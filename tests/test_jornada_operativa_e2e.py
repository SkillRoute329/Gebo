import os
import sys
import uuid
import psycopg2

sys.path.append(os.path.abspath('backend/src'))
from logic.checklist_verifier import guardar_inspeccion
from logic.expenses_handler import registrar_gasto_ruta
from logic.fatigue_monitor import monitorear_fatiga_choferes
from logic.financial_advisor import diagnosticar_salud_financiera

def run_e2e_test():
    db_url = os.environ.get('SUPABASE_DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    try:
        print("=== Fase 1: Configuración Inicial del Administrador y Apertura de Turno ===")
        # Agregar columnas si no existen
        try:
            cursor.execute("ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS costo_hora_chofer_uyu numeric DEFAULT 350;")
            cursor.execute("ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS costo_km_depreciacion_uyu numeric DEFAULT 15;")
            conn.commit()
        except Exception:
            conn.rollback()

        cursor.execute("SELECT id FROM configuracion_negocio LIMIT 1")
        row = cursor.fetchone()
        config_id = row[0] if row else str(uuid.uuid4())
        
        # En caso de que no existan filas, insertamos
        cursor.execute("""
            INSERT INTO configuracion_negocio (id, limite_conduccion_minutos, limite_gasto_automatico, costo_hora_chofer_uyu, costo_km_depreciacion_uyu) 
            VALUES (%s, 120, 500, 350, 15)
            ON CONFLICT (id) DO UPDATE SET 
            limite_conduccion_minutos = EXCLUDED.limite_conduccion_minutos,
            limite_gasto_automatico = EXCLUDED.limite_gasto_automatico,
            costo_hora_chofer_uyu = EXCLUDED.costo_hora_chofer_uyu,
            costo_km_depreciacion_uyu = EXCLUDED.costo_km_depreciacion_uyu;
        """, (config_id,))
        conn.commit()

        # Inyectar chofer de rescate con estado 'pendiente_inspeccion'
        chofer_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING;",
            (chofer_id, f"test_chofer_{chofer_id}@gebo.com", '{"rol": "gebo_driver"}')
        )
        
        cursor.execute(
            "INSERT INTO choferes (id, usuario_id, estado) VALUES (%s, %s, 'disponible') ON CONFLICT (id) DO NOTHING;",
            (chofer_id, chofer_id)
        )
        
        turno_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO turnos_chofer (id, chofer_id, inicio_jornada, estado_laboral, minutos_conduccion_acumulados)
            VALUES (%s, %s, NOW(), 'pendiente_inspeccion', 0)
            """,
            (turno_id, chofer_id)
        )
        conn.commit()
        
        cursor.execute("SELECT estado_laboral FROM turnos_chofer WHERE id = %s", (turno_id,))
        estado_inicial = cursor.fetchone()[0]
        assert estado_inicial == 'pendiente_inspeccion', f"Estado inicial debe ser pendiente_inspeccion, es {estado_inicial}"
        print(f"Chofer {chofer_id} y Turno {turno_id} inyectados correctamente (pendiente_inspeccion).")


        print("\\n=== Fase 2: Inspección Física y Desbloqueo Operativo ===")
        # Mandar inspección
        vagoneta_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO vagonetas (id, estado, patente) VALUES (%s, 'disponible', %s) ON CONFLICT (id) DO NOTHING;",
            (vagoneta_id, str(uuid.uuid4())[:8])
        )
        conn.commit()

        pregunta_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO preguntas_checklist (id, pregunta, categoria, es_critica) VALUES (%s, 'Neumáticos OK', 'seguridad', TRUE) ON CONFLICT (id) DO NOTHING;",
            (pregunta_id,)
        )
        conn.commit()

        respuestas = {pregunta_id: True}
        fotos = []
        
        # Ejecutar lógica Python para guardar inspección
        exito_inspeccion = guardar_inspeccion(
            turno_id=turno_id,
            tipo="entrada",
            odometro=120000,
            respuestas=respuestas,
            fotos=fotos,
            vagoneta_id=vagoneta_id,
            danos_reportados=[]
        )
        assert exito_inspeccion, "La inspección de entrada falló en guardar_inspeccion."
        
        cursor.execute("SELECT estado_laboral FROM turnos_chofer WHERE id = %s", (turno_id,))
        estado_post_inspeccion = cursor.fetchone()[0]
        assert estado_post_inspeccion == 'activo', f"Chofer no pasó a estado activo, está en {estado_post_inspeccion}"
        print("Inspección aprobada. El estado laboral del chofer pasó a 'activo'.")


        print("\\n=== Fase 3: Ejecución de Faena, Gastos en Ruta y Alerta de Fatiga ===")
        # Crear Cliente y Faena
        cliente_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING;",
            (cliente_id, f"test_cli_{cliente_id}@gebo.com", '{"rol": "cliente"}')
        )
        cursor.execute(
            "INSERT INTO clientes (id, usuario_id) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
            (cliente_id, cliente_id)
        )
        
        vehiculo_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, patente, tipo) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING;",
            (vehiculo_id, cliente_id, 'VW', 'Polo', str(uuid.uuid4())[:8], 'auto')
        )
        
        faena_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, chofer_id, estado, modalidad, odometro_inicio, origen_h3_res8)
            VALUES (%s, %s, %s, %s, 'en_curso', 'por_minuto', 120000, '88a919000000000')
            """,
            (faena_id, cliente_id, vehiculo_id, chofer_id)
        )
        conn.commit()

        # Gasto en Ruta < 500
        resultado_gasto = registrar_gasto_ruta(
            turno_id=turno_id,
            categoria="peaje",
            monto=150.0,
            comprobante="TK123",
            foto="http://gebo.app/peaje.jpg",
            vagoneta_id=vagoneta_id
        )
        assert resultado_gasto.get('estado_gasto') == 'aprobado_automatico', f"El gasto debía aprobarse automáticamente. Resultado: {resultado_gasto}"
        print(f"Gasto de Peaje ($150) registrado y aprobado automáticamente. Estado: {resultado_gasto.get('estado_gasto')}")
        
        # Simulación de Fatiga
        cursor.execute("UPDATE turnos_chofer SET minutos_conduccion_acumulados = 121 WHERE id = %s", (turno_id,))
        conn.commit()
        
        resultado_fatiga = monitorear_fatiga_choferes()
        
        cursor.execute("SELECT estado_laboral FROM turnos_chofer WHERE id = %s", (turno_id,))
        estado_fatiga = cursor.fetchone()[0]
        assert estado_fatiga == 'en_descanso', f"El chofer debería estar en_descanso, pero está en {estado_fatiga}"
        print("Motor de fatiga detectó 121 minutos (límite 120). Chofer transicionado a 'en_descanso' exitosamente.")

        print("\\n=== Fase 4: Conciliación de Odómetro, Cierre Contable y Sugerencia de IA ===")
        # Conciliación
        cursor.execute(
            "SELECT finalizar_faena_sync(%s, %s, %s, %s)",
            (faena_id, 120015, 12.0, "http://gebo.app/tablero_fin.jpg")
        )
        resultado_sync = cursor.fetchone()[0]
        conn.commit()
        
        assert resultado_sync['success'] is True, "El RPC finalizar_faena_sync falló."
        assert float(resultado_sync['distancia_facturada']) == 15.0, f"Se esperaba facturar 15 km (mayor), pero se facturó {resultado_sync['distancia_facturada']} km."
        print(f"RPC finalizar_faena_sync ejecutado. Distancia tomada: {resultado_sync['distancia_facturada']} km (GREATEST entre 12 y 15). Costo Final: ${resultado_sync['costo_final']}")

        # Modificamos ingreso de la faena para forzar un margen negativo debido al tiempo en fatiga
        # El gasto ya ingresado es 150. Pongamos que el ingreso es solo 100 para generar margen negativo explícito si es necesario.
        cursor.execute("UPDATE resumen_contable_viajes SET ingreso = 100, costo_chofer = 450 WHERE faena_id = %s", (faena_id,))
        conn.commit()

        salud = diagnosticar_salud_financiera()
        assert 'sugerencias' in salud, "diagnosticar_salud_financiera no devolvió diccionario con 'sugerencias'."
        sugerencias = salud.get('sugerencias', [])
        # Validar si hubo sugerencia
        print(f"Diagnóstico financiero ejecutado. {len(sugerencias)} sugerencia(s) detectada(s).")
        for sug in sugerencias:
            print(f"- Sugerencia ID {sug.get('id')}: Acción '{sug.get('accion_sugerida')}' ({sug.get('justificacion')})")
        
        print("\\n=========================================================")
        print("✓ SIMULACIÓN UNIFICADA DE LA OPERATIVA DIARIA E2E EXITOSA")
        print("=========================================================")

    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_e2e_test()
