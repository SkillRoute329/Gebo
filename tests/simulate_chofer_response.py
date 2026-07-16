import psycopg2
import sys

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    if len(sys.argv) < 3:
        print("Usage: python simulate_chofer_response.py <action> <cliente_email>")
        sys.exit(1)
        
    action = sys.argv[1]
    email = sys.argv[2]
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    
    # Obtener el cliente_id a partir del email
    cur.execute("SELECT c.id FROM clientes c JOIN auth.users u ON c.usuario_id = u.id WHERE u.email = %s", (email,))
    row = cur.fetchone()
    if not row:
        print(f"Error: Cliente con email {email} no encontrado.")
        sys.exit(1)
    cliente_id = row[0]
    
    # Buscar faena actual
    cur.execute("SELECT id FROM faenas WHERE cliente_id = %s ORDER BY fecha_hora_programada DESC LIMIT 1", (cliente_id,))
    row = cur.fetchone()
    if not row:
        print("Error: faena no encontrada.")
        sys.exit(1)
    faena_id = row[0]
    
    # Un chofer demo de la BD
    cur.execute("SELECT id FROM choferes LIMIT 1")
    chofer_id = cur.fetchone()[0]

    if action == "assign":
        cur.execute("UPDATE faenas SET estado = 'chofer_en_camino', chofer_id = %s, asignada_en = NOW() WHERE id = %s", (chofer_id, faena_id))
        print("Faena asignada a chofer (chofer_en_camino).")
    
    elif action == "arrive":
        cur.execute("UPDATE faenas SET estado = 'chofer_llegó' WHERE id = %s", (faena_id,))
        print("Chofer llegó al origen.")
        
    elif action == "start":
        cur.execute("UPDATE faenas SET estado = 'en_curso', fecha_hora_inicio_real = NOW() WHERE id = %s", (faena_id,))
        print("Faena iniciada (en_curso).")
        
    elif action == "finish":
        cur.execute("UPDATE faenas SET estado = 'finalizada', fecha_hora_fin_real = NOW(), costo_total = 450 WHERE id = %s", (faena_id,))
        print("Faena finalizada.")
        
    else:
        print("Acción no reconocida")

if __name__ == "__main__":
    main()
