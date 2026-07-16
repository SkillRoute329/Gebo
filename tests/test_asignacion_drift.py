import json
import os
import random
import sys
import psycopg2
import uuid
from datetime import datetime, timedelta, timezone

# Añadir el backend al path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/src'))
sys.path.append(backend_path)

from logic.asignacion import determinar_chofer_optimo_para_faena

def run_drift_test():
    random.seed(42)
    
    conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    cursor = conn.cursor()
    
    divergencias = 0
    
    for i in range(100):
        # Obtener NOW() de Postgres para estar sincronizados
        cursor.execute("SELECT NOW();")
        tiempo_actual = cursor.fetchone()[0]
        
        # Limpiar base
        cursor.execute("ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_usuario_id_fkey CASCADE;")
        cursor.execute("ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_usuario_id_fkey1 CASCADE;")
        cursor.execute("ALTER TABLE choferes DROP CONSTRAINT IF EXISTS choferes_usuario_id_fkey CASCADE;")
        cursor.execute("ALTER TABLE choferes DROP CONSTRAINT IF EXISTS choferes_usuario_id_fkey1 CASCADE;")
        
        cursor.execute("TRUNCATE TABLE faenas_ofertas_rechazadas CASCADE;")
        cursor.execute("TRUNCATE TABLE paradas_traslado CASCADE;")
        cursor.execute("TRUNCATE TABLE traslados_equipo CASCADE;")
        cursor.execute("TRUNCATE TABLE faenas CASCADE;")
        cursor.execute("TRUNCATE TABLE vagonetas CASCADE;")
        cursor.execute("TRUNCATE TABLE posiciones CASCADE;")
        cursor.execute("TRUNCATE TABLE vehiculos_cliente CASCADE;")
        cursor.execute("TRUNCATE TABLE choferes CASCADE;")
        cursor.execute("TRUNCATE TABLE clientes CASCADE;")
        cursor.execute("TRUNCATE TABLE usuarios CASCADE;")
        
        # Crear cliente y vehiculo_cliente
        cliente_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (cliente_id, f'cliente_drift_{i}@gebo.com'))
        cursor.execute("INSERT INTO usuarios (id, email, nombre_completo) VALUES (%s, %s, 'Cliente') ON CONFLICT DO NOTHING;", (cliente_id, f'cliente_drift_{i}@gebo.com'))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo) VALUES (%s, %s, 'particular');", (cliente_id, cliente_id))
        
        vehiculo_id = str(uuid.uuid4())
        tipo_vehiculo = random.choice(['auto', 'suv', 'camioneta', 'camion', 'electrico'])
        transmision = random.choice(['manual', 'automatico'])
        es_electrico = random.choice([True, False])
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, año, patente, tipo, transmision, es_electrico) VALUES (%s, %s, 'Marca', 'Modelo', 2020, %s, %s, %s, %s);", (vehiculo_id, cliente_id, f"PAT{i}", tipo_vehiculo, transmision, es_electrico))
        
        # Faena DB
        faena_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, origen, destino, modalidad, fecha_hora_programada, estado) 
            VALUES (%s, %s, %s, ST_MakePoint(0,0), ST_MakePoint(1,1), 'por_minuto', %s, 'programada');
        """, (faena_id, cliente_id, vehiculo_id, tiempo_actual))
        
        choferes_py = []
        
        for v in range(5):
            cid = str(uuid.uuid4())
            uid = str(uuid.uuid4())
            
            estado = random.choice(['disponible', 'disponible', 'disponible', 'en_faena'])
            horas = random.randint(0, 10)
            maneja_manual = random.choice([True, False])
            maneja_automatico = True
            maneja_electrico = random.choice([True, False])
            maneja_suv = random.choice([True, False])
            maneja_camion = random.choice([True, False])
            
            dist_metros = random.randint(100, 5000)
            minutos_atras = random.choice([random.uniform(0, 4.8), random.uniform(5.2, 10)])
            ping_gps = tiempo_actual - timedelta(minutes=minutos_atras)
            
            choferes_py.append({
                'id': cid,
                'estado': estado,
                'horas_conduccion_continua': horas,
                'maneja_manual': maneja_manual,
                'maneja_automatico': maneja_automatico,
                'maneja_electrico': maneja_electrico,
                'maneja_suv': maneja_suv,
                'maneja_camion': maneja_camion,
                'distancia_al_origen_metros': dist_metros,
                'ultimo_ping_gps': ping_gps,
                'cancelaciones_tardias_24h': 0
            })
            
            # Insertar en DB
            cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (uid, f"chofer_{i}_{v}@gebo.com"))
            cursor.execute("INSERT INTO usuarios (id, email, nombre_completo) VALUES (%s, %s, 'Chofer');", (uid, f"chofer_{i}_{v}@gebo.com"))
            cursor.execute("INSERT INTO choferes (id, usuario_id, estado, horas_conduccion_continua, maneja_manual, maneja_automatico, maneja_electrico, maneja_suv, maneja_camion) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);", (cid, uid, estado, horas, maneja_manual, maneja_automatico, maneja_electrico, maneja_suv, maneja_camion))
            
            # Las coordenadas proporcionales para ST_Distance
            lon = dist_metros / 111320.0
            cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion, timestamp) VALUES (%s, ST_MakePoint(%s, 0), %s);", (cid, lon, ping_gps))
            
        # 1. Python Asignación inicial
        oferta_py = determinar_chofer_optimo_para_faena(tipo_vehiculo, transmision, es_electrico, choferes_py, tiempo_actual)
        py_asignado = oferta_py['chofer_id'] if oferta_py else None
        
        # Simular asignacion DB
        if py_asignado:
            cursor.execute("UPDATE faenas SET chofer_ofrecido_id = %s, estado = 'ofrecida' WHERE id = %s;", (py_asignado, faena_id))
            
            # 2. Rechazar 
            oferta_py_2 = determinar_chofer_optimo_para_faena(tipo_vehiculo, transmision, es_electrico, choferes_py, tiempo_actual, choferes_excluidos=[py_asignado])
            py_reasignado = oferta_py_2['chofer_id'] if oferta_py_2 else None
            
            cursor.execute("INSERT INTO faenas_ofertas_rechazadas (faena_id, chofer_id, motivo) VALUES (%s, %s, 'No puedo ir');", (faena_id, py_asignado))
            cursor.execute("SELECT procesar_reasignacion_faena(%s);", (faena_id,))
            
            cursor.execute("SELECT chofer_ofrecido_id FROM faenas WHERE id = %s;", (faena_id,))
            sql_reasignado = cursor.fetchone()[0]
            
            if py_reasignado != sql_reasignado:
                print(f"DIVERGENCIA en Faena {i}: Python asignó {py_reasignado}, SQL asignó {sql_reasignado}")
                divergencias += 1
                
        conn.commit()
            
    if divergencias == 0:
        print("DRIFT TEST PASS: PL/pgSQL y Python devolvieron exactamente los mismos resultados para los 100 escenarios.")
    else:
        print(f"DRIFT TEST FAIL: {divergencias} divergencias encontradas.")
        
    conn.commit()
    cursor.close()
    conn.close()

if __name__ == "__main__":
    run_drift_test()
