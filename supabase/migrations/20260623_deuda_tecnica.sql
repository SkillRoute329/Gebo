-- =========================================================================
-- ORDEN #13: CIERRE DE DEUDA TÉCNICA
-- =========================================================================

-- -------------------------------------------------------------------------
-- PUNTO 3: Tabla configuracion_negocio (SSoT para constantes)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_negocio (
    clave VARCHAR PRIMARY KEY,
    valor NUMERIC NOT NULL
);

ALTER TABLE configuracion_negocio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura publica de configuracion"
ON configuracion_negocio FOR SELECT
TO authenticated
USING (true);

INSERT INTO configuracion_negocio (clave, valor) VALUES
('penalizacion_cancelacion_tardia_uyu', 30.00),
('ventana_gracia_chofer_mins', 1),
('ventana_gracia_cliente_mins', 2)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- -------------------------------------------------------------------------
-- PUNTO 2: Performance RLS en alertas_emergencia
-- -------------------------------------------------------------------------
ALTER TABLE alertas_emergencia ADD COLUMN IF NOT EXISTS cliente_usuario_id UUID;
ALTER TABLE alertas_emergencia ADD COLUMN IF NOT EXISTS chofer_usuario_id UUID;

CREATE OR REPLACE FUNCTION trg_alertas_emergencia_desnormalizar()
RETURNS TRIGGER AS $$
BEGIN
    SELECT c.usuario_id, ch.usuario_id 
    INTO NEW.cliente_usuario_id, NEW.chofer_usuario_id
    FROM viajes v
    JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN vehiculos ve ON v.vehiculo_id = ve.id
    LEFT JOIN choferes ch ON ve.chofer_id = ch.id
    WHERE v.id = NEW.viaje_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alertas_desnormalizar ON alertas_emergencia;
CREATE TRIGGER trg_alertas_desnormalizar
BEFORE INSERT ON alertas_emergencia
FOR EACH ROW
EXECUTE FUNCTION trg_alertas_emergencia_desnormalizar();

-- Limpiar política vieja
DROP POLICY IF EXISTS "Permitir insertar alerta a participantes" ON alertas_emergencia;
DROP POLICY IF EXISTS "Permitir leer alertas a participantes y admins" ON alertas_emergencia;
DROP POLICY IF EXISTS "Permitir actualizar alertas" ON alertas_emergencia;

