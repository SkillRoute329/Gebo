import os
import psycopg2
from typing import Dict, List

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres?prepared_statement_cache_size=0")

def diagnosticar_salud_financiera() -> Dict:
    """
    Diagnostica la salud financiera analizando ingresos y egresos, y genera sugerencias contables.
    """
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # A) Totales
        cursor.execute("""
            SELECT 
                SUM(ingreso), SUM(costo_chofer + costo_vagoneta + costo_gastos_ruta), SUM(margen_neto), SUM(kilometros_reales)
            FROM resumen_contable_viajes
        """)
        totales = cursor.fetchone()
        ingreso_total = float(totales[0]) if totales and totales[0] else 0.0
        costo_total = float(totales[1]) if totales and totales[1] else 0.0
        margen_neto_total = float(totales[2]) if totales and totales[2] else 0.0
        km_total = float(totales[3]) if totales and totales[3] else 0.0
        
        costo_promedio_km = costo_total / km_total if km_total > 0 else 0.0
        
        # B) Sugerencias
        sugerencias_generadas = []
        
        # Regla 1: Margen Neto < 10% por zona
        cursor.execute("""
            SELECT zona_h3, SUM(ingreso), SUM(margen_neto)
            FROM resumen_contable_viajes
            WHERE zona_h3 IS NOT NULL
            GROUP BY zona_h3
        """)
        zonas = cursor.fetchall()
        for zona, ing, marg in zonas:
            if ing > 0 and (marg / ing) < 0.10:
                sug_desc = f"Rentabilidad en la zona {zona} es muy baja ({(marg/ing)*100:.1f}%). Se sugiere ajustar la tarifa base."
                cursor.execute("""
                    INSERT INTO sugerencias_financieras (tipo_sugerencia, zona_h3, descripcion)
                    VALUES ('ajuste_tarifa', %s, %s)
                    ON CONFLICT DO NOTHING;
                """, (zona, sug_desc))
                sugerencias_generadas.append(sug_desc)
                
        # Regla 2: Gastos de ruta > 30% del costo total por vagoneta
        cursor.execute("""
            SELECT vagoneta_id, SUM(costo_gastos_ruta), SUM(costo_chofer + costo_vagoneta + costo_gastos_ruta)
            FROM resumen_contable_viajes
            WHERE vagoneta_id IS NOT NULL
            GROUP BY vagoneta_id
        """)
        vagonetas = cursor.fetchall()
        for vag_id, gastos, costo_tot in vagonetas:
            if costo_tot > 0 and (gastos / costo_tot) > 0.30:
                sug_desc = f"La vagoneta {vag_id} supera el 30% en gastos de ruta. Reducir límite de aprobación automática."
                cursor.execute("""
                    INSERT INTO sugerencias_financieras (tipo_sugerencia, vagoneta_id, descripcion)
                    VALUES ('ajuste_limite_gastos', %s, %s)
                    ON CONFLICT DO NOTHING;
                """, (vag_id, sug_desc))
                sugerencias_generadas.append(sug_desc)
        
        return {
            "ingreso_total": ingreso_total,
            "costo_total": costo_total,
            "margen_neto": margen_neto_total,
            "costo_promedio_km": costo_promedio_km,
            "sugerencias": sugerencias_generadas
        }
    finally:
        cursor.close()
        conn.close()
