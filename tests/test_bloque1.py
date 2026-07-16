import os
import psycopg2
import pytest
from datetime import datetime, timedelta

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def get_conn():
    return psycopg2.connect(DB_URL)

def test_faenas_programadas_schema():
    conn = get_conn()
    cur = conn.cursor()
    # Limpiar faenas
    cur.execute("DELETE FROM faenas")
    conn.commit()

    # Buscar un cliente y un vehiculo
    cur.execute("SELECT id FROM clientes LIMIT 1")
    cliente_id = cur.fetchone()[0]
    cur.execute("SELECT id FROM vehiculos_cliente WHERE cliente_id = %s LIMIT 1", (cliente_id,))
    vehiculo_id = cur.fetchone()[0]

    faena_id = "11111111-1111-1111-1111-111111111111"
    
    # Insertar faena programada
    fecha_prog = datetime.now() + timedelta(days=1)
    
    try:
        cur.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, modalidad, estado, tipo_viaje, fecha_hora_programada)
            VALUES (%s, %s, %s, 'por_minuto', 'programada', 'programada', %s)
        """, (faena_id, cliente_id, vehiculo_id, fecha_prog))
        conn.commit()
    except Exception as e:
        pytest.fail(f"Fallo al insertar faena programada: {e}")

    # Verificar que el estado incidente es valido
    try:
        cur.execute("UPDATE faenas SET estado = 'incidente' WHERE id = %s", (faena_id,))
        conn.commit()
    except Exception as e:
        pytest.fail(f"El estado 'incidente' no fue aceptado: {e}")

    cur.close()
    conn.close()

def test_mensajes_faena_y_incidentes():
    conn = get_conn()
    cur = conn.cursor()
    
    faena_id = "11111111-1111-1111-1111-111111111111"
    cur.execute("SELECT cliente_id FROM faenas WHERE id = %s", (faena_id,))
    cliente_id = cur.fetchone()[0]

    cur.execute("SELECT id FROM choferes LIMIT 1")
    chofer_id = cur.fetchone()[0]

    # Insertar mensaje
    try:
        cur.execute("""
            INSERT INTO mensajes_faena (faena_id, emisor_id, rol_emisor, contenido)
            VALUES (%s, %s, 'cliente', 'Hola, ya llegaste?')
        """, (faena_id, cliente_id))
        conn.commit()
    except Exception as e:
        pytest.fail(f"Fallo al insertar mensaje: {e}")

    # Insertar incidente
    try:
        cur.execute("""
            INSERT INTO incidentes_faena (faena_id, reportado_por_id, descripcion, estado)
            VALUES (%s, %s, 'Choque leve', 'reportado')
        """, (faena_id, chofer_id))
        conn.commit()
    except Exception as e:
        pytest.fail(f"Fallo al insertar incidente: {e}")

    cur.close()
    conn.close()

def test_push_subscriptions():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT auth.uid() FROM auth.users LIMIT 1")
    res = cur.fetchone()
    if res and res[0]:
        user_id = res[0]
    else:
        # Fake UUID for testing structure
        user_id = "99999999-9999-9999-9999-999999999999"

    try:
        cur.execute("""
            INSERT INTO push_subscriptions (user_id, endpoint, auth, p256dh)
            VALUES (%s, 'https://endpoint.com', 'authkey', 'p256dhkey')
        """, (user_id,))
        conn.commit()
    except Exception as e:
        pytest.fail(f"Fallo al insertar push_subscription: {e}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    test_faenas_programadas_schema()
    test_mensajes_faena_y_incidentes()
    test_push_subscriptions()
    print("Tests del Bloque 1 pasaron exitosamente.")
