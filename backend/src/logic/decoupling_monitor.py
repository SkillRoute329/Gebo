import os
import psycopg2
from typing import List

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def evaluar_y_desacoplar_traslados_retrasados() -> List[str]:
    """
    Evalúa paradas en espera, lee la configuración de tolerancia,
    desacopla choferes retrasados e invoca la re-secuenciación SQL.
    Retorna lista de traslado_ids afectados.
    """
    traslados_afectados = set()
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cursor = conn.cursor()
    
    try:
        # 1. Leer configuración dinámica
        cursor.execute("SELECT tolerancia_espera_minutos FROM configuracion_negocio LIMIT 1;")
        row = cursor.fetchone()
        tolerancia_minutos = row[0] if row else 8
        
        # 2. Buscar paradas retrasadas
        # Como faenas puede no tener una fecha clara de cuando el chofer llegó al origen para empezar
        # a esperar, para este escenario asumiremos que la demora se calcula desde fecha_hora_programada
        # Si EXTRACT(EPOCH FROM (NOW() - f.fecha_hora_programada))/60 > tolerancia_minutos
        
        cursor.execute("""
            SELECT p.id, p.traslado_id 
            FROM paradas_traslado p
            JOIN traslados_equipo t ON t.id = p.traslado_id
            JOIN faenas f ON f.chofer_id = p.chofer_id
            WHERE t.estado IN ('en_curso', 'programado') 
            AND EXTRACT(EPOCH FROM (NOW() - f.fecha_hora_programada))/60 > %s
        """, (tolerancia_minutos,))
        
        retrasos = cursor.fetchall()
        
        for parada_id, traslado_id in retrasos:
            # 3. Invocar fn_desacoplar_chofer_retrasado
            cursor.execute("SELECT fn_desacoplar_chofer_retrasado(%s);", (parada_id,))
            traslados_afectados.add(traslado_id)
            
        conn.commit()
        
        # En una arquitectura completa, aquí se invocaría a routing_engine.py 
        # para re-calcular los tiempos de viaje (ETAs) de las secuencias restantes.
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()
        
    return list(traslados_afectados)
