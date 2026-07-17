import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def test_production_security_rls():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    pasajero_a = str(uuid.uuid4())
    pasajero_b = str(uuid.uuid4())
    chofer_x = str(uuid.uuid4())
    chofer_y = str(uuid.uuid4())
    faena_b_id = str(uuid.uuid4())

    try:
        print("=== Iniciando Auditoría de Seguridad RLS en Producción ===")
        
        # Insert initial data bypassing RLS (as superuser)
        cursor.execute("INSERT INTO usuarios (id, email, nombre_completo) VALUES (%s, 'pa@test.com', 'Pasajero A');", (pasajero_a,))
        cliente_b_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO clientes (id, nombre, saldo_cuenta) VALUES (%s, 'Empresa B', 1000);", (cliente_b_id,))
        cursor.execute("INSERT INTO usuarios (id, email, nombre_completo, cliente_id) VALUES (%s, 'pb@test.com', 'Pasajero B', %s);", (pasajero_b, cliente_b_id))
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer X', 'disponible');", (chofer_x,))
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Y', 'disponible');", (chofer_y,))
        cursor.execute("INSERT INTO faenas (id, cliente_id, chofer_id, estado) VALUES (%s, %s, %s, 'finalizada');", (faena_b_id, cliente_b_id, chofer_y))
        
        # Insert chat message for Faena B
        cursor.execute("INSERT INTO chats_faenas (faena_id, remitente_tipo, mensaje) VALUES (%s, 'cliente', 'Mensaje confidencial de B');", (faena_b_id,))

        # Caso 1: Ataque de Datos (Pasajero A intentando leer Chat de Faena B)
        print("\n[*] Ejecutando Caso 1: Lectura no autorizada de Chats (Ataque de Datos)")
        # Simulate Pasajero A session
        cursor.execute("SET SESSION ROLE authenticated;")
        cursor.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (pasajero_a,))
        
        cursor.execute("SELECT COUNT(*) FROM chats_faenas WHERE faena_id = %s;", (faena_b_id,))
        count = cursor.fetchone()[0]
        
        print(f"    -> Mensajes interceptados por Pasajero A: {count}")
        assert count == 0, "Violación de Privacidad: Pasajero A pudo leer el chat de la Faena B"
        print("[✓] Assert OK: Supabase RLS bloqueó la lectura exitosamente (0 registros retornados).")
        
        # Caso 2: Suplantación de Chofer (Chofer X intentando inyectar GPS como Chofer Y)
        print("\n[*] Ejecutando Caso 2: Inyección de GPS Suplantada (Chofer X -> Y)")
        # Simulate Chofer X session
        cursor.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (chofer_x,))
        
        bloqueado = False
        try:
            cursor.execute("""
                INSERT INTO posiciones (chofer_id, latitud, longitud, ubicacion_h3_index, ubicacion) 
                VALUES (%s, -34.90, -56.16, '88a919426bfffff', ST_SetSRID(ST_MakePoint(-56.16, -34.90), 4326));
            """, (chofer_y,))
        except psycopg2.errors.InsufficientPrivilege as e:
            bloqueado = True
            print(f"    -> Base de datos abortó inyección: {e}".strip())
        except psycopg2.errors.CheckViolation as e:
            # RLS WITH CHECK violation manifests as CheckViolation in some cases
            bloqueado = True
            print(f"    -> Base de datos abortó inyección (RLS CHECK): {e}".strip())
            
        assert bloqueado, "Violación de Integridad: Chofer X pudo inyectar un ping de GPS a nombre del Chofer Y"
        print("[✓] Assert OK: Supabase RLS rechazó la operación de suplantación.")

        print("\n==============================================")
        print("✓ PRUEBA PENETRACIÓN RLS: COMPLETADA Y EXITOSA")
        print("==============================================")
        
    finally:
        # Revert to superuser to clean up
        try:
            cursor.execute("RESET ROLE;")
            cursor.execute("DELETE FROM chats_faenas WHERE faena_id = %s;", (faena_b_id,))
            cursor.execute("DELETE FROM faenas WHERE id = %s;", (faena_b_id,))
            cursor.execute("DELETE FROM choferes WHERE id IN (%s, %s);", (chofer_x, chofer_y))
            cursor.execute("DELETE FROM usuarios WHERE id IN (%s, %s);", (pasajero_a, pasajero_b))
        except Exception as e:
            print("Cleanup error:", e)
            pass
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_production_security_rls()
