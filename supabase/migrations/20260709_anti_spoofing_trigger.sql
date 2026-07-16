-- Migration 20260709_anti_spoofing_trigger.sql

-- 1. Modificar el check constraint de estado en choferes para permitir 'suspendido'
ALTER TABLE choferes DROP CONSTRAINT IF EXISTS choferes_estado_check;
ALTER TABLE choferes ADD CONSTRAINT choferes_estado_check CHECK (estado IN ('disponible', 'en_faena', 'en_traslado', 'descanso', 'inactivo', 'suspendido'));

-- 2. Crear funcion y trigger para banear por spoofing
CREATE OR REPLACE FUNCTION check_spoofing_anomalies()
RETURNS TRIGGER AS $$
DECLARE
    v_anomalias_count INTEGER;
BEGIN
    -- Contar anomalias en la ultima hora para este chofer
    SELECT COUNT(*) INTO v_anomalias_count
    FROM anomalias_gps
    WHERE chofer_id = NEW.chofer_id
      AND timestamp >= NOW() - INTERVAL '1 hour';

    -- Si llega a 3 (contando la actual, que ya se inserto porque es AFTER INSERT), se suspende al chofer
    IF v_anomalias_count >= 3 THEN
        UPDATE choferes
        SET estado = 'suspendido'
        WHERE id = NEW.chofer_id AND estado != 'suspendido';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_spoofing ON anomalias_gps;
CREATE TRIGGER trigger_check_spoofing
AFTER INSERT ON anomalias_gps
FOR EACH ROW
EXECUTE FUNCTION check_spoofing_anomalies();
