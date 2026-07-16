import math
from typing import Tuple

# Constantes de Geometría
RADIO_TIERRA_METROS = 6371000
UMBRAL_ARRIBO_METROS = 50.0


def calcular_distancia_haversine(
    coord_a: Tuple[float, float], 
    coord_b: Tuple[float, float]
) -> float:
    """
    Calcula la distancia en metros entre dos coordenadas (longitud, latitud)
    usando la fórmula del semiverseno (Haversine).
    """
    lon1, lat1 = coord_a
    lon2, lat2 = coord_b
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
        
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return RADIO_TIERRA_METROS * c


def verificar_arribo(
    coordenadas_recientes_chofer: List[Tuple[float, float]], 
    coordenada_destino: Tuple[float, float]
) -> bool:
    """
    Función Pura (Domain-Driven Design).
    Verifica si el chofer ingresó a la geocerca de 50 metros del destino.
    
    PREVENCIÓN DE INCONVENIENTES (GPS Bouncing):
    En zonas céntricas o días nublados, el GPS del celular "salta" erráticamente.
    Para evitar que el sistema marque 'en_punto' por un salto fantasma del GPS,
    exigimos que al menos las ÚLTIMAS DOS lecturas consecutivas estén dentro de los 50m.
    
    Args:
        coordenadas_recientes_chofer: Lista de las últimas (longitud, latitud). Mínimo 2 recomendadas.
        coordenada_destino: (longitud, latitud) del objetivo del viaje.
        
    Returns:
        bool: True si hay confianza real de que está a <= 50m, False en caso contrario.
    """
    if len(coordenadas_recientes_chofer) < 2:
        # Si solo tenemos una lectura, somos estrictos y no disparamos el arribo 
        # hasta confirmar con el siguiente ping.
        return False
        
    lecturas_validas = 0
    # Verificamos las últimas 2 coordenadas del historial
    for coord in coordenadas_recientes_chofer[-2:]:
        distancia = calcular_distancia_haversine(coord, coordenada_destino)
        if distancia <= UMBRAL_ARRIBO_METROS:
            lecturas_validas += 1
            
    return lecturas_validas == 2
