import os
import uuid
import psycopg2
import sys

# Agregar el root path para poder importar backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.src.logic.routing_engine import optimizar_ruta_vagoneta

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO SIMULACIÓN DE INTERCEPTACIÓN DINÁMICA (RUTEO CONTINUO)")
    
    test_id = str(uuid.uuid4())[:8]
    
    # IDs Vagoneta V1
    vagoneta_v1_id = str(uuid.uuid4())
    
    # IDs Faena A (Chofer A - Centro)
    cliente_a_user_id = str(uuid.uuid4())
    cliente_a_id = str(uuid.uuid4())
    vehiculo_a_id = str(uuid.uuid4())
    chofer_a_user_id = str(uuid.uuid4())
    chofer_a_id = str(uuid.uuid4())
    faena_a_id = str(uuid.uuid4())
    
    # IDs Faena B (Chofer B - Cordón)
    cliente_b_user_id = str(uuid.uuid4())
    cliente_b_id = str(uuid.uuid4())
    vehiculo_b_id = str(uuid.uuid4())
    chofer_b_user_id = str(uuid.uuid4())
    chofer_b_id = str(uuid.uuid4())
    faena_b_id = str(uuid.uuid4())

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cursor = conn.cursor()
    
    try:
        # 1. Escenario Inicial (Seed)
        print_step("🌱", "Fase 1: Preparación del Escenario (Seed)")
        
        # Vagoneta V1 en Tres Cruces (-34.8941, -56.1652)
        cursor.execute("""
            INSERT INTO vagonetas (id, patente, modelo, capacidad, estado, ubicacion_actual) 
            VALUES (%s, %s, 'H3 Van', 12, 'disponible', ST_SetSRID(ST_MakePoint(-56.1652, -34.8941), 4326));
        """, (vagoneta_v1_id, f"VAG-INT-{test_id}"))
        print_sub(f"Vagoneta V1 disponible en Tres Cruces (ID: {vagoneta_v1_id[:8]}...)")
        
        # Chofer A y B (Usuarios y Choferes)
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_a_user_id, f"chofer_a_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer A', 'disponible', true);", (chofer_a_id, chofer_a_user_id))
        
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_b_user_id, f"chofer_b_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer B', 'disponible', true);", (chofer_b_id, chofer_b_user_id))

        # Clientes y Vehículos
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (cliente_a_user_id, f"cliente_a_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre) VALUES (%s, %s, 'particular', 'Cliente A');", (cliente_a_id, cliente_a_user_id))
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, patente, tipo) VALUES (%s, %s, 'Marca', %s, 'auto');", (vehiculo_a_id, cliente_a_id, f"A-{test_id}"))
        
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (cliente_b_user_id, f"cliente_b_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre) VALUES (%s, %s, 'particular', 'Cliente B');", (cliente_b_id, cliente_b_user_id))
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, patente, tipo) VALUES (%s, %s, 'Marca', %s, 'auto');", (vehiculo_b_id, cliente_b_id, f"B-{test_id}"))

        # Faena A (Destino: Centro -34.9056, -56.1853)
        cursor.execute("""
            INSERT INTO faenas (id, chofer_id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'en_curso', NOW());
        """, (faena_a_id, chofer_a_id, cliente_a_id, vehiculo_a_id))
        print_sub(f"Faena A en curso (Destino Centro: -34.9056, -56.1853)")

        # Faena B (Destino: Cordón -34.9001, -56.1762)
        cursor.execute("""
            INSERT INTO faenas (id, chofer_id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326), ST_SetSRID(ST_MakePoint(-56.1762, -34.9001), 4326), 'en_curso', NOW());
        """, (faena_b_id, chofer_b_id, cliente_b_id, vehiculo_b_id))
        print_sub(f"Faena B en curso (Destino Cordón: -34.9001, -56.1762) [Cercano a ruta]")

        conn.commit()
        
        # 2. Gatillar Primer Rescate
        print_step("🚚", "Fase 2: Gatillar Primer Rescate (Faena A -> Centro)")
        cursor.execute("UPDATE faenas SET estado = 'finalizada' WHERE id = %s;", (faena_a_id,))
        conn.commit()
        
        # Verificar que se creó traslado y parada para Faena A
        cursor.execute("SELECT id FROM traslados_equipo WHERE vagoneta_id = %s;", (vagoneta_v1_id,))
        traslado_res = cursor.fetchone()
        assert traslado_res is not None, "El trigger original no creó el traslado para Faena A"
        traslado_id = traslado_res[0]
        print_sub(f"Traslado V1 creado correctamente (ID: {traslado_id[:8]}...)")
        
        cursor.execute("SELECT chofer_id, secuencia, descripcion FROM paradas_traslado WHERE traslado_id = %s ORDER BY secuencia ASC;", (traslado_id,))
        paradas = cursor.fetchall()
        assert len(paradas) == 1, "Debería haber 1 parada"
        assert paradas[0][0] == chofer_a_id and paradas[0][1] == 1, "La parada 1 debería ser el Chofer A"
        print_sub(f"Parada Original Asignada: Chofer A (Secuencia: {paradas[0][1]}) - {paradas[0][2]}")
        
        # Vagoneta cambia su estado a 'en_curso' manualmente simulando la operativa
        cursor.execute("UPDATE traslados_equipo SET estado = 'en_curso' WHERE id = %s;", (traslado_id,))
        conn.commit()

        # 3. Interceptación Dinámica
        print_step("⚡", "Fase 3: Inyectar Interceptación Dinámica (Faena B -> Cordón)")
        cursor.execute("UPDATE faenas SET estado = 'finalizada' WHERE id = %s;", (faena_b_id,))
        conn.commit()
        
        cursor.execute("SELECT id FROM traslados_equipo WHERE vagoneta_id = %s;", (vagoneta_v1_id,))
        traslados_count = len(cursor.fetchall())
        assert traslados_count == 1, "Se creó un traslado duplicado en vez de interceptar"
        print_sub("✔️ No se crearon traslados duplicados. Interceptación evaluada.")
        
        cursor.execute("SELECT chofer_id, secuencia, descripcion, ST_Y(punto::geometry), ST_X(punto::geometry) FROM paradas_traslado WHERE traslado_id = %s ORDER BY secuencia ASC;", (traslado_id,))
        paradas_actualizadas = cursor.fetchall()
        assert len(paradas_actualizadas) == 2, "Debería haber 2 paradas ahora"
        
        parada_1 = paradas_actualizadas[0]
        parada_2 = paradas_actualizadas[1]
        
        assert parada_1[0] == chofer_b_id, f"La parada 1 debería ser el Chofer B (Cordón). Encontramos: {parada_1}"
        assert parada_2[0] == chofer_a_id, "La parada 2 debería ser el Chofer A (Centro)"
        
        print_sub(f"🔄 Re-Secuenciación Exitosa en Base de Datos:")
        print_sub(f"   Secuencia 1: Chofer B (Lat: {parada_1[3]}, Lng: {parada_1[4]}) - {parada_1[2]}")
        print_sub(f"   Secuencia 2: Chofer A (Lat: {parada_2[3]}, Lng: {parada_2[4]}) - {parada_2[2]}")
        
        # 4. Validar Motor en Python
        print_step("🧠", "Fase 4: Validación del Motor de Ruteo en Python (routing_engine.py)")
        
        paradas_pendientes = [
            {'parada_id': 'p-a', 'chofer_id': 'Chofer A (Centro)', 'lat': parada_2[3], 'lng': parada_2[4]},
            {'parada_id': 'p-b', 'chofer_id': 'Chofer B (Cordón)', 'lat': parada_1[3], 'lng': parada_1[4]}
        ]
        
        # Tres Cruces
        ubicacion_vagoneta = {'lat': -34.8941, 'lng': -56.1652}
        
        print_sub(f"Ejecutando Micro-VRP para ubicación actual: {ubicacion_vagoneta}")
        
        optimizadas = optimizar_ruta_vagoneta(str(traslado_id), ubicacion_vagoneta, paradas_pendientes)
        
        assert len(optimizadas) == 2
        assert optimizadas[0]['chofer_id'] == 'Chofer B (Cordón)'
        assert optimizadas[1]['chofer_id'] == 'Chofer A (Centro)'
        
        for idx, p in enumerate(optimizadas):
            print_sub(f"📍 Posición {idx+1}: {p['chofer_id']}")
            print_sub(f"   - Tramo: {p['distancia_tramo_m']} m")
            print_sub(f"   - Acumulado: {p['distancia_acumulada_m']} m")
            print_sub(f"   - ETA: {p['eta_minutos']} min")

        print_step("✅", "TODAS LAS PRUEBAS SUPERADAS EXITOSAMENTE")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        conn.rollback()
        raise e
        
    finally:
        print_step("🧹", "Fase 5: Limpieza Completa (Cleanup)")
        try:
            # Borrar en cascada
            cursor.execute("DELETE FROM paradas_traslado WHERE traslado_id IN (SELECT id FROM traslados_equipo WHERE vagoneta_id = %s);", (vagoneta_v1_id,))
            cursor.execute("DELETE FROM traslados_equipo WHERE vagoneta_id = %s;", (vagoneta_v1_id,))
            cursor.execute("DELETE FROM faenas WHERE id IN (%s, %s);", (faena_a_id, faena_b_id))
            cursor.execute("DELETE FROM vehiculos_cliente WHERE id IN (%s, %s);", (vehiculo_a_id, vehiculo_b_id))
            cursor.execute("DELETE FROM clientes WHERE id IN (%s, %s);", (cliente_a_id, cliente_b_id))
            cursor.execute("DELETE FROM posiciones WHERE chofer_id IN (%s, %s);", (chofer_a_id, chofer_b_id))
            cursor.execute("DELETE FROM choferes WHERE id IN (%s, %s);", (chofer_a_id, chofer_b_id))
            cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_v1_id,))
            cursor.execute("DELETE FROM auth.users WHERE id IN (%s, %s, %s, %s);", (chofer_a_user_id, chofer_b_user_id, cliente_a_user_id, cliente_b_user_id))
            conn.commit()
            print_sub("Registros de interceptación limpiados al 100%.")
        except Exception as e:
            conn.rollback()
            print_sub(f"Aviso durante el cleanup: {str(e)}")
            
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
