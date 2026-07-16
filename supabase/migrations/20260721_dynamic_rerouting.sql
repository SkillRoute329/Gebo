-- =================================================================================
-- Migración: Ruteo Dinámico Continuo e Interceptación en Ruta
-- Descripción: Permite a vagonetas que ya se encuentran 'en_ruta' para rescates
--              interceptar y recoger a otros choferes que terminen su faena
--              en hexágonos cercanos, re-secuenciando sus paradas.
-- =================================================================================

BEGIN;

-- 1. Añadir/Asegurar la columna 'secuencia' en paradas_traslado
ALTER TABLE paradas_traslado ADD COLUMN IF NOT EXISTS secuencia INTEGER DEFAULT 1;

-- Migrar datos de 'orden' a 'secuencia' si existía previamente por convenciones anteriores
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='paradas_traslado' AND column_name='orden') THEN
        UPDATE paradas_traslado SET secuencia = orden WHERE orden IS NOT NULL AND secuencia = 1;
    END IF;
END $$;

-- 2. Función de Evaluación de Interceptación (Vecindario H3 k=1 o Proximidad 1500m)
CREATE OR REPLACE FUNCTION fn_evaluar_interceptacion_vagoneta(
    p_chofer_id UUID, 
    p_faena_id UUID,
    p_destino_geography GEOGRAPHY
) RETURNS BOOLEAN 
LANGUAGE plpgsql
AS $$
DECLARE
    v_traslado_id UUID;
    v_vagoneta_id UUID;
    v_vagoneta_lat float;
    v_vagoneta_lng float;
    v_dest_lat float;
    v_dest_lng float;
    v_dist_nueva float;
    v_dist_actual float;
    v_parada_actual_id UUID;
    v_parada_actual_lat float;
    v_parada_actual_lng float;
BEGIN
    v_dest_lat := ST_Y(p_destino_geography::geometry);
    v_dest_lng := ST_X(p_destino_geography::geometry);

    -- A y B) Buscar un traslado de retorno activo cuya vagoneta esté en vecindad H3 (~1500m max)
    SELECT t.id, t.vagoneta_id, ST_Y(v.ubicacion_actual::geometry), ST_X(v.ubicacion_actual::geometry)
    INTO v_traslado_id, v_vagoneta_id, v_vagoneta_lat, v_vagoneta_lng
    FROM traslados_equipo t
    JOIN vagonetas v ON t.vagoneta_id = v.id
    WHERE (t.estado = 'en_curso' OR t.estado = 'programado')
      AND t.tipo = 'retorno'
      AND v.ubicacion_actual IS NOT NULL
      AND ST_Distance(v.ubicacion_actual, p_destino_geography) <= 1500
    ORDER BY ST_Distance(v.ubicacion_actual, p_destino_geography) ASC
    LIMIT 1;

    -- C) Si encontramos una vagoneta en ruta apta para desvío/interceptación
    IF FOUND THEN
        -- Extraer la parada actual prioritaria de ese traslado para comparar distancias
        SELECT id, ST_Y(punto::geometry), ST_X(punto::geometry)
        INTO v_parada_actual_id, v_parada_actual_lat, v_parada_actual_lng
        FROM paradas_traslado
        WHERE traslado_id = v_traslado_id AND completada = false
        ORDER BY secuencia ASC LIMIT 1;
        
        v_dist_nueva := ST_Distance(ST_MakePoint(v_vagoneta_lng, v_vagoneta_lat)::geography, p_destino_geography);
        
        IF v_parada_actual_id IS NOT NULL THEN
            v_dist_actual := ST_Distance(ST_MakePoint(v_vagoneta_lng, v_vagoneta_lat)::geography, ST_MakePoint(v_parada_actual_lng, v_parada_actual_lat)::geography);
            
            -- Re-secuenciamiento dinámico: Si el nuevo chofer está más cerca que el objetivo original, interceptarlo primero
            IF v_dist_nueva < v_dist_actual THEN
                -- Desplazar las paradas existentes incrementando su secuencia
                UPDATE paradas_traslado SET secuencia = secuencia + 1 WHERE traslado_id = v_traslado_id AND completada = false;
                
                -- Insertar al interceptado como Prioridad 1
                INSERT INTO paradas_traslado (
                    id, traslado_id, chofer_id, faena_id, punto, descripcion, secuencia, tipo, completada
                ) VALUES (
                    gen_random_uuid(), v_traslado_id, p_chofer_id, p_faena_id, p_destino_geography, 'Interceptación H3 (Prioritaria)', 1, 'recogida', false
                );
            ELSE
                -- Insertarlo a la cola (al final del recorrido de esa vagoneta)
                INSERT INTO paradas_traslado (
                    id, traslado_id, chofer_id, faena_id, punto, descripcion, secuencia, tipo, completada
                ) VALUES (
                    gen_random_uuid(), v_traslado_id, p_chofer_id, p_faena_id, p_destino_geography, 'Interceptación H3 (En cola)', (SELECT COALESCE(MAX(secuencia), 0) + 1 FROM paradas_traslado WHERE traslado_id = v_traslado_id), 'recogida', false
                );
            END IF;
        ELSE
            -- El traslado existía pero no tenía paradas activas, lo insertamos como 1
            INSERT INTO paradas_traslado (
                id, traslado_id, chofer_id, faena_id, punto, descripcion, secuencia, tipo, completada
            ) VALUES (
                gen_random_uuid(), v_traslado_id, p_chofer_id, p_faena_id, p_destino_geography, 'Interceptación H3 (Única)', 1, 'recogida', false
            );
        END IF;

        -- D) Retorna TRUE bloqueando la creación de un traslado redundante
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;


