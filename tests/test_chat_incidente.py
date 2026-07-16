import os
import time
import psycopg2

DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres"

def run_tests():
    print("Testing Chat e Incidentes...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    try:
        # Create users
        cursor.execute("SELECT id FROM choferes LIMIT 1")
        ch_id = cursor.fetchone()[0]
        cursor.execute("SELECT usuario_id FROM choferes WHERE id = %s", (ch_id,))
        ch_uid = cursor.fetchone()[0]

        cursor.execute("SELECT id FROM clientes LIMIT 1")
        cli_id = cursor.fetchone()[0]
        cursor.execute("SELECT usuario_id FROM clientes WHERE id = %s", (cli_id,))
        cli_uid = cursor.fetchone()[0]

        cursor.execute("SELECT id FROM vehiculos_cliente WHERE cliente_id = %s LIMIT 1", (cli_id,))
        veh_id = cursor.fetchone()[0]

        # 1. Create a faena en_curso
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, chofer_id, estado, modalidad, fecha_hora_inicio_real, costo_total)
            VALUES (gen_random_uuid(), %s, %s, %s, 'en_curso', 'por_hora', NOW(), 0) RETURNING id
        """, (cli_id, veh_id, ch_id))
        faena_id = cursor.fetchone()[0]

        # 2. Test chat message as chofer
        cursor.execute("""
            SET request.jwt.claim.role = 'authenticated';
            SET request.jwt.claim.sub = %s;
        """, (str(ch_uid),))
        
        cursor.execute("""
            INSERT INTO mensajes_faena (faena_id, emisor_id, rol_emisor, contenido)
            VALUES (%s, %s, 'chofer', 'Hola, estoy llegando') RETURNING id
        """, (faena_id, ch_id))
        msg_id_1 = cursor.fetchone()[0]

        # 3. Test read chat as cliente
        cursor.execute("""
            SET request.jwt.claim.sub = %s;
        """, (str(cli_uid),))
        cursor.execute("SELECT COUNT(*) FROM mensajes_faena WHERE faena_id = %s", (faena_id,))
        count = cursor.fetchone()[0]
        if count != 1: raise Exception(f"Cliente no ve el mensaje (count: {count})")

        cursor.execute("""
            INSERT INTO mensajes_faena (faena_id, emisor_id, rol_emisor, contenido)
            VALUES (%s, %s, 'cliente', 'Perfecto, te espero')
        """, (faena_id, cli_id))

        # 4. Test Incidente from Chofer
        cursor.execute("""
            SET request.jwt.claim.sub = %s;
        """, (str(ch_uid),))
        cursor.execute("""
            INSERT INTO incidentes_faena (faena_id, reportado_por_id, descripcion)
            VALUES (%s, %s, 'Choque leve en la esquina') RETURNING id
        """, (faena_id, ch_id))
        inc_id = cursor.fetchone()[0]
        
        # Simulated frontend updating faena
        cursor.execute("""
            UPDATE faenas SET estado = 'incidente' WHERE id = %s
        """, (faena_id,))

        cursor.execute("SELECT ultimo_inicio_pausa FROM faenas WHERE id = %s", (faena_id,))
        res = cursor.fetchone()
        if not res[0]: raise Exception("ultimo_inicio_pausa no se seteo")

        # 5. Wait 2 seconds
        time.sleep(2)

        # 6. Admin resolves incidente
        cursor.execute("""
            SET request.jwt.claim.role = 'admin';
            SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000';
            UPDATE incidentes_faena SET estado = 'resuelto' WHERE id = %s;
            UPDATE faenas SET estado = 'en_curso' WHERE id = %s;
        """, (inc_id, faena_id))

        cursor.execute("SELECT tiempo_pausa_acumulado_segundos, ultimo_inicio_pausa FROM faenas WHERE id = %s", (faena_id,))
        res = cursor.fetchone()
        print(f"Pausa acumulada: {res[0]}s")
        if res[0] < 1: raise Exception("tiempo_pausa_acumulado_segundos no sumo el tiempo (deberia ser ~2s)")
        if res[1] is not None: raise Exception("ultimo_inicio_pausa no se limpio")

        print("Tests Chat e Incidentes: PASSED")

    except Exception as e:
        print(f"Error: {e}")
        exit(1)
    finally:
        cursor.execute("RESET ALL")
        conn.close()

if __name__ == "__main__":
    run_tests()
