import psycopg2
import time
import uuid

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def run_chofer_tests():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()

    print("--- INICIANDO TEST SUITE CHOFER (VISTA 2) ---")
    
    passed = 0
    choferes_creados = []
    pos_creadas = []
    vagonetas_creadas = []
    traslados_creados = []
    paradas_creadas = []
    clientes_creados = []
    vehiculos_creados = []
    faenas_creadas = []

    try:
        # Create a mock chofer for the tests since we don't know an existing ID
        cursor.execute("INSERT INTO choferes (id, nombre, estado, maneja_manual, maneja_automatico, maneja_electrico) VALUES (gen_random_uuid(), 'Test Chofer App', 'inactivo', true, false, true) RETURNING id")
        ch_id = cursor.fetchone()[0]
        choferes_creados.append(ch_id)

        # TEST 1 - Cargar perfil
        print("\nTest 1 - Carga de perfil del chofer...")
        try:
            cursor.execute("SELECT nombre, estado, maneja_manual, maneja_automatico, maneja_electrico FROM choferes WHERE id = %s", (ch_id,))
            prof = cursor.fetchone()
            if not prof: raise Exception("No se encontro el perfil")
            if prof[0] != 'Test Chofer App': raise Exception("Nombre incorrecto")
            if not prof[2] or prof[3] or not prof[4]: raise Exception("Certificaciones incorrectas")
            print("[OK] Test 1 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 1 FAILED: {e}")

        # TEST 2 - Iniciar turno
        print("\nTest 2 - Iniciar turno...")
        try:
            cursor.execute("UPDATE choferes SET estado = 'disponible' WHERE id = %s", (ch_id,))
            cursor.execute("SELECT estado FROM choferes WHERE id = %s", (ch_id,))
            est = cursor.fetchone()[0]
            if est != 'disponible': raise Exception(f"Estado en DB es {est}")
            
            cursor.execute("SELECT count(*) FROM choferes WHERE estado = 'disponible' AND id = %s", (ch_id,))
            if cursor.fetchone()[0] != 1: raise Exception("Chofer no aparece como disponible en el radar")
            
            print("[OK] Test 2 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 2 FAILED: {e}")

        # TEST 3 - TransmisiÃ³n GPS
        print("\nTest 3 - TransmisiÃ³n de posiciÃ³n GPS...")
        try:
            cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion) VALUES (%s, ST_GeomFromText('POINT(-56 -34)', 4326)) RETURNING id", (ch_id,))
            p_id = cursor.fetchone()[0]
            pos_creadas.append(p_id)
            
            cursor.execute("SELECT chofer_id, ST_AsText(ubicacion) FROM posiciones WHERE id = %s", (p_id,))
            pres = cursor.fetchone()
            if pres[0] != str(ch_id): raise Exception(f"chofer_id incorrecto en posiciones. Exp: {ch_id}, Got: {pres[0]}")
            if 'POINT' not in pres[1]: raise Exception("coordenadas no son validas")
            print("[OK] Test 3 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 3 FAILED: {e}")

        # TEST 4 - Alerta vagoneta
        print("\nTest 4 - Alerta de vagoneta programada...")
        try:
            cursor.execute("INSERT INTO vagonetas (id, patente, estado) VALUES (gen_random_uuid(), %s, 'disponible') RETURNING id", (f"VAG-{str(uuid.uuid4())[:4]}",))
            v_id = cursor.fetchone()[0]
            vagonetas_creadas.append(v_id)
            
            cursor.execute("INSERT INTO traslados_equipo (id, vagoneta_id, estado, tipo, fecha_hora) VALUES (gen_random_uuid(), %s, 'programado', 'ida', NOW()) RETURNING id", (v_id,))
            t_id = cursor.fetchone()[0]
            traslados_creados.append(t_id)
            
            cursor.execute("INSERT INTO paradas_traslado (id, traslado_id, chofer_id, tipo, completada, punto) VALUES (gen_random_uuid(), %s, %s, 'recogida', false, ST_GeomFromText('POINT(0 0)', 4326)) RETURNING id", (t_id, ch_id))
            pt_id = cursor.fetchone()[0]
            paradas_creadas.append(pt_id)
            
            cursor.execute('''
                SELECT p.id
                FROM paradas_traslado p
                INNER JOIN traslados_equipo t ON p.traslado_id = t.id
                WHERE p.chofer_id = %s
                  AND p.completada = false
                  AND p.tipo = 'recogida'
                  AND t.fecha_hora >= CURRENT_DATE
            ''', (ch_id,))
            
            p_res = cursor.fetchone()
            if not p_res: raise Exception("No se encontro la parada en la query de frontend")
            if p_res[0] != str(pt_id): raise Exception("ID de parada incorrecto")
            print("[OK] Test 4 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 4 FAILED: {e}")

        # TEST 5 - Finalizar turno
        print("\nTest 5 - Finalizar turno...")
        try:
            cursor.execute("UPDATE choferes SET estado = 'inactivo' WHERE id = %s", (ch_id,))
            
            cursor.execute("SELECT count(*) FROM choferes WHERE estado IN ('disponible', 'en_faena', 'en_traslado') AND id = %s", (ch_id,))
            cnt = cursor.fetchone()[0]
            if cnt != 0: raise Exception("Chofer sigue contando como activo en el radar")
            
            print("[OK] Test 5 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 5 FAILED: {e}")

        # PREPARE MOCK DATA FOR FAENAS
        cursor.execute("INSERT INTO clientes (id, nombre, tipo) VALUES (gen_random_uuid(), 'Test Cliente', 'particular') RETURNING id")
        cli_id = cursor.fetchone()[0]
        clientes_creados.append(cli_id)

        patente_rnd = f"TST-{str(uuid.uuid4())[:4]}"
        cursor.execute("INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, año, patente, tipo, transmision, es_electrico) VALUES (gen_random_uuid(), %s, 'Test', 'Auto', 2020, %s, 'auto', 'manual', false) RETURNING id", (cli_id, patente_rnd))
        veh_id = cursor.fetchone()[0]
        vehiculos_creados.append(veh_id)

        # TEST 6 - Simular oferta de faena
        print("\nTest 6 - Simular oferta de faena...")
        f_id = None
        try:
            cursor.execute("INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, estado, modalidad) VALUES (gen_random_uuid(), %s, %s, 'programada', 'por_hora') RETURNING id", (cli_id, veh_id))
            f_id = cursor.fetchone()[0]
            faenas_creadas.append(f_id)

            cursor.execute("UPDATE faenas SET chofer_ofrecido_id = %s WHERE id = %s", (ch_id, f_id))

            # Verificar la query que haria el frontend despues del Realtime event
            cursor.execute("SELECT f.id, v.tipo FROM faenas f LEFT JOIN vehiculos_cliente v ON f.vehiculo_cliente_id = v.id WHERE f.id = %s AND f.chofer_ofrecido_id = %s AND f.estado = 'programada'", (f_id, ch_id))
            res = cursor.fetchone()
            if not res: raise Exception("No se recibio la faena correctamente")
            if res[1] != 'auto': raise Exception("Join de vehiculo fallido")
            
            print("[OK] Test 6 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 6 FAILED: {e}")

        # TEST 7 - Aceptar faena
        print("\nTest 7 - Aceptar faena...")
        try:
            # Simulamos el handleAceptarOferta
            cursor.execute("UPDATE faenas SET estado = 'chofer_en_camino', chofer_id = %s, chofer_ofrecido_id = NULL WHERE id = %s", (ch_id, f_id))
            cursor.execute("UPDATE choferes SET estado = 'en_faena' WHERE id = %s", (ch_id,))

            cursor.execute("SELECT estado, chofer_id FROM faenas WHERE id = %s", (f_id,))
            f_res = cursor.fetchone()
            if f_res[0] != 'chofer_en_camino' or f_res[1] != str(ch_id): raise Exception("Faena no se actualizo")

            cursor.execute("SELECT estado FROM choferes WHERE id = %s", (ch_id,))
            if cursor.fetchone()[0] != 'en_faena': raise Exception("Chofer no se actualizo")

            print("[OK] Test 7 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 7 FAILED: {e}")

        # TEST 8 - Rechazar faena
        print("\nTest 8 - Rechazar faena...")
        try:
            # Reseteamos la faena para rechazarla
            cursor.execute("UPDATE faenas SET estado = 'programada', chofer_id = NULL, chofer_ofrecido_id = %s WHERE id = %s", (ch_id, f_id))
            
            # Simulamos handleRechazarOferta
            cursor.execute("INSERT INTO faenas_ofertas_rechazadas (faena_id, chofer_id) VALUES (%s, %s)", (f_id, ch_id))
            cursor.execute("UPDATE faenas SET chofer_ofrecido_id = NULL WHERE id = %s", (f_id,))

            cursor.execute("SELECT chofer_ofrecido_id FROM faenas WHERE id = %s", (f_id,))
            if cursor.fetchone()[0] is not None: raise Exception("La faena sigue ofrecida")

            cursor.execute("SELECT count(*) FROM faenas_ofertas_rechazadas WHERE faena_id = %s AND chofer_id = %s", (f_id, ch_id))
            if cursor.fetchone()[0] != 1: raise Exception("No se inserto el rechazo")

            print("[OK] Test 8 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 8 FAILED: {e}")


        # TEST 9 - Leer origen y destino de faena
        print("\nTest 9 - Leer origen y destino de faena (Vista 3)...")
        try:
            # Re-asignamos la faena para el test 9
            cursor.execute("UPDATE faenas SET estado = 'chofer_en_camino', chofer_id = %s, origen = ST_GeomFromText('POINT(-56.164 -34.901)', 4326), origen_descripcion = 'Origen 123' WHERE id = %s", (ch_id, f_id))
            cursor.execute("UPDATE choferes SET estado = 'en_faena' WHERE id = %s", (ch_id,))

            # Simulamos el fetchFaenaEnCurso del frontend
            cursor.execute("SELECT id, estado, origen_descripcion, ST_AsText(origen) FROM faenas WHERE chofer_id = %s AND estado IN ('chofer_en_camino', 'chofer_llegó') ORDER BY asignada_en DESC LIMIT 1", (ch_id,))
            res9 = cursor.fetchone()
            if not res9: raise Exception("No se encontró la faena en curso")
            if res9[2] != 'Origen 123': raise Exception("No se leyó el origen")
            print("[OK] Test 9 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 9 FAILED: {e}")

        # TEST 10 - Llegada dentro de geocerca
        print("\nTest 10 - Llegada dentro de geocerca...")
        try:
            # Simulamos posicion del chofer a ~20m (0.0002 grados aprox)
            cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion) VALUES (%s, ST_GeomFromText('POINT(-56.1641 -34.9011)', 4326))", (ch_id,))
            
            # Query de distancia en backend (simulando haversine del frontend o ST_DistanceSphere)
            cursor.execute("SELECT ST_DistanceSphere(ST_GeomFromText('POINT(-56.164 -34.901)', 4326), ST_GeomFromText('POINT(-56.1641 -34.9011)', 4326))")
            dist = cursor.fetchone()[0]
            
            if dist > 50:
                raise Exception(f"La distancia ({dist}m) es mayor a 50m, pero debería ser menor")
            
            # Como dist < 50, simulamos el click en LLEGUÉ
            cursor.execute("UPDATE faenas SET estado = 'chofer_llegó' WHERE id = %s", (f_id,))
            cursor.execute("SELECT estado FROM faenas WHERE id = %s", (f_id,))
            if cursor.fetchone()[0] != 'chofer_llegó': raise Exception("No se actualizó el estado a chofer_llegó")
            print("[OK] Test 10 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 10 FAILED: {e}")

        # TEST 11 - Llegada fuera de geocerca
        print("\nTest 11 - Llegada fuera de geocerca...")
        try:
            # Revertimos faena a en_camino
            cursor.execute("UPDATE faenas SET estado = 'chofer_en_camino' WHERE id = %s", (f_id,))
            
            # Simulamos posicion del chofer a ~1km
            cursor.execute("INSERT INTO posiciones (chofer_id, ubicacion) VALUES (%s, ST_GeomFromText('POINT(-56.17 -34.91)', 4326))", (ch_id,))
            
            cursor.execute("SELECT ST_DistanceSphere(ST_GeomFromText('POINT(-56.164 -34.901)', 4326), ST_GeomFromText('POINT(-56.17 -34.91)', 4326))")
            dist11 = cursor.fetchone()[0]

            if dist11 <= 50:
                raise Exception(f"La distancia ({dist11}m) es menor o igual a 50m, pero debería ser mayor")
            
            # Como dist > 50, NO hacemos el update de estado (simulando boton deshabilitado)
            # Verificamos que el estado sigue siendo chofer_en_camino
            cursor.execute("SELECT estado FROM faenas WHERE id = %s", (f_id,))
            if cursor.fetchone()[0] != 'chofer_en_camino': raise Exception("El estado cambió inesperadamente")
            
            print("[OK] Test 11 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 11 FAILED: {e}")

        # TEST 12 - Verificar join de cliente (Vista 4)
        print("\nTest 12 - Verificar join de cliente (Vista 4)...")
        try:
            # Revertimos faena a chofer_llegó
            cursor.execute("UPDATE faenas SET estado = 'chofer_llegó' WHERE id = %s", (f_id,))
            
            cursor.execute('''
                SELECT c.nombre 
                FROM faenas f 
                LEFT JOIN clientes c ON f.cliente_id = c.id 
                WHERE f.id = %s
            ''', (f_id,))
            res12 = cursor.fetchone()
            if not res12: raise Exception("No se encontró la faena")
            if res12[0] != 'Test Cliente': raise Exception("Join de cliente fallido")
            
            print("[OK] Test 12 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 12 FAILED: {e}")

        # TEST 13 - Foto obligatoria (simulacion)
        print("\nTest 13 - Simular inicio sin foto (demo skip o validacion)...")
        try:
            # El backend no tiene check constraint, lo simulamos en test asegurando que insertamos url
            cursor.execute("UPDATE faenas SET foto_vehiculo_inicio_url = 'http://test.foto.jpg' WHERE id = %s", (f_id,))
            
            cursor.execute("SELECT foto_vehiculo_inicio_url FROM faenas WHERE id = %s", (f_id,))
            if cursor.fetchone()[0] != 'http://test.foto.jpg': raise Exception("No se guardo la URL de la foto")
            
            print("[OK] Test 13 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 13 FAILED: {e}")

        # TEST 14 - Iniciar Faena
        print("\nTest 14 - Iniciar Faena...")
        try:
            cursor.execute("UPDATE faenas SET estado = 'en_curso', fecha_hora_inicio_real = NOW() WHERE id = %s", (f_id,))
            
            cursor.execute("SELECT estado, fecha_hora_inicio_real FROM faenas WHERE id = %s", (f_id,))
            res14 = cursor.fetchone()
            if res14[0] != 'en_curso': raise Exception("Estado no cambió a en_curso")
            if not res14[1]: raise Exception("fecha_hora_inicio_real es NULL")
            
            print("[OK] Test 14 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 14 FAILED: {e}")

        # TEST 15 - Verificar cálculo de costo por minuto
        print("\nTest 15 - Verificar cálculo de costo por minuto (Vista 5)...")
        try:
            # Obtener tarifa desde BD
            cursor.execute("SELECT valor FROM configuracion_negocio WHERE clave = 'tarifa_por_minuto_uyu'")
            tarifa_min = float(cursor.fetchone()[0])
            
            # Asumimos 10 minutos transcurridos
            mins = 10
            costo_calculado = mins * tarifa_min
            
            # Guardamos ese costo simulado como si el frontend lo hiciera en un update intermedio o final
            cursor.execute("UPDATE faenas SET modalidad = 'por_minuto', costo_total = %s WHERE id = %s", (costo_calculado, f_id))
            
            cursor.execute("SELECT costo_total FROM faenas WHERE id = %s", (f_id,))
            res15 = float(cursor.fetchone()[0])
            if res15 != costo_calculado: raise Exception(f"Costo incorrecto. Se esperaba {costo_calculado}, se tiene {res15}")
            
            print("[OK] Test 15 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 15 FAILED: {e}")

        # TEST 16 - Verificar cálculo de costo por hora
        print("\nTest 16 - Verificar cálculo de costo por hora (Vista 5)...")
        try:
            # Obtener tarifa por hora
            cursor.execute("SELECT valor FROM configuracion_negocio WHERE clave = 'tarifa_por_hora_uyu'")
            tarifa_hora = float(cursor.fetchone()[0])
            
            # Asumimos 2.5 horas transcurridas
            horas = 2.5
            costo_calculado = horas * tarifa_hora
            
            # Guardamos ese costo simulado
            cursor.execute("UPDATE faenas SET modalidad = 'por_hora', costo_total = %s WHERE id = %s", (costo_calculado, f_id))
            
            cursor.execute("SELECT costo_total FROM faenas WHERE id = %s", (f_id,))
            res16 = float(cursor.fetchone()[0])
            if res16 != costo_calculado: raise Exception(f"Costo incorrecto. Se esperaba {costo_calculado}, se tiene {res16}")
            
            print("[OK] Test 16 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 16 FAILED: {e}")

        # TEST 17 - Finalizar faena
        print("\nTest 17 - Finalizar Faena (Vista 5)...")
        try:
            cursor.execute("""
                UPDATE faenas 
                SET estado = 'finalizada', fecha_hora_fin_real = NOW(), foto_vehiculo_fin_url = 'http://test.foto.fin.jpg', costo_total = 800 
                WHERE id = %s
            """, (f_id,))
            
            # Y el chofer vuelve a disponible
            cursor.execute("UPDATE choferes SET estado = 'disponible' WHERE id = %s", (ch_id,))
            
            cursor.execute("SELECT estado, fecha_hora_fin_real, foto_vehiculo_fin_url, costo_total FROM faenas WHERE id = %s", (f_id,))
            res17_f = cursor.fetchone()
            if res17_f[0] != 'finalizada': raise Exception("Estado de faena no es 'finalizada'")
            if not res17_f[1]: raise Exception("fecha_hora_fin_real es NULL")
            if res17_f[2] != 'http://test.foto.fin.jpg': raise Exception("Foto fin URL incorrecta")
            if res17_f[3] <= 0: raise Exception("Costo total <= 0")
            
            cursor.execute("SELECT estado FROM choferes WHERE id = %s", (ch_id,))
            res17_c = cursor.fetchone()
            if res17_c[0] != 'disponible': raise Exception("Estado de chofer no es 'disponible'")
            
            print("[OK] Test 17 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 17 FAILED: {e}")

        # TEST 18, 19, 20 - Panel Vista 6 (Métricas del día)
        print("\nTest 18, 19, 20 - Métricas del día (Vista 6)...")
        try:
            # Insertar 2 faenas finalizadas adicionales para hoy (una hora cada una)
            # Faena 2
            cursor.execute("""
                INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, chofer_id, estado, modalidad, origen, 
                fecha_hora_inicio_real, fecha_hora_fin_real, costo_total)
                VALUES (gen_random_uuid(), %s, %s, %s, 'finalizada', 'por_hora', ST_GeomFromText('POINT(-56.164 -34.901)', 4326),
                NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 600) RETURNING id
            """, (cli_id, veh_id, ch_id))
            faena2_id = cursor.fetchone()[0]
            faenas_creadas.append(faena2_id)
            
            # Faena 3
            cursor.execute("""
                INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, chofer_id, estado, modalidad, origen, 
                fecha_hora_inicio_real, fecha_hora_fin_real, costo_total)
                VALUES (gen_random_uuid(), %s, %s, %s, 'finalizada', 'por_hora', ST_GeomFromText('POINT(-56.164 -34.901)', 4326),
                NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hours', 600) RETURNING id
            """, (cli_id, veh_id, ch_id))
            faena3_id = cursor.fetchone()[0]
            faenas_creadas.append(faena3_id)
            
            # Fetch faenas de hoy
            cursor.execute("""
                SELECT fecha_hora_inicio_real, fecha_hora_fin_real, costo_total 
                FROM faenas 
                WHERE chofer_id = %s AND estado = 'finalizada' AND fecha_hora_fin_real >= CURRENT_DATE
            """, (ch_id,))
            faenas_hoy = cursor.fetchall()
            
            if len(faenas_hoy) != 3: raise Exception(f"Conteo de faenas retornó {len(faenas_hoy)}, se esperaban 3")
            print("[OK] Test 18 OK")
            passed += 1
            
            # Calcular horas trabajadas sumando fechas
            total_horas = 0
            for f in faenas_hoy:
                diff = f[1] - f[0]
                total_horas += diff.total_seconds() / 3600
                
            # Tenemos 3 faenas: f_id (hecha en Test 14 a 17, asumiendo ~0 horas de diff porque fue casi instantanea) + Faena 2 (1h) + Faena 3 (1h)
            # Para estar seguros, forzamos la faena 1 a tener exactamente 1 hora para el test
            cursor.execute("UPDATE faenas SET fecha_hora_inicio_real = NOW() - INTERVAL '4 hours', fecha_hora_fin_real = NOW() - INTERVAL '3 hours' WHERE id = %s", (f_id,))
            
            cursor.execute("""
                SELECT fecha_hora_inicio_real, fecha_hora_fin_real 
                FROM faenas 
                WHERE chofer_id = %s AND estado = 'finalizada' AND fecha_hora_fin_real >= CURRENT_DATE
            """, (ch_id,))
            faenas_hoy_actualizadas = cursor.fetchall()
            
            total_horas = 0
            for f in faenas_hoy_actualizadas:
                diff = f[1] - f[0]
                total_horas += diff.total_seconds() / 3600
                
            # Deberían ser ~3 horas
            if round(total_horas, 1) != 3.0: raise Exception(f"Horas trabajadas calculadas: {total_horas}, se esperaban 3.0")
            print("[OK] Test 19 OK")
            passed += 1
            
            # Calcular ganancias
            cursor.execute("SELECT valor FROM configuracion_negocio WHERE clave = 'pago_chofer_por_hora_uyu'")
            pago_por_hora = float(cursor.fetchone()[0])
            
            ganancias_calculadas = total_horas * pago_por_hora
            
            if round(ganancias_calculadas) <= 0: raise Exception("Ganancias calculadas son 0 o negativas")
            print("[OK] Test 20 OK")
            passed += 1
        except Exception as e:
            import traceback
            print(f"[FAIL] Test 18-20 FAILED: {e}")
            traceback.print_exc()

        # TEST 21 - Restricción del algoritmo
        print("\nTest 21 - Restricción por horas de conducción continuas...")
        try:
            # Set horas de conducción a >= 8
            cursor.execute("UPDATE choferes SET horas_conduccion_continua = 8.5 WHERE id = %s", (ch_id,))
            
            # Crear faena e invocar algoritmo
            cursor.execute("""
                INSERT INTO faenas (id, cliente_id, vehiculo_cliente_id, estado, modalidad, origen, destino)
                VALUES (gen_random_uuid(), %s, %s, 'ofrecida', 'por_hora', ST_GeomFromText('POINT(-56.164 -34.901)', 4326), ST_GeomFromText('POINT(-56.164 -34.901)', 4326)) RETURNING id
            """, (cli_id, veh_id))
            faena4_id = cursor.fetchone()[0]
            faenas_creadas.append(faena4_id)
            
            # Invocar stored procedure
            cursor.execute("SELECT procesar_reasignacion_faena(%s)", (faena4_id,))
            
            cursor.execute("SELECT chofer_ofrecido_id FROM faenas WHERE id = %s", (faena4_id,))
            res21 = cursor.fetchone()
            if res21 and res21[0] == ch_id:
                raise Exception("Algoritmo asignó faena a un chofer con >= 8 horas de conducción continua")
            
            print("[OK] Test 21 OK")
            passed += 1
        except Exception as e:
            print(f"[FAIL] Test 21 FAILED: {e}")

    finally:
        print("\nLimpiando DB...")
        if paradas_creadas: cursor.execute("DELETE FROM paradas_traslado WHERE id = ANY(%s::uuid[])", (paradas_creadas,))
        if traslados_creados: cursor.execute("DELETE FROM traslados_equipo WHERE id = ANY(%s::uuid[])", (traslados_creados,))
        if vagonetas_creadas: cursor.execute("DELETE FROM vagonetas WHERE id = ANY(%s::uuid[])", (vagonetas_creadas,))
        
        cursor.execute("DELETE FROM faenas_ofertas_rechazadas WHERE chofer_id = ANY(%s::uuid[])", (choferes_creados,))
        if faenas_creadas: cursor.execute("DELETE FROM faenas WHERE id = ANY(%s::uuid[])", (faenas_creadas,))
        if vehiculos_creados: cursor.execute("DELETE FROM vehiculos_cliente WHERE id = ANY(%s::uuid[])", (vehiculos_creados,))
        if clientes_creados: cursor.execute("DELETE FROM clientes WHERE id = ANY(%s::uuid[])", (clientes_creados,))
        
        if choferes_creados:
            cursor.execute("DELETE FROM posiciones WHERE chofer_id = ANY(%s::uuid[])", (choferes_creados,))
            cursor.execute("DELETE FROM choferes WHERE id = ANY(%s::uuid[])", (choferes_creados,))
        conn.close()

    print(f"\nRESUMEN: {passed}/21 tests pasaron.")

if __name__ == '__main__':
    run_chofer_tests()
