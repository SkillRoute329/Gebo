import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def test_chofer_blindado_suite():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    c_id = str(uuid.uuid4())
    cli_id = str(uuid.uuid4())
    f_id = str(uuid.uuid4())
    req_id = None

    try:
        print("=== Iniciando Validación de Ecosistema Financiero del Chofer ===")
        
        # Setup initial state
        cursor.execute("INSERT INTO choferes (id, nombre, saldo_billetera, estado) VALUES (%s, 'Chofer Financiero', 1000, 'disponible');", (c_id,))
        cursor.execute("INSERT INTO clientes (id, nombre, saldo_cuenta) VALUES (%s, 'Cliente Corporativo', 5000);", (cli_id,))
        cursor.execute("INSERT INTO faenas (id, chofer_id, cliente_id, estado) VALUES (%s, %s, %s, 'finalizada');", (f_id, c_id, cli_id))
        
        # Caso 1: Propina Atómica
        print("\n[*] Ejecutando Caso 1: Asignación de Propina ($200)")
        cursor.execute("SELECT asignar_propina(%s, 200.00);", (f_id,))
        
        cursor.execute("SELECT propina FROM faenas WHERE id = %s;", (f_id,))
        propina = cursor.fetchone()[0]
        cursor.execute("SELECT saldo_billetera FROM choferes WHERE id = %s;", (c_id,))
        saldo_chofer = cursor.fetchone()[0]
        cursor.execute("SELECT saldo_cuenta FROM clientes WHERE id = %s;", (cli_id,))
        saldo_cliente = cursor.fetchone()[0]
        
        print(f"    -> Propina en Faena: ${propina}")
        print(f"    -> Nuevo Saldo Chofer (1000 + 200): ${saldo_chofer}")
        print(f"    -> Nuevo Saldo Cliente (5000 - 200): ${saldo_cliente}")
        
        assert propina == 200, "La propina no se registró correctamente en la faena"
        assert saldo_chofer == 1200, "El saldo del chofer no se incrementó correctamente"
        assert saldo_cliente == 4800, "El saldo del cliente no se debitó correctamente"
        print("[✓] Assert OK: Propina asignada y saldos actualizados atómicamente.")
        
        # Caso 2: Solicitud de Reembolso
        print("\n[*] Ejecutando Caso 2: Aprobación de Reembolso ($1200)")
        cursor.execute("""
            INSERT INTO solicitudes_financieras_chofer (gebo_driver_id, tipo, monto, motivo, estado)
            VALUES (%s, 'reembolso', 1200.00, 'Pinchazo en ruta', 'pendiente') RETURNING id;
        """, (c_id,))
        req_id = cursor.fetchone()[0]
        
        cursor.execute("SELECT procesar_solicitud_financiera(%s, 'aprobar');", (req_id,))
        
        cursor.execute("SELECT estado FROM solicitudes_financieras_chofer WHERE id = %s;", (req_id,))
        estado_req = cursor.fetchone()[0]
        cursor.execute("SELECT saldo_billetera FROM choferes WHERE id = %s;", (c_id,))
        saldo_chofer_final = cursor.fetchone()[0]
        
        print(f"    -> Estado de Solicitud: {estado_req}")
        print(f"    -> Nuevo Saldo Chofer (1200 + 1200): ${saldo_chofer_final}")
        
        assert estado_req == 'aprobado', "La solicitud no fue marcada como aprobada"
        assert saldo_chofer_final == 2400, "El saldo del chofer no reflejó el reembolso"
        print("[✓] Assert OK: Reembolso aprobado e impactado sin discrepancias contables.")

        print("\n==============================================")
        print("✓ PRUEBA ECOSISTEMA FINANCIERO: COMPLETADA Y EXITOSA")
        print("==============================================")
        
    finally:
        # Cleanup
        try:
            if req_id:
                cursor.execute("DELETE FROM solicitudes_financieras_chofer WHERE id = %s;", (req_id,))
            cursor.execute("DELETE FROM faenas WHERE id = %s;", (f_id,))
            cursor.execute("DELETE FROM choferes WHERE id = %s;", (c_id,))
            cursor.execute("DELETE FROM clientes WHERE id = %s;", (cli_id,))
        except Exception as e:
            pass
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_chofer_blindado_suite()
