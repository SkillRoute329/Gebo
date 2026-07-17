import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE CHECKLIST DE INSPECCIÓN FLOTA")
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    chofer_id = str(uuid.uuid4())
    turno_id = str(uuid.uuid4())
    vagoneta_id = str(uuid.uuid4())
    
    chofer_id_2 = str(uuid.uuid4())
    turno_id_2 = str(uuid.uuid4())
    vagoneta_id_2 = str(uuid.uuid4())
    
    pregunta_critica_id = str(uuid.uuid4())

    try:
        print_step("🌱", "Fase 1: Preparación (Seed)")
        
        # Vagonetas
        cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (%s, %s, 'disponible');", (vagoneta_id, "TEST-OK"))
        cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (%s, %s, 'disponible');", (vagoneta_id_2, "TEST-FAIL"))
        
        # Choferes y Turnos (estado laboral inicial = pendiente_inspeccion)
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Responsable', 'disponible');", (chofer_id,))
        cursor.execute("INSERT INTO turnos_chofer (id, chofer_id, estado_laboral) VALUES (%s, %s, 'pendiente_inspeccion');", (turno_id, chofer_id))
        
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Reportador', 'disponible');", (chofer_id_2,))
        cursor.execute("INSERT INTO turnos_chofer (id, chofer_id, estado_laboral) VALUES (%s, %s, 'pendiente_inspeccion');", (turno_id_2, chofer_id_2))
        
        # Pregunta critica
        cursor.execute("INSERT INTO preguntas_checklist (id, pregunta, categoria, es_critica) VALUES (%s, 'Frenos y luces operativas', 'seguridad', TRUE);", (pregunta_critica_id,))
        
        print_sub("Vagonetas, choferes pendientes de inspección y pregunta crítica inyectados.")

        import sys
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic'))
        from checklist_verifier import guardar_inspeccion

        print_step("🤖", "Fase 2: Caso A - Inspección de Entrada Exitosa")
        
        # Todo bien
        respuestas_ok = {pregunta_critica_id: True}
        res_ok = guardar_inspeccion(turno_id, 'entrada', 150000, respuestas_ok, [], vagoneta_id, [])
        assert res_ok, "Fallo al guardar inspección OK"
        
        # Validar
        cursor.execute("SELECT estado_laboral FROM turnos_chofer WHERE id = %s;", (turno_id,))
        est_lab_1 = cursor.fetchone()[0]
        assert est_lab_1 == 'activo', f"Estado laboral no pasó a activo: {est_lab_1}"
        
        cursor.execute("SELECT estado FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        est_vag_1 = cursor.fetchone()[0]
        assert est_vag_1 == 'disponible', f"Vagoneta cambió de estado erróneamente: {est_vag_1}"
        
        print_sub("✅ VERIFICADO: Inspección OK -> estado_laboral cambia a 'activo'.")

        print_step("💥", "Fase 3: Caso B - Inspección con Falla Crítica")
        
        # Falla crítica
        respuestas_fail = {pregunta_critica_id: False}
        res_fail = guardar_inspeccion(turno_id_2, 'entrada', 150500, respuestas_fail, [], vagoneta_id_2, [])
        assert res_fail, "Fallo al guardar inspección FAIL"
        
        # Validar
        cursor.execute("SELECT estado_laboral FROM turnos_chofer WHERE id = %s;", (turno_id_2,))
        est_lab_2 = cursor.fetchone()[0]
        assert est_lab_2 == 'pendiente_inspeccion', f"Estado laboral se habilitó erróneamente: {est_lab_2}"
        
        cursor.execute("SELECT estado FROM vagonetas WHERE id = %s;", (vagoneta_id_2,))
        est_vag_2 = cursor.fetchone()[0]
        assert est_vag_2 == 'alerta_mantenimiento', f"Vagoneta NO entró en alerta de mantenimiento: {est_vag_2}"
        
        cursor.execute("SELECT COUNT(*) FROM incidentes_calle WHERE vagoneta_id = %s;", (vagoneta_id_2,))
        inc_count = cursor.fetchone()[0]
        assert inc_count == 1, "No se registró el incidente en incidentes_calle."
        
        print_sub("✅ VERIFICADO: Inspección FAIL -> Vagoneta entra en 'alerta_mantenimiento'.")
        print_sub("✅ VERIFICADO: Incidente registrado para la mesa de ayuda.")
        print_sub("✅ VERIFICADO: Chofer permanece bloqueado ('pendiente_inspeccion').")
        
        print_step("🏆", "PRUEBA DE CHECKLIST DE FLOTA SUPERADA CON ÉXITO")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM incidentes_calle WHERE vagoneta_id IN (%s, %s);", (vagoneta_id, vagoneta_id_2))
        cursor.execute("DELETE FROM inspecciones_vagoneta WHERE vagoneta_id IN (%s, %s);", (vagoneta_id, vagoneta_id_2))
        cursor.execute("DELETE FROM turnos_chofer WHERE id IN (%s, %s);", (turno_id, turno_id_2))
        cursor.execute("DELETE FROM choferes WHERE id IN (%s, %s);", (chofer_id, chofer_id_2))
        cursor.execute("DELETE FROM vagonetas WHERE id IN (%s, %s);", (vagoneta_id, vagoneta_id_2))
        cursor.execute("DELETE FROM preguntas_checklist WHERE id = %s;", (pregunta_critica_id,))
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
