import json

with open('tests/baseline_resultados.json', 'r') as f1:
    b1 = json.load(f1)
with open('tests/baseline_resultados_v2.json', 'r') as f2:
    b2 = json.load(f2)

diff_count = 0
for v1, v2 in zip(b1, b2):
    # En baseline_resultados.json el campo se llama 'asignado' o 'vehiculo_asignado' (hay que revisar),
    # pero vimos que la dif del output de simulacion_100_viajes.py era: 
    # {'viaje_id': 61, 'pasajeros': 6, 'asignado': 'v_61_1'...} -> no, veamos:
    # La Orden #4 cambió 'asignado' por 'asignado_original'.
    a1 = v1.get('asignado_original') or v1.get('asignado')
    a2 = v2.get('asignado_original')
    if a1 != a2:
        print(f"Diff en Viaje {v1['viaje_id']}: Antes={a1}, Nuevo={a2}")
        diff_count += 1
print(f"Total diffs: {diff_count}")
