BEGIN;

-- 1. Asegurar la tabla de configuración y la columna de tolerancia
DROP TABLE IF EXISTS configuracion_negocio CASCADE;

CREATE TABLE configuracion_negocio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarifa_base_minuto NUMERIC DEFAULT 0,
    costo_cancelacion_tardia NUMERIC DEFAULT 100,
    tolerancia_espera_minutos INTEGER DEFAULT 8
);

-- Insertar un row inicial
INSERT INTO configuracion_negocio (tarifa_base_minuto, costo_cancelacion_tardia, tolerancia_espera_minutos)
VALUES (15, 100, 8);

-- 2. Función de desacople de chofer retrasado
CREATE OR REPLACE FUNCTION fn_desacoplar_chofer_retrasado(p_parada_id UUID)
RETURNS UUID AS $$
DECLARE
    v_traslado_id UUID;
    v_secuencia INT;
BEGIN
    -- Obtenemos traslado_id y secuencia de la parada a eliminar
    SELECT traslado_id, secuencia INTO v_traslado_id, v_secuencia
    FROM paradas_traslado
    WHERE id = p_parada_id;

    IF v_traslado_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Eliminamos la parada (Desacople)
    DELETE FROM paradas_traslado WHERE id = p_parada_id;

    -- Re-secuenciamos las paradas restantes
    UPDATE paradas_traslado
    SET secuencia = secuencia - 1
    WHERE traslado_id = v_traslado_id AND secuencia > v_secuencia;

    RETURN v_traslado_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