-- 3. Parche y Extensión del Trigger Principal de Rescate (Mantenemos compatibilidad)
CREATE OR REPLACE FUNCTION fn_automatizar_rescate_chofer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vagoneta_id UUID;
    v_traslado_id UUID;
    v_interceptado BOOLEAN;
BEGIN
    IF NEW.destino IS NULL THEN
        RETURN NEW;
    END IF;

    -- 1. Intentar Interceptación Dinámica (Ruteo Continuo / Pooling de Vagonetas)
    v_interceptado := fn_evaluar_interceptacion_vagoneta(NEW.chofer_id, NEW.id, NEW.destino);

    -- 2. Si no se pudo interceptar en la calle, procedemos a enviar una vagoneta libre (legacy flow)
    IF NOT v_interceptado THEN
        SELECT id INTO v_vagoneta_id
        FROM vagonetas
        WHERE estado = 'disponible'
          AND ubicacion_actual IS NOT NULL
        ORDER BY ubicacion_actual <-> NEW.destino
        LIMIT 1;

        IF FOUND AND v_vagoneta_id IS NOT NULL THEN
            v_traslado_id := gen_random_uuid();
            
            INSERT INTO traslados_equipo (
                id, vagoneta_id, tipo, fecha_hora, estado
            ) VALUES (
                v_traslado_id, v_vagoneta_id, 'retorno', NOW(), 'programado'
            );

            INSERT INTO paradas_traslado (
                id, traslado_id, chofer_id, faena_id, punto, descripcion, secuencia, tipo, completada
            ) VALUES (
                gen_random_uuid(), v_traslado_id, NEW.chofer_id, NEW.id, NEW.destino, 'Rescate post-faena (Nueva Vagoneta)', 1, 'recogida', false
            );

            UPDATE vagonetas 
            SET estado = 'en_ruta' 
            WHERE id = v_vagoneta_id;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    -- Mantenemos el bloque transaccional robusto
    WHEN OTHERS THEN
        RAISE WARNING 'Error no critico al programar rescate/interceptacion para la faena %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

COMMIT;
