-- =================================================================================
-- Migración: Automatizar rescate de chofer (Retorno en vagoneta)
-- Descripción: Detecta cuando una faena finaliza y asigna la vagoneta disponible
--              más cercana para buscar al chofer en su punto de destino.
-- =================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- Para asegurar que gen_random_uuid() está disponible

-- 1. Función Trigger
CREATE OR REPLACE FUNCTION fn_automatizar_rescate_chofer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vagoneta_id UUID;
    v_traslado_id UUID;
BEGIN
    -- Ejecutar validación de seguridad para evitar fallos si el destino es nulo
    IF NEW.destino IS NULL THEN
        RETURN NEW;
    END IF;

    -- Encontrar la vagoneta disponible más cercana a la coordenada de destino
    SELECT id INTO v_vagoneta_id
    FROM vagonetas
    WHERE estado = 'disponible'
      AND ubicacion_actual IS NOT NULL
    ORDER BY ubicacion_actual <-> NEW.destino
    LIMIT 1;

    -- Validar de manera segura si encontramos una vagoneta (evitar que falle la faena si no hay flota)
    IF FOUND AND v_vagoneta_id IS NOT NULL THEN
        
        -- Generar ID para el nuevo traslado
        v_traslado_id := gen_random_uuid();
        
        -- A) Insertar el traslado (Retorno)
        INSERT INTO traslados_equipo (
            id, 
            vagoneta_id, 
            tipo, 
            fecha_hora, 
            estado
        ) VALUES (
            v_traslado_id, 
            v_vagoneta_id, 
            'retorno', 
            NOW(), 
            'programado'
        );

        -- B) Insertar la parada correspondiente (Recogida del chofer en el destino de la faena)
        INSERT INTO paradas_traslado (
            id, 
            traslado_id, 
            chofer_id, 
            faena_id, 
            punto, 
            descripcion, 
            orden, 
            tipo, 
            completada
        ) VALUES (
            gen_random_uuid(), 
            v_traslado_id, 
            NEW.chofer_id, 
            NEW.id, 
            NEW.destino, 
            'Rescate post-faena', 
            1, 
            'recogida', 
            false
        );

        -- C) Actualizar el estado de la vagoneta a 'en_ruta' para aislarla del pool de disponibles
        UPDATE vagonetas 
        SET estado = 'en_ruta' 
        WHERE id = v_vagoneta_id;

    END IF;

    RETURN NEW;

EXCEPTION
    -- Bloque de seguridad: En caso de cualquier error relacional o espacial, permitimos que la faena 
    -- se cierre de todos modos sin revertir la transacción principal de pago/cierre.
    WHEN OTHERS THEN
        RAISE WARNING 'Error no critico al programar rescate de chofer para la faena %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- 2. Creación / Reemplazo del Trigger
DROP TRIGGER IF EXISTS trg_faena_finalizada_rescate ON faenas;

CREATE TRIGGER trg_faena_finalizada_rescate
AFTER UPDATE ON faenas
FOR EACH ROW
WHEN (NEW.estado = 'finalizada' AND OLD.estado != 'finalizada')
EXECUTE FUNCTION fn_automatizar_rescate_chofer();
