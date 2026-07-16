import psycopg2
import uuid
DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Obtener el chofer de la DB
    cursor.execute("SELECT id FROM choferes WHERE nombre = 'Carlos Demo' LIMIT 1")
    ch_id = cursor.fetchone()[0]

    # Crear cliente y vehiculo dummy
    cursor.execute("INSERT INTO clientes (id, nombre, tipo) VALUES (gen_random_uuid(), 'Test Cliente', 'particular') RETURNING id")
    cli_id = cursor.fetchone()[0]

    cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, año, patente, tipo, transmision, es_electrico) VALUES (gen_random_uuid(), %s, 'Nissan', 'Leaf', 2023, %s, 'auto', 'automatico', true) RETURNING id", (cli_id, f"TST{str(uuid.uuid4())[:4]}"))
    veh_id = cursor.fetchone()[0]

    # Insertar faena ofrecida
    cursor.execute("""
        INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, estado, modalidad, origen_descripcion, destino_descripcion, origen, chofer_ofrecido_id) 
        VALUES (gen_random_uuid(), %s, %s, 'programada', 'por_hora', 'Av Siempreviva 742', 'Centro', ST_GeomFromText('POINT(-56.164 -34.901)', 4326), %s)
    """, (cli_id, veh_id, ch_id))

if __name__ == '__main__':
    main()
