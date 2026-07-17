import os
from typing import List
import psycopg2
from .h3_adapter import obtener_hex_vecinos_anillo1

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres?prepared_statement_cache_size=0")

def verificar_desvio_vagoneta(traslado_id: str, ubicacion_actual_h3: str, ruta_planificada_h3: List[str]) -> bool:
    """
    Verifica de forma topológica (sobre hexágonos H3) si la vagoneta 
    se desvió de su ruta planificada.
    
    Args:
        traslado_id (str): UUID del traslado.
        ubicacion_actual_h3 (str): Hexágono H3 actual de la vagoneta.
        ruta_planificada_h3 (List[str]): Hexágonos H3 que componen la ruta.
        
    Returns:
        bool: True si hubo un desvío, False si está dentro de tolerancia.
    """
    # 1. Expandir la ruta con la zona de tolerancia H3 (anillo k=1 ~1500m diámetro)
    zona_tolerancia = set()
    for hex_ruta in ruta_planificada_h3:
        zona_tolerancia.add(hex_ruta)
        # expandir usando el adaptador que emula la topología (vecindad k=1)
        vecinos = obtener_hex_vecinos_anillo1(hex_ruta)
        zona_tolerancia.update(vecinos)
        
    # 2. Evaluar desvío (Operación de conjuntos O(1))
    if ubicacion_actual_h3 not in zona_tolerancia:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = False
        cursor = conn.cursor()
        
        try:
            # A) Cambiar estado del traslado a 'desviado'
            cursor.execute("UPDATE traslados_equipo SET estado = 'desviado' WHERE id = %s;", (traslado_id,))
            
            # B) Insertar en alertas operativas
            cursor.execute("""
                INSERT INTO alertas_operativas (traslado_id, tipo_alerta, descripcion)
                VALUES (%s, 'desvio_ruta', 'La vagoneta ha salido de la zona de tolerancia H3 planificada.');
            """, (traslado_id,))
            
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            conn.close()
            
    return False
