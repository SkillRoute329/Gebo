-- PASO 1: Archivar esquema anterior
ALTER TABLE viajes RENAME TO legacy_viajes;
ALTER TABLE vehiculos RENAME TO legacy_vehiculos;
ALTER TABLE clientes RENAME TO legacy_clientes;
ALTER TABLE choferes RENAME TO legacy_choferes;
ALTER TABLE posiciones RENAME TO legacy_posiciones;
ALTER TABLE viajes_ofertas_rechazadas RENAME TO legacy_viajes_ofertas_rechazadas;

ALTER INDEX IF EXISTS idx_posiciones_chofer_time RENAME TO idx_legacy_posiciones_chofer_time;
ALTER INDEX IF EXISTS idx_posiciones_ubicacion RENAME TO idx_legacy_posiciones_ubicacion;
ALTER INDEX IF EXISTS idx_clientes_ubicacion RENAME TO idx_legacy_clientes_ubicacion;
ALTER INDEX IF EXISTS idx_viajes_origen RENAME TO idx_legacy_viajes_origen;
ALTER INDEX IF EXISTS idx_viajes_destino RENAME TO idx_legacy_viajes_destino;
ALTER INDEX IF EXISTS idx_viajes_estado RENAME TO idx_legacy_viajes_estado;

-- Renombrar politicas RLS de las tablas legacy para evitar conflictos si se requiere
-- Aunque al renombrar la tabla las politicas siguen pegadas a ella, es buena practica

-- PASO 2: Crear nuevas tablas core

-- Clientes (persona particular o empresa)
CREATE TABLE clientes (
  id UUID PRIMARY KEY,
  usuario_id UUID REFERENCES auth.users,
  tipo TEXT CHECK (tipo IN ('particular', 'empresa')),
  nombre TEXT,
  telefono TEXT,
  razon_social TEXT -- solo si tipo = 'empresa'
);

-- Vehículos del cliente (el cliente registra su propio auto)
CREATE TABLE vehiculos_cliente (
  id UUID PRIMARY KEY,
  cliente_id UUID REFERENCES clientes,
  marca TEXT,
  modelo TEXT,
  año INT,
  patente TEXT UNIQUE,
  tipo TEXT CHECK (tipo IN ('auto', 'suv', 'camioneta', 'camion', 'electrico', 'otro')),
  transmision TEXT CHECK (transmision IN ('manual', 'automatico')),
  es_electrico BOOLEAN DEFAULT FALSE,
  foto_url TEXT -- foto de referencia del vehículo
);

-- Choferes profesionales de Gebo
CREATE TABLE choferes (
  id UUID PRIMARY KEY,
  usuario_id UUID REFERENCES auth.users,
  nombre TEXT,
  telefono TEXT,
  estado TEXT CHECK (estado IN ('disponible', 'en_faena', 'en_traslado', 'descanso', 'inactivo')),
  horas_conduccion_continua NUMERIC DEFAULT 0,
  ultima_vez_disponible TIMESTAMPTZ,
  -- Certificaciones por tipo de vehículo
  maneja_manual BOOLEAN DEFAULT TRUE,
  maneja_automatico BOOLEAN DEFAULT TRUE,
  maneja_electrico BOOLEAN DEFAULT FALSE,
  maneja_camion BOOLEAN DEFAULT FALSE,
  maneja_suv BOOLEAN DEFAULT TRUE
);

-- Vagonetas de Gebo (mueven choferes entre faenas)
CREATE TABLE vagonetas (
  id UUID PRIMARY KEY,
  patente TEXT UNIQUE,
  modelo TEXT,
  capacidad INT,
  chofer_vagoneta_id UUID REFERENCES choferes(id), -- El chofer que maneja la vagoneta en este turno, puede ser nulo
  estado TEXT CHECK (estado IN ('disponible', 'en_ruta', 'inactivo')),
  ubicacion_actual GEOGRAPHY(Point, 4326)
);

-- Faenas (núcleo del negocio)
CREATE TABLE faenas (
  id UUID PRIMARY KEY,
  cliente_id UUID REFERENCES clientes,
  vehiculo_cliente_id UUID REFERENCES vehiculos_cliente,
  chofer_id UUID REFERENCES choferes,
  origen GEOGRAPHY(Point, 4326),
  origen_descripcion TEXT,
  destino GEOGRAPHY(Point, 4326),
  destino_descripcion TEXT,
  modalidad TEXT CHECK (modalidad IN ('por_minuto', 'por_hora', 'dia_completo')),
  fecha_hora_programada TIMESTAMPTZ,
  fecha_hora_inicio_real TIMESTAMPTZ, 
  fecha_hora_fin_real TIMESTAMPTZ,    
  estado TEXT CHECK (estado IN ('programada', 'ofrecida', 'asignada', 'chofer_en_camino', 'chofer_llegó', 'en_curso', 'finalizada', 'cancelada_cliente', 'cancelada_gebo')),
  chofer_ofrecido_id UUID REFERENCES choferes, -- Para el flujo de oferta
  oferta_expira_en TIMESTAMPTZ,
  asignada_en TIMESTAMPTZ,
  foto_vehiculo_inicio_url TEXT, 
  foto_vehiculo_fin_url TEXT,    
  costo_total NUMERIC,
  penalizacion_demora NUMERIC DEFAULT 0,
  metodo_traslado_chofer TEXT CHECK (metodo_traslado_chofer IN ('vagoneta_propia', 'taxi_externo', 'por_sus_medios'))
);

