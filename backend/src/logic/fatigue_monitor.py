import os
import psycopg2
from typing import Dict

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres?prepared_statement_cache_size=0")

def monitorear_fatiga_choferes() -> Dict:
    """
    Monitorea los minutos de conducción de los choferes y fuerza descansos o emite alertas de fatiga.
    """
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    resultados = {"alertas": [], "descansos_forzados": []}
    
    try:
        # Leer parametros
        cursor.execute("SELECT limite_conduccion_minutos, descanso_obligatorio_minutos, jornada_maxima_minutos FROM configuracion_negocio LIMIT 1;")
        params = cursor.fetchone()
        if not params:
            return resultados
            
        lim_conduccion, descanso_min, lim_jornada = params
        
        # Revisar turnos activos
        cursor.execute("""
            SELECT t.id, t.chofer_id, t.minutos_conduccion_acumulados
            FROM turnos_chofer t
            JOIN choferes c ON c.id = t.chofer_id
            WHERE t.estado_laboral = 'activo' AND c.estado NOT IN ('en_descanso', 'jornada_finalizada');
        """)
        turnos = cursor.fetchall()
        
        for turno_id, chofer_id, acumulado in turnos:
            if acumulado >= lim_conduccion:
                # Actualizar estado a descanso y bloquear asignaciones
                cursor.execute("""
                    UPDATE turnos_chofer 
                    SET estado_laboral = 'en_descanso', fin_descanso_estimado = NOW() + INTERVAL '%s minutes'
                    WHERE id = %s RETURNING fin_descanso_estimado;
                """, (descanso_min, turno_id))
                fin_descanso = cursor.fetchone()[0]
                
                cursor.execute("UPDATE choferes SET estado = 'en_descanso' WHERE id = %s;", (chofer_id,))
                
                # Desvincular de paradas pendientes de rescate o en vagoneta?
                cursor.execute("UPDATE paradas_traslado SET chofer_id = NULL WHERE chofer_id = %s AND completada = FALSE;", (chofer_id,))
                
                # Desvincular faenas en estado asignada
                cursor.execute("UPDATE faenas SET chofer_id = NULL, estado = 'programada' WHERE chofer_id = %s AND estado IN ('asignada', 'ofrecida');", (chofer_id,))
                
                resultados["descansos_forzados"].append({
                    "chofer_id": str(chofer_id),
                    "fin_descanso_estimado": str(fin_descanso)
                })
                
            elif acumulado >= lim_conduccion - 15:
                # Crear alerta de advertencia en incidentes_calle
                cursor.execute("""
                    INSERT INTO incidentes_calle (tipo_incidente, descripcion, chofer_id)
                    VALUES ('advertencia_fatiga', 'Chofer próximo al límite de conducción continua', %s); 
                """, (chofer_id,))
                resultados["alertas"].append(str(chofer_id))
                
        return resultados
    finally:
        cursor.close()
        conn.close()
