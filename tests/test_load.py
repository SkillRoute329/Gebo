import psycopg2
import time
import random
import uuid

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def run_load_test():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    print("--- INICIANDO TEST DE CARGA (ORDEN #21.2) ---")
    
    # 1. Setup Data
    print("Insertando datos de prueba (50 faenas, 20 choferes con 200 posiciones, 5 vagonetas)...")
    
    choferes_creados = []
    clientes_creados = []
    faenas_creadas = []
    vagonetas_creadas = []
    traslados_creados = []
    paradas_creadas = []

    cursor.execute("INSERT INTO clientes (id, nombre, activo) VALUES (gen_random_uuid(), 'Load Client', true) RETURNING id")
    client_id = cursor.fetchone()[0]
    clientes_creados.append(client_id)

    # Insert 20 choferes available and 50 choferes in en_faena
    choferes_disp = []
    for i in range(20):
        cursor.execute("INSERT INTO choferes (id, nombre, estado, maneja_manual) VALUES (gen_random_uuid(), %s, 'disponible', true) RETURNING id", (f"Disp {i}",))
        choferes_disp.append(cursor.fetchone()[0])
        
    choferes_faena = []
    for i in range(50):
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (gen_random_uuid(), %s, 'en_faena') RETURNING id", (f"Faena {i}",))
        choferes_faena.append(cursor.fetchone()[0])

    # Insert 50 faenas en_curso
    for ch_id in choferes_faena:
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, chofer_id, estado, fecha_hora_programada, origen, destino) 
            VALUES (gen_random_uuid(), %s, %s, 'en_curso', NOW(), ST_GeomFromText('POINT(0 0)', 4326), ST_GeomFromText('POINT(1 1)', 4326))
            RETURNING id
        """, (client_id, ch_id))
        faenas_creadas.append(cursor.fetchone()[0])

    # Insert 200 posiciones for the 20 disponible choferes (10 each)
    for ch_id in choferes_disp:
        for j in range(10):
            lat, lng = -34.90 + random.uniform(-0.1, 0.1), -56.16 + random.uniform(-0.1, 0.1)
            # simulate 3 sec intervals using NOW() - interval
            cursor.execute("""
                INSERT INTO posiciones (chofer_id, timestamp, ubicacion)
                VALUES (%s, NOW() - interval '%s seconds', ST_GeomFromText('POINT(%s %s)', 4326))
            """, (ch_id, j * 3, lng, lat))

    # Insert 5 vagonetas with traslados and 3 paradas each
    for i in range(5):
        patente = f"VAG-{str(uuid.uuid4())[:4]}"
        cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (gen_random_uuid(), %s, 'disponible') RETURNING id", (patente,))
        vag_id = cursor.fetchone()[0]
        vagonetas_creadas.append(vag_id)
        cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, estado, tipo) VALUES (gen_random_uuid(), %s, 'en_curso', 'ida') RETURNING id", (vag_id,))
        tras_id = cursor.fetchone()[0]
        traslados_creados.append(tras_id)
        for j in range(3):
            cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, punto, tipo, completada) VALUES (gen_random_uuid(), %s, ST_GeomFromText('POINT(0 0)', 4326), 'recogida', false) RETURNING id", (tras_id,))
            paradas_creadas.append(cursor.fetchone()[0])

    print("Datos insertados. Ejecutando mediciones de performance...\n")

    # TEST 1: getFaenasDelDia()
    start = time.time()
    cursor.execute("""
        SELECT f.*, c.nombre as cliente, ch.nombre as chofer
        FROM faenas f
        LEFT JOIN clientes c ON f.cliente_id = c.id
        LEFT JOIN choferes ch ON f.chofer_id = ch.id
        WHERE f.fecha_hora_programada >= CURRENT_DATE
    """)
    res1 = cursor.fetchall()
    t1 = (time.time() - start) * 1000

    # TEST 2: Conteo de choferes activos
    start = time.time()
    cursor.execute("SELECT count(*) FROM choferes WHERE estado IN ('disponible', 'en_faena', 'en_traslado')")
    res2 = cursor.fetchone()[0]
    t2 = (time.time() - start) * 1000

    # TEST 3: Query de asignación
    start = time.time()
    cursor.execute("""
        SELECT c.id, c.nombre, p.ubicacion <-> ST_GeomFromText('POINT(-56.164 -34.901)', 4326) as dist
        FROM choferes c
        JOIN posiciones p ON p.chofer_id = c.id
        WHERE c.estado = 'disponible' AND c.maneja_manual = true
          AND p.timestamp = (SELECT MAX(timestamp) FROM posiciones WHERE chofer_id = c.id)
        ORDER BY dist
        LIMIT 1
    """)
    res3 = cursor.fetchone()
    t3 = (time.time() - start) * 1000

    # RESULTS
    print(f"RESULTADOS DE PERFORMANCE:")
    print(f"- getFaenasDelDia() (Total {len(res1)}): {t1:.2f} ms")
    print(f"- Conteo choferes activos (Total {res2}): {t2:.2f} ms")
    print(f"- Query asignación (Chofer más cercano encontrado): {t3:.2f} ms")

    if t1 > 200 or t2 > 200 or t3 > 200:
        print("\n[ALERTA] Al menos una consulta excedió el umbral de 200ms.")
    else:
        print("\n[ÉXITO] Todas las consultas críticas respondieron en menos de 200ms bajo carga simulada.")

    # Cleanup
    print("\nLimpiando DB...")
    if paradas_creadas: cursor.execute("DELETE FROM paradas_traslado WHERE id = ANY(%s::uuid[])", (paradas_creadas,))
    if traslados_creados: cursor.execute("DELETE FROM traslados_equipo WHERE id = ANY(%s::uuid[])", (traslados_creados,))
    if faenas_creadas: cursor.execute("DELETE FROM faenas WHERE id = ANY(%s::uuid[])", (faenas_creadas,))
    if vagonetas_creadas: cursor.execute("DELETE FROM vagonetas WHERE id = ANY(%s::uuid[])", (vagonetas_creadas,))
    
    choferes_all = choferes_disp + choferes_faena
    if choferes_all:
        cursor.execute("DELETE FROM posiciones WHERE chofer_id = ANY(%s::uuid[])", (choferes_all,))
        cursor.execute("DELETE FROM choferes WHERE id = ANY(%s::uuid[])", (choferes_all,))
        
    if clientes_creados: cursor.execute("DELETE FROM clientes WHERE id = ANY(%s::uuid[])", (clientes_creados,))
    conn.close()

if __name__ == '__main__':
    run_load_test()
