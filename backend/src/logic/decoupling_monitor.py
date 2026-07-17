import os
import psycopg2
from typing import List

print("[INFO] Cargando decoupling_monitor.py con Nomenclatura Semántica Estricta.")
print("[INFO] Equivalencias: 'traslado_id' -> 'shuttle_route_id', 'chofer_id' (faena) -> 'gebo_driver_id'.")

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres?prepared_statement_cache_size=0")

def evaluar_y_desacoplar_traslados_retrasados() -> List[str]:
    """
    Evalúa paradas en espera, lee la configuración de tolerancia,
    desacopla choferes (gebo_driver) retrasados e invoca la re-secuenciación SQL.
    Retorna lista de shuttle_route_id afectados.
    """
    affected_shuttle_routes = set()
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cursor = conn.cursor()
    
    try:
        # 1. Leer configuración dinámica
        cursor.execute("SELECT tolerancia_espera_minutos FROM configuracion_negocio LIMIT 1;")
        row = cursor.fetchone()
        tolerancia_minutos = row[0] if row else 8
        
        # 2. Buscar paradas retrasadas
        cursor.execute("""
            SELECT p.id, p.traslado_id 
            FROM paradas_traslado p
            JOIN traslados_equipo t ON t.id = p.traslado_id
            JOIN faenas f ON f.chofer_id = p.chofer_id
            WHERE t.estado IN ('en_curso', 'programado') 
            AND EXTRACT(EPOCH FROM (NOW() - f.fecha_hora_programada))/60 > %s
        """, (tolerancia_minutos,))
        
        retrasos = cursor.fetchall()
        
        for stop_id, shuttle_route_id in retrasos:
            # 3. Invocar fn_desacoplar_chofer_retrasado (ahora usa semántica stop_id internamente)
            cursor.execute("SELECT fn_desacoplar_chofer_retrasado(%s);", (stop_id,))
            affected_shuttle_routes.add(shuttle_route_id)
            
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()
        
    return list(affected_shuttle_routes)
