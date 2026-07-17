import math

def getDistanceInMeters(lat1, lon1, lat2, lon2):
    if not lat1 or not lon1 or not lat2 or not lon2: return float('inf')
    R = 6371e3
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    deltaPhi = math.radians(lat2 - lat1)
    deltaLambda = math.radians(lon2 - lon1)

    a = math.sin(deltaPhi / 2) * math.sin(deltaPhi / 2) + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(deltaLambda / 2) * math.sin(deltaLambda / 2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def shouldSendPing(newCoords, lastSentCoords, inactiveSeconds):
    if not lastSentCoords: return True
    if inactiveSeconds >= 30: return True
    dist = getDistanceInMeters(newCoords['lat'], newCoords['lng'], lastSentCoords['lat'], lastSentCoords['lng'])
    if dist >= 5: return True
    return False

def test_semaforo():
    print("=== Iniciando Simulación de Tráfico Reducido (Filtro Delta) ===")
    
    # 20 pings cada 3 segundos (total 60 segundos)
    # Bulevar Artigas: -34.8951, -56.1663
    # Generaremos variaciones menores a 1 metro (ruido de señal)
    
    base_lat = -34.8951
    base_lon = -56.1663
    
    last_sent_coords = None
    last_sent_time = 0
    pings_enviados = 0
    
    for i in range(20):
        current_time = i * 3 # cada 3 segundos
        # ruido de +/- 0.000005 grados (~0.5 metros)
        noise_lat = (i % 2) * 0.000005
        noise_lon = (i % 3) * 0.000005
        
        new_coords = {'lat': base_lat + noise_lat, 'lng': base_lon + noise_lon}
        
        inactive_seconds = current_time - last_sent_time if last_sent_coords else 0
        
        send = shouldSendPing(new_coords, last_sent_coords, inactive_seconds)
        
        if send:
            print(f"[{current_time}s] Ping APROBADO de red. Dist/Tiempo superó umbral.")
            last_sent_coords = new_coords
            last_sent_time = current_time
            pings_enviados += 1
        else:
            print(f"[{current_time}s] Ping RECHAZADO (Redundante. Detenido).")
            
    assert pings_enviados <= 3, f"Se esperaban máximo 3 pings (inicial y safety de 30s). Pings reales: {pings_enviados}"
    
    print("\n[✓] Aserción Exitosa: De 20 lecturas de GPS, solo se transmitieron", pings_enviados)
    print(f"[✓] Tráfico de red reducido en un {(20 - pings_enviados)/20 * 100:.0f}% en condiciones de detención.")
    print("\n==============================================")
    print("✓ PRUEBA AVANZADA DELTA: COMPLETADA Y EXITOSA")
    print("==============================================")

if __name__ == "__main__":
    test_semaforo()