-- Faenas ofertas rechazadas
CREATE TABLE faenas_ofertas_rechazadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faena_id UUID REFERENCES faenas ON DELETE CASCADE,
  chofer_id UUID REFERENCES choferes ON DELETE CASCADE,
  rechazado_en TIMESTAMPTZ DEFAULT NOW(),
  motivo TEXT
);

-- Traslados de equipo (vagoneta moviendo choferes)
CREATE TABLE traslados_equipo (
  id UUID PRIMARY KEY,
  vagoneta_id UUID REFERENCES vagonetas,
  tipo TEXT CHECK (tipo IN ('ida', 'retorno')),
  fecha_hora TIMESTAMPTZ,
  estado TEXT CHECK (estado IN ('programado', 'en_curso', 'completado'))
);

-- Paradas del traslado
CREATE TABLE paradas_traslado (
  id UUID PRIMARY KEY,
  traslado_id UUID REFERENCES traslados_equipo,
  chofer_id UUID REFERENCES choferes,
  faena_id UUID REFERENCES faenas,
  punto GEOGRAPHY(Point, 4326),
  descripcion TEXT,
  orden INT,
  tipo TEXT CHECK (tipo IN ('recogida', 'entrega')),
  completada BOOLEAN DEFAULT FALSE,
  completada_en TIMESTAMPTZ
);

-- Nueva tabla de posiciones (basada en el ID del chofer)
CREATE TABLE posiciones (
  id BIGSERIAL PRIMARY KEY,
  chofer_id UUID REFERENCES choferes(id),
  ubicacion GEOGRAPHY(Point, 4326) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  precision_metros NUMERIC
);
CREATE INDEX idx_posiciones_chofer_time ON posiciones (chofer_id, timestamp DESC);

-- Nuevas configuraciones
INSERT INTO configuracion_negocio (clave, valor) VALUES 
('tarifa_por_minuto_uyu', 15),
('tarifa_por_hora_uyu', 600),
('tarifa_dia_completo_uyu', 4500),
('pago_chofer_por_hora_uyu', 250),
('costo_referencia_taxi_externo_uyu', 350),
('margen_minimo_pct', 20)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- Rename de penalizacion_cancelacion_tardia_uyu a penalizacion_demora_por_min_uyu
-- Usaremos la logica de insert para que quede claro
INSERT INTO configuracion_negocio (clave, valor) VALUES ('penalizacion_demora_por_min_uyu', 50) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- PASO 3: POLITICAS RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE choferes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vagonetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE faenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE faenas_ofertas_rechazadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE traslados_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas_traslado ENABLE ROW LEVEL SECURITY;
ALTER TABLE posiciones ENABLE ROW LEVEL SECURITY;

-- Funciones SECURITY DEFINER necesarias
CREATE OR REPLACE FUNCTION get_faenas_asignadas_chofer()
RETURNS SETOF uuid AS $$
BEGIN
  RETURN QUERY SELECT id FROM faenas WHERE chofer_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid()) OR chofer_ofrecido_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_traslados_asignados_chofer()
RETURNS SETOF uuid AS $$
BEGIN
  RETURN QUERY 
    SELECT t.id FROM traslados_equipo t
    JOIN vagonetas v ON v.id = t.vagoneta_id
    WHERE v.chofer_vagoneta_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid())
    UNION
    SELECT t.id FROM traslados_equipo t
    JOIN paradas_traslado p ON p.traslado_id = t.id
    WHERE p.chofer_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clientes
CREATE POLICY "Clientes ven sus propios datos" ON clientes FOR ALL USING (usuario_id = auth.uid());
CREATE POLICY "Admins ven clientes" ON clientes FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Vehículos Cliente
CREATE POLICY "Clientes ven sus propios vehiculos" ON vehiculos_cliente FOR ALL USING (cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid()));
CREATE POLICY "Admins ven vehiculos" ON vehiculos_cliente FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
CREATE POLICY "Choferes ven el vehiculo de su faena" ON vehiculos_cliente FOR SELECT USING (id IN (SELECT vehiculo_cliente_id FROM faenas WHERE id IN (SELECT get_faenas_asignadas_chofer())));

