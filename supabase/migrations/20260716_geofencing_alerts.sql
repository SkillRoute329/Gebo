BEGIN;

-- 1. Actualizar el estado de traslados_equipo para soportar 'desviado'
-- Quitamos el constraint anterior si existe (en Supabase la tabla ya podría tenerlo)
ALTER TABLE traslados_equipo DROP CONSTRAINT IF EXISTS traslados_equipo_estado_check;
ALTER TABLE traslados_equipo ADD CONSTRAINT traslados_equipo_estado_check 
    CHECK (estado IN ('programado', 'en_curso', 'finalizado', 'cancelado', 'desviado'));

-- 2. Crear tabla alertas_operativas
CREATE TABLE IF NOT EXISTS alertas_operativas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    traslado_id UUID REFERENCES traslados_equipo(id) ON DELETE CASCADE,
    tipo_alerta TEXT NOT NULL,
    descripcion TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
