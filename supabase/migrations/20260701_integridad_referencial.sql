-- Migration: 20260701_integridad_referencial
-- Trigger 1: Chofer se inactiva
CREATE OR REPLACE FUNCTION trg_chofer_inactivo()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Las faenas en estados activos pasan a 'programada' con chofer_id = NULL
    UPDATE faenas
    SET estado = 'programada', chofer_id = NULL
    WHERE chofer_id = NEW.id
      AND estado IN ('chofer_en_camino', 'chofer_llegó', 'en_curso', 'asignada'); -- Added 'asignada' just in case

    -- 2. El chofer se desvincula de cualquier vagoneta
    UPDATE vagonetas
    SET chofer_vagoneta_id = NULL
    WHERE chofer_vagoneta_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_on_chofer_inactivo ON choferes;
CREATE TRIGGER trg_on_chofer_inactivo
AFTER UPDATE ON choferes
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'inactivo')
EXECUTE FUNCTION trg_chofer_inactivo();


-- Trigger 2: Cliente se desactiva
CREATE OR REPLACE FUNCTION trg_cliente_inactivo()
RETURNS TRIGGER AS $$
BEGIN
    -- Las faenas en estado 'programada' de ese cliente pasan a 'cancelada_gebo'
    UPDATE faenas
    SET estado = 'cancelada_gebo'
    WHERE cliente_id = NEW.id
      AND estado = 'programada';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_on_cliente_inactivo ON clientes;
CREATE TRIGGER trg_on_cliente_inactivo
AFTER UPDATE ON clientes
FOR EACH ROW
WHEN (OLD.activo IS DISTINCT FROM NEW.activo AND NEW.activo = FALSE)
EXECUTE FUNCTION trg_cliente_inactivo();
