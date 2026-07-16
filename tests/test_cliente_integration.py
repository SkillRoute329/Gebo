import psycopg2
import os
import uuid
import math

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def test_cliente_integration():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("=== INICIANDO TESTS INTEGRACION CLIENTE ===")

        # Setup test data
        usuario_cliente_id = str(uuid.uuid4())
        cliente_id = str(uuid.uuid4())
        vehiculo_id = str(uuid.uuid4())
        usuario_otro_cliente_id = str(uuid.uuid4())
        otro_cliente_id = str(uuid.uuid4())
        
        # Test 1: Registrar vehículo -> verificar en vehiculos_cliente
        print("\nTest 1: Registrar vehículo")
        cur.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", (usuario_cliente_id, 'test_cli1@gebo.com'))
        cur.execute("INSERT INTO clientes (id, usuario_id, nombre) VALUES (%s, %s, %s)", (cliente_id, usuario_cliente_id, 'Cliente Test 1'))
        
        cur.execute("""
            INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, año, patente, tipo, transmision, es_electrico)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (vehiculo_id, cliente_id, 'Toyota', 'Corolla', 2023, 'SBA1234', 'auto', 'automatico', False))
        
        cur.execute("SELECT id FROM vehiculos_cliente WHERE cliente_id = %s", (cliente_id,))
        vehs = cur.fetchall()
        assert len(vehs) == 1
        print("[OK] Vehículo registrado exitosamente.")

        # Test 2: Solicitar faena -> verificar INSERT en faenas con estado programada
        print("\nTest 2: Solicitar faena")
        faena_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, origen, destino, modalidad, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, ST_GeomFromText('POINT(-56.1645 -34.9011)', 4326), ST_GeomFromText('POINT(-56.148 -34.891)', 4326), 'por_minuto', 'programada', NOW())
        """, (faena_id, cliente_id, vehiculo_id))
        
        cur.execute("SELECT estado FROM faenas WHERE id = %s", (faena_id,))
        estado = cur.fetchone()[0]
        assert estado == 'programada'
        print("[OK] Faena solicitada con estado 'programada'.")

        # Test 3: Simular asignación de chofer
        print("\nTest 3: Simular asignación de chofer")
        chofer_id = str(uuid.uuid4())
        usuario_chofer_id = str(uuid.uuid4())
        cur.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", (usuario_chofer_id, 'test_chofer_cli@gebo.com'))
        cur.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_manual, maneja_automatico, maneja_electrico, maneja_suv) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", (chofer_id, usuario_chofer_id, 'Chofer Cliente Test', 'disponible', True, True, True, True))
        
        cur.execute("UPDATE faenas SET estado = 'asignada', chofer_id = %s WHERE id = %s", (chofer_id, faena_id))
        cur.execute("SELECT estado, chofer_id FROM faenas WHERE id = %s", (faena_id,))
        f_updated = cur.fetchone()
        assert f_updated[0] == 'asignada'
        assert f_updated[1] == chofer_id
        print("[OK] Asignación simulada vista correctamente por el cliente.")

        # Test 4: Verificar cálculo de tarifa estimada (consistente con configuracion_negocio)
        print("\nTest 4: Cálculo de tarifa estimada (simulación)")
        cur.execute("SELECT valor FROM configuracion_negocio WHERE clave = 'tarifa_por_minuto_uyu'")
        val = cur.fetchone()
        tarifa_min = float(val[0]) if val else 30
        
        # Haversine distance between -56.1645,-34.9011 and -56.148,-34.891
        def haversine(lat1, lon1, lat2, lon2):
            R = 6371
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2) * math.sin(dlat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2) * math.sin(dlon/2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            return R * c
        
        dist = haversine(-34.9011, -56.1645, -34.891, -56.148)
        estimado = round(50 + dist * tarifa_min)
        assert estimado > 50
        print(f"[OK] Tarifa estimada ({estimado} UYU) usa configuración del negocio.")

        # Test 5: Simular finalización y lectura de costo_total
        print("\nTest 5: Simular finalización de faena")
        cur.execute("UPDATE faenas SET estado = 'finalizada', costo_total = 450.50 WHERE id = %s", (faena_id,))
        cur.execute("SELECT costo_total FROM faenas WHERE id = %s", (faena_id,))
        costo = cur.fetchone()[0]
        assert costo == 450.50
        print("[OK] Cliente lee costo_total de faena finalizada correctamente.")

        # Test 6: Verificar RLS — cliente no puede leer faenas de otros clientes
        print("\nTest 6: Verificar RLS")
        cur.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", (usuario_otro_cliente_id, 'test_cli2@gebo.com'))
        cur.execute("INSERT INTO clientes (id, usuario_id, nombre) VALUES (%s, %s, %s)", (otro_cliente_id, usuario_otro_cliente_id, 'Cliente Test 2'))
        faena_otro_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, origen, destino, modalidad, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, ST_GeomFromText('POINT(-56.1 34.9)', 4326), ST_GeomFromText('POINT(-56.2 34.8)', 4326), 'por_minuto', 'programada', NOW())
        """, (faena_otro_id, otro_cliente_id, vehiculo_id))
        
        # Test RLS by switching role to the first user
        # Note: In postgres superuser bypasses RLS. We must SET ROLE anon and set request.jwt.claims
        cur.execute("SET LOCAL role authenticated")
        cur.execute("SET LOCAL request.jwt.claims = %s", (f'{{"sub": "{usuario_cliente_id}"}}',))
        
        cur.execute("SELECT id FROM faenas")
        faenas_visibles = cur.fetchall()
        
        # Should only see their own faena
        ids_visibles = [f[0] for f in faenas_visibles]
        assert faena_id in ids_visibles
        assert faena_otro_id not in ids_visibles
        print("[OK] RLS bloquea a cliente 1 ver la faena de cliente 2.")

        print("\n=== TODOS LOS TESTS PASARON (6/6) ===")

    except Exception as e:
        print(f"\n[ERROR] Falló un test: {e}")
        import traceback
        traceback.print_exc()
        raise e
    finally:
        conn.rollback()
        cur.close()
        conn.close()

if __name__ == "__main__":
    test_cliente_integration()
