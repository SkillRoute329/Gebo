-- Fase Hardening Competitivo: Anti-Spoofing (B3)

CREATE TABLE anomalias_gps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chofer_id UUID NOT NULL REFERENCES choferes(id) ON DELETE CASCADE,
    posicion_anterior GEOGRAPHY(Point, 4326) NOT NULL,
    posicion_nueva GEOGRAPHY(Point, 4326) NOT NULL,
    velocidad_calculada_kmh DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE anomalias_gps ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
-- Leer: solo si es admin (usando auth.jwt)
CREATE POLICY "Permitir leer anomalias_gps a admins"
ON anomalias_gps FOR SELECT
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Insertar: Bloqueado a usuarios regulares. Solo el backend/edge_function 
-- (usando service_role) puede insertar logs, bypassando el RLS.
