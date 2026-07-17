BEGIN;

ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS checkin_anticipado_minutos INTEGER DEFAULT 15;

-- Choferes (ausente_preventivo, reten_activo)
ALTER TABLE choferes DROP CONSTRAINT IF EXISTS choferes_estado_check;
ALTER TABLE choferes ADD CONSTRAINT choferes_estado_check CHECK (
    estado IN ('disponible', 'ocupado', 'en_faena', 'en_traslado', 'inactivo', 'ausente_preventivo', 'reten_activo')
);

-- Faenas (siniestrado)
ALTER TABLE faenas ADD COLUMN IF NOT EXISTS chofer_checkin_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE faenas DROP CONSTRAINT IF EXISTS faenas_estado_check;
ALTER TABLE faenas ADD CONSTRAINT faenas_estado_check CHECK (
    estado IN ('programada', 'en_curso', 'finalizada', 'cancelada', 'cancelada_cliente', 'cancelada_gebo', 'incidente', 'asignada', 'ofrecida', 'chofer_en_camino', 'chofer_llegó', 'siniestrado')
);

-- Clientes (bloqueado)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clientes' AND column_name='estado') THEN
        ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_estado_check;
        ALTER TABLE clientes ADD CONSTRAINT clientes_estado_check CHECK (estado IN ('activo', 'inactivo', 'bloqueado'));
    END IF;
END $$;

-- Traslados (siniestrado)
ALTER TABLE traslados_equipo DROP CONSTRAINT IF EXISTS traslados_equipo_estado_check;
ALTER TABLE traslados_equipo ADD CONSTRAINT traslados_equipo_estado_check CHECK (
    estado IN ('programado', 'en_curso', 'finalizado', 'cancelado', 'desviado', 'siniestrado')
);

-- Vagonetas (fuera_de_servicio)
ALTER TABLE vagonetas DROP CONSTRAINT IF EXISTS vagonetas_estado_check;
ALTER TABLE vagonetas ADD CONSTRAINT vagonetas_estado_check CHECK (
    estado IN ('disponible', 'en_ruta', 'inactiva', 'fuera_de_servicio')
);

-- Paradas
ALTER TABLE paradas_traslado ADD COLUMN IF NOT EXISTS prioridad_urgente BOOLEAN DEFAULT FALSE;
ALTER TABLE paradas_traslado ADD COLUMN IF NOT EXISTS estado_parada VARCHAR(30) DEFAULT 'pendiente';

-- Tabla incidentes_calle
CREATE TABLE IF NOT EXISTS incidentes_calle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_incidente TEXT,
    descripcion TEXT,
    coordenadas_reporte GEOGRAPHY(Point, 4326),
    fotos_evidencia TEXT[],
    chofer_id UUID REFERENCES choferes(id),
    vagoneta_id UUID REFERENCES vagonetas(id),
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Función para siniestro de vagoneta
CREATE OR REPLACE FUNCTION fn_reportar_siniestro_vagoneta(p_vagoneta_id UUID)
RETURNS VOID AS $$
DECLARE
    v_traslado_id UUID;
BEGIN
    -- A) Marcar vagoneta como fuera_de_servicio
    UPDATE vagonetas SET estado = 'fuera_de_servicio' WHERE id = p_vagoneta_id;
    
    -- Obtener traslado activo
    SELECT id INTO v_traslado_id FROM traslados_equipo WHERE vagoneta_id = p_vagoneta_id AND estado = 'en_curso' LIMIT 1;
    
    IF v_traslado_id IS NOT NULL THEN
        UPDATE traslados_equipo SET estado = 'siniestrado' WHERE id = v_traslado_id;
        
        -- C) Desvincular paradas y marcar pendientes con prioridad
        UPDATE paradas_traslado 
        SET 
            traslado_id = NULL,
            estado_parada = 'pendiente_rescate',
            prioridad_urgente = TRUE
        WHERE traslado_id = v_traslado_id AND completada = FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
