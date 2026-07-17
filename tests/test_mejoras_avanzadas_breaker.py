import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def setup_faena(cursor, base_odo=10000):
    faena_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO faenas (id, estado, odometro_inicio, modalidad) 
        VALUES (%s, 'en_curso', %s, 'por_minuto') RETURNING id;
    """, (faena_id, base_odo))
    return faena_id

def test_circuit_breaker():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    f1_id = None
    f2_id = None

    try:
        print("=== Iniciando Validación de Circuit Breaker Contable ===")
        
        # Aseguramos un registro base en configuracion_negocio para las pruebas
        # (Omitido porque el RPC ya usa COALESCE por defecto a 30 si no existe)
        
        # CASO 1: Normal
        print("\n[*] Ejecutando Caso 1: Flujo Normal (Tarifa Coherente)")
        f1_id = setup_faena(cursor, 10000)
        # 25 km reales = 50 base + 25*30 = 800 pesos.
        cursor.execute("SELECT finalizar_faena_sync(%s, 10025, 25.0, 'http://foto.com/odo');", (f1_id,))
        res_normal = cursor.fetchone()[0]
        
        cursor.execute("SELECT estado FROM faenas WHERE id = %s;", (f1_id,))
        estado_f1 = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM resumen_contable_viajes WHERE faena_id = %s;", (f1_id,))
        impacto_f1 = cursor.fetchone()[0]
        
        print(f"    -> Costo Final: ${res_normal['costo_final']}")
        print(f"    -> Estado Faena: {estado_f1}")
        
        assert estado_f1 == 'finalizada', "El caso normal debe quedar como 'finalizada'"
        assert impacto_f1 == 1, "El caso normal debe impactar los saldos contables"
        print("[✓] Assert OK: Flujo normal cerrado e impactado con éxito.")

        # CASO 2: Anomalía (Tipeo Erróneo del Odómetro)
        print("\n[*] Ejecutando Caso 2: Anomalía (Error de Tipeo - Tarifa Desmedida)")
        f2_id = setup_faena(cursor, 10000)
        # Odometro fin exagerado: 12000 (2000 km = 50 base + 2000*30 = 60050 pesos)
        cursor.execute("SELECT finalizar_faena_sync(%s, 12000, 2000.0, 'http://foto.com/odo2');", (f2_id,))
        res_anomalia = cursor.fetchone()[0]
        
        cursor.execute("SELECT estado FROM faenas WHERE id = %s;", (f2_id,))
        estado_f2 = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM resumen_contable_viajes WHERE faena_id = %s;", (f2_id,))
        impacto_f2 = cursor.fetchone()[0]
        
        print(f"    -> Costo Disparado: ${res_anomalia['costo_final']}")
        print(f"    -> Estado Faena Interceptado: {estado_f2}")
        
        assert estado_f2 == 'pendiente_auditoria_admin', "El circuit breaker debe cambiar el estado a auditoría"
        assert impacto_f2 == 0, "El circuit breaker NO DEBE impactar los saldos"
        print("[✓] Assert OK: Circuit Breaker activado. Saldo corporativo protegido (0 alteraciones). Faena enviada a revisión.")

        print("\n==============================================")
        print("✓ PRUEBA AVANZADA CIRCUIT BREAKER: COMPLETADA Y EXITOSA")
        print("==============================================")
        
    finally:
        # cleanup
        try:
            if f1_id:
                cursor.execute("DELETE FROM resumen_contable_viajes WHERE faena_id = %s;", (f1_id,))
                cursor.execute("DELETE FROM faenas WHERE id = %s;", (f1_id,))
            if f2_id:
                cursor.execute("DELETE FROM resumen_contable_viajes WHERE faena_id = %s;", (f2_id,))
                cursor.execute("DELETE FROM faenas WHERE id = %s;", (f2_id,))
        except Exception as e:
            pass
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_circuit_breaker()
