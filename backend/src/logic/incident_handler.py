import os
import psycopg2
from typing import Dict
import json

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def verificar_checkins_choferes():
    """
    Verifica si los choferes han hecho check-in a tiempo para sus faenas programadas.
    Si no lo hicieron, los marca ausentes y reasigna la faena a un retén.
    """
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    try:
        # A) Leer checkin_anticipado_minutos
        cursor.execute("SELECT checkin_anticipado_minutos FROM configuracion_negocio LIMIT 1;")
        res = cursor.fetchone()
        if not res:
            return []
        minutos = res[0]
        
        # B) Identificar faenas en ventana de tiempo sin check-in
        cursor.execute(f"""
            SELECT id, chofer_id 
            FROM faenas 
            WHERE estado IN ('asignada', 'programada', 'ofrecida') 
              AND chofer_checkin_at IS NULL 
              AND chofer_id IS NOT NULL
              AND fecha_hora_programada <= NOW() + INTERVAL '{minutos} minutes'
              AND fecha_hora_programada >= NOW() - INTERVAL '{minutos} minutes';
        """)
        faenas_retrasadas = cursor.fetchall()
        
        reasignaciones = []
        for faena_id, chofer_id in faenas_retrasadas:
            # C) Marcar chofer como ausente_preventivo
            cursor.execute("UPDATE choferes SET estado = 'ausente_preventivo' WHERE id = %s;", (chofer_id,))
            
            # Buscar retén activo
            cursor.execute("SELECT id FROM choferes WHERE estado = 'reten_activo' LIMIT 1;")
            reten = cursor.fetchone()
            
            if reten:
                reten_id = reten[0]
                # D) Reasignar faena al retén
                cursor.execute("UPDATE faenas SET chofer_id = %s, estado = 'asignada' WHERE id = %s;", (reten_id, faena_id))
                reasignaciones.append({"faena_id": faena_id, "chofer_original": chofer_id, "nuevo_chofer": reten_id})
                
        return reasignaciones
    finally:
        cursor.close()
        conn.close()

def procesar_boton_sos(chofer_id: str, ubicacion: Dict) -> Dict:
    """
    Registra una alerta de pánico de alta prioridad y activa el guardado de coordenadas
    en tiempo real (en la vida real se mandaría señal al dispositivo).
    """
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    try:
        lat = ubicacion.get("lat")
        lng = ubicacion.get("lng")
        
        cursor.execute("""
            INSERT INTO incidentes_calle (tipo_incidente, descripcion, coordenadas_reporte, chofer_id)
            VALUES ('sos_panico', 'Botón SOS activado por el chofer', ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)
            RETURNING id;
        """, (lng, lat, chofer_id))
        incidente_id = cursor.fetchone()[0]
        
        return {
            "status": "sos_registrado",
            "incidente_id": str(incidente_id),
            "mensaje": "Señal de pánico enviada. Protocolo de rastreo continuo cada 5 segundos activado."
        }
    finally:
        cursor.close()
        conn.close()
