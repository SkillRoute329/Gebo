-- Migration: 20260702_indices_performance

-- Faenas
CREATE INDEX IF NOT EXISTS idx_faenas_estado ON faenas(estado);
CREATE INDEX IF NOT EXISTS idx_faenas_cliente_id ON faenas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_faenas_chofer_id ON faenas(chofer_id);
CREATE INDEX IF NOT EXISTS idx_faenas_fecha_hora_programada ON faenas(fecha_hora_programada);

-- Choferes
CREATE INDEX IF NOT EXISTS idx_choferes_estado ON choferes(estado);

-- Vagonetas
CREATE INDEX IF NOT EXISTS idx_vagonetas_estado ON vagonetas(estado);

-- Check if idx_posiciones_chofer_time exists (using IF NOT EXISTS handles this gracefully)
CREATE INDEX IF NOT EXISTS idx_posiciones_chofer_time ON posiciones(chofer_id, timestamp DESC);
