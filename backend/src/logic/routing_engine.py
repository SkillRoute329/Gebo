import math
from typing import List, Dict, Any

def haversine_dist(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula la distancia en metros entre dos coordenadas utilizando la fórmula de Haversine.
    """
    R = 6371e3  # Radio de la Tierra en metros
    p1 = lat1 * math.pi / 180
    p2 = lat2 * math.pi / 180
    dp = (lat2 - lat1) * math.pi / 180
    dl = (lon2 - lon1) * math.pi / 180
    a = math.sin(dp / 2) * math.sin(dp / 2) + \
        math.cos(p1) * math.cos(p2) * \
        math.sin(dl / 2) * math.sin(dl / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def optimizar_ruta_vagoneta(traslado_id: str, ubicacion_vagoneta: Dict[str, float], paradas_pendientes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Motor de Re-Ruteo Dinámico Continuo (Micro-VRP).
    
    Recibe la ubicación actual de la vagoneta en tránsito y la lista de choferes 
    esperando ser interceptados o recogidos (paradas). Calcula el orden óptimo de recolección
    utilizando una estrategia de 'Vecino Más Cercano' (Greedy TSP).
    
    Esta hoja de ruta modificada debe emitirse por WebSockets a la App de la Vagoneta.
    
    Args:
        traslado_id (str): ID UUID del traslado/ruta activa en la base de datos.
        ubicacion_vagoneta (Dict[str, float]): Coordenadas actuales {'lat': -34.90, 'lng': -56.16}.
        paradas_pendientes (List[Dict]): Lista de paradas a evaluar. Ejemplo:
            [
                {'parada_id': 'uuid-1', 'chofer_id': 'chof-1', 'lat': -34.910, 'lng': -56.155},
                {'parada_id': 'uuid-2', 'chofer_id': 'chof-2', 'lat': -34.908, 'lng': -56.160}
            ]
            
    Returns:
        List[Dict]: Secuencia óptima in-place con métricas adicionales de distancia y ETA.
    """
    
    if not paradas_pendientes:
        return []
        
    paradas_optimizadas: List[Dict[str, Any]] = []
    punto_actual = ubicacion_vagoneta
    
    # Trabajamos con una copia mutable para el algoritmo Greedy
    pendientes = list(paradas_pendientes)
    
    distancia_acumulada_m = 0.0
    secuencia_dinamica = 1
    
    # Velocidad urbana promedio estimada para vagoneta en Montevideo: 30 km/h = 8.33 m/s
    VELOCIDAD_PROMEDIO_M_S = 8.33
    
    while pendientes:
        # 1. Encontrar la parada más cercana (Greedy Nearest Neighbor)
        parada_cercana = None
        distancia_minima = float('inf')
        
        for parada in pendientes:
            dist = haversine_dist(
                punto_actual['lat'], punto_actual['lng'], 
                parada['lat'], parada['lng']
            )
            if dist < distancia_minima:
                distancia_minima = dist
                parada_cercana = parada
                
        # 2. Registrar el hito de la ruta y calcular ETA
        distancia_acumulada_m += distancia_minima
        
        parada_cercana['secuencia'] = secuencia_dinamica
        parada_cercana['distancia_tramo_m'] = round(distancia_minima, 2)
        parada_cercana['distancia_acumulada_m'] = round(distancia_acumulada_m, 2)
        parada_cercana['eta_minutos'] = round(distancia_acumulada_m / (VELOCIDAD_PROMEDIO_M_S * 60), 1)
        
        paradas_optimizadas.append(parada_cercana)
        
        # 3. Avanzar virtualmente la vagoneta hacia esa parada para la próxima iteración
        punto_actual = {'lat': parada_cercana['lat'], 'lng': parada_cercana['lng']}
        pendientes.remove(parada_cercana)
        secuencia_dinamica += 1
        
    return paradas_optimizadas
