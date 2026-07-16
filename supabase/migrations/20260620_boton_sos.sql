-- Fase Hardening Competitivo: Botón SOS (B1)

-- 1. Tabla de alertas de emergencia
CREATE TABLE alertas_emergencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viaje_id UUID NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
    emisor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_emisor TEXT NOT NULL CHECK (tipo_emisor IN ('cliente', 'chofer')),
    ubicacion_lat DOUBLE PRECISION,
    ubicacion_lng DOUBLE PRECISION,
    estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'resuelta', 'falsa_alarma')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE alertas_emergencia ENABLE ROW LEVEL SECURITY;

-- 2. Función SECURITY DEFINER para chequear participación en el viaje y aislar lecturas cruzadas
CREATE OR REPLACE FUNCTION is_user_in_viaje_or_admin(p_viaje_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cliente_id UUID;
    v_vehiculo_id UUID;
    v_chofer_id UUID;
BEGIN
    -- Chequeo rápido de Admin (usando auth.jwt como fuente única de verdad)
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
        RETURN TRUE;
    END IF;

    -- Extraer datos del viaje
    SELECT cliente_id, vehiculo_id INTO v_cliente_id, v_vehiculo_id
    FROM viajes WHERE id = p_viaje_id;

    -- Es el cliente?
    IF auth.uid() = (SELECT usuario_id FROM clientes WHERE id = v_cliente_id) THEN
        RETURN TRUE;
    END IF;

    -- Extraer chofer del vehiculo si está asignado
    IF v_vehiculo_id IS NOT NULL THEN
        SELECT chofer_id INTO v_chofer_id
        FROM vehiculos WHERE id = v_vehiculo_id;

        -- Es el chofer?
        IF auth.uid() = (SELECT usuario_id FROM choferes WHERE id = v_chofer_id) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 3. Políticas RLS para la tabla alertas_emergencia
-- Insertar: solo si es admin o parte del viaje
CREATE POLICY "Permitir insertar alerta a participantes"
ON alertas_emergencia FOR INSERT
TO authenticated
WITH CHECK (
    is_user_in_viaje_or_admin(viaje_id) AND auth.uid() = emisor_id
);

-- Leer: solo si es admin o parte del viaje
CREATE POLICY "Permitir leer alertas a participantes y admins"
ON alertas_emergencia FOR SELECT
TO authenticated
USING (
    is_user_in_viaje_or_admin(viaje_id)
);

-- Update: solo para cambiar estado a falsa_alarma o resuelta.
-- Chofer/Cliente pueden cancelar (falsa alarma). Admin puede resolver.
CREATE POLICY "Permitir actualizar alertas"
ON alertas_emergencia FOR UPDATE
TO authenticated
USING (
    is_user_in_viaje_or_admin(viaje_id)
)
WITH CHECK (
    is_user_in_viaje_or_admin(viaje_id)
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE alertas_emergencia;
