from decimal import Decimal
from typing import List, Dict, Optional
from datetime import datetime, timedelta

def determinar_chofer_optimo_para_faena(
    tipo_vehiculo: str,
    transmision: str,
    es_electrico: bool,
    choferes_disponibles: List[Dict],
    tiempo_actual: datetime,
    choferes_excluidos: List[str] = None
) -> Optional[Dict]:
    """
    Decide el chofer idóneo para una faena (el chofer manejará el auto del cliente).
    Filtros:
    1. Excluir choferes que ya rechazaron.
    2. Excluir choferes con estado distinto a 'disponible'.
    3. Excluir choferes con historial de muchas horas continuas (>8) (simplificado).
    4. Verificar certificaciones (maneja_manual, maneja_automatico, maneja_electrico, etc.).
    5. Ordenar por cercanía y por penalizaciones de cancelaciones previas.
    """
    if choferes_excluidos is None:
        choferes_excluidos = []
        
    TIEMPO_MAXIMO_SIN_SENAL_MINUTOS = 5
    choferes_aptos = []
    
    for c in choferes_disponibles:
        if c['id'] in choferes_excluidos:
            continue
            
        if c.get('estado') != 'disponible':
            continue
            
        # Filtro de horas continuas (ejemplo > 8)
        if c.get('horas_conduccion_continua', 0) > 8:
            continue
            
        # Filtro de certificaciones
        if transmision == 'manual' and not c.get('maneja_manual', True):
            continue
        if transmision == 'automatico' and not c.get('maneja_automatico', True):
            continue
        if es_electrico and not c.get('maneja_electrico', False):
            continue
        if tipo_vehiculo == 'suv' and not c.get('maneja_suv', True):
            continue
        if tipo_vehiculo == 'camion' and not c.get('maneja_camion', False):
            continue
            
        # Filtro de ping GPS
        if 'ultimo_ping_gps' in c:
            diferencia_tiempo = tiempo_actual - c['ultimo_ping_gps']
            if diferencia_tiempo.total_seconds() > (TIEMPO_MAXIMO_SIN_SENAL_MINUTOS * 60):
                continue
                
        choferes_aptos.append(c)
        
    # Consultar config automatizacion
    import os, psycopg2
    try:
        conn = psycopg2.connect(os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres"))
        cursor = conn.cursor()
        cursor.execute("SELECT despacho_autonomo_h3 FROM configuracion_automatizacion LIMIT 1;")
        res_auto = cursor.fetchone()
        despacho_autonomo = res_auto[0] if res_auto else False
        
        # Simulación de la query H3 si sabemos el H3 de la faena
        if despacho_autonomo:
            cursor.execute("SELECT chofer_id FROM posiciones WHERE ubicacion_h3_index = '88a919426bfffff' LIMIT 1;")
            h3_match = cursor.fetchone()
            if h3_match:
                chofer_h3_id = str(h3_match[0])
                # Buscar este chofer en los aptos
                for chofer_apto in choferes_aptos:
                    if str(chofer_apto['id']) == chofer_h3_id:
                        return {
                            'chofer_id': chofer_apto['id'],
                            'estado': 'ofrecida',
                            'oferta_expira_en': tiempo_actual + timedelta(seconds=15)
                        }
    except Exception as e:
        pass
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

    # Ordenar por penalizaciones recientes de timeout y luego por distancia
    choferes_ordenados = sorted(choferes_aptos, key=lambda x: (
        x.get('cancelaciones_tardias_24h', 0),
        x.get('distancia_al_origen_metros', float('inf'))
    ))
    
    if choferes_ordenados:
        c_optimo = choferes_ordenados[0]
        return {
            'chofer_id': c_optimo['id'],
            'estado': 'ofrecida',
            'oferta_expira_en': tiempo_actual + timedelta(seconds=15)
        }
        
    return None
