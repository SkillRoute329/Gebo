import random
from datetime import datetime, timedelta

random.seed(42)
tiempo_actual = datetime(2026, 6, 14, 12, 0, 0)

for i in range(100):
    pasajeros = random.randint(1, 6)
    vehiculos = []
    for v in range(5):
        vehiculos.append({
            'id': f'v_{i}_{v}',
            'tipo': random.choice(['vagoneta', 'taxi_tercero']),
            'capacidad': random.randint(4, 8),
            'distancia_al_origen_metros': random.randint(100, 5000),
            'ultimo_ping_gps': tiempo_actual - timedelta(minutes=random.randint(0, 10))
        })
    demora_real_mins = random.randint(-5, 25)
    
    if i == 16:
        print(f"Pasajeros: {pasajeros}")
        for v in vehiculos:
            gps = (tiempo_actual - v['ultimo_ping_gps']).total_seconds() / 60
            print(f"{v['id']} ({v['tipo']}, Cap: {v['capacidad']}, Dist: {v['distancia_al_origen_metros']}, GPS: {gps} min)")
