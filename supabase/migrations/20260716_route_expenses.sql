BEGIN;

ALTER TABLE configuracion_negocio 
ADD COLUMN IF NOT EXISTS limite_gasto_automatico DECIMAL(10,2) DEFAULT 500.00;

CREATE TABLE IF NOT EXISTS gastos_ruta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_id UUID REFERENCES turnos_chofer(id),
    vagoneta_id UUID REFERENCES vagonetas(id),
    categoria VARCHAR(50),
    monto DECIMAL(10,2),
    comprobante_nro VARCHAR(100),
    foto_comprobante TEXT,
    estado_gasto VARCHAR(30) CHECK (estado_gasto IN ('aprobado_automatico', 'pendiente_aprobacion', 'aprobado_manual', 'rechazado')),
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
