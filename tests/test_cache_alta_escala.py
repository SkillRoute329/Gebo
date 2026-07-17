import os
import uuid
import time
import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE CARGA Y CACHÉ H3 (1,000 PINGS)")
    test_id = str(uuid.uuid4())[:8]
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    vagoneta_id = str(uuid.uuid4())
    chofer_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    try:
        # 1. Seed inicial
        print_step("🌱", "Fase 1: Preparación (Seed)")
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (user_id, f"chofer_cache_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado) VALUES (%s, %s, 'Chofer Cache', 'disponible');", (chofer_id, user_id))
        cursor.execute("INSERT INTO vagonetas (id, patente, chofer_vagoneta_id, estado, capacidad) VALUES (%s, %s, %s, 'en_ruta', 12);", (vagoneta_id, f"VAG-{test_id}", chofer_id))
        
        print_step("🔥", "Fase 2: Simulación de Carga (1,000 Pings)")
        
        lat_base, lng_base = -34.9000, -56.1600
        pings = []
        for i in range(1000):
            lat = lat_base + (i * 0.0001)
            lng = lng_base + (i * 0.0001)
            h3_res8 = f"88a9134a47ff{i%1000:03d}"
            pings.append((
                chofer_id,
                f"POINT({lng} {lat})",
                f"2026-07-16 10:00:00.{i:03d}",
                h3_res8
            ))
            
        ultimo_h3_res8 = pings[-1][3]
        
        start_time_insert = time.time()
        execute_values(cursor, """
            INSERT INTO posiciones (chofer_id, ubicacion, timestamp, h3_res8)
            VALUES %s
        """, pings, template="(%s, ST_SetSRID(%s::geometry, 4326), %s, %s)")
        
        insert_duration = time.time() - start_time_insert
        print_sub(f"1,000 Pings insertados (Tiempo de inyección: {insert_duration:.3f} s)")

        print_step("🔍", "Fase 3: Verificación de Caché")
        
        start_time_hist = time.time()
        cursor.execute("SELECT * FROM posiciones WHERE chofer_id = %s ORDER BY timestamp DESC LIMIT 1;", (chofer_id,))
        hist = cursor.fetchone()
        hist_duration = time.time() - start_time_hist
        print_sub(f"Consulta a 'posiciones' (histórico) tomó: {hist_duration:.6f} s")
        
        start_time_cache = time.time()
        cursor.execute("SELECT ultimo_h3_res8 FROM vagonetas_estado_actual WHERE vagoneta_id = %s;", (vagoneta_id,))
        cache_data = cursor.fetchall()
        cache_duration = time.time() - start_time_cache
        print_sub(f"Consulta a 'vagonetas_estado_actual' (caché en caliente) tomó: {cache_duration:.6f} s")
        
        # Obtenemos el h3 real calculado por la DB para la última fila
        real_ultimo_h3_res8 = hist[5] # asumiendo que h3_res8 es la 6ta columna
        
        assert len(cache_data) == 1, f"Debería existir exactamente 1 fila en la caché para la vagoneta, pero hay {len(cache_data)}"
        assert cache_data[0][0] == real_ultimo_h3_res8, f"El h3 guardado ({cache_data[0][0]}) no coincide con el último histórico ({real_ultimo_h3_res8})"
        
        print_sub("✅ VERIFICADO: La tabla de caché contiene 1 única fila consolidada.")
        print_sub("✅ VERIFICADO: La fila consolidada representa el último estado reportado correctamente.")
        
        print_step("🏆", "PRUEBA DE CACHÉ DE ALTA ESCALA SUPERADA")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM vagonetas_estado_actual WHERE vagoneta_id = %s;", (vagoneta_id,))
        cursor.execute("DELETE FROM posiciones WHERE chofer_id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM auth.users WHERE id = %s;", (user_id,))
        print_sub("Registros de prueba eliminados.")
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