-- Faenas
CREATE POLICY "Clientes ven sus faenas" ON faenas FOR ALL USING (cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid()));
CREATE POLICY "Choferes ven sus faenas asignadas" ON faenas FOR SELECT USING (id IN (SELECT get_faenas_asignadas_chofer()));
CREATE POLICY "Choferes actualizan sus faenas" ON faenas FOR UPDATE USING (id IN (SELECT get_faenas_asignadas_chofer()));
CREATE POLICY "Admins ven faenas" ON faenas FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Faenas Ofertas Rechazadas
CREATE POLICY "Admins ven ofertas rechazadas" ON faenas_ofertas_rechazadas FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
CREATE POLICY "Choferes pueden insertar ofertas rechazadas" ON faenas_ofertas_rechazadas FOR INSERT WITH CHECK (chofer_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid()));

-- Choferes
CREATE POLICY "Choferes ven su propio perfil" ON choferes FOR ALL USING (usuario_id = auth.uid());
CREATE POLICY "Admins ven choferes" ON choferes FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
CREATE POLICY "Clientes ven a su chofer asignado" ON choferes FOR SELECT USING (id IN (SELECT chofer_id FROM faenas WHERE cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid())));

-- Vagonetas, Traslados y Paradas
CREATE POLICY "Choferes ven vagonetas de sus traslados" ON vagonetas FOR SELECT USING (id IN (SELECT vagoneta_id FROM traslados_equipo WHERE id IN (SELECT get_traslados_asignados_chofer())));
CREATE POLICY "Admins ven vagonetas" ON vagonetas FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

CREATE POLICY "Choferes ven sus traslados" ON traslados_equipo FOR SELECT USING (id IN (SELECT get_traslados_asignados_chofer()));
CREATE POLICY "Admins ven traslados" ON traslados_equipo FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

CREATE POLICY "Choferes ven paradas de sus traslados" ON paradas_traslado FOR SELECT USING (traslado_id IN (SELECT get_traslados_asignados_chofer()));
CREATE POLICY "Admins ven paradas" ON paradas_traslado FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Posiciones
CREATE POLICY "Choferes ven sus propias posiciones" ON posiciones FOR SELECT USING (chofer_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid()));
CREATE POLICY "Choferes insertan posiciones" ON posiciones FOR INSERT WITH CHECK (chofer_id = (SELECT id FROM choferes WHERE usuario_id = auth.uid()));
CREATE POLICY "Admins ven posiciones" ON posiciones FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
CREATE POLICY "Clientes ven posicion de su chofer asignado" ON posiciones FOR SELECT USING (chofer_id IN (SELECT chofer_id FROM faenas WHERE cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid()) AND estado IN ('chofer_en_camino', 'en_curso')));

-- PROCEDURES (Actualizados para faenas)

CREATE OR REPLACE FUNCTION procesar_reasignacion_faena(p_faena_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_faena RECORD;
    v_vehiculo RECORD;
    v_chofer RECORD;
BEGIN
    SELECT * INTO v_faena FROM faenas WHERE id = p_faena_id;
    
    IF v_faena.estado != 'ofrecida' THEN
        RETURN;
    END IF;
    
    SELECT * INTO v_vehiculo FROM vehiculos_cliente WHERE id = v_faena.vehiculo_cliente_id;

    -- Seleccionar chofer más cercano que no haya rechazado, que esté disponible, maneje el tipo y no esté pasado de horas
    SELECT c.* INTO v_chofer 
    FROM choferes c
    JOIN posiciones p ON p.chofer_id = c.id
    WHERE c.estado = 'disponible'
      AND c.horas_conduccion_continua <= 8
      AND c.id NOT IN (SELECT chofer_id FROM faenas_ofertas_rechazadas WHERE faena_id = p_faena_id)
      AND p.timestamp >= NOW() - INTERVAL '5 minutes'
      AND (
          (v_vehiculo.transmision = 'manual' AND c.maneja_manual = TRUE) OR
          (v_vehiculo.transmision = 'automatico' AND c.maneja_automatico = TRUE)
      )
      AND (v_vehiculo.es_electrico = FALSE OR c.maneja_electrico = TRUE)
      AND (v_vehiculo.tipo != 'suv' OR c.maneja_suv = TRUE)
      AND (v_vehiculo.tipo != 'camion' OR c.maneja_camion = TRUE)
    ORDER BY p.ubicacion <-> v_faena.origen
    LIMIT 1;

    IF v_chofer.id IS NOT NULL THEN
        UPDATE faenas 
        SET chofer_ofrecido_id = v_chofer.id, 
            oferta_expira_en = NOW() + INTERVAL '15 seconds'
        WHERE id = p_faena_id;
    ELSE
        UPDATE faenas 
        SET chofer_ofrecido_id = NULL,
            estado = 'programada' 
        WHERE id = p_faena_id;
    END IF;
END;
$$;
