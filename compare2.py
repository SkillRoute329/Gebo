import json
import random
from datetime import datetime, timedelta

def get_vehicles_for_trip(trip_id):
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
        if i == trip_id:
            return vehiculos

with open('tests/baseline_resultados.json', 'r') as f1:
    b1 = json.load(f1)
with open('tests/baseline_resultados_v2.json', 'r') as f2:
    b2 = json.load(f2)

tiempo_actual = datetime(2026, 6, 14, 12, 0, 0)
diff_count = 0
for v1, v2 in zip(b1, b2):
    a1 = v1.get('asignado_original') or v1.get('asignado')
    a2 = v2.get('asignado_original')
    if a1 != a2:
        vehiculos = get_vehicles_for_trip(v1['viaje_id'])
        v_a1 = next((v for v in vehiculos if v['id'] == a1), None)
        v_a2 = next((v for v in vehiculos if v['id'] == a2), None)
        
        print(f"Viaje {v1['viaje_id']}:")
        if v_a1:
            gps_a1 = (tiempo_actual - v_a1['ultimo_ping_gps']).total_seconds() / 60
            print(f"  Antes: {a1} ({v_a1['tipo']}, Cap: {v_a1['capacidad']}, GPS: hace {gps_a1} min, Dist: {v_a1['distancia_al_origen_metros']}m)")
        if v_a2:
            gps_a2 = (tiempo_actual - v_a2['ultimo_ping_gps']).total_seconds() / 60
            print(f"  Nuevo: {a2} ({v_a2['tipo']}, Cap: {v_a2['capacidad']}, GPS: hace {gps_a2} min, Dist: {v_a2['distancia_al_origen_metros']}m)")
        diff_count += 1
print(f"Total diffs: {diff_count}")
