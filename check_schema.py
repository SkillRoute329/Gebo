import os
import psycopg2

conn = psycopg2.connect(os.environ.get('SUPABASE_DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'))
cursor = conn.cursor()

def check_columns(table):
    cursor.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}';")
    cols = cursor.fetchall()
    print(f'-- {table} columns:')
    for c in cols: print(f'   {c[0]}: {c[1]}')

check_columns('posiciones')
check_columns('chats_faenas')
check_columns('solicitudes_financieras_chofer')
check_columns('faenas')
check_columns('centros_de_costo')
