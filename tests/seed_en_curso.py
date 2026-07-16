import psycopg2
import sys

DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres"

def main():
    action = sys.argv[1]
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    if action == 'seed':
        cursor.execute("SELECT c.id FROM choferes c JOIN auth.users u ON c.usuario_id = u.id WHERE u.email = 'chofer1@gebo.com'")
        ch_id = cursor.fetchone()[0]
        cursor.execute("SELECT id FROM clientes LIMIT 1")
        cli_id = cursor.fetchone()[0]
        cursor.execute("SELECT id FROM vehiculos_cliente WHERE cliente_id = %s LIMIT 1", (cli_id,))
        veh_id = cursor.fetchone()[0]

        faena_id = '11111111-1111-1111-1111-111111111111'
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, chofer_id, estado, modalidad, origen, destino, fecha_hora_inicio_real)
            VALUES (%s, %s, %s, %s, 'en_curso', 'por_hora', ST_GeomFromText('POINT(-56.164 -34.901)', 4326), ST_GeomFromText('POINT(-56.165 -34.902)', 4326), NOW() - INTERVAL '5 minutes')
            ON CONFLICT (id) DO UPDATE SET estado = 'en_curso', chofer_id = EXCLUDED.chofer_id
        """, (faena_id, cli_id, veh_id, ch_id))
        
        cursor.execute("UPDATE choferes SET estado = 'en_faena' WHERE id = %s", (ch_id,))
        
        conn.commit()
    elif action == 'cleanup':
        cursor.execute("DELETE FROM faenas WHERE id = '11111111-1111-1111-1111-111111111111'")

if __name__ == "__main__":
    main()
