import psycopg2

conn = psycopg2.connect('postgresql://postgres:postgres@127.0.0.1:54322/postgres')
cur = conn.cursor()

cur.execute("SELECT c.id FROM clientes c JOIN auth.users u ON c.usuario_id = u.id WHERE u.email = 'cliente1@gebo.com'")
client_row = cur.fetchone()
print('Cliente ID:', client_row)

if client_row:
    cur.execute("SELECT id, estado, fecha_hora_programada FROM faenas WHERE cliente_id = %s", (client_row[0],))
    print('Faenas:', cur.fetchall())
