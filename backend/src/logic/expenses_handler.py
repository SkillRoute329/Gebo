import os
import psycopg2
from typing import Dict

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres?prepared_statement_cache_size=0")

def registrar_gasto_ruta(turno_id: str, categoria: str, monto: float, comprobante: str, foto: str, vagoneta_id: str = None) -> Dict:
    """
    Registra un gasto de ruta (peaje, estacionamiento, combustible, etc.) y evalúa su aprobación.
    """
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # A) Leer limite_gasto_automatico
        cursor.execute("SELECT limite_gasto_automatico FROM configuracion_negocio LIMIT 1;")
        res = cursor.fetchone()
        limite = float(res[0]) if res and res[0] is not None else 500.00
        
        # B) Evaluar el monto
        estado_gasto = 'aprobado_automatico' if monto <= limite else 'pendiente_aprobacion'
        
        # C) Insertar gasto
        cursor.execute("""
            INSERT INTO gastos_ruta (turno_id, vagoneta_id, categoria, monto, comprobante_nro, foto_comprobante, estado_gasto)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, estado_gasto;
        """, (turno_id, vagoneta_id, categoria, monto, comprobante, foto, estado_gasto))
        
        gasto_res = cursor.fetchone()
        
        return {
            "id": str(gasto_res[0]),
            "estado_gasto": gasto_res[1],
            "monto": monto,
            "categoria": categoria
        }
    finally:
        cursor.close()
        conn.close()
