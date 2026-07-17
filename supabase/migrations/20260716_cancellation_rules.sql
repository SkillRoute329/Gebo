BEGIN;

-- 1. Añadir costo_penalizacion a la tabla de faenas
ALTER TABLE faenas ADD COLUMN IF NOT EXISTS costo_penalizacion NUMERIC DEFAULT 0;

-- 2. Asegurar el estado 'cancelada_cliente' en faenas
ALTER TABLE faenas DROP CONSTRAINT IF EXISTS faenas_estado_check;
ALTER TABLE faenas ADD CONSTRAINT faenas_estado_check 
    CHECK (estado IN ('programada', 'en_curso', 'finalizada', 'cancelada', 'cancelada_cliente', 'incidente'));

-- 3. Crear función de procesamiento de cancelación
CREATE OR REPLACE FUNCTION fn_procesar_cancelacion_faena(p_faena_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_origen GEOGRAPHY;
    v_chofer_id UUID;
    v_estado_faena TEXT;
    v_vagoneta_ubicacion GEOGRAPHY;
    v_distancia_metros NUMERIC;
    v_resultado TEXT;
BEGIN
    -- 1. Obtener datos de la faena
    SELECT origen, chofer_id, estado INTO v_origen, v_chofer_id, v_estado_faena
    FROM faenas
    WHERE id = p_faena_id;

    IF v_estado_faena = 'cancelada_cliente' THEN
        RETURN 'YA_CANCELADA';
    END IF;

    -- 2. Buscar si hay una vagoneta asignada en curso hacia este chofer
    SELECT v.ubicacion_actual INTO v_vagoneta_ubicacion
    FROM traslados_equipo t
    JOIN paradas_traslado p ON p.traslado_id = t.id
    JOIN vagonetas v ON v.id = t.vagoneta_id
    WHERE p.chofer_id = v_chofer_id
      AND t.estado IN ('en_curso', 'programado')
    LIMIT 1;

    -- 3. Evaluar Zona de No Retorno (anillo H3 k=1 ~1500m de radio robusto postgis)
    IF v_vagoneta_ubicacion IS NOT NULL THEN
        v_distancia_metros := ST_Distance(v_vagoneta_ubicacion, v_origen);

        IF v_distancia_metros <= 1500 THEN
            -- Zona de No Retorno (Abusiva)
            UPDATE faenas 
            SET estado = 'cancelada_cliente', costo_penalizacion = 100
            WHERE id = p_faena_id;
            
            v_resultado := 'PENALIZACION_COMPLETA';
        ELSE
            -- Lejos (Sin penalización máxima)
            UPDATE faenas 
            SET estado = 'cancelada_cliente', costo_penalizacion = 0
            WHERE id = p_faena_id;
            
            v_resultado := 'SIN_PENALIZACION';
        END IF;
    ELSE
        -- No hay vagoneta o no está en ruta
        UPDATE faenas 
        SET estado = 'cancelada_cliente', costo_penalizacion = 0
        WHERE id = p_faena_id;
        
        v_resultado := 'SIN_PENALIZACION';
    END IF;

    RETURN v_resultado;
END;
$$ LANGUAGE plpgsql;

COMMIT;
