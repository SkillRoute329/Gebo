import psycopg2
DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
conn = psycopg2.connect(DB_URL)
conn.autocommit = True
conn.cursor().execute("UPDATE choferes SET estado = 'inactivo'")
print("Updated estado to inactivo")
