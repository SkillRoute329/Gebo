import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE CONTROL DE FATIGA PARAMÉTRICO")
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    chofer_id = str(uuid.uuid4())
    turno_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    faena_id = str(uuid.uuid4())

    try:
        print_step("🌱", "Fase 1: Preparación de Parámetros")
        
        # 1. Configuración de fatiga (120 min conduccion, 15 min descanso)
        cursor.execute("""
            UPDATE configuracion_negocio 
            SET limite_conduccion_minutos = 120, descanso_obligatorio_minutos = 15;
        """)
        print_sub("Parámetros: Conducción = 120 min, Descanso = 15 min.")
        
        # 2. Inserción de Chofer, Cliente y Turno Activo (con 121 min acumulados)
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Cansado', 'en_faena');", (chofer_id,))
        cursor.execute("INSERT INTO turnos_chofer (id, chofer_id, minutos_conduccion_acumulados, estado_laboral) VALUES (%s, %s, 121, 'activo');", (turno_id, chofer_id))
        cursor.execute("INSERT INTO clientes (id, nombre) VALUES (%s, 'Cliente Test Fatiga');", (cliente_id,))
        cursor.execute("INSERT INTO faenas (id, cliente_id, chofer_id, origen, destino, estado, fecha_hora_programada) VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(-56.16, -34.90), 4326), ST_SetSRID(ST_MakePoint(-56.17, -34.91), 4326), 'asignada', NOW());", (faena_id, cliente_id, chofer_id))
        
        print_sub(f"Chofer con 121 minutos acumulados inyectado en turno activo.")

        print_step("🤖", "Fase 2: Ejecución del Monitor de Fatiga")
        
        import sys
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic'))
        from fatigue_monitor import monitorear_fatiga_choferes
        
        resultados = monitorear_fatiga_choferes()
        print_sub(f"Resultados del monitor: {resultados}")
        
        print_step("✅", "Fase 3: Validaciones")
        
        # Validar cambio de estado
        cursor.execute("SELECT estado_laboral, fin_descanso_estimado FROM turnos_chofer WHERE id = %s;", (turno_id,))
        estado_laboral, fin_descanso = cursor.fetchone()
        
        cursor.execute("SELECT estado FROM choferes WHERE id = %s;", (chofer_id,))
        estado_chofer = cursor.fetchone()[0]
        
        cursor.execute("SELECT chofer_id FROM faenas WHERE id = %s;", (faena_id,))
        faena_chofer_id = cursor.fetchone()[0]
        
        assert estado_laboral == 'en_descanso', f"El turno no pasó a 'en_descanso'. Estado actual: {estado_laboral}"
        assert estado_chofer == 'en_descanso', f"El chofer no pasó a 'en_descanso'. Estado actual: {estado_chofer}"
        assert fin_descanso is not None, "No se programó el fin del descanso."
        assert faena_chofer_id is None, "El chofer no fue desvinculado de la faena pendiente."
        
        print_sub("VERIFICADO: Estado laboral cambió a 'en_descanso'.")
        print_sub(f"VERIFICADO: Descanso programado hasta {fin_descanso} (sumados 15 min).")
        print_sub("VERIFICADO: Chofer ignorado/desvinculado de asignaciones pendientes.")
        
        print_step("🏆", "PRUEBA DE FATIGA SUPERADA CON ÉXITO")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM incidentes_calle WHERE chofer_id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM faenas WHERE id = %s;", (faena_id,))
        cursor.execute("DELETE FROM turnos_chofer WHERE id = %s;", (turno_id,))
        cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM clientes WHERE id = %s;", (cliente_id,))
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
