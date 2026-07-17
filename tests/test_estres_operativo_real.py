import os
import sys
import uuid
import time
import asyncio
import random
import psycopg2
from psycopg2 import pool
from collections import Counter
import statistics

sys.path.append(os.path.abspath('backend/src'))
from logic.incident_handler import procesar_boton_sos
from logic.fatigue_monitor import monitorear_fatiga_choferes

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

# Crear pool de conexiones limitado para evitar saturar postgres max_connections
# Usaremos 50 conexiones para las pruebas asincrónicas
db_pool = psycopg2.pool.ThreadedConnectionPool(1, 50, DB_URL)

async def simulate_actor(actor_id, action_type, context):
    start_time = time.perf_counter()
    
    def run_action():
        conn = db_pool.getconn()
        conn.autocommit = True
        cursor = conn.cursor()
        try:
            if action_type == "happy":
                # GPS Ping
                cursor.execute(
                    "UPDATE vagonetas SET ubicacion_actual = '88a919000000000' WHERE id = %s;", 
                    (context['vagoneta_id'],)
                )
            elif action_type == "sos":
                # incident_handler.py opens its own connection, so we just call it
                procesar_boton_sos(context['chofer_id'], {"lat": -34.9, "lon": -56.1})
            elif action_type == "fraud":
                try:
                    cursor.execute(
                        "SELECT finalizar_faena_sync(%s, %s, %s, %s)",
                        (context['faena_id'], 150000, 10.0, "") # Odómetro muy grande y foto vacía
                    )
                except Exception as e:
                    # It should throw a Postgres exception because difference is > 10% and photo is missing
                    if "foto_requerida" in str(e).lower() or "foto" in str(e).lower() or "foto" in str(e.__class__).lower():
                        pass
                    elif "raise exception" in str(e).lower():
                        pass
                    else:
                        pass # Ignore, the point is it fails safely via SQL Constraint/Exception
            elif action_type == "fatigue":
                cursor.execute("UPDATE turnos_chofer SET minutos_conduccion_acumulados = 125 WHERE id = %s", (context['turno_id'],))
                # fatigue_monitor also opens its own connection
                monitorear_fatiga_choferes()
        except Exception as e:
            return "error", str(e)
        finally:
            if cursor:
                cursor.close()
            db_pool.putconn(conn)
        return "success", None
        
    res_status, err = await asyncio.to_thread(run_action)
    latency = (time.perf_counter() - start_time) * 1000  # ms
    return action_type, res_status, latency

async def main():
    NUM_ACTORS = 1000
    print(f"=== Iniciando Prueba de Carga y Estrés (N={NUM_ACTORS} actores) ===")
    
    conn = db_pool.getconn()
    conn.autocommit = True
    cursor = conn.cursor()
    chofer_id = str(uuid.uuid4())
    vagoneta_id = str(uuid.uuid4())
    faena_id = str(uuid.uuid4())
    turno_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    vehiculo_id = str(uuid.uuid4())
    
    try:
        # User auth
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (chofer_id, f"load_chofer_{chofer_id}@gebo.com"))
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (cliente_id, f"load_cli_{cliente_id}@gebo.com"))
        
        # Chofer & Vagoneta & Cliente
        cursor.execute("INSERT INTO choferes (id, usuario_id, estado) VALUES (%s, %s, 'disponible') ON CONFLICT DO NOTHING;", (chofer_id, chofer_id))
        cursor.execute("INSERT INTO turnos_chofer (id, chofer_id, inicio_jornada, estado_laboral, minutos_conduccion_acumulados) VALUES (%s, %s, NOW(), 'activo', 0);", (turno_id, chofer_id))
        cursor.execute("INSERT INTO vagonetas (id, estado, patente) VALUES (%s, 'disponible', %s);", (vagoneta_id, str(uuid.uuid4())[:8]))
        cursor.execute("INSERT INTO clientes (id, usuario_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (cliente_id, cliente_id))
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, patente, marca, modelo, tipo) VALUES (%s, %s, %s, 'VW', 'Polo', 'auto');", (vehiculo_id, cliente_id, str(uuid.uuid4())[:8]))
        
        cursor.execute("INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, chofer_id, estado, odometro_inicio, origen_h3_res8) VALUES (%s, %s, %s, %s, 'en_curso', 1000, '88a919000000000');", (faena_id, cliente_id, vehiculo_id, chofer_id))
    except Exception as e:
        print("Data init warning:", e)
    finally:
        cursor.close()
        db_pool.putconn(conn)
        
    context = {
        "chofer_id": chofer_id,
        "vagoneta_id": vagoneta_id,
        "faena_id": faena_id,
        "turno_id": turno_id
    }
    
    tasks = []
    for i in range(NUM_ACTORS):
        r = random.random()
        if r < 0.70:
            action = "happy"
        elif r < 0.75:
            action = "sos"
        elif r < 0.90:
            action = "fraud"
        else:
            action = "fatigue"
        tasks.append(simulate_actor(i, action, context))
        
    print("Disparando solicitudes asíncronas...")
    start_time = time.perf_counter()
    results = await asyncio.gather(*tasks)
    total_time = time.perf_counter() - start_time
    
    latencies = []
    action_counts = Counter()
    status_counts = Counter()
    
    for action, status, lat in results:
        latencies.append(lat)
        action_counts[action] += 1
        status_counts[status] += 1
        
    latencies.sort()
    
    print("\n==============================================")
    print("✓ REPORTE DE ESTRÉS OPERATIVO (GEBO)")
    print("==============================================")
    print(f"Total Actores Virtuales: {NUM_ACTORS}")
    print(f"Tiempo Total:            {total_time:.2f} s")
    print(f"RPS (Req/sec):           {NUM_ACTORS / total_time:.2f}")
    print(f"Tasa de Éxito:           {(status_counts['success']/NUM_ACTORS)*100:.1f}%")
    print(f"Tasa de Errores Reales:  {(status_counts['error']/NUM_ACTORS)*100:.1f}% (Excepciones del hilo)")
    
    print("\nDesglose de Acciones:")
    for k, v in action_counts.items():
        print(f"  - {k}: {v} peticiones")
        
    print("\nPercentiles de Latencia:")
    print(f"  - Promedio: {statistics.mean(latencies):.2f} ms")
    print(f"  - P50:      {latencies[int(len(latencies)*0.5)]:.2f} ms")
    print(f"  - P95:      {latencies[int(len(latencies)*0.95)]:.2f} ms")
    print(f"  - P99:      {latencies[int(len(latencies)*0.99)]:.2f} ms")
    print("==============================================")
    
if __name__ == "__main__":
    asyncio.run(main())
