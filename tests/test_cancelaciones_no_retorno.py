import os
import uuid
import sys
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE ZONA DE NO RETORNO (CANCELACIONES ABUSIVAS)")
    test_id = str(uuid.uuid4())[:8]
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # IDs Compartidos
    vagoneta_id = str(uuid.uuid4())
    cliente_user_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    vehiculo_id = str(uuid.uuid4())
    
    # IDs Caso A (Lejos)
    chofer_a_user_id = str(uuid.uuid4())
    chofer_a_id = str(uuid.uuid4())
    faena_a_id = str(uuid.uuid4())
    traslado_a_id = str(uuid.uuid4())
    
    # IDs Caso B (Cerca)
    chofer_b_user_id = str(uuid.uuid4())
    chofer_b_id = str(uuid.uuid4())
    faena_b_id = str(uuid.uuid4())
    traslado_b_id = str(uuid.uuid4())

    try:
        # Seed Base
        print_step("🌱", "Fase 1: Preparación (Seed)")
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (cliente_user_id, f"cliente_cancel_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre) VALUES (%s, %s, 'particular', 'Cliente Cancelador');", (cliente_id, cliente_user_id))
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, patente, tipo) VALUES (%s, %s, 'Marca', %s, 'auto');", (vehiculo_id, cliente_id, f"CAN-{test_id}"))
        
        # Vagoneta (Base en Tres Cruces)
        cursor.execute("INSERT INTO vagonetas (id, patente, modelo, capacidad, estado, ubicacion_actual) VALUES (%s, %s, 'H3 Van', 12, 'en_ruta', ST_SetSRID(ST_MakePoint(-56.1652, -34.8941), 4326));", (vagoneta_id, f"VAG-CAN-{test_id}"))
        print_sub(f"Vagoneta creada y ubicada en Tres Cruces (-34.8941, -56.1652)")

        # CASO A: Lejos
        print_step("🧪", "Fase 2: Caso A - Cancelación Lejana (Sin Penalización)")
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_a_user_id, f"chofer_a_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer A', 'disponible', true);", (chofer_a_id, chofer_a_user_id))
        
        # Faena A origen Pocitos (-34.9080, -56.1490) -> Destino Centro
        cursor.execute("""
            INSERT INTO faenas (id, chofer_id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'en_curso', NOW());
        """, (faena_a_id, chofer_a_id, cliente_id, vehiculo_id))
        print_sub(f"Faena A creada con origen en Pocitos (-34.9080, -56.1490)")
        
        # Traslado A
        cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, tipo, fecha_hora, estado) VALUES (%s, %s, 'retorno', NOW(), 'en_curso');", (traslado_a_id, vagoneta_id))
        cursor.execute("INSERT INTO paradas_traslado (traslado_id, chofer_id, secuencia, punto) VALUES (%s, %s, 1, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326));", (traslado_a_id, chofer_a_id))
        
        cursor.execute("SELECT fn_procesar_cancelacion_faena(%s);", (faena_a_id,))
        res_a = cursor.fetchone()[0]
        assert res_a == 'SIN_PENALIZACION', f"Esperado SIN_PENALIZACION, obtenido {res_a}"
        
        cursor.execute("SELECT estado, costo_penalizacion FROM faenas WHERE id = %s;", (faena_a_id,))
        faena_a_data = cursor.fetchone()
        assert faena_a_data[0] == 'cancelada_cliente'
        assert faena_a_data[1] == 0
        print_sub(f"✅ Caso A Superado: Retornó {res_a} (Penalización: $ {faena_a_data[1]})")

        # CASO B: Cerca
        print_step("🧪", "Fase 3: Caso B - Cancelación Abusiva / Zona No Retorno (Penalización Total)")
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s);", (chofer_b_user_id, f"chofer_b_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) VALUES (%s, %s, 'Chofer B', 'disponible', true);", (chofer_b_id, chofer_b_user_id))
        
        # Faena B origen Tres Cruces (-34.8941, -56.1652) (misma ubicacion que vagoneta o muy cerca)
        cursor.execute("""
            INSERT INTO faenas (id, chofer_id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1651, -34.8942), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'en_curso', NOW());
        """, (faena_b_id, chofer_b_id, cliente_id, vehiculo_id))
        print_sub(f"Faena B creada con origen en Tres Cruces (A pocos metros de la Vagoneta)")
        
        # Traslado B
        cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, tipo, fecha_hora, estado) VALUES (%s, %s, 'retorno', NOW(), 'en_curso');", (traslado_b_id, vagoneta_id))
        cursor.execute("INSERT INTO paradas_traslado (traslado_id, chofer_id, secuencia, punto) VALUES (%s, %s, 1, ST_SetSRID(ST_MakePoint(-56.1651, -34.8942), 4326));", (traslado_b_id, chofer_b_id))
        
        cursor.execute("SELECT fn_procesar_cancelacion_faena(%s);", (faena_b_id,))
        res_b = cursor.fetchone()[0]
        assert res_b == 'PENALIZACION_COMPLETA', f"Esperado PENALIZACION_COMPLETA, obtenido {res_b}"
        
        cursor.execute("SELECT estado, costo_penalizacion FROM faenas WHERE id = %s;", (faena_b_id,))
        faena_b_data = cursor.fetchone()
        assert faena_b_data[0] == 'cancelada_cliente'
        assert faena_b_data[1] == 100
        print_sub(f"🚨 Caso B Superado: Retornó {res_b} (Penalización: $ {faena_b_data[1]})")

        print_step("🏆", "PRUEBA DE ZONA DE NO RETORNO SUPERADA")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM paradas_traslado WHERE traslado_id IN (%s, %s);", (traslado_a_id, traslado_b_id))
        cursor.execute("DELETE FROM traslados_equipo WHERE id IN (%s, %s);", (traslado_a_id, traslado_b_id))
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