-- Nuevas políticas sin JOIN
CREATE POLICY "Permitir insertar alerta a participantes"
ON alertas_emergencia FOR INSERT
TO authenticated
WITH CHECK (
    (emisor_id = auth.uid() OR cliente_usuario_id = auth.uid() OR chofer_usuario_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    AND auth.uid() = emisor_id
);

CREATE POLICY "Permitir leer alertas a participantes y admins"
ON alertas_emergencia FOR SELECT
TO authenticated
USING (
    emisor_id = auth.uid() OR cliente_usuario_id = auth.uid() OR chofer_usuario_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

CREATE POLICY "Permitir actualizar alertas"
ON alertas_emergencia FOR UPDATE
TO authenticated
USING (
    emisor_id = auth.uid() OR cliente_usuario_id = auth.uid() OR chofer_usuario_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
    emisor_id = auth.uid() OR cliente_usuario_id = auth.uid() OR chofer_usuario_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- -------------------------------------------------------------------------
-- PUNTO 4: Impacto Penalizado por Demora en el Algoritmo (PL/pgSQL)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procesar_reasignacion_viaje(p_viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_viaje viajes%ROWTYPE;
    v_nuevo_vehiculo_id UUID;
    v_nuevo_chofer_id UUID;
BEGIN
    SELECT * INTO v_viaje FROM viajes WHERE id = p_viaje_id FOR UPDATE;
    IF v_viaje.estado != 'ofrecido' THEN
        RETURN;
    END IF;

    IF v_viaje.chofer_ofrecido_id IS NOT NULL THEN
        INSERT INTO viajes_ofertas_rechazadas (viaje_id, chofer_id)
        VALUES (v_viaje.id, v_viaje.chofer_ofrecido_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Extraer el vehiculo excluyendo rechazados, ordenado por penalidades y distancia
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
        (SELECT COUNT(*) FROM viajes_ofertas_rechazadas vor WHERE vor.chofer_id = v.chofer_id AND vor.penalizado_por_demora = true AND vor.creado_en > NOW() - INTERVAL '24 hours') ASC,
        CASE WHEN v.tipo = 'vagoneta' THEN 1 ELSE 2 END ASC,
        COALESCE(ST_Distance(p.ubicacion, v_viaje.origen), 9999999) ASC
    LIMIT 1;

    IF v_nuevo_vehiculo_id IS NOT NULL THEN
        UPDATE viajes 
        SET estado = 'ofrecido', vehiculo_id = v_nuevo_vehiculo_id, chofer_ofrecido_id = v_nuevo_chofer_id, oferta_expira_en = NOW() + INTERVAL '15 seconds'
        WHERE id = v_viaje.id;
    ELSE
        UPDATE viajes 
        SET estado = 'pendiente', vehiculo_id = NULL, chofer_ofrecido_id = NULL, oferta_expira_en = NULL
        WHERE id = v_viaje.id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------------------------
-- ACTUALIZACIÓN RPC CANCELAR (Puntos 3) para usar configuracion_negocio
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancelar_viaje_cliente(p_viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_viaje viajes%ROWTYPE;
    v_cliente_usuario_id UUID;
    v_config_multa NUMERIC;
    v_config_ventana NUMERIC;
BEGIN
    SELECT valor INTO v_config_multa FROM configuracion_negocio WHERE clave = 'penalizacion_cancelacion_tardia_uyu';
    SELECT valor INTO v_config_ventana FROM configuracion_negocio WHERE clave = 'ventana_gracia_cliente_mins';

    SELECT * INTO v_viaje FROM viajes WHERE id = p_viaje_id FOR UPDATE;
    IF v_viaje.id IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado'; END IF;

    SELECT usuario_id INTO v_cliente_usuario_id FROM clientes WHERE id = v_viaje.cliente_id;
    IF auth.uid() != v_cliente_usuario_id THEN RAISE EXCEPTION 'No autorizado'; END IF;

    IF v_viaje.estado IN ('en_curso', 'finalizado', 'cancelado_cliente', 'cancelado_chofer') THEN
        RAISE EXCEPTION 'No se puede cancelar en el estado actual';
    END IF;

    IF v_viaje.estado IN ('pendiente', 'ofrecido', 'solicitado') THEN
        UPDATE viajes SET estado = 'cancelado_cliente' WHERE id = p_viaje_id;
    ELSIF v_viaje.estado IN ('asignado', 'en_camino', 'en_punto') THEN
        IF v_viaje.asignado_en IS NOT NULL AND (NOW() - v_viaje.asignado_en) > (v_config_ventana || ' minutes')::interval THEN
            UPDATE viajes SET estado = 'cancelado_cliente', penalizacion_cancelacion = v_config_multa WHERE id = p_viaje_id;
        ELSE
            UPDATE viajes SET estado = 'cancelado_cliente', penalizacion_cancelacion = 0.00 WHERE id = p_viaje_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cancelar_viaje_chofer(p_viaje_id UUID)
RETURNS void AS $$
DECLARE
    v_viaje viajes%ROWTYPE;
    v_chofer_id UUID;
    v_chofer_usuario_id UUID;
    v_penalizado BOOLEAN := false;
    v_config_ventana NUMERIC;
BEGIN
    SELECT valor INTO v_config_ventana FROM configuracion_negocio WHERE clave = 'ventana_gracia_chofer_mins';

    SELECT * INTO v_viaje FROM viajes WHERE id = p_viaje_id FOR UPDATE;
    IF v_viaje.id IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado'; END IF;
    IF v_viaje.vehiculo_id IS NULL THEN RAISE EXCEPTION 'El viaje no tiene un vehículo asignado'; END IF;

    SELECT chofer_id INTO v_chofer_id FROM vehiculos WHERE id = v_viaje.vehiculo_id;
    SELECT usuario_id INTO v_chofer_usuario_id FROM choferes WHERE id = v_chofer_id;

    IF auth.uid() != v_chofer_usuario_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
    IF v_viaje.estado NOT IN ('asignado', 'en_camino', 'en_punto') THEN RAISE EXCEPTION 'Chofer no puede cancelar en el estado actual'; END IF;

    IF v_viaje.asignado_en IS NOT NULL AND (NOW() - v_viaje.asignado_en) > (v_config_ventana || ' minutes')::interval THEN
        v_penalizado := true;
    END IF;

    INSERT INTO viajes_ofertas_rechazadas (viaje_id, chofer_id, penalizado_por_demora)
    VALUES (p_viaje_id, v_chofer_id, v_penalizado)
    ON CONFLICT (viaje_id, chofer_id) DO UPDATE SET penalizado_por_demora = v_penalizado;

    UPDATE viajes SET estado = 'ofrecido', vehiculo_id = NULL, chofer_ofrecido_id = NULL WHERE id = p_viaje_id;
    PERFORM procesar_reasignacion_viaje(p_viaje_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------------------------
-- PUNTO 5: Anti-Spoofing Pasivo (alertas_sistema y pg_cron) Opción B
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alertas_sistema (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo TEXT NOT NULL,
    chofer_id UUID REFERENCES choferes(id),
    mensaje TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atendida BOOLEAN DEFAULT FALSE
);

ALTER TABLE alertas_sistema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lee alertas sistema"
ON alertas_sistema FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

ALTER PUBLICATION supabase_realtime ADD TABLE alertas_sistema;

-- NOTA DE PRODUCCIÓN: pg_cron requiere habilitación manual en Supabase Cloud
-- vía Dashboard -> Database -> Extensions antes de que esta migración funcione.
-- En self-hosted (VPS con Docker), el CLI lo activa automáticamente.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'anti-spoofing-pasivo-job',
    '0 * * * *', -- Cada hora
    $$
        INSERT INTO alertas_sistema (tipo, chofer_id, mensaje)
        SELECT 'spoofing', chofer_id, 'Múltiples anomalías GPS (>5) detectadas en la última hora.'
        FROM anomalias_gps
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
        GROUP BY chofer_id
        HAVING COUNT(*) >= 5;
    $$
);
