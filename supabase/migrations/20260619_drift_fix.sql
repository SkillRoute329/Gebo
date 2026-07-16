-- Migración para corregir el Drift de Asignación detectado por QA

-- 1. Añadir el campo pasajeros a viajes que es necesario para la regla de negocio
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS pasajeros INTEGER NOT NULL DEFAULT 1 CHECK (pasajeros > 0);

-- 2. Corregir el RPC para incluir capacidad_pasajeros y margen de seguridad
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

    -- Ejecutar algoritmo de asignación (Port completo de Fase 2, corrigiendo drift)
    -- Priorizamos vagonetas, luego taxis, ordenados por proximidad y excluyendo los rechazados.
    SELECT v.id, v.chofer_id INTO v_nuevo_vehiculo_id, v_nuevo_chofer_id
    FROM vehiculos v
    LEFT JOIN posiciones p ON p.chofer_id = v.chofer_id
    WHERE v.chofer_id NOT IN (
        SELECT chofer_id FROM viajes_ofertas_rechazadas WHERE viaje_id = v_viaje.id
    )
    AND (
        (v.tipo = 'vagoneta' AND p.timestamp >= NOW() - INTERVAL '5 minutes' AND (v.capacidad_pasajeros - 1) >= v_viaje.pasajeros) OR
        (v.tipo = 'taxi_tercero' AND v.capacidad_pasajeros >= v_viaje.pasajeros)
    )
    ORDER BY 
        CASE WHEN v.tipo = 'vagoneta' THEN 1 ELSE 2 END ASC,
        COALESCE(ST_Distance(p.ubicacion, v_viaje.origen), 9999999) ASC
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
