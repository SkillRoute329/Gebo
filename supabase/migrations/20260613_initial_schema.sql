-- =========================================================================
-- PROYECTO GEBO - MIGRACIÓN INICIAL (SEMANA 1)
-- =========================================================================

-- Habilitar extensiones criptográficas y espaciales
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. Tabla de Usuarios Base
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    nombre_completo TEXT NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Choferes
CREATE TABLE choferes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    estado TEXT NOT NULL DEFAULT 'inactivo', -- activo, en_descanso, inactivo
    horas_trabajadas_semana NUMERIC(5,2) DEFAULT 0.00,
    descanso_hasta TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_estado_chofer CHECK (estado IN ('activo', 'en_descanso', 'inactivo'))
);

-- 3. Tabla de Clientes
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    direccion_principal TEXT NOT NULL,
    ubicacion_principal GEOGRAPHY(Point, 4326) NOT NULL
);

-- 4. Tabla de Vehículos
CREATE TABLE vehiculos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chofer_id UUID NOT NULL REFERENCES choferes(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL, -- vagoneta, taxi_tercero
    capacidad_pasajeros INTEGER NOT NULL CHECK (capacidad_pasajeros > 0),
    matricula TEXT UNIQUE NOT NULL,
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    CONSTRAINT chk_tipo_vehiculo CHECK (tipo IN ('vagoneta', 'taxi_tercero'))
);

-- 5. Tabla de Viajes
CREATE TABLE viajes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    vehiculo_id UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
    estado TEXT NOT NULL DEFAULT 'solicitado',
    origen GEOGRAPHY(Point, 4326) NOT NULL,
    destino GEOGRAPHY(Point, 4326) NOT NULL,
    hora_pactada TIMESTAMP WITH TIME ZONE NOT NULL,
    hora_arribo_real TIMESTAMP WITH TIME ZONE,
    demora_minutos INTEGER DEFAULT 0 CHECK (demora_minutos >= 0),
    penalizacion_monetaria NUMERIC(10,2) DEFAULT 0.00 CHECK (penalizacion_monetaria >= 0),
    CONSTRAINT chk_estado_viaje CHECK (estado IN ('solicitado', 'asignado', 'en_camino', 'en_punto', 'en_curso', 'finalizado', 'cancelado'))
);

-- 6. Tabla de Posiciones (Rastreo GPS)
CREATE TABLE posiciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chofer_id UUID NOT NULL REFERENCES choferes(id) ON DELETE CASCADE,
    ubicacion GEOGRAPHY(Point, 4326) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices Espaciales y de Rendimiento
CREATE INDEX idx_clientes_ubicacion ON clientes USING GIST (ubicacion_principal);
CREATE INDEX idx_viajes_origen ON viajes USING GIST (origen);
CREATE INDEX idx_viajes_destino ON viajes USING GIST (destino);
CREATE INDEX idx_posiciones_ubicacion ON posiciones USING GIST (ubicacion);
CREATE INDEX idx_posiciones_chofer_time ON posiciones (chofer_id, timestamp DESC);
CREATE INDEX idx_viajes_estado ON viajes (estado);

-- =========================================================================
-- SEGURIDAD DE NIVEL DE FILA (ROW-LEVEL SECURITY - RLS)
-- =========================================================================

-- Activar RLS en todas las tablas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE choferes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE posiciones ENABLE ROW LEVEL SECURITY;

-- Nota: Para simplificar esta fase inicial en modo de Arquitectura,
-- asumimos que el JWT de autenticación inyectará el 'usuario_id' en auth.uid()

-- Políticas para Clientes:
-- Un cliente solo puede ver sus propios datos de perfil.
CREATE POLICY "Clientes ven su propio perfil" ON clientes
    FOR SELECT USING (usuario_id = auth.uid());

-- Un cliente solo puede ver los viajes donde es el cliente_id.
CREATE POLICY "Clientes ven sus viajes" ON viajes
    FOR SELECT USING (
        cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid())
    );

-- Un cliente solo puede ver la posición del chofer que tiene asignado EN ESTE MOMENTO (viaje en camino).
CREATE POLICY "Clientes ven posicion de su chofer asignado" ON posiciones
    FOR SELECT USING (
        chofer_id IN (
            SELECT v.chofer_id FROM vehiculos v
            JOIN viajes vj ON vj.vehiculo_id = v.id
            WHERE vj.cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid())
              AND vj.estado IN ('en_camino', 'en_punto')
        )
    );

-- Políticas para Choferes:
-- Un chofer solo puede ver su propio perfil y vehículo.
CREATE POLICY "Choferes ven su propio perfil" ON choferes
    FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "Choferes ven su vehiculo" ON vehiculos
    FOR SELECT USING (
        chofer_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid())
    );

-- Un chofer solo puede ver los viajes que le fueron asignados.
CREATE POLICY "Choferes ven sus viajes asignados" ON viajes
    FOR SELECT USING (
        vehiculo_id IN (SELECT id FROM vehiculos WHERE chofer_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid()))
    );

-- Un chofer solo puede ver los datos del cliente de su viaje actual.
CREATE POLICY "Choferes ven clientes de sus viajes" ON clientes
    FOR SELECT USING (
        id IN (
            SELECT cliente_id FROM viajes 
            WHERE vehiculo_id IN (SELECT id FROM vehiculos WHERE chofer_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid()))
              AND estado IN ('asignado', 'en_camino', 'en_punto', 'en_curso')
        )
    );
