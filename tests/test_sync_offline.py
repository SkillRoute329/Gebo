import os
import uuid
import sys
import datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient
import psycopg2

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.src.api.posiciones import router as posiciones_router

app = FastAPI()
app.include_router(posiciones_router)
client = TestClient(app)

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO SIMULACIÓN DE SINCRONIZACIÓN OFFLINE BATCH")
    test_id = str(uuid.uuid4())[:8]
    
    chofer_user_id = str(uuid.uuid4())
    chofer_id = str(uuid.uuid4())
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # Seed
        print_step("🌱", "Fase 1: Preparación (Seed Chofer)")
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_user_id, f"chofer_offline_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer Offline', 'disponible', true);", (chofer_id, chofer_user_id))
        print_sub(f"Chofer creado (ID: {chofer_id[:8]}...)")
        
        # Simular pings en tunel de Av. Italia (pasado)
        print_step("📡", "Fase 2: Ingreso a Túnel Av. Italia (Perdida de Señal)")
        now = datetime.datetime.utcnow()
        t1 = (now - datetime.timedelta(minutes=3)).isoformat()
        t2 = (now - datetime.timedelta(minutes=2)).isoformat()
        t3 = (now - datetime.timedelta(minutes=1)).isoformat()
        
        pings = [
            {"chofer_id": chofer_id, "lat": -34.8910, "lng": -56.1400, "timestamp": t1},
            {"chofer_id": chofer_id, "lat": -34.8915, "lng": -56.1450, "timestamp": t2},
            {"chofer_id": chofer_id, "lat": -34.8920, "lng": -56.1500, "timestamp": t3}
        ]
        print_sub("Almacenando localmente 3 pings históricos en el dispositivo...")
        
        # Batch Sync
        print_step("📶", "Fase 3: Señal Recuperada (Sincronización Batch API)")
        response = client.post("/api/posiciones/sync-batch", json=pings)
        assert response.status_code == 200, f"Error en API: {response.text}"
        data = response.json()
        assert data["status"] == "success" and data["synced"] == 3
        print_sub(f"Respuesta API exitosa. Registros procesados: {data['synced']}")
        
        # Validar en base de datos
        print_step("🔍", "Fase 4: Validación de H3 e Integridad de Histórico")
        cursor.execute("SELECT timestamp, h3_res8, ST_Y(ubicacion::geometry), ST_X(ubicacion::geometry) FROM posiciones WHERE chofer_id = %s ORDER BY timestamp ASC;", (chofer_id,))
        records = cursor.fetchall()
        assert len(records) == 3, "No se guardaron todos los pings"
        
        for idx, row in enumerate(records):
            ts_str = row[0].isoformat()
            h3_val = row[1]
            lat = row[2]
            lng = row[3]
            print_sub(f"📍 Ping {idx+1}: {ts_str} -> Lat: {lat}, Lng: {lng} | 📦 H3: {h3_val}")
            assert h3_val is not None, "El trigger de H3 falló al procesar el ping batch"
        
        print_step("✅", "PRUEBA DE SINCRONIZACIÓN OFFLINE EXITOSA")
        
    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 5: Cleanup")
        cursor.execute("DELETE FROM posiciones WHERE chofer_id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM auth.users WHERE id = %s;", (chofer_user_id,))
        print_sub("Chofer y posiciones eliminadas.")
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
