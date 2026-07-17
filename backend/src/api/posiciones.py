import os
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import psycopg2

router = APIRouter(prefix="/api/posiciones", tags=["posiciones"])

class Ping(BaseModel):
    chofer_id: str
    lat: float
    lng: float
    timestamp: str  # Fecha ISO-8601 guardada en el dispositivo

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres:postgres@127.0.0.1:6543/postgres?prepared_statement_cache_size=0")

def get_db_connection():
    return psycopg2.connect(DB_URL)

@router.post("/sync-batch")
def sync_batch_posiciones(pings: List[Ping]):
    """
    Recibe un array de pings históricos guardados localmente en el móvil durante
    pérdida de señal (offline tracking) y los inserta de manera transaccional.
    El trigger de Supabase calculará automáticamente el hexágono H3 para cada uno.
    """
    try:
        conn = get_db_connection()
        conn.autocommit = False
        cursor = conn.cursor()
        
        for ping in pings:
            cursor.execute("""
                INSERT INTO posiciones (chofer_id, ubicacion, timestamp)
                VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s);
            """, (ping.chofer_id, ping.lng, ping.lat, ping.timestamp))
            
        conn.commit()
        cursor.close()
        conn.close()
        
        return {"status": "success", "synced": len(pings)}
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
