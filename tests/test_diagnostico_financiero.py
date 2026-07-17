import os
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

def print_step(emoji, mensaje):
    print(f"\n{emoji} {mensaje}")

def print_sub(mensaje):
    print(f"   ↳ {mensaje}")

def run_test():
    print_step("🚀", "INICIANDO PRUEBA DE DIAGNÓSTICO FINANCIERO")
    
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        print_step("🌱", "Fase 1: Preparación (Seed)")
        
        # 1. Configurar costos operativos
        cursor.execute("""
            UPDATE costos_operativos_base 
            SET costo_chofer_hora = 300.00, depreciacion_vagoneta_km = 10.00;
        """)
        print_sub("Parámetros: Chofer = $ 300/hr, Vagoneta = $ 10/km")
        
        # 2. Simular un viaje corporativo en Pocitos
        # Ingreso = 1000
        # Costo chofer = 600
        # Costo vagoneta = 200
        # Gasto combustible = 300
        # Costo total = 1100, margen neto = -100
        # km = 20
        cursor.execute("""
            INSERT INTO resumen_contable_viajes (zona_h3, ingreso, costo_chofer, costo_vagoneta, costo_gastos_ruta, kilometros_reales)
            VALUES ('882a107299fffff', 1000.00, 600.00, 200.00, 300.00, 20.00)
            RETURNING id, margen_neto;
        """)
        res_viaje = cursor.fetchone()
        viaje_id = str(res_viaje[0])
        margen_calculado = float(res_viaje[1])
        
        print_sub(f"Viaje en Pocitos inyectado con margen calculado por DB: $ {margen_calculado}")
        
        print_step("🤖", "Fase 2: Ejecución del Diagnóstico")
        
        import sys
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'logic'))
        from financial_advisor import diagnosticar_salud_financiera
        
        resultados = diagnosticar_salud_financiera()
        print_sub(f"Resultados financieros: Ingreso ${resultados['ingreso_total']}, Costo ${resultados['costo_total']}, Margen ${resultados['margen_neto']}")
        print_sub(f"Sugerencias generadas: {resultados['sugerencias']}")
        
        print_step("✅", "Fase 3: Validaciones")
        
        assert resultados['margen_neto'] == -100.00, f"El margen neto no es el esperado: {resultados['margen_neto']}"
        assert any('ajustar la tarifa base' in s for s in resultados['sugerencias']), "No se generó la sugerencia de ajuste de tarifa"
        
        print_sub("VERIFICADO: Margen neto calculado correctamente en negativo.")
        print_sub("VERIFICADO: Sugerencia de ajuste de tarifa generada.")
        
        print_step("🏆", "PRUEBA DE DIAGNÓSTICO FINANCIERO SUPERADA CON ÉXITO")

    except Exception as e:
        print_step("❌", f"ERROR EN LA PRUEBA: {str(e)}")
        raise e
        
    finally:
        print_step("🧹", "Fase 4: Cleanup")
        cursor.execute("DELETE FROM sugerencias_financieras WHERE zona_h3 = '882a107299fffff';")
        cursor.execute("DELETE FROM resumen_contable_viajes WHERE id = %s;", (viaje_id,))
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_test()
