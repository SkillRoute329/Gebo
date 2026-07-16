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
