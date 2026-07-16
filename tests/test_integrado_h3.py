import os
import uuid
import time
import psycopg2
from datetime import datetime, timezone

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO SIMULACIÓN INTEGRADA H3 (GEBO)")
    
    # IDs estáticos
    test_id = str(uuid.uuid4())[:8]
    cliente_user_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    vehiculo_cliente_id = str(uuid.uuid4())
    
    chofer_user_id = str(uuid.uuid4())
    chofer_id = str(uuid.uuid4())
    
    vagoneta_id = str(uuid.uuid4())
    faena_id = str(uuid.uuid4())
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cursor = conn.cursor()
    
    try:
        # FASE 1: Inicialización
        print_step("🌱", "Fase 1: Preparación del Entorno (Seed)")
        
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (cliente_user_id, f"cliente_h3_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre) VALUES (%s, %s, 'particular', 'Cliente Test H3');", (cliente_id, cliente_user_id))
        
        cursor.execute("""
            INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, patente, tipo, transmision, es_electrico) 
            VALUES (%s, %s, 'Nissan', 'Sentra', %s, 'auto', 'automatico', false);
        """, (vehiculo_cliente_id, cliente_id, f"H3-{test_id}"))
        
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (chofer_user_id, f"chofer_h3_{test_id}@gebo.com"))
        cursor.execute("""
            INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) 
            VALUES (%s, %s, 'Chofer H3 Tres Cruces', 'disponible', true);
        """, (chofer_id, chofer_user_id))
        
        # Posicion Chofer en Tres Cruces (-34.8941, -56.1652)
        cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion) VALUES (%s, ST_SetSRID(ST_MakePoint(-56.1652, -34.8941), 4326));", (chofer_id,))
        print_sub(f"Chofer de prueba insertado en Tres Cruces (ID: {chofer_id[:8]}...)")
        
        # Vagoneta disponible (-34.9000, -56.1600)
        cursor.execute("""
            INSERT INTO vagonetas (id, patente, modelo, capacidad, estado, ubicacion_actual) 
            VALUES (%s, %s, 'H3 Van', 12, 'disponible', ST_SetSRID(ST_MakePoint(-56.1600, -34.9000), 4326));
        """, (vagoneta_id, f"VAG-H3-{test_id}"))
        print_sub(f"Vagoneta disponible cerca (ID: {vagoneta_id[:8]}...)")
        
        # Faena: Pocitos (-34.9080, -56.1490) -> Centro (-34.9056, -56.1853)
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'programada', NOW());
        """, (faena_id, cliente_id, vehiculo_cliente_id))
        print_sub("Faena registrada: Origen (Pocitos) -> Destino (Centro)")
        
        conn.commit()

        # FASE 2: Verificación Indexación H3
        print_step("🔍", "Fase 2: Verificación de Indexación H3 (Nativa de Supabase)")
        
        cursor.execute("SELECT origen_h3_res8, destino_h3_res8 FROM faenas WHERE id = %s;", (faena_id,))
        faena_res = cursor.fetchone()
        assert faena_res is not None, "Faena no encontrada"
        origen_h3, destino_h3 = faena_res
        
        assert origen_h3 is not None, "H3 de origen no calculado"
        assert destino_h3 is not None, "H3 de destino no calculado"
        print_sub(f"✔️ Hash H3 Autocalculado para Pocitos (Origen): {origen_h3}")
        print_sub(f"✔️ Hash H3 Autocalculado para Centro (Destino): {destino_h3}")
        
        cursor.execute("SELECT h3_res8 FROM posiciones WHERE chofer_id = %s LIMIT 1;", (chofer_id,))
        pos_res = cursor.fetchone()
        assert pos_res is not None and pos_res[0] is not None, "H3 de posicion chofer no calculado"
        print_sub(f"✔️ Hash H3 Autocalculado para Chofer (Tres Cruces): {pos_res[0]}")
        
        # FASE 3: Simulación Flujo y Rescate
        print_step("🚚", "Fase 3: Simulación de Flujo y Rescate Automatizado")
        cursor.execute("UPDATE faenas SET chofer_id = %s, estado = 'en_curso' WHERE id = %s;", (chofer_id, faena_id))
        conn.commit()
        print_sub("Faena pasada a estado 'en_curso'.")
        
        # Finalizar
        cursor.execute("UPDATE faenas SET estado = 'finalizada', fecha_hora_fin_real = NOW() WHERE id = %s;", (faena_id,))
        # El trigger se dispara aquí
        conn.commit()
        print_sub("Faena finalizada. Esperando que el trigger de rescate actúe...")
        
        # Verificar Traslados
        cursor.execute("SELECT vagoneta_id, tipo FROM traslados_equipo WHERE vagoneta_id = %s AND tipo = 'retorno' ORDER BY fecha_hora DESC LIMIT 1;", (vagoneta_id,))
        rescate = cursor.fetchone()
        assert rescate is not None, "El trigger no creó el traslado de retorno"
        print_sub(f"🚨 ÉXITO: Rescate H3 asignado automáticamente a la vagoneta {vagoneta_id[:8]} (Tipo: {rescate[1]}).")
        
        print_step("✨", "PRUEBA H3 COMPLETADA SIN ERRORES")
        
    except Exception as e:
        print_step("❌", f"ERROR DURANTE LA SIMULACIÓN: {str(e)}")
        conn.rollback()
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Limpieza de Base de Datos (Cleanup)")
        try:
            cursor.execute("DELETE FROM paradas_traslado WHERE traslado_id IN (SELECT id FROM traslados_equipo WHERE vagoneta_id = %s);", (vagoneta_id,))
            cursor.execute("DELETE FROM traslados_equipo WHERE vagoneta_id = %s;", (vagoneta_id,))
            cursor.execute("DELETE FROM faenas WHERE id = %s;", (faena_id,))
            cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
            cursor.execute("DELETE FROM posiciones WHERE chofer_id = %s;", (chofer_id,))
            cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
            cursor.execute("DELETE FROM vehiculos_cliente WHERE id = %s;", (vehiculo_cliente_id,))
            cursor.execute("DELETE FROM clientes WHERE id = %s;", (cliente_id,))
            cursor.execute("DELETE FROM usuarios WHERE id IN (%s, %s);", (cliente_user_id, chofer_user_id))
            cursor.execute("DELETE FROM auth.users WHERE id IN (%s, %s);", (cliente_user_id, chofer_user_id))
            conn.commit()
            print_sub("Registros de prueba H3 eliminados correctamente.")
        except Exception as e:
            conn.rollback()
            print_sub(f"Advertencia durante limpieza: {str(e)}")
            
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
