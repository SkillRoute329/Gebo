import os
import sys
import uuid
import psycopg2

def run_tests():
    db_url = os.environ.get('SUPABASE_DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    try:
        # Pre-requisites: Insert a dummy client, vehicle, and faena
        cliente_id = str(uuid.uuid4())
        faena_id = str(uuid.uuid4())
        
        # We need a valid cliente (which might have constraints, so let's use minimal inserts if needed, or just insert directly if no strict constraints)
        # Assuming minimal constraints or we just bypass it if we can. Actually let's try to insert into faenas directly, 
        # but faenas has foreign keys to clientes and vehiculos.
        # Let's see if we can insert a dummy user, cliente, vehiculo.
        usuario_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING;",
            (usuario_id, f"test_{usuario_id}@gebo.com", '{"rol": "cliente"}')
        )
        
        cursor.execute(
            "INSERT INTO clientes (id, usuario_id) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
            (cliente_id, usuario_id)
        )
        
        vehiculo_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, patente, tipo) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING;",
            (vehiculo_id, cliente_id, 'TestMarca', 'TestModelo', str(uuid.uuid4())[:8], 'auto')
        )

        # Insert Faena
        cursor.execute(
            """
            INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, estado, modalidad, odometro_inicio, origen_h3_res8)
            VALUES (%s, %s, %s, 'en_curso', 'por_minuto', 150130, '88a919000000000')
            """,
            (faena_id, cliente_id, vehiculo_id)
        )
        conn.commit()
        
        print("Faena inyectada con odometro_inicio = 150130.")

        print("Ejecutando Caso A: Sin foto y diferencia > 10%...")
        try:
            cursor.execute(
                "SELECT finalizar_faena_sync(%s, %s, %s, %s)",
                (faena_id, 150150, 10.0, None) # Odo dist = 20, GPS = 10, no photo
            )
            # Should fail
            assert False, "El caso A no fue rechazado por la base de datos a pesar de no tener foto."
        except psycopg2.errors.RaiseException as e:
            conn.rollback() # Important to rollback the failed transaction state
            err_msg = str(e)
            assert 'foto_requerida' in err_msg, f"Mensaje de error inesperado: {err_msg}"
            print("✓ Caso A Exitoso: La base de datos rechazó la finalización solicitando la foto.")

        print("Ejecutando Caso B: Conciliación exitosa con foto aportada...")
        cursor.execute(
            "SELECT finalizar_faena_sync(%s, %s, %s, %s)",
            (faena_id, 150150, 10.0, "http://gebo.app/foto_tablero_123.jpg")
        )
        result = cursor.fetchone()[0]
        conn.commit()

        # The JSON returned: {'success': true, 'costo_final': 350.00, 'distancia_facturada': 20.00}
        assert result['success'] is True, "RPC failed"
        assert result['distancia_facturada'] == 20, f"Distancia esperada: 20, obtenida: {result['distancia_facturada']}"
        # Tarifa por minuto es 30 por km. 50 (base) + 20 * 30 = 350
        assert float(result['costo_final']) == 350.0, f"Costo esperado: 350.0, obtenido: {result['costo_final']}"

        # Verify in DB table
        cursor.execute("SELECT estado, costo_total, distancia_gps_km, odometro_fin FROM faenas WHERE id = %s", (faena_id,))
        faena_data = cursor.fetchone()
        assert faena_data[0] == 'finalizada', "Estado no es 'finalizada'"
        assert float(faena_data[1]) == 350.0, "costo_total en tabla incorrecto"
        
        # Verify resumen_contable_viajes
        cursor.execute("SELECT kilometros_reales, ingreso FROM resumen_contable_viajes WHERE faena_id = %s", (faena_id,))
        resumen = cursor.fetchone()
        assert float(resumen[0]) == 20.0, "kilometros_reales en resumen_contable_viajes es incorrecto"
        assert float(resumen[1]) == 350.0, "ingreso en resumen_contable_viajes es incorrecto"

        print(f"✓ Caso B Exitoso: La base de datos aplicó el odómetro mayor (20 km) con costo de ${result['costo_final']}")

        print("\\nTodos los tests de sincronización satélite pasaron correctamente. 🚀")
        
    except Exception as e:
        print(f"Error en el test: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_tests()
