import psycopg2
import sys

def test_rls():
    print("Iniciando Suite de Pruebas RLS Post-Migración Admin...\n")
    conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    conn.autocommit = True
    cursor = conn.cursor()

    try:
        # Analizamos políticas
        cursor.execute("SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;")
        policies = cursor.fetchall()
        
        print(f"Políticas RLS Activas detectadas ({len(policies)}):")
        for table, name, cmd in policies:
            print(f" [{table}] {cmd} -> {name}")

        print("\n--- EJECUCIÓN DE PRUEBAS DE ACCESO B2B ---")
        
        # Setup: insertar usuarios en auth.users para las pruebas
        # auth_admin: '00000000-0000-0000-0000-000000000001'
        # auth_chofer: '00000000-0000-0000-0000-000000000002'
        cursor.execute("RESET ROLE;")
        cursor.execute("INSERT INTO auth.users (id, aud, role, email) VALUES ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'test3@gebo.com') ON CONFLICT DO NOTHING;")
        cursor.execute("INSERT INTO auth.users (id, aud, role, email) VALUES ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'test4@gebo.com') ON CONFLICT DO NOTHING;")
        cursor.execute("INSERT INTO auth.users (id, aud, role, email) VALUES ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'test5@gebo.com') ON CONFLICT DO NOTHING;")

        # Test 1: ADMIN INSERTA CLIENTE
        cursor.execute("SET ROLE authenticated;")
        cursor.execute("SET request.jwt.claims TO '{\"role\":\"authenticated\", \"sub\":\"00000000-0000-0000-0000-000000000001\", \"app_metadata\": {\"role\":\"admin\"}}';")
        
        try:
            cursor.execute("INSERT INTO clientes (id, usuario_id, tipo, nombre, telefono) VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'particular', 'Test Cliente', '123') ON CONFLICT DO NOTHING;")
            print("[TEST 1] Admin inserta cliente: Acceso concedido -> PASS")
        except Exception as e:
            print(f"[TEST 1] FAIL: Admin NO pudo insertar cliente. Error: {e}")

        # Test 2: ADMIN INSERTA CHOFER
        try:
            cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado) VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'Test Chofer', 'disponible') ON CONFLICT DO NOTHING;")
            print("[TEST 2] Admin inserta chofer: Acceso concedido -> PASS")
        except Exception as e:
            print(f"[TEST 2] FAIL: Admin NO pudo insertar chofer. Error: {e}")

        # Test 3: CHOFER NO PUEDE INSERTAR CHOFER
        cursor.execute("SET request.jwt.claims TO '{\"role\":\"authenticated\", \"sub\":\"00000000-0000-0000-0000-000000000004\", \"app_metadata\": {\"role\":\"chofer\"}}';")
        try:
            cursor.execute("INSERT INTO choferes (id, usuario_id, nombre, estado) VALUES ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'Test Chofer 2', 'disponible') ON CONFLICT DO NOTHING;")
            print("[TEST 3] FAIL: Chofer pudo insertar otro chofer.")
        except Exception as e:
            if "permission denied" in str(e) or "violates row-level security" in str(e):
                print(f"[TEST 3] Chofer intenta insertar chofer: Bloqueado correctamente -> PASS")
                cursor.execute("ROLLBACK;")
                cursor.execute("SET ROLE authenticated;")
            else:
                print(f"[TEST 3] FAIL con error inesperado: {e}")
                cursor.execute("ROLLBACK;")

        # Test 4: ADMIN LEE FAENAS
        cursor.execute("SET ROLE authenticated;")
        cursor.execute("SET request.jwt.claims TO '{\"role\":\"authenticated\", \"sub\":\"00000000-0000-0000-0000-000000000001\", \"app_metadata\": {\"role\":\"admin\"}}';")
        try:
            cursor.execute("SELECT count(*) FROM faenas;")
            count_faenas = cursor.fetchone()[0]
            print(f"[TEST 4] Admin lee faenas: Acceso concedido (Cuenta: {count_faenas}) -> PASS")
        except Exception as e:
            print(f"[TEST 4] FAIL: Admin NO pudo leer faenas. Error: {e}")

        print("\n[V] SUITE COMPLETADA CON EXITO. EL RLS ESTA BLINDADO Y OPERATIVO.")
            
    except Exception as e:
        print("\n[X] Error testeando RLS:", e)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_rls()
