-- =========================================================================
-- FASE 10: ESTADOS DE OFERTA, TIMEOUTS Y REASIGNACIÓN
-- =========================================================================

-- 1. Ampliar los estados permitidos en la tabla viajes
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS chk_estado_viaje;
ALTER TABLE viajes ADD CONSTRAINT chk_estado_viaje 
    CHECK (estado IN ('solicitado', 'pendiente', 'ofrecido', 'asignado', 'en_camino', 'en_punto', 'en_curso', 'finalizado', 'cancelado'));

-- 2. Añadir campos para el flujo de ofertas
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS chofer_ofrecido_id UUID REFERENCES choferes(id);
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS oferta_expira_en TIMESTAMP WITH TIME ZONE;

-- 3. Tabla para registrar los choferes que ya rechazaron (o ignoraron) el viaje
CREATE TABLE IF NOT EXISTS viajes_ofertas_rechazadas (
    viaje_id UUID REFERENCES viajes(id) ON DELETE CASCADE,
    chofer_id UUID REFERENCES choferes(id) ON DELETE CASCADE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (viaje_id, chofer_id)
);

-- 4. Función central para ejecutar la reasignación (Lógica compartida)
-- Esta función excluye al chofer anterior, lo anota en la lista negra temporal del viaje,
-- y busca al siguiente mejor chofer disponible.
CREATE OR REPLACE FUNCTION procesar_reasignacion_viaje(p_viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_viaje viajes%ROWTYPE;
    v_nuevo_vehiculo_id UUID;
    v_nuevo_chofer_id UUID;
BEGIN
    -- Bloquear el viaje para evitar race conditions
    SELECT * INTO v_viaje FROM viajes WHERE id = p_viaje_id FOR UPDATE;
    
    -- Si ya fue aceptado o cancelado, ignorar
    IF v_viaje.estado != 'ofrecido' THEN
        RETURN;
    END IF;

    -- Registrar al chofer actual en la lista de rechazados
    IF v_viaje.chofer_ofrecido_id IS NOT NULL THEN
        INSERT INTO viajes_ofertas_rechazadas (viaje_id, chofer_id)
        VALUES (v_viaje.id, v_viaje.chofer_ofrecido_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Ejecutar algoritmo de asignación (Port simplificado a PL/pgSQL de Fase 2)
    -- Priorizamos vagonetas, luego taxis, ordenados por proximidad y excluyendo los rechazados.
    SELECT v.id, v.chofer_id INTO v_nuevo_vehiculo_id, v_nuevo_chofer_id
    FROM vehiculos v
    JOIN posiciones p ON p.chofer_id = v.chofer_id
    WHERE v.chofer_id NOT IN (
        SELECT chofer_id FROM viajes_ofertas_rechazadas WHERE viaje_id = v_viaje.id
    )
    AND p.timestamp >= NOW() - INTERVAL '5 minutes'
    ORDER BY 
        CASE WHEN v.tipo = 'vagoneta' THEN 1 ELSE 2 END ASC,
        ST_Distance(p.ubicacion, v_viaje.origen) ASC
    LIMIT 1;

    IF v_nuevo_vehiculo_id IS NOT NULL THEN
        -- Encontramos un nuevo chofer, lo ofrecemos por 15 segundos
        UPDATE viajes 
        SET estado = 'ofrecido', 
            vehiculo_id = v_nuevo_vehiculo_id,
            chofer_ofrecido_id = v_nuevo_chofer_id,
            oferta_expira_en = NOW() + INTERVAL '15 seconds'
        WHERE id = v_viaje.id;
    ELSE
        -- No hay nadie disponible, se queda en pendiente
        UPDATE viajes 
        SET estado = 'pendiente',
            vehiculo_id = NULL,
            chofer_ofrecido_id = NULL,
            oferta_expira_en = NULL
        WHERE id = v_viaje.id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC Invocado por el Cliente (App Pasajero) al vencer los 15s
CREATE OR REPLACE FUNCTION solicitar_reasignacion(viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_cliente_id UUID;
    v_oferta_expira_en TIMESTAMP WITH TIME ZONE;
    v_estado TEXT;
BEGIN
    SELECT cliente_id, oferta_expira_en, estado 
    INTO v_cliente_id, v_oferta_expira_en, v_estado
    FROM viajes WHERE id = viaje_id;

    -- Validaciones de seguridad crticas (Zero-Trust)
    IF v_cliente_id IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;
    
    IF v_cliente_id != auth.uid() THEN
        RAISE EXCEPTION 'No autorizado. Solo el creador del viaje puede solicitar reasignacion.';
    END IF;

    IF v_estado != 'ofrecido' THEN
        RAISE EXCEPTION 'El viaje no esta en ventana de oferta';
    END IF;

    IF NOW() < v_oferta_expira_en THEN
        RAISE EXCEPTION 'La oferta actual aun no ha expirado';
    END IF;

    -- Pasa todas las validaciones, ejecutamos
    PERFORM procesar_reasignacion_viaje(viaje_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Job de Respaldo (Fallback Cron)
-- Se requiere la extension pg_cron. Si estamos en local, a veces hay que habilitarla:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Creamos el job que corre cada 1 minuto
SELECT cron.schedule(
    'reasignacion-fallback-job',
    '* * * * *',
    $$
        SELECT procesar_reasignacion_viaje(id) 
        FROM viajes 
        WHERE estado = 'ofrecido' 
          AND oferta_expira_en < NOW();
    $$
);
