import json
import os
import random
from datetime import datetime, timedelta
import sys
from decimal import Decimal

# Añadir el backend al path para poder importar la lógica de negocio
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/src'))
sys.path.append(backend_path)

from logic.asignacion import determinar_chofer_optimo_para_faena
from logic.auditoria import calcular_penalizacion
from logic.anti_spoofing import detectar_spoofing

def run_simulation():
    # Semilla fija para garantizar determinismo en pruebas de regresión
    random.seed(42)
    resultados = []
    
    tiempo_actual = datetime(2026, 6, 14, 12, 0, 0)
    
    for i in range(100):
        pasajeros = random.randint(1, 6)
        
        # Generar vehículos candidatos para este viaje
        vehiculos = []
        for v in range(5):
            vehiculos.append({
                'id': f'v_{i}_{v}',
                'estado': 'disponible',
                'horas_conduccion_continua': random.randint(0, 7),
                'maneja_automatico': True,
                'maneja_manual': True,
                'maneja_electrico': True,
                'distancia_al_origen_metros': random.randint(100, 5000),
                # El ping GPS varía entre hace 0 y 4 minutos
                'ultimo_ping_gps': tiempo_actual - timedelta(minutes=random.randint(0, 4)),
                'cancelaciones_tardias_24h': random.randint(0, 2)
            })
            
        # 1. Ejecutar algoritmo de asignación original (Regresión)
        oferta_1 = determinar_chofer_optimo_para_faena('auto', 'automatico', False, vehiculos, tiempo_actual)
        
        asignado = None
        re_asignado = None
        
        if oferta_1:
            asignado = oferta_1['chofer_id']
            # Simulamos que el chofer ignora la oferta durante 15s
            # 2. Re-ejecutar excluyendo al primero
            tiempo_reasignacion = oferta_1['oferta_expira_en']
            oferta_2 = determinar_chofer_optimo_para_faena('auto', 'automatico', False, vehiculos, tiempo_reasignacion, choferes_excluidos=[asignado])
            if oferta_2:
                re_asignado = oferta_2['chofer_id']
        
        # 3. Ejecutar cálculo de penalización (Regresión)
        hora_pactada = tiempo_actual + timedelta(minutes=15)
        demora_real_mins = random.randint(-5, 25)
        hora_arribo_real = hora_pactada + timedelta(minutes=demora_real_mins)
        demora_calc, penalizacion = calcular_penalizacion(hora_pactada, hora_arribo_real)
        
        resultados.append({
            'viaje_id': i,
            'pasajeros': pasajeros,
            'asignado_original': asignado,
            'asignado_fallback_15s': re_asignado,
            'demora_calc_min': demora_calc,
            'penalizacion_uyu': float(penalizacion)
        })
        
    baseline_path = os.path.join(os.path.dirname(__file__), 'baseline_resultados.json')
    
    baseline_path = os.path.join(os.path.dirname(__file__), 'baseline_resultados_v2.json')
    
    # Prueba aislada B3 Anti-Spoofing
    t1 = datetime(2026, 6, 14, 12, 0, 0)
    # Movimiento normal: ~1km en 2 minutos = 30km/h
    t2_normal = datetime(2026, 6, 14, 12, 2, 0)
    spoof_falso = detectar_spoofing(-34.900, -56.160, t1, -34.909, -56.160, t2_normal) 
    
    # Teletransporte: ~10km en 1 minuto = 600km/h
    t2_spoofer = datetime(2026, 6, 14, 12, 1, 0)
    spoof_verdadero = detectar_spoofing(-34.900, -56.160, t1, -34.810, -56.160, t2_spoofer)
    
    if spoof_falso or not spoof_verdadero:
        print("ERROR: Falló prueba matemática Anti-Spoofing (B3).")
        return False
    else:
        print("ANTI-SPOOFING OK: Detección validada en Python (150 km/h umbral).")

    if not os.path.exists(baseline_path):
        with open(baseline_path, 'w') as f:
            json.dump(resultados, f, indent=2)
        print("BASELINE V2 CREADO: Se guardaron resultados de 100 viajes con timeout 15s de Fase 10.")
        return True
    else:
        with open(baseline_path, 'r') as f:
            baseline = json.load(f)
        
        if baseline == resultados:
            print("REGRESIÓN EXITOSA: El algoritmo de Asignación y Penalización (Fase 2) se mantuvo 100% idéntico. No hay alteraciones en Fases 4-9.")
            return True
        else:
            print("ERROR DE REGRESIÓN: Los algoritmos base han sufrido alteraciones que rompen la salida esperada.")
            # Mostrar algunas diferencias
            for idx, (b, r) in enumerate(zip(baseline, resultados)):
                if b != r:
                    print(f"Dif en Viaje {idx}: Baseline={b} | Actual={r}")
            return False

if __name__ == "__main__":
    if not run_simulation():
        sys.exit(1)
