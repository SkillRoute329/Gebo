import psycopg2

try:
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres",
        password="postgres",
        host="127.0.0.1",
        port="54322"
    )
    cursor = conn.cursor()
    cursor.execute("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;")
    conn.commit()
    print("Granted privileges to service_role.")
    cursor.close()
    conn.close()
except Exception as e:
    print("Error:", e)
