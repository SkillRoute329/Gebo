import os
import uuid
import time
import psycopg2
from datetime import datetime, timezone

# Configuracion de conexion (usa credenciales de entorno o localhost por defecto)
DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO SIMULACIÓN DE OPERATIVA COMPLETA (GEBO)")
    
    # IDs estaticos para la prueba para facilitar limpieza
    test_id = str(uuid.uuid4())[:8] # Prefijo para identificar facil
    cliente_user_id = str(uuid.uuid4())
    cliente_id = str(uuid.uuid4())
    vehiculo_cliente_id = str(uuid.uuid4())
    
    chofer_user_id = str(uuid.uuid4())
    chofer_id = str(uuid.uuid4())
    
    vagoneta_id = str(uuid.uuid4())
    faena_id = str(uuid.uuid4())
    traslado_ida_id = str(uuid.uuid4())
    traslado_retorno_id = str(uuid.uuid4())
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cursor = conn.cursor()
    
    try:
        # ==========================================
        # 1. FASE DE PREPARACIÓN (SEED TEMPORAL)
        # ==========================================
        print_step("🌱", "Fase 1: Preparación del Entorno (Seed)")
        
        # 1.1 Crear Usuario Cliente y Registro Cliente
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (cliente_user_id, f"cliente_test_{test_id}@gebo.com"))
        cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre) VALUES (%s, %s, 'particular', 'Cliente Test Pocitos');", (cliente_id, cliente_user_id))
        
        # 1.2 Crear Vehículo del Cliente
        cursor.execute("""
            INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, patente, tipo, transmision, es_electrico) 
            VALUES (%s, %s, 'Toyota', 'Corolla', %s, 'auto', 'automatico', false);
        """, (vehiculo_cliente_id, cliente_id, f"TEST-{test_id}"))
        print_sub(f"Cliente creado en Pocitos con auto Toyota (ID: {cliente_id[:8]}...)")
        
        # 1.3 Crear Usuario Chofer y Registro Chofer (En Tres Cruces)
        cursor.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (chofer_user_id, f"chofer_test_{test_id}@gebo.com"))
        cursor.execute("""
            INSERT INTO choferes (id, usuario_id, nombre, estado, maneja_automatico) 
            VALUES (%s, %s, 'Chofer Test Tres Cruces', 'disponible', true);
        """, (chofer_id, chofer_user_id))
        # Actualizar posicion inicial del chofer
        cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion) VALUES (%s, ST_SetSRID(ST_MakePoint(-56.1652, -34.8941), 4326));", (chofer_id,))
        print_sub(f"Chofer 'disponible' creado en Tres Cruces (ID: {chofer_id[:8]}...)")
        
        # 1.4 Crear Vagoneta
        cursor.execute("""
            INSERT INTO vagonetas (id, patente, modelo, capacidad, estado, ubicacion_actual) 
            VALUES (%s, %s, 'Renault Master', 12, 'disponible', ST_SetSRID(ST_MakePoint(-56.1600, -34.9000), 4326));
        """, (vagoneta_id, f"VAG-{test_id}"))
        print_sub(f"Vagoneta logística disponible creada (ID: {vagoneta_id[:8]}...)")
        
        conn.commit()
        
        # ==========================================
        # 2. FASE DE SOLICITUD Y ASIGNACIÓN
        # ==========================================
        print_step("📱", "Fase 2: Solicitud de Servicio y Asignación")
        
        # Insertar Faena (Viaje)
        cursor.execute("""
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, origen, destino, estado, fecha_hora_programada)
            VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(-56.1490, -34.9080), 4326), ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326), 'programada', NOW());
        """, (faena_id, cliente_id, vehiculo_cliente_id))
        print_sub("Faena registrada: Origen (Pocitos) -> Destino (Centro)")
        
        # Asignar Chofer
        cursor.execute("UPDATE faenas SET chofer_id = %s, estado = 'asignada', asignada_en = NOW() WHERE id = %s;", (chofer_id, faena_id))
        cursor.execute("UPDATE choferes SET estado = 'en_traslado' WHERE id = %s;", (chofer_id,))
        conn.commit()
        print_sub("✅ Chofer asignado exitosamente a la faena.")
        
        # ==========================================
        # 3. FASE DE ENTREGA (DELIVERY / TRASLADO IDA)
        # ==========================================
        print_step("🚐", "Fase 3: Logística de Entrega (Vagoneta traslada a Chofer)")
        
        cursor.execute("""
            INSERT INTO traslados_equipo (id, vagoneta_id, tipo, fecha_hora, estado) 
            VALUES (%s, %s, 'ida', NOW(), 'en_curso');
        """, (traslado_ida_id, vagoneta_id))
        cursor.execute("UPDATE vagonetas SET estado = 'en_ruta' WHERE id = %s;", (vagoneta_id,))
        print_sub("Vagoneta despachada hacia el origen del chofer (Tres Cruces) y luego al cliente (Pocitos)...")
        
        # Simular llegada al cliente
        time.sleep(1)
        cursor.execute("UPDATE faenas SET estado = 'chofer_llegó' WHERE id = %s;", (faena_id,))
        cursor.execute("UPDATE choferes SET estado = 'en_faena' WHERE id = %s;", (chofer_id,))
        cursor.execute("UPDATE traslados_equipo SET estado = 'completado' WHERE id = %s;", (traslado_ida_id,))
        cursor.execute("UPDATE vagonetas SET estado = 'disponible' WHERE id = %s;", (vagoneta_id,))
        conn.commit()
        
        # Inicio del viaje en el auto del cliente
        cursor.execute("UPDATE faenas SET estado = 'en_curso', fecha_hora_inicio_real = NOW() WHERE id = %s;", (faena_id,))
        conn.commit()
        print_sub("🚗 El Chofer ha tomado control del auto del cliente. Faena 'en_curso'.")
        
        # ==========================================
        # 4. FASE DE FINALIZACIÓN Y RESCATE (RETORNO)
        # ==========================================
        print_step("🏁", "Fase 4: Finalización y Coordinación de Rescate")
        
        # Finalizar Faena en el Centro
        cursor.execute("UPDATE faenas SET estado = 'finalizada', fecha_hora_fin_real = NOW() WHERE id = %s;", (faena_id,))
        # El chofer queda "disponible" pero físicamente varado en el Centro
        cursor.execute("UPDATE choferes SET estado = 'disponible' WHERE id = %s;", (chofer_id,))
        # Actualizar su ultima posicion al Centro
        cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion) VALUES (%s, ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326));", (chofer_id,))
        conn.commit()
        print_sub("Faena finalizada con éxito. El chofer quedó libre en el Centro.")
        
        # Alertar y buscar vagoneta para rescate
        print_sub("Buscando vagoneta activa más cercana para rescate...")
        cursor.execute("""
            SELECT id, patente, ST_Distance(ubicacion_actual, ST_SetSRID(ST_MakePoint(-56.1853, -34.9056), 4326)) as dist 
            FROM vagonetas 
            WHERE estado = 'disponible' 
            ORDER BY dist ASC LIMIT 1;
        """)
        vagoneta_rescate = cursor.fetchone()
        
        assert vagoneta_rescate is not None, "No se encontró vagoneta disponible para el rescate"
        assert vagoneta_rescate[0] == vagoneta_id, "Debería haber asignado la vagoneta de test"
        
        print_sub(f"🚨 RESCATE ASIGNADO: Vagoneta {vagoneta_rescate[1]} enviada al Centro (Distancia aprox: {round(vagoneta_rescate[2], 2)} metros).")
        
        cursor.execute("""
            INSERT INTO traslados_equipo (id, vagoneta_id, tipo, fecha_hora, estado) 
            VALUES (%s, %s, 'retorno', NOW(), 'programado');
        """, (traslado_retorno_id, vagoneta_rescate[0]))
        conn.commit()
        
        print_step("✨", "OPERATIVA COMPLETADA SIN ERRORES")
        
    except Exception as e:
        print_step("❌", f"ERROR DURANTE LA SIMULACIÓN: {str(e)}")
        conn.rollback()
        
    finally:
        # ==========================================
        # 5. LIMPIEZA (CLEANUP)
        # ==========================================
        print_step("🧹", "Fase 5: Limpieza de Base de Datos")
        try:
            cursor.execute("DELETE FROM traslados_equipo WHERE id IN (%s, %s);", (traslado_ida_id, traslado_retorno_id))
            cursor.execute("DELETE FROM faenas WHERE id = %s;", (faena_id,))
            cursor.execute("DELETE FROM vagonetas WHERE id = %s;", (vagoneta_id,))
            cursor.execute("DELETE FROM posiciones WHERE chofer_id = %s;", (chofer_id,))
            cursor.execute("DELETE FROM choferes WHERE id = %s;", (chofer_id,))
            cursor.execute("DELETE FROM vehiculos_cliente WHERE id = %s;", (vehiculo_cliente_id,))
            cursor.execute("DELETE FROM clientes WHERE id = %s;", (cliente_id,))
            cursor.execute("DELETE FROM auth.users WHERE id IN (%s, %s);", (cliente_user_id, chofer_user_id))
            
            # Borrar las dependencias por si existen triggers secundarios (ej. usuarios publica)
            cursor.execute("DELETE FROM usuarios WHERE id IN (%s, %s);", (cliente_user_id, chofer_user_id))
            
            conn.commit()
            print_sub("Registros de prueba eliminados correctamente.")
        except Exception as e:
            conn.rollback()
            print_sub(f"Advertencia durante limpieza: {str(e)}")
            
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
