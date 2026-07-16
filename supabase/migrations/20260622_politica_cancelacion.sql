-- =========================================================================
-- FASE HARDENING B5: POLÍTICA SIMÉTRICA DE CANCELACIÓN
-- =========================================================================

-- 1. Modificar estados en viajes
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS chk_estado_viaje;
ALTER TABLE viajes ADD CONSTRAINT chk_estado_viaje 
    CHECK (estado IN ('solicitado', 'pendiente', 'ofrecido', 'asignado', 'en_camino', 'en_punto', 'en_curso', 'finalizado', 'cancelado', 'cancelado_cliente', 'cancelado_chofer'));

-- 2. Añadir nuevas columnas
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS penalizacion_cancelacion NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS asignado_en TIMESTAMP WITH TIME ZONE;
ALTER TABLE viajes_ofertas_rechazadas ADD COLUMN IF NOT EXISTS penalizado_por_demora BOOLEAN DEFAULT false;

-- 3. Trigger para setear asignado_en automáticamente
CREATE OR REPLACE FUNCTION set_asignado_en()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado = 'asignado' AND OLD.estado != 'asignado' THEN
        NEW.asignado_en = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_viajes_asignado_en ON viajes;
CREATE TRIGGER trg_viajes_asignado_en
BEFORE UPDATE ON viajes
FOR EACH ROW
EXECUTE FUNCTION set_asignado_en();

-- 4. RLS para viajes_ofertas_rechazadas
ALTER TABLE viajes_ofertas_rechazadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin puede leer ofertas rechazadas" 
ON viajes_ofertas_rechazadas FOR SELECT 
TO authenticated 
USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- 5. RPC Cancelar Viaje Cliente
CREATE OR REPLACE FUNCTION cancelar_viaje_cliente(p_viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_viaje viajes%ROWTYPE;
    v_cliente_usuario_id UUID;
    v_penalidad_uyu CONSTANT NUMERIC := 30.00; -- PENALIZACION_CANCELACION_TARDIA_UYU
BEGIN
    -- Bloquear el viaje
    SELECT * INTO v_viaje FROM viajes WHERE id = p_viaje_id FOR UPDATE;
    
    IF v_viaje.id IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;

    -- Validar identidad del cliente (usando el mapeo correcto usuarios.id)
    SELECT usuario_id INTO v_cliente_usuario_id FROM clientes WHERE id = v_viaje.cliente_id;
    IF auth.uid() != v_cliente_usuario_id THEN
        RAISE EXCEPTION 'No autorizado: El usuario actual no es el cliente de este viaje';
    END IF;

    IF v_viaje.estado IN ('en_curso', 'finalizado', 'cancelado_cliente', 'cancelado_chofer') THEN
        RAISE EXCEPTION 'No se puede cancelar en el estado actual (%)', v_viaje.estado;
    END IF;

    -- Lógica de cancelación
    IF v_viaje.estado IN ('pendiente', 'ofrecido', 'solicitado') THEN
        UPDATE viajes SET estado = 'cancelado_cliente' WHERE id = p_viaje_id;
    ELSIF v_viaje.estado IN ('asignado', 'en_camino', 'en_punto') THEN
        IF v_viaje.asignado_en IS NOT NULL AND (NOW() - v_viaje.asignado_en) > INTERVAL '2 minutes' THEN
            UPDATE viajes 
            SET estado = 'cancelado_cliente', penalizacion_cancelacion = v_penalidad_uyu
            WHERE id = p_viaje_id;
        ELSE
            UPDATE viajes 
            SET estado = 'cancelado_cliente', penalizacion_cancelacion = 0.00
            WHERE id = p_viaje_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC Cancelar Viaje Chofer
CREATE OR REPLACE FUNCTION cancelar_viaje_chofer(p_viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_viaje viajes%ROWTYPE;
    v_chofer_id UUID;
    v_chofer_usuario_id UUID;
    v_penalizado BOOLEAN := false;
BEGIN
    SELECT * INTO v_viaje FROM viajes WHERE id = p_viaje_id FOR UPDATE;

    IF v_viaje.id IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;

    -- Determinar el chofer asignado a través de vehiculo_id
    IF v_viaje.vehiculo_id IS NULL THEN
        RAISE EXCEPTION 'El viaje no tiene un vehículo asignado';
    END IF;

    SELECT chofer_id INTO v_chofer_id FROM vehiculos WHERE id = v_viaje.vehiculo_id;
    SELECT usuario_id INTO v_chofer_usuario_id FROM choferes WHERE id = v_chofer_id;

    IF auth.uid() != v_chofer_usuario_id THEN
        RAISE EXCEPTION 'No autorizado: El usuario actual no es el chofer de este viaje';
    END IF;

    IF v_viaje.estado NOT IN ('asignado', 'en_camino', 'en_punto') THEN
        RAISE EXCEPTION 'Chofer no puede cancelar en el estado actual (%)', v_viaje.estado;
    END IF;

    -- Penalización si cancela tarde
    IF v_viaje.asignado_en IS NOT NULL AND (NOW() - v_viaje.asignado_en) > INTERVAL '1 minute' THEN
        v_penalizado := true;
    END IF;

    -- Registrar en ofertas rechazadas para excluir y anotar la penalidad
    INSERT INTO viajes_ofertas_rechazadas (viaje_id, chofer_id, penalizado_por_demora)
    VALUES (p_viaje_id, v_chofer_id, v_penalizado)
    ON CONFLICT (viaje_id, chofer_id) DO UPDATE SET penalizado_por_demora = v_penalizado;

    -- Volver a estado ofrecido para forzar reasignación
    UPDATE viajes 
    SET estado = 'ofrecido', vehiculo_id = NULL, chofer_ofrecido_id = NULL
    WHERE id = p_viaje_id;

    -- Disparar reasignación asíncrona o síncrona
    PERFORM procesar_reasignacion_viaje(p_viaje_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
