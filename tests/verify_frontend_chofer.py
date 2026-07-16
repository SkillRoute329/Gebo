import requests
import json
import psycopg2
from datetime import datetime

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SUPABASE_URL = "http://127.0.0.1:54321"
ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

def run_verification():
    print("--- VERIFICACIÓN DE FLUJO FRONTEND (ORDEN #22.3) ---")
    
    # 1. We need a valid JWT for a Chofer
    # First, let's create a chofer using the edge function just like in test 1
    email = f"chofer_{int(datetime.now().timestamp())}@gebo.com"
    pwd = "password123"
    
    # Sign up via Supabase Auth
    print("\n1. Simulando Login de Chofer...")
    resp = requests.post(f"{SUPABASE_URL}/auth/v1/signup", headers={
        "apikey": ANON_KEY,
        "Content-Type": "application/json"
    }, json={"email": email, "password": pwd})
    
    if resp.status_code != 200:
        print(f"Error creando usuario: {resp.text}")
        return
        
    session = resp.json()
    token = session['access_token']
    user_id = session['user']['id']
    
    # Force the role and create the chofer profile in DB to simulate a real chofer
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("UPDATE auth.users SET raw_app_meta_data = '{\"role\":\"chofer\"}'::jsonb WHERE id = %s", (user_id,))
    cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_manual) VALUES (gen_random_uuid(), %s, 'Juan Frontend', 'inactivo', true) RETURNING id", (user_id,))
    ch_id = cursor.fetchone()[0]
    
    # Common headers for PostgREST
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # 2. Query de Perfil
    print("\n2. Simulando query del perfil de chofer...")
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/choferes?usuario_id=eq.{user_id}&select=*", headers=headers)
    if resp.status_code == 200 and len(resp.json()) > 0:
        profile = resp.json()[0]
        print(f"[OK] Perfil retornado exitosamente: {profile['nombre']} (Estado: {profile['estado']})")
    else:
        print(f"[FAIL] Error obteniendo perfil: {resp.text}")
        return

    # 3. Query de Vagoneta Programada
    print("\n3. Simulando query de Paradas de Vagoneta...")
    # Inject a scheduled stop
    cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (gen_random_uuid(), 'VAG-FRNT', 'disponible') RETURNING id")
    v_id = cursor.fetchone()[0]
    cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, estado, tipo, fecha_hora) VALUES (gen_random_uuid(), %s, 'programado', 'ida', NOW()) RETURNING id", (v_id,))
    t_id = cursor.fetchone()[0]
    cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, chofer_id, tipo, completada, descripcion) VALUES (gen_random_uuid(), %s, %s, 'recogida', false, 'Av Siempreviva 123') RETURNING id", (t_id, ch_id))
    pt_id = cursor.fetchone()[0]
    
    # Query like Supabase JS client
    today = datetime.now().strftime('%Y-%m-%d')
    url = f"{SUPABASE_URL}/rest/v1/paradas_traslado?select=id,punto,descripcion,tipo,traslados_equipo!inner(fecha_hora,estado)&chofer_id=eq.{ch_id}&completada=eq.false&tipo=eq.recogida&traslados_equipo.fecha_hora=gte.{today}&order=traslados_equipo(fecha_hora).asc&limit=1"
    
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200 and len(resp.json()) > 0:
        parada = resp.json()[0]
        print(f"[OK] Parada programada encontrada: {parada['descripcion']}")
    else:
        print(f"[FAIL] Error obteniendo parada: {resp.text}")

    # 4. INSERT de posicion
    print("\n4. Simulando INSERT de posición (GPS)...")
    payload = {
        "chofer_id": ch_id,
        "ubicacion": "POINT(-56 -34)" # PostgREST automatically converts this to Geography if the column is Geography
    }
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/posiciones", headers=headers, json=payload)
    if resp.status_code in [200, 201]:
        print(f"[OK] Posición guardada con éxito desde el cliente.")
    else:
        print(f"[FAIL] Error guardando posición: {resp.text}")

    # Cleanup
    print("\nLimpiando DB de pruebas...")
    cursor.execute("DELETE FROM paradas_traslado WHERE id = %s", (pt_id,))
    cursor.execute("DELETE FROM traslados_equipo WHERE id = %s", (t_id,))
    cursor.execute("DELETE FROM vagonetas WHERE id = %s", (v_id,))
    cursor.execute("DELETE FROM posiciones WHERE chofer_id = %s", (ch_id,))
    cursor.execute("DELETE FROM choferes WHERE id = %s", (ch_id,))
    cursor.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))
    conn.close()

if __name__ == "__main__":
    run_verification()
