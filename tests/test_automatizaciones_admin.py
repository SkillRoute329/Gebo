import os
import uuid
import psycopg2
from datetime import datetime

# Adjust sys path so we can import backend logic
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic')))
from asignacion import determinar_chofer_optimo_para_faena
from fatigue_monitor import monitorear_fatiga_choferes

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres")

def setup_chofer_and_pos(cursor):
    c_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO choferes (id, nombre, estado, maneja_manual, maneja_automatico, maneja_suv)
        VALUES (%s, 'Chofer H3 Test', 'disponible', true, true, true);
    """, (c_id,))
    cursor.execute("""
        INSERT INTO posiciones (chofer_id, latitud, longitud, ubicacion_h3_index, ubicacion)
        VALUES (%s, -34.90, -56.16, '88a919426bfffff', ST_SetSRID(ST_MakePoint(-56.16, -34.90), 4326));
    """, (c_id,))
    return c_id

def setup_turno_fatiga(cursor):
    c_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO choferes (id, nombre, estado) VALUES (%s, 'Chofer Fatiga Test', 'disponible');
    """, (c_id,))
    t_id = str(uuid.uuid4())
    # Simulamos 600 min (10 horas)
    cursor.execute("""
        INSERT INTO turnos_chofer (id, chofer_id, estado_laboral, minutos_conduccion_acumulados)
        VALUES (%s, %s, 'activo', 600);
    """, (t_id, c_id))
    
    # Aseguramos limite de 480 (8 hrs)
    cursor.execute("UPDATE configuracion_negocio SET limite_conduccion_minutos = 480;")
    
    return c_id, t_id

def test_automatizaciones():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    c_h3_id = None
    c_fatiga_id = None
    t_fatiga_id = None

    try:
        print("=== Iniciando Validación de Automatizaciones de Administrador ===")
        
        # Preparación H3
        c_h3_id = setup_chofer_and_pos(cursor)
        choferes_disponibles = [{
            'id': c_h3_id,
            'estado': 'disponible',
            'horas_conduccion_continua': 1,
            'maneja_manual': True,
            'maneja_automatico': True,
            'maneja_suv': True
        }]
        
        # Test 1: Despacho H3 Autónomo
        print("\n[*] Ejecutando Caso 1: Despacho H3 Autónomo")
        # 1. Habilitamos
        cursor.execute("UPDATE configuracion_automatizacion SET despacho_autonomo_h3 = true;")
        resultado_asignacion = determinar_chofer_optimo_para_faena(
            'suv', 'manual', False, choferes_disponibles, datetime.now()
        )
        assert resultado_asignacion is not None, "Debería encontrar un chofer"
        assert str(resultado_asignacion['chofer_id']) == str(c_h3_id), "Debería asignar al chofer del H3 más cercano"
        print("    -> Chofer seleccionado automáticamente por cercanía H3.")
        print("[✓] Assert OK: Motor H3 autónomo activado correctamente.")
        
        # Test 2: Bloqueo de Fatiga NO Estricto
        print("\n[*] Ejecutando Caso 2: Alertas de Fatiga Tolerantes (No Bloqueantes)")
        c_fatiga_id, t_fatiga_id = setup_turno_fatiga(cursor)
        
        # 1. Deshabilitamos bloqueo estricto
        cursor.execute("UPDATE configuracion_automatizacion SET bloqueo_fatiga_estricto = false;")
        
        res_fatiga = monitorear_fatiga_choferes()
        
        cursor.execute("SELECT estado FROM choferes WHERE id = %s;", (c_fatiga_id,))
        estado_chofer = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM incidentes_calle WHERE chofer_id = %s AND tipo_incidente = 'advertencia_fatiga_limite';", (c_fatiga_id,))
        alertas = cursor.fetchone()[0]
        
        print(f"    -> Estado actual del chofer: '{estado_chofer}'")
        assert estado_chofer == 'disponible', "El chofer no debió ser bloqueado porque bloqueo_fatiga_estricto es false"
        assert alertas > 0, "Debe existir al menos un incidente tipo advertencia_fatiga_limite"
        print("[✓] Assert OK: Alerta generada y sesión no inhabilitada.")

        print("\n==============================================")
        print("✓ PRUEBA AUTOMATIZACIONES ADMIN: COMPLETADA Y EXITOSA")
        print("==============================================")
        
    finally:
        # cleanup
        try:
            if c_h3_id:
                cursor.execute("DELETE FROM posiciones WHERE chofer_id = %s;", (c_h3_id,))
                cursor.execute("DELETE FROM choferes WHERE id = %s;", (c_h3_id,))
            if t_fatiga_id:
                cursor.execute("DELETE FROM turnos_chofer WHERE id = %s;", (t_fatiga_id,))
            if c_fatiga_id:
                cursor.execute("DELETE FROM incidentes_calle WHERE chofer_id = %s;", (c_fatiga_id,))
                cursor.execute("DELETE FROM choferes WHERE id = %s;", (c_fatiga_id,))
            cursor.execute("UPDATE configuracion_automatizacion SET despacho_autonomo_h3 = false, bloqueo_fatiga_estricto = true;")
        except Exception as e:
            pass
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_automatizaciones()
