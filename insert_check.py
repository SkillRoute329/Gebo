import psycopg2
import uuid
import datetime

conn = psycopg2.connect('postgresql://postgres:postgres@127.0.0.1:54322/postgres')
cur = conn.cursor()

try:
    cur.execute("SELECT id FROM vehiculos_cliente WHERE cliente_id = '33333333-3333-3333-3333-333333333333' LIMIT 1")
    vehiculo_row = cur.fetchone()
    if not vehiculo_row:
        print('No vehicles found for client')
    else:
        vehiculo_id = vehiculo_row[0]
        cur.execute("""
            INSERT INTO faenas (cliente_id, vehiculo_cliente_id, origen, destino, estado, modalidad, fecha_hora_programada)
            VALUES ('33333333-3333-3333-3333-333333333333', %s, 
            ST_GeomFromText('POINT(-56 -34)', 4326), ST_GeomFromText('POINT(-56 -35)', 4326), 
            'programada', 'por_minuto', NOW()) RETURNING id
        """, (vehiculo_id,))
        print('Inserted:', cur.fetchone())
        conn.commit()
except Exception as e:
    print('Error:', e)
