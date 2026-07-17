import os
import sys
import time
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def run_h3_trigger_test():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    chofer_id = str(uuid.uuid4())
    pos_id = None
    
    try:
        print("=== Iniciando Validación de Trigger H3 Nativo ===")
        
        # 1. Preparar chofer de prueba
        cursor.execute(
            "INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;",
            (chofer_id, f"test_h3_{chofer_id}@gebo.com")
        )
        cursor.execute(
            "INSERT INTO choferes (id, usuario_id, estado) VALUES (%s, %s, 'disponible') ON CONFLICT DO NOTHING;",
            (chofer_id, chofer_id)
        )
        
        # 2. Inserción de Coordenadas
        # Lat: -34.9011, Lon: -56.1645 (Centro/Pocitos MVD) sin H3 index explícito
        lat = -34.9011
        lon = -56.1645
        
        start_insert = time.perf_counter()
        cursor.execute("""
            INSERT INTO posiciones (chofer_id, latitud, longitud, ubicacion, timestamp) 
            VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), NOW()) RETURNING id;
        """, (chofer_id, lat, lon, lon, lat))
        
        pos_id = cursor.fetchone()[0]
        print(f"[*] Inserción completada. Tiempo: {(time.perf_counter() - start_insert)*1000:.2f} ms")
        
        # 3. Validación de Trigger
        cursor.execute("SELECT ubicacion_h3_index FROM posiciones WHERE id = %s;", (pos_id,))
        h3_index = cursor.fetchone()[0]
        
        print(f"[*] Valor H3 index detectado en base de datos: {h3_index}")
        assert h3_index == '88a919426bfffff', f"El H3 calculado '{h3_index}' no es el esperado para Pocitos/Centro."
        print("[✓] Assert OK: El trigger nativo interceptó y calculó correctamente el índice H3.")
        
        # 4. Prueba de rendimiento de consulta usando el nuevo índice estructural
        start_query = time.perf_counter()
        cursor.execute("SELECT id FROM posiciones WHERE ubicacion_h3_index = '88a919426bfffff' LIMIT 1;")
        res = cursor.fetchone()
        query_time_ms = (time.perf_counter() - start_query) * 1000
        
        assert res is not None, "No se encontró el registro filtrando por H3."
        print(f"[*] Búsqueda por índice H3 completada. Tiempo: {query_time_ms:.2f} ms")
        assert query_time_ms < 5.0, f"La consulta demoró {query_time_ms:.2f} ms, superando el límite de 5 ms."
        print("[✓] Assert OK: Consulta geográfica resuelta velozmente gracias al índice (idx_posiciones_choferes_h3).")
        
        print("\n==============================================")
        print("✓ PRUEBA AVANZADA H3 NATIVA: COMPLETADA Y EXITOSA")
        print("==============================================")
        
    finally:
        # Limpieza
        if pos_id:
            cursor.execute("DELETE FROM posiciones WHERE id = %s;", (pos_id,))
        cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM auth.users WHERE id = %s;", (chofer_id,))
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_h3_trigger_test()
