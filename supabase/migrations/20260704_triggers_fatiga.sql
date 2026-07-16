-- 20260704_triggers_fatiga.sql

-- Trigger para sumar horas_conduccion_continua al finalizar faena
CREATE OR REPLACE FUNCTION trg_fn_sumar_fatiga_faena()
RETURNS TRIGGER AS $$
DECLARE
    v_horas NUMERIC;
BEGIN
    IF NEW.estado = 'finalizada' AND OLD.estado != 'finalizada' THEN
        -- Calcular duración en horas
        v_horas := EXTRACT(EPOCH FROM (NEW.fecha_hora_fin_real - NEW.fecha_hora_inicio_real)) / 3600.0;
        
        -- Actualizar horas_conduccion_continua
        UPDATE choferes
        SET horas_conduccion_continua = horas_conduccion_continua + v_horas
        WHERE id = NEW.chofer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sumar_fatiga_faena
AFTER UPDATE ON faenas
FOR EACH ROW
EXECUTE FUNCTION trg_fn_sumar_fatiga_faena();


-- Trigger para resetear horas_conduccion_continua a 0 al subir a vagoneta (recogida completada)
CREATE OR REPLACE FUNCTION trg_fn_resetear_fatiga_vagoneta()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completada = TRUE AND OLD.completada = FALSE AND NEW.tipo = 'recogida' THEN
        UPDATE choferes
        SET horas_conduccion_continua = 0
        WHERE id = NEW.chofer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resetear_fatiga_vagoneta
AFTER UPDATE ON paradas_traslado
FOR EACH ROW
EXECUTE FUNCTION trg_fn_resetear_fatiga_vagoneta();
