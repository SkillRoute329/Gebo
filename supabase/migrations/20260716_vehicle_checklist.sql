BEGIN;

-- Añadir 'alerta_mantenimiento' a vagonetas
ALTER TABLE vagonetas DROP CONSTRAINT IF EXISTS vagonetas_estado_check;
ALTER TABLE vagonetas ADD CONSTRAINT vagonetas_estado_check CHECK (
    estado IN ('disponible', 'en_ruta', 'inactiva', 'fuera_de_servicio', 'alerta_mantenimiento')
);

CREATE TABLE IF NOT EXISTS preguntas_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pregunta TEXT,
    categoria TEXT,
    es_critica BOOLEAN DEFAULT FALSE,
    activa BOOLEAN DEFAULT TRUE
);

-- Insertar 3 preguntas por defecto
INSERT INTO preguntas_checklist (pregunta, categoria, es_critica) VALUES
('¿Los neumáticos tienen la presión y dibujo adecuados?', 'mecanica', TRUE),
('¿El interior y exterior de la vagoneta están limpios?', 'limpieza', FALSE),
('¿Funciona el sistema de luces y frenos correctamente?', 'seguridad', TRUE);

CREATE TABLE IF NOT EXISTS inspecciones_vagoneta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_id UUID REFERENCES turnos_chofer(id),
    vagoneta_id UUID REFERENCES vagonetas(id),
    tipo_inspeccion VARCHAR(20) CHECK (tipo_inspeccion IN ('entrada', 'salida')),
    odometro INTEGER,
    respuestas JSONB,
    danos_reportados TEXT[],
    fotos_danos TEXT[],
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
