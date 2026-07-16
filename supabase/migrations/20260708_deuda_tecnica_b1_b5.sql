-- Migration 20260708_deuda_tecnica_b1_b5.sql

-- ==============================================================================
-- 1. DRIFT REASIGNACION DE FAENA
-- ==============================================================================
ALTER TABLE faenas_ofertas_rechazadas ADD COLUMN IF NOT EXISTS penalizado_por_demora BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION procesar_reasignacion_faena(p_faena_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_faena RECORD;
    v_vehiculo RECORD;
    v_chofer RECORD;
BEGIN
    SELECT * INTO v_faena FROM faenas WHERE id = p_faena_id;
    
    IF v_faena.estado != 'ofrecida' THEN
        RETURN;
    END IF;

    -- Si hay un chofer ofrecido y expiró el tiempo, es rechazo por demora (timeout)
    IF v_faena.chofer_ofrecido_id IS NOT NULL THEN
        INSERT INTO faenas_ofertas_rechazadas (faena_id, chofer_id, penalizado_por_demora, motivo)
        VALUES (v_faena.id, v_faena.chofer_ofrecido_id, true, 'timeout_automatico')
        ON CONFLICT DO NOTHING;
    END IF;
    
    SELECT * INTO v_vehiculo FROM vehiculos_cliente WHERE id = v_faena.vehiculo_cliente_id;

    -- Seleccionar chofer más cercano que no haya rechazado
    SELECT c.* INTO v_chofer 
    FROM choferes c
    JOIN posiciones p ON p.chofer_id = c.id
    WHERE c.estado = 'disponible'
      AND c.horas_conduccion_continua <= 8
      AND c.id NOT IN (SELECT chofer_id FROM faenas_ofertas_rechazadas WHERE faena_id = p_faena_id)
      AND p.timestamp >= NOW() - INTERVAL '5 minutes'
      AND (
          (v_vehiculo.transmision = 'manual' AND c.maneja_manual = TRUE) OR
          (v_vehiculo.transmision = 'automatico' AND c.maneja_automatico = TRUE)
      )
      AND (v_vehiculo.es_electrico = FALSE OR c.maneja_electrico = TRUE)
      AND (v_vehiculo.tipo != 'suv' OR c.maneja_suv = TRUE)
      AND (v_vehiculo.tipo != 'camion' OR c.maneja_camion = TRUE)
    ORDER BY 
      -- Priorizar a los que NO tienen penalizaciones recientes por timeout
      (SELECT COUNT(*) FROM faenas_ofertas_rechazadas fr WHERE fr.chofer_id = c.id AND fr.penalizado_por_demora = true AND fr.rechazado_en > NOW() - INTERVAL '24 hours') ASC,
      p.ubicacion <-> v_faena.origen
    LIMIT 1;

    IF v_chofer.id IS NOT NULL THEN
        UPDATE faenas 
        SET chofer_ofrecido_id = v_chofer.id, 
            oferta_expira_en = NOW() + INTERVAL '15 seconds'
        WHERE id = p_faena_id;
    ELSE
        UPDATE faenas 
        SET chofer_ofrecido_id = NULL,
            estado = 'programada' 
        WHERE id = p_faena_id;
    END IF;
END;
$$;

-- ==============================================================================
-- 2. PERFORMANCE DE SOS RLS POLICY
-- ==============================================================================
ALTER TABLE alertas_emergencia ADD COLUMN IF NOT EXISTS cliente_usuario_id UUID;
ALTER TABLE alertas_emergencia ADD COLUMN IF NOT EXISTS chofer_usuario_id UUID;

-- Actualizar filas existentes
UPDATE alertas_emergencia ae
SET 
  cliente_usuario_id = (SELECT c.usuario_id FROM clientes c JOIN faenas f ON f.cliente_id = c.id WHERE f.id = ae.faena_id),
  chofer_usuario_id = (SELECT ch.usuario_id FROM choferes ch JOIN faenas f ON f.chofer_id = ch.id WHERE f.id = ae.faena_id);

-- Desnormalizar automáticamente en el INSERT
CREATE OR REPLACE FUNCTION fill_alerta_emergencia_users()
RETURNS TRIGGER AS $$
BEGIN
    SELECT c.usuario_id, ch.usuario_id
    INTO NEW.cliente_usuario_id, NEW.chofer_usuario_id
    FROM faenas f
    LEFT JOIN clientes c ON f.cliente_id = c.id
    LEFT JOIN choferes ch ON f.chofer_id = ch.id
    WHERE f.id = NEW.faena_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fill_alerta_emergencia_users ON alertas_emergencia;
CREATE TRIGGER trigger_fill_alerta_emergencia_users
BEFORE INSERT ON alertas_emergencia
FOR EACH ROW
EXECUTE FUNCTION fill_alerta_emergencia_users();

-- Actualizar Policies para alertas_emergencia (eliminando el uso de la función lenta en lectura/update)
DROP POLICY IF EXISTS "Permitir leer alertas a participantes y admins" ON alertas_emergencia;
DROP POLICY IF EXISTS "Permitir actualizar alertas" ON alertas_emergencia;

CREATE POLICY "Permitir leer alertas a participantes y admins"
ON alertas_emergencia FOR SELECT
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    auth.uid() = cliente_usuario_id OR
    auth.uid() = chofer_usuario_id
);

CREATE POLICY "Permitir actualizar alertas"
ON alertas_emergencia FOR UPDATE
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    auth.uid() = cliente_usuario_id OR
    auth.uid() = chofer_usuario_id
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    auth.uid() = cliente_usuario_id OR
    auth.uid() = chofer_usuario_id
);

-- Recrear INSERT con la columna faena_id
DROP POLICY IF EXISTS "Permitir insertar alertas a participantes" ON alertas_emergencia;
CREATE POLICY "Permitir insertar alertas a participantes"
ON alertas_emergencia FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = emisor_id AND
    is_user_in_viaje_or_admin(faena_id)
);
