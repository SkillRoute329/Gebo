import os
import uuid
import sys
import psycopg2

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic')))
from decoupling_monitor import evaluar_y_desacoplar_traslados_retrasados

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE DESACOPLE DINÁMICO")
    test_id = str(uuid.uuid4())[:8]
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    vagoneta_id = str(uuid.uuid4())
    cliente_user_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    vehiculo_id = str(uuid.uuid4())
    
    # Chofer A (Retrasado)
    chofer_a_user_id = str(uuid.uuid4())
    chofer_a_id = str(uuid.uuid4())
    faena_a_id = str(uuid.uuid4())
    parada_a_id = str(uuid.uuid4())
    
    # Chofer B (Normal)
    chofer_b_user_id = str(uuid.uuid4())
    chofer_b_id = str(uuid.uuid4())
    faena_b_id = str(uuid.uuid4())
    parada_b_id = str(uuid.uuid4())
    
    traslado_id = str(uuid.uuid4())

    try:
        # Seed Base
        print_step("🌱", "Fase 1: Preparación (Seed)")
        
        # Configurar tolerancia dinámica a 5 min
        cursor.execute("UPDATE configuracion_negocio SET tolerancia_espera_minutos = 5;")
        print_sub("Tolerancia de negocio configurada a 5 minutos.")

        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (cliente_user_id, f"cliente_desacople_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre) VALUES (%s, %s, 'particular', 'Cliente Test');", (cliente_id, cliente_user_id))
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, patente, tipo) VALUES (%s, %s, 'Marca', %s, 'auto');", (vehiculo_id, cliente_id, f"DES-{test_id}"))
        
        # Vagoneta
        cursor.execute("INSERT INTO vagonetas (id, patente, modelo, capacidad, estado, ubicacion_actual) VALUES (%s, %s, 'H3 Van', 12, 'en_ruta', ST_SetSRID(ST_MakePoint(-56.1652, -34.8941), 4326));", (vagoneta_id, f"VAG-DES-{test_id}"))

        # Choferes
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_a_user_id, f"chofer_a_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer A Retrasado', 'en_faena', true);", (chofer_a_id, chofer_a_user_id))
        
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_b_user_id, f"chofer_b_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer B Normal', 'en_faena', true);", (chofer_b_id, chofer_b_user_id))

        # Faenas (Chofer A creado hace 6 minutos - RETRASADO)
        cursor.execute("""
            INSERT INTO faenas (id, chofer_id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'en_curso', NOW() - INTERVAL '6 minutes');
        """, (faena_a_id, chofer_a_id, cliente_id, vehiculo_id))
        print_sub("Faena Chofer A insertada con retraso de 6 minutos.")

        # Faena (Chofer B creado recién - NORMAL)
        cursor.execute("""
            INSERT INTO faenas (id, chofer_id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1651, -34.8942), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'en_curso', NOW() - INTERVAL '1 minutes');
        """, (faena_b_id, chofer_b_id, cliente_id, vehiculo_id))
        print_sub("Faena Chofer B insertada con tiempo normal (1 minuto).")

        # Traslado
        cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, tipo, fecha_hora, estado) VALUES (%s, %s, 'retorno', NOW(), 'en_curso');", (traslado_id, vagoneta_id))
        cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, chofer_id, secuencia, punto) VALUES (%s, %s, %s, 1, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326));", (parada_a_id, traslado_id, chofer_a_id))
        cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, chofer_id, secuencia, punto) VALUES (%s, %s, %s, 2, ST_SetSRID(ST_MakePoint(-56.1651, -34.8942), 4326));", (parada_b_id, traslado_id, chofer_b_id))
        
        print_sub("Cola Original: [Secuencia 1 = Chofer A, Secuencia 2 = Chofer B]")

        print_step("🤖", "Fase 2: Ejecución del Decoupling Monitor")
        afectados = evaluar_y_desacoplar_traslados_retrasados()
        print_sub(f"El monitor reportó traslados afectados: {afectados}")
        
        assert traslado_id in afectados, "El traslado no fue procesado por el monitor."

        print_step("🔍", "Fase 3: Verificación de Integridad de Cola")
        # Revisamos qué paradas quedaron
        cursor.execute("SELECT chofer_id, secuencia FROM paradas_traslado WHERE traslado_id = %s ORDER BY secuencia ASC;", (traslado_id,))
        paradas_actualizadas = cursor.fetchall()
        
        print_sub(f"Cola Actualizada (Chofer_id, Secuencia): {paradas_actualizadas}")
        
        # Validaciones fuertes
        assert len(paradas_actualizadas) == 1, "Debería quedar solo 1 parada."
        assert paradas_actualizadas[0][0] == chofer_b_id, "La parada restante debería ser la del Chofer B."
        assert paradas_actualizadas[0][1] == 1, "La parada del Chofer B debería haber subido a la secuencia 1."
        
        print_sub("✅ VERIFICADO: La parada del Chofer A fue removida.")
        print_sub("✅ VERIFICADO: La secuencia del Chofer B se ajustó correctamente de 2 a 1 cerrando la brecha.")
        
        print_step("🏆", "PRUEBA DE DESACOPLE DINÁMICO SUPERADA")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM paradas_traslado WHERE traslado_id = %s;", (traslado_id,))
        cursor.execute("DELETE FROM traslados_equipo WHERE id = %s;", (traslado_id,))
        cursor.execute("DELETE FROM faenas WHERE id IN (%s, %s);", (faena_a_id, faena_b_id))
        cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        cursor.execute("DELETE FROM choferes WHERE id IN (%s, %s);", (chofer_a_id, chofer_b_id))
        cursor.execute("DELETE FROM vehiculos_cliente WHERE id = %s;", (vehiculo_id,))
        cursor.execute("DELETE FROM clientes WHERE id = %s;", (cliente_id,))
        cursor.execute("DELETE FROM auth.users WHERE id IN (%s, %s, %s);", (chofer_a_user_id, chofer_b_user_id, cliente_user_id))
        print_sub("Registros de prueba eliminados.")
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
