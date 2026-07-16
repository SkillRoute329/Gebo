import math
from datetime import datetime

UMBRAL_SPOOFING_KMH = 150.0
RADIO_TIERRA_METROS = 6371000.0

def calcular_distancia_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return RADIO_TIERRA_METROS * c

def calcular_velocidad_kmh(lat1: float, lon1: float, ts1: datetime, lat2: float, lon2: float, ts2: datetime) -> float:
    delta_horas = abs((ts2 - ts1).total_seconds()) / 3600.0
    if delta_horas == 0:
        return 0.0
    
    distancia_km = calcular_distancia_haversine(lat1, lon1, lat2, lon2) / 1000.0
    return distancia_km / delta_horas

def detectar_spoofing(lat1: float, lon1: float, ts1: datetime, lat2: float, lon2: float, ts2: datetime) -> bool:
    velocidad = calcular_velocidad_kmh(lat1, lon1, ts1, lat2, lon2, ts2)
    return velocidad > UMBRAL_SPOOFING_KMH
