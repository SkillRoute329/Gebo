import os
import uuid
import time
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE GESTIÓN DE INCIDENCIAS Y CONTINGENCIAS")
    test_id = str(uuid.uuid4())[:8]
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Entidades Caso A
    chofer_original_id = str(uuid.uuid4())
    chofer_reten_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    faena_id = str(uuid.uuid4())
    
    # Entidades Caso B
    vagoneta_id = str(uuid.uuid4())
    traslado_id = str(uuid.uuid4())
    parada1_id = str(uuid.uuid4())
    parada2_id = str(uuid.uuid4())

    try:
        print_step("🌱", "Fase 1: Preparación (Seed)")
        
        # Configuracion
        cursor.execute("UPDATE configuracion_negocio SET checkin_anticipado_minutos = 20;")
        
        # Choferes
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Impuntual', 'disponible');", (chofer_original_id,))
        cursor.execute("INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Retén', 'reten_activo');", (chofer_reten_id,))
        
        # Cliente
        cursor.execute("INSERT INTO clientes (id, nombre) VALUES (%s, 'Cliente Test Incidencias');", (cliente_id,))
        
        # Faena para en 18 minutos (dentro de los 20 min de tolerancia de checkin)
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, chofer_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(-56.16, -34.90), 4326), ST_SetSRID(ST_MakePoint(-56.17, -34.91), 4326), 'asignada', NOW() + INTERVAL '18 minutes');
        """, (faena_id, cliente_id, chofer_original_id))
        
        # Vagoneta y Traslado (Siniestro)
        cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (%s, %s, 'en_ruta');", (vagoneta_id, f"VAG-{test_id}"))
        cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, tipo, estado) VALUES (%s, %s, 'ida', 'en_curso');", (traslado_id, vagoneta_id))
        
        # Paradas activas (completada=FALSE)
        cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, tipo, estado_parada) VALUES (%s, %s, 'recogida', 'pendiente');", (parada1_id, traslado_id))
        cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, tipo, estado_parada) VALUES (%s, %s, 'entrega', 'pendiente');", (parada2_id, traslado_id))

        print_sub("Entidades base inyectadas (Choferes, Faena, Vagoneta, Traslado, Paradas).")

        print_step("🤖", "Fase 2: Caso A - Verificación de Check-In Tardío")
        
        import sys
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic'))
        from incident_handler import verificar_checkins_choferes
        
        reasignaciones = verificar_checkins_choferes()
        
        print_sub(f"Reasignaciones procesadas: {len(reasignaciones)}")
        
        # Validar en base
        cursor.execute("SELECT estado FROM choferes WHERE id = %s;", (chofer_original_id,))
        estado_chof1 = cursor.fetchone()[0]
        cursor.execute("SELECT chofer_id FROM faenas WHERE id = %s;", (faena_id,))
        chof_faena = cursor.fetchone()[0]
        
        assert estado_chof1 == 'ausente_preventivo', f"Chofer no pasó a ausente preventivo, estado actual: {estado_chof1}"
        assert str(chof_faena) == str(chofer_reten_id), f"Faena no reasignada al reten, chofer actual: {chof_faena}"
        
        print_sub("✅ VERIFICADO: Chofer original marcado como 'ausente_preventivo'.")
        print_sub("✅ VERIFICADO: Faena reasignada automáticamente al chofer en 'reten_activo'.")

        print_step("💥", "Fase 3: Caso B - Siniestro de Vagoneta en Ruta")
        
        cursor.execute("SELECT fn_reportar_siniestro_vagoneta(%s);", (vagoneta_id,))
        
        # Validaciones
        cursor.execute("SELECT estado FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        estado_vag = cursor.fetchone()[0]
        cursor.execute("SELECT estado FROM traslados_equipo WHERE id = %s;", (traslado_id,))
        estado_traslado = cursor.fetchone()[0]
        cursor.execute("SELECT traslado_id, estado_parada, prioridad_urgente FROM paradas_traslado WHERE id IN (%s, %s);", (parada1_id, parada2_id))
        paradas = cursor.fetchall()
        
        assert estado_vag == 'fuera_de_servicio', f"Vagoneta no quedó fuera de servicio. Estado: {estado_vag}"
        assert estado_traslado == 'siniestrado', f"Traslado no quedó siniestrado. Estado: {estado_traslado}"
        for p in paradas:
            assert p[0] is None, f"Parada no fue desvinculada del traslado: {p[0]}"
            assert p[1] == 'pendiente_rescate', f"Parada no fue marcada para rescate: {p[1]}"
            assert p[2] is True, "Parada no fue marcada con prioridad_urgente = TRUE"
            
        print_sub("✅ VERIFICADO: Vagoneta y traslado bloqueados por siniestro.")
        print_sub("✅ VERIFICADO: Choferes en traslado liberados y marcados con rescate prioritario.")
        
        print_step("🏆", "PRUEBA DE INCIDENCIAS DE CALLE SUPERADA")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM incidentes_calle;")
        cursor.execute("DELETE FROM paradas_traslado WHERE id IN (%s, %s);", (parada1_id, parada2_id))
        cursor.execute("DELETE FROM traslados_equipo WHERE id = %s;", (traslado_id,))
        cursor.execute("DELETE FROM faenas WHERE id = %s;", (faena_id,))
        cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        cursor.execute("DELETE FROM choferes WHERE id IN (%s, %s);", (chofer_original_id, chofer_reten_id))
        cursor.execute("DELETE FROM clientes WHERE id = %s;", (cliente_id,))
        print_sub("Registros de prueba eliminados.")
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
