import requests
import json
import time

ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

print("1. Registrando chofer...")
res_auth = requests.post(
    "http://127.0.0.1:54321/auth/v1/signup",
    headers={
        "apikey": ANON_KEY,
        "Content-Type": "application/json"
    },
    json={"email": "chofer_edge2@gebo.com", "password": "password123"}
)
auth_data = res_auth.json()
token = auth_data.get("access_token")

if not token:
    print("Error auth:", auth_data)
    exit(1)

print("Token obtenido con exito.")

print("2. LLamando Edge Function sync-gps...")
start_time = time.time()
res_edge = requests.post(
    "http://127.0.0.1:54321/functions/v1/sync-gps",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    json={
        "viaje_id": "11111111-1111-1111-1111-111111111111",
        "destino": {"lat": -34.9011, "lon": -56.1645},
        "posiciones": [
            {"lat": -34.9000, "lon": -56.1600, "ts": "2026-06-14T10:00:00Z"},
            {"lat": -34.9011, "lon": -56.1646, "ts": "2026-06-14T10:00:01Z"}
        ]
    }
)
latency = (time.time() - start_time) * 1000
print(f"Status Code: {res_edge.status_code}")
print(f"Response: {res_edge.text}")
print(f"Latencia: {latency:.2f} ms")

print("3. Verificando DB Asincrona...")
time.sleep(1) # Esperar a que la promesa async termine
import psycopg2
try:
    conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM posiciones;")
    count = cursor.fetchone()[0]
    print(f"Posiciones en DB: {count}")
except Exception as e:
    print("DB error:", e)
