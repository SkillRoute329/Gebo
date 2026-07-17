import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE RENDICIÓN DE GASTOS PARAMÉTRICO")
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    chofer_id = str(uuid.uuid4())
    turno_id = str(uuid.uuid4())
    vagoneta_id = str(uuid.uuid4())
    
    try:
        print_step("🌱", "Fase 1: Preparación (Seed)")
        
        # Límite de gasto
        cursor.execute("UPDATE configuracion_negocio SET limite_gasto_automatico = 300.00;")
        print_sub("Límite de gasto automático configurado en $ 300.00")
        
        # Chofer, vagoneta y turno
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Gastos', 'disponible');", (chofer_id,))
        cursor.execute("INSERT INTO turnos_chofer (id, chofer_id, estado_laboral) VALUES (%s, %s, 'activo');", (turno_id, chofer_id))
        cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (%s, 'GAS-123', 'disponible');", (vagoneta_id,))
        
        print_sub("Chofer y turno activo inyectados.")

        import sys
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic'))
        from expenses_handler import registrar_gasto_ruta

        print_step("🤖", "Fase 2: Caso A - Gasto Bajo Límite")
        # Gasto de 150
        res_a = registrar_gasto_ruta(turno_id, 'peaje', 150.00, 'TICKET-001', 'foto1.jpg', vagoneta_id)
        assert res_a['estado_gasto'] == 'aprobado_automatico', f"El estado no fue aprobado_automatico: {res_a['estado_gasto']}"
        print_sub("✅ VERIFICADO: Gasto de $ 150 pasó a 'aprobado_automatico'.")
        
        print_step("🤖", "Fase 3: Caso B - Gasto Sobre Límite")
        # Gasto de 2500
        res_b = registrar_gasto_ruta(turno_id, 'combustible', 2500.00, 'TICKET-002', 'foto2.jpg', vagoneta_id)
        assert res_b['estado_gasto'] == 'pendiente_aprobacion', f"El estado no fue pendiente_aprobacion: {res_b['estado_gasto']}"
        print_sub("✅ VERIFICADO: Gasto de $ 2500 quedó 'pendiente_aprobacion'.")
        
        print_step("👨‍💻", "Fase 4: Caso C - Aprobación Manual")
        cursor.execute("UPDATE gastos_ruta SET estado_gasto = 'aprobado_manual' WHERE id = %s;", (res_b['id'],))
        
        cursor.execute("SELECT estado_gasto FROM gastos_ruta WHERE id = %s;", (res_b['id'],))
        est_final = cursor.fetchone()[0]
        assert est_final == 'aprobado_manual', f"El estado final no es aprobado_manual: {est_final}"
        print_sub("✅ VERIFICADO: Operador aprobó manualmente el gasto excedido.")
        
        print_step("🏆", "PRUEBA DE RENDICIÓN DE GASTOS SUPERADA CON ÉXITO")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 5: Cleanup")
        cursor.execute("DELETE FROM gastos_ruta WHERE turno_id = %s;", (turno_id,))
        cursor.execute("DELETE FROM turnos_chofer WHERE id = %s;", (turno_id,))
        cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
        cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
