BEGIN;

CREATE TABLE IF NOT EXISTS vagonetas_estado_actual (
    vagoneta_id UUID PRIMARY KEY REFERENCES vagonetas(id) ON DELETE CASCADE,
    ultima_posicion GEOGRAPHY(Point, 4326),
    ultimo_h3_res8 VARCHAR(15),
    estado VARCHAR(30),
    actualizado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for spatial queries
CREATE INDEX IF NOT EXISTS idx_vagonetas_estado_geom ON vagonetas_estado_actual USING GIST (ultima_posicion);

-- Trigger function
CREATE OR REPLACE FUNCTION fn_actualizar_cache_estado_vagoneta()
RETURNS TRIGGER AS $$
DECLARE
    v_vagoneta_id UUID;
    v_estado VARCHAR(30);
BEGIN
    SELECT id, estado INTO v_vagoneta_id, v_estado 
    FROM vagonetas 
    WHERE chofer_vagoneta_id = NEW.chofer_id 
    LIMIT 1;
    
    IF v_vagoneta_id IS NOT NULL THEN
        INSERT INTO vagonetas_estado_actual (
            vagoneta_id, ultima_posicion, ultimo_h3_res8, estado, actualizado_at
        ) VALUES (
            v_vagoneta_id, NEW.ubicacion, NEW.h3_res8, v_estado, NEW.timestamp
        )
        ON CONFLICT (vagoneta_id) DO UPDATE SET
            ultima_posicion = EXCLUDED.ultima_posicion,
            ultimo_h3_res8 = EXCLUDED.ultimo_h3_res8,
            estado = EXCLUDED.estado,
            actualizado_at = EXCLUDED.actualizado_at;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posiciones_actualizar_cache ON posiciones;
CREATE TRIGGER trg_posiciones_actualizar_cache
AFTER INSERT ON posiciones
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_cache_estado_vagoneta();

COMMIT;
