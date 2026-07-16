import psycopg2

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
conn = psycopg2.connect(DB_URL)
cursor = conn.cursor()

cursor.execute("SELECT c.id, c.nombre, c.usuario_id, u.email FROM choferes c JOIN auth.users u ON u.id = c.usuario_id WHERE u.email = 'chofer1@gebo.com';")
res = cursor.fetchall()

print("RESULTADO DE LA QUERY:")
for r in res:
    print(r)

if len(res) == 0:
    print("No hay chofer1@gebo.com en la tabla choferes!")

conn.close()
