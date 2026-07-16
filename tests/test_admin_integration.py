import psycopg2
import requests
import json
import uuid
import sys

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
FUNCTIONS_URL = "http://127.0.0.1:54321/functions/v1"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

def get_conn():
    return psycopg2.connect(DB_URL)

def run_tests():
    passed = 0
    total = 8
    
    conn = get_conn()
    conn.autocommit = True
    cursor = conn.cursor()

    print("--- INICIANDO TEST SUITE ADMIN (ORDEN #21) ---")
    
    # Trackers for cleanup
    choferes_creados = []
    clientes_creados = []
    faenas_creadas = []
    vagonetas_creadas = []
    traslados_creados = []
    auth_users_creados = []

    try:
        # TEST 1
        print("\nTest 1 - Crear chofer...")
        try:
            # Login as Admin to get JWT
            auth_resp = requests.post(
                f"http://127.0.0.1:54321/auth/v1/token?grant_type=password",
                headers={"apikey": SERVICE_ROLE_KEY, "Content-Type": "application/json"}, # apikey can be anon_key or service_key
                json={"email": "admin@gebo.com", "password": "gebo123"}
            )
            admin_token = auth_resp.json().get("access_token")
            if not admin_token: raise Exception(f"No se pudo hacer login como admin: {auth_resp.text}")

            email = f"test_{uuid.uuid4()}@gebo.com"
            headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
            resp = requests.post(f"{FUNCTIONS_URL}/create-user", headers=headers, json={
                "email": email, "password": "password123", "role": "chofer", "metadata": {"nombre_completo": "Test Chofer"}, "profileData": {"telefono": "123"}
            })
            if resp.status_code != 200:
                raise Exception(f"Edge Function error: {resp.text}")
            try:
                resp_json = resp.json()
                u_id = resp_json.get("user", {}).get("id")
                if not u_id:
                    raise Exception(f"No user.id returned. Response: {resp_json}")
            except Exception as j_err:
                raise Exception(f"Failed to parse response: {resp.text}")
            auth_users_creados.append(u_id)
            
            cursor.execute("SELECT raw_app_meta_data FROM auth.users WHERE id = %s", (u_id,))
            role = cursor.fetchone()[0].get('role')
            if role != 'chofer': raise Exception(f"Rol incorrecto: {role}")
            
            cursor.execute("SELECT id, estado FROM choferes WHERE usuario_id = %s", (u_id,))
            ch_row = cursor.fetchone()
            if not ch_row: raise Exception("No se creó fila en tabla choferes")
            ch_id = ch_row[0]
            choferes_creados.append(ch_id)
            if ch_row[1] != 'disponible': raise Exception(f"Estado inicial chofer != disponible ({ch_row[1]})")
            print("[OK] Test 1 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 1 FAILED: {str(e)}")

        # TEST 2
        print("\nTest 2 - Asignar chofer a vagoneta...")
        try:
            cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (gen_random_uuid(), 'Test2 Ch', 'disponible') RETURNING id")
            c2_id = cursor.fetchone()[0]
            choferes_creados.append(c2_id)
            
            cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (gen_random_uuid(), %s, 'disponible') RETURNING id", (f"TST-{str(uuid.uuid4())[:4]}",))
            v_id = cursor.fetchone()[0]
            vagonetas_creadas.append(v_id)
            
            # Simulamos asignarChoferVagoneta que actualiza chofer_vagoneta_id
            cursor.execute("UPDATE vagonetas SET chofer_vagoneta_id = %s WHERE id = %s RETURNING chofer_vagoneta_id", (c2_id, v_id))
            res = cursor.fetchone()
            if res[0] != str(c2_id): raise Exception("chofer_vagoneta_id no se actualizó correctamente")
            
            # Verificamos que chofer_id no existe en vagonetas tirando un query
            try:
                cursor.execute("SELECT chofer_id FROM vagonetas LIMIT 1")
                raise Exception("La columna chofer_id TODAVÍA EXISTE en vagonetas")
            except psycopg2.errors.UndefinedColumn as e:
                pass # This is EXPECTED and GOOD
                
            print("[OK] Test 2 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 2 FAILED: {str(e)}")

        # TEST 3
        print("\nTest 3 - Crear faena manual...")
        try:
            cursor.execute("INSERT INTO clientes (id, nombre, activo) VALUES (gen_random_uuid(), 'Cli3', true) RETURNING id")
            cl3_id = cursor.fetchone()[0]
            clientes_creados.append(cl3_id)
            
            cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (gen_random_uuid(), 'Ch3', 'disponible') RETURNING id")
            ch3_id = cursor.fetchone()[0]
            choferes_creados.append(ch3_id)
            
            # Insert faena
            cursor.execute('''
                INSERT INTO faenas (id, cliente_id, chofer_id, origen, destino, estado)
                VALUES (gen_random_uuid(), %s, %s, ST_GeomFromText('POINT(-56.164 -34.901)', 4326), ST_GeomFromText('POINT(-56.148 -34.891)', 4326), 'programada')
                RETURNING id, estado, chofer_id, ST_AsText(origen)
            ''', (cl3_id, ch3_id))
            f3 = cursor.fetchone()
            faenas_creadas.append(f3[0])
            
            if f3[1] != 'programada': raise Exception("Estado no es programada")
            if str(f3[2]) != str(ch3_id): raise Exception("chofer_id no coincide")
            if 'POINT' not in f3[3]: raise Exception("origen no es POINT geography válido")
            print("[OK] Test 3 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 3 FAILED: {str(e)}")

        # TEST 4
        print("\nTest 4 - Cancelar faena...")
        try:
            cursor.execute("INSERT INTO faenas (id, estado) VALUES (gen_random_uuid(), 'en_curso') RETURNING id")
            f4_id = cursor.fetchone()[0]
            faenas_creadas.append(f4_id)
            
            # Update to cancelada_gebo should work
            cursor.execute("UPDATE faenas SET estado = 'cancelada_gebo' WHERE id = %s RETURNING estado", (f4_id,))
            if cursor.fetchone()[0] != 'cancelada_gebo': raise Exception("No guardó cancelada_gebo")
            
            # Update to cancelada should FAIL constraint
            try:
                cursor.execute("UPDATE faenas SET estado = 'cancelada' WHERE id = %s", (f4_id,))
                raise Exception("PERMITIÓ GUARDAR 'cancelada' SIN DAR ERROR DE CONSTRAINT")
            except psycopg2.errors.CheckViolation as e:
                pass # EXPECTED
                
            print("[OK] Test 4 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 4 FAILED: {str(e)}")

        # TEST 5
        print("\nTest 5 - Crear traslado con paradas...")
        try:
            cursor.execute("INSERT INTO vagonetas (id, estado) VALUES (gen_random_uuid(), 'disponible') RETURNING id")
            v5 = cursor.fetchone()[0]
            vagonetas_creadas.append(v5)
            
            cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, estado, tipo) VALUES (gen_random_uuid(), %s, 'programado', 'ida') RETURNING id", (v5,))
            t5 = cursor.fetchone()[0]
            traslados_creados.append(t5)
            
            # Insert paradas
            cursor.execute("INSERT INTO paradas_traslado (traslado_id, punto, tipo, completada) VALUES (%s, ST_GeomFromText('POINT(0 0)', 4326), 'recogida', false)", (t5,))
            cursor.execute("INSERT INTO paradas_traslado (traslado_id, punto, tipo, completada) VALUES (%s, ST_GeomFromText('POINT(1 1)', 4326), 'entrega', false)", (t5,))
            
            # Check table
            cursor.execute("SELECT tipo, completada FROM paradas_traslado WHERE traslado_id = %s", (t5,))
            paradas = cursor.fetchall()
            if len(paradas) != 2: raise Exception(f"Faltan paradas, solo hay {len(paradas)}")
            for p in paradas:
                if p[0] not in ('recogida', 'entrega'): raise Exception(f"Tipo inválido {p[0]}")
                if p[1] is not False: raise Exception("Completada no es false")
                
            print("[OK] Test 5 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 5 FAILED: {str(e)}")

        # TEST 6
        print("\nTest 6 - Desactivar chofer con faena activa...")
        try:
            cursor.execute("INSERT INTO choferes (id, estado) VALUES (gen_random_uuid(), 'en_faena') RETURNING id")
            c6 = cursor.fetchone()[0]
            choferes_creados.append(c6)
            
            cursor.execute("INSERT INTO faenas (id, chofer_id, estado) VALUES (gen_random_uuid(), %s, 'en_curso') RETURNING id", (c6,))
            f6 = cursor.fetchone()[0]
            faenas_creadas.append(f6)
            
            # Trigger!
            cursor.execute("UPDATE choferes SET estado = 'inactivo' WHERE id = %s", (c6,))
            
            # Check Faena
            cursor.execute("SELECT estado, chofer_id FROM faenas WHERE id = %s", (f6,))
            fres = cursor.fetchone()
            if fres[0] != 'programada': raise Exception(f"La faena no cambió a programada, quedó en {fres[0]}")
            if fres[1] is not None: raise Exception("El chofer_id no se limpió (esperado NULL)")
            
            print("[OK] Test 6 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 6 FAILED: {str(e)}")

        # TEST 7
        print("\nTest 7 - Desactivar cliente con faena programada...")
        try:
            cursor.execute("INSERT INTO clientes (id, activo) VALUES (gen_random_uuid(), true) RETURNING id")
            cl7 = cursor.fetchone()[0]
            clientes_creados.append(cl7)
            
            cursor.execute("INSERT INTO faenas (id, cliente_id, estado) VALUES (gen_random_uuid(), %s, 'programada') RETURNING id", (cl7,))
            f7 = cursor.fetchone()[0]
            faenas_creadas.append(f7)
            
            # Trigger!
            cursor.execute("UPDATE clientes SET activo = false WHERE id = %s", (cl7,))
            
            cursor.execute("SELECT estado FROM faenas WHERE id = %s", (f7,))
            f_estado = cursor.fetchone()[0]
            if f_estado != 'cancelada_gebo': raise Exception(f"La faena no se canceló, estado: {f_estado}")
            
            print("[OK] Test 7 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 7 FAILED: {str(e)}")

        # TEST 8
        print("\nTest 8 - Contador de choferes activos...")
        try:
            cursor.execute("INSERT INTO choferes (id, estado) VALUES (gen_random_uuid(), 'en_faena'), (gen_random_uuid(), 'en_faena'), (gen_random_uuid(), 'en_faena') RETURNING id")
            for r in cursor.fetchall(): choferes_creados.append(r[0])
            
            cursor.execute("INSERT INTO choferes (id, estado) VALUES (gen_random_uuid(), 'en_traslado'), (gen_random_uuid(), 'en_traslado') RETURNING id")
            for r in cursor.fetchall(): choferes_creados.append(r[0])
            
            # Query from getChoferesActivosCount
            cursor.execute("SELECT COUNT(*) FROM choferes WHERE estado IN ('en_faena', 'en_traslado')")
            cnt = cursor.fetchone()[0]
            if cnt < 5: raise Exception(f"Se esperaban al menos 5, hay {cnt}")
            
            print("[OK] Test 8 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 8 FAILED: {str(e)}")

    finally:
        # CLEANUP
        print("\nLimpiando DB...")
        try:
            cursor.execute("DELETE FROM paradas_traslado WHERE traslado_id = ANY(%s)", (traslados_creados,))
        except: pass
        try:
            if faenas_creadas: cursor.execute("DELETE FROM faenas WHERE id = ANY(%s)", (faenas_creadas,))
        except: pass
        try:
            if traslados_creados: cursor.execute("DELETE FROM traslados_equipo WHERE id = ANY(%s)", (traslados_creados,))
        except: pass
        try:
            if vagonetas_creadas: cursor.execute("DELETE FROM vagonetas WHERE id = ANY(%s)", (vagonetas_creadas,))
        except: pass
        try:
            if choferes_creados: cursor.execute("DELETE FROM choferes WHERE id = ANY(%s)", (choferes_creados,))
        except: pass
        try:
            if clientes_creados: cursor.execute("DELETE FROM clientes WHERE id = ANY(%s)", (clientes_creados,))
        except: pass
        try:
            if auth_users_creados: cursor.execute("DELETE FROM auth.users WHERE id = ANY(%s)", (auth_users_creados,))
        except: pass
        
        conn.close()
        
    print(f"\nRESUMEN: {passed}/{total} tests pasaron.")

if __name__ == '__main__':
    run_tests()
