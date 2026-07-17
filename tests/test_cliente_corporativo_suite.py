import os
import uuid
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def test_corporate_suite():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    empresa_id = str(uuid.uuid4())
    it_dept_id = str(uuid.uuid4())
    ventas_dept_id = str(uuid.uuid4())
    
    emp_it = str(uuid.uuid4())
    emp_ventas = str(uuid.uuid4())

    try:
        print("=== Iniciando Validación de Control de Presupuesto Corporativo ===")
        
        # Setup initial state
        cursor.execute("INSERT INTO clientes (id, nombre, saldo_cuenta) VALUES (%s, 'Gebo Corp', 50000);", (empresa_id,))
        
        # IT Department: 10000 limit, 0 spent
        cursor.execute("""
            INSERT INTO centros_de_costo (id, empresa_id, nombre_departamento, presupuesto_mensual, gasto_acumulado) 
            VALUES (%s, %s, 'IT', 10000, 0);
        """, (it_dept_id, empresa_id))
        
        # Ventas Department: 5000 limit, 5000 spent (maxed out)
        cursor.execute("""
            INSERT INTO centros_de_costo (id, empresa_id, nombre_departamento, presupuesto_mensual, gasto_acumulado) 
            VALUES (%s, %s, 'Ventas', 5000, 5000);
        """, (ventas_dept_id, empresa_id))
        
        # Create users (employees)
        cursor.execute("INSERT INTO usuarios (id, email, nombre_completo, cliente_id, centro_de_costo_id) VALUES (%s, 'juan@corp.com', 'Juan IT', %s, %s);", (emp_it, empresa_id, it_dept_id))
        cursor.execute("INSERT INTO usuarios (id, email, nombre_completo, cliente_id, centro_de_costo_id) VALUES (%s, 'maria@corp.com', 'Maria Ventas', %s, %s);", (emp_ventas, empresa_id, ventas_dept_id))
        
        # Caso 1: Aprobado (IT gasta $3000 de $10000)
        print("\n[*] Ejecutando Caso 1: Solicitud de Viaje ($3000) por Departamento de IT")
        cursor.execute("SELECT validar_y_descontar_presupuesto_departamento(%s, 3000.00);", (emp_it,))
        
        cursor.execute("SELECT gasto_acumulado FROM centros_de_costo WHERE id = %s;", (it_dept_id,))
        gasto_it = cursor.fetchone()[0]
        
        print(f"    -> Nuevo Gasto Acumulado de IT (0 + 3000): ${gasto_it}")
        assert gasto_it == 3000, "El presupuesto no se debitó correctamente para IT"
        print("[✓] Assert OK: Viaje autorizado y gasto descontado atómicamente.")
        
        # Caso 2: Bloqueado (Ventas gasta $1500 pero ya gastó $5000 de $5000)
        print("\n[*] Ejecutando Caso 2: Solicitud de Viaje ($1500) por Departamento de Ventas (Maxed)")
        bloqueado = False
        try:
            cursor.execute("SELECT validar_y_descontar_presupuesto_departamento(%s, 1500.00);", (emp_ventas,))
        except psycopg2.errors.RaiseException as e:
            if "Presupuesto excedido" in str(e):
                bloqueado = True
                print(f"    -> Base de datos abortó transacción: {e}".strip())
        
        assert bloqueado, "El viaje debió ser rechazado por falta de presupuesto"
        print("[✓] Assert OK: Excepción lanzada y finanzas protegidas correctamente.")

        print("\n==============================================")
        print("✓ PRUEBA CONTROL DE PRESUPUESTO: COMPLETADA Y EXITOSA")
        print("==============================================")
        
    finally:
        # Cleanup
        try:
            cursor.execute("DELETE FROM usuarios WHERE id IN (%s, %s);", (emp_it, emp_ventas))
            cursor.execute("DELETE FROM centros_de_costo WHERE id IN (%s, %s);", (it_dept_id, ventas_dept_id))
            cursor.execute("DELETE FROM clientes WHERE id = %s;", (empresa_id,))
        except Exception as e:
            pass
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_corporate_suite()
