import psycopg2

conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
cursor = conn.cursor()

cursor.execute("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='choferes';")
print("Grants for choferes:")
for row in cursor.fetchall():
    print(row)

cursor.execute("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='clientes';")
print("Grants for clientes:")
for row in cursor.fetchall():
    print(row)
