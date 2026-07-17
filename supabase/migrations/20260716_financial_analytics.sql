BEGIN;

CREATE TABLE IF NOT EXISTS costos_operativos_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    costo_operador_hora DECIMAL(10,2) DEFAULT 250.00,
    costo_chofer_hora DECIMAL(10,2) DEFAULT 350.00,
    depreciacion_vagoneta_km DECIMAL(10,2) DEFAULT 15.00,
    costo_combustible_litro DECIMAL(10,2) DEFAULT 78.00,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar configuración base inicial
INSERT INTO costos_operativos_base (costo_operador_hora, costo_chofer_hora, depreciacion_vagoneta_km, costo_combustible_litro)
VALUES (250.00, 350.00, 15.00, 78.00);

CREATE TABLE IF NOT EXISTS resumen_contable_viajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faena_id UUID REFERENCES faenas(id),
    vagoneta_id UUID REFERENCES vagonetas(id),
    zona_h3 VARCHAR(15), -- Para agrupar por sector
    ingreso DECIMAL(10,2),
    costo_chofer DECIMAL(10,2),
    costo_vagoneta DECIMAL(10,2),
    costo_gastos_ruta DECIMAL(10,2),
    margen_neto DECIMAL(10,2) GENERATED ALWAYS AS (ingreso - costo_chofer - costo_vagoneta - costo_gastos_ruta) STORED,
    kilometros_reales DECIMAL(10,2),
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sugerencias_financieras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_sugerencia VARCHAR(50), -- 'ajuste_tarifa', 'ajuste_limite_gastos'
    zona_h3 VARCHAR(15),
    vagoneta_id UUID REFERENCES vagonetas(id),
    descripcion TEXT,
    aplicada BOOLEAN DEFAULT FALSE,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
