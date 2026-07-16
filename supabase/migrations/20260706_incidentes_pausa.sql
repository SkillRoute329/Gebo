-- Migration for incident pause logic
ALTER TABLE faenas ADD COLUMN IF NOT EXISTS tiempo_pausa_acumulado_segundos INTEGER DEFAULT 0;
ALTER TABLE faenas ADD COLUMN IF NOT EXISTS ultimo_inicio_pausa TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION procesar_estado_incidente()
RETURNS TRIGGER AS $$
BEGIN
    -- Transition INTO incidente
    IF NEW.estado = 'incidente' AND (OLD.estado IS DISTINCT FROM 'incidente') THEN
        NEW.ultimo_inicio_pausa = NOW();
    END IF;

    -- Transition OUT OF incidente
    IF OLD.estado = 'incidente' AND (NEW.estado IS DISTINCT FROM 'incidente') THEN
        IF OLD.ultimo_inicio_pausa IS NOT NULL THEN
            NEW.tiempo_pausa_acumulado_segundos = COALESCE(OLD.tiempo_pausa_acumulado_segundos, 0) + EXTRACT(EPOCH FROM (NOW() - OLD.ultimo_inicio_pausa))::INTEGER;
            NEW.ultimo_inicio_pausa = NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_estado_incidente ON faenas;
CREATE TRIGGER trigger_estado_incidente
BEFORE UPDATE ON faenas
FOR EACH ROW
EXECUTE FUNCTION procesar_estado_incidente();
