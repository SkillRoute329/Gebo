import os
import uuid
import sys
import psycopg2

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.src.logic.geofencing import verificar_desvio_vagoneta
from backend.src.logic.h3_adapter import obtener_hex_resolucion_8

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE GEOFENCING Y DETECCIÓN DE DESVÍOS (H3)")
    test_id = str(uuid.uuid4())[:8]
    
    vagoneta_id = str(uuid.uuid4())
    traslado_id = str(uuid.uuid4())
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # Seed
        print_step("🌱", "Fase 1: Preparación (Seed Traslado)")
        cursor.execute("INSERT INTO vagonetas (id, patente, modelo, capacidad, estado) VALUES (%s, %s, 'H3 Van', 12, 'en_ruta');", (vagoneta_id, f"VAG-GEO-{test_id}"))
        cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, tipo, fecha_hora, estado) VALUES (%s, %s, 'retorno', NOW(), 'en_curso');", (traslado_id, vagoneta_id))
        print_sub(f"Traslado creado (ID: {traslado_id[:8]}...) con estado 'en_curso'")
        
        # Ruta planificada (Tres Cruces a Cordón)
        # Tres Cruces
        hex_tres_cruces = obtener_hex_resolucion_8(-34.8941, -56.1652)
        # Cordon
        hex_cordon = obtener_hex_resolucion_8(-34.9001, -56.1762)
        
        ruta_planificada = [hex_tres_cruces, hex_cordon]
        print_sub(f"Ruta Planificada: Tres Cruces ({hex_tres_cruces}) -> Cordón ({hex_cordon})")
        
        # Simulación 1: Posición Normal (Dentro del corredor)
        print_step("✅", "Fase 2: Posición dentro de la ruta (Tres Cruces Exacto)")
        hex_actual_ok = obtener_hex_resolucion_8(-34.8942, -56.1651) # Casi igual
        desvio = verificar_desvio_vagoneta(str(traslado_id), hex_actual_ok, ruta_planificada)
        assert not desvio, "No debió marcar desvío estando en la ruta."
        
        # Verificar estado en BD
        cursor.execute("SELECT estado FROM traslados_equipo WHERE id = %s;", (traslado_id,))
        est = cursor.fetchone()[0]
        assert est == 'en_curso', f"El estado debe ser 'en_curso', pero es {est}"
        print_sub(f"Vagoneta reporta posición {hex_actual_ok}. Estado: NORMAL ({est})")
        
        # Simulación 2: Desvío a Carrasco (Completamente alejado)
        print_step("🚨", "Fase 3: Desvío Alejado (Carrasco)")
        # Carrasco (-34.8877, -56.0583)
        hex_carrasco = obtener_hex_resolucion_8(-34.8877, -56.0583)
        print_sub(f"Vagoneta reporta posición {hex_carrasco} (Carrasco).")
        desvio_alertado = verificar_desvio_vagoneta(str(traslado_id), hex_carrasco, ruta_planificada)
        assert desvio_alertado, "Debió detectar desvío."
        
        # Verificar alerta y estado
        cursor.execute("SELECT estado FROM traslados_equipo WHERE id = %s;", (traslado_id,))
        est2 = cursor.fetchone()[0]
        assert est2 == 'desviado', f"El estado debe ser 'desviado', pero es {est2}"
        print_sub(f"El estado del traslado cambió exitosamente a: {est2}")
        
        cursor.execute("SELECT tipo_alerta, descripcion FROM alertas_operativas WHERE traslado_id = %s;", (traslado_id,))
        alerta = cursor.fetchone()
        assert alerta is not None, "No se creó la alerta"
        print_sub(f"Alerta operativa generada: {alerta[0]} - {alerta[1]}")
        
        print_step("🏆", "PRUEBA DE GEOFENCING H3 SUPERADA")
        
    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM alertas_operativas WHERE traslado_id = %s;", (traslado_id,))
        cursor.execute("DELETE FROM traslados_equipo WHERE id = %s;", (traslado_id,))
        cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
        print_sub("Registros de prueba eliminados.")
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
