-- ORDEN #25: Bloque 1 - Faenas Programadas, Chat, Incidentes, Push

-- 1. Faenas Programadas
-- Agregar tipo_viaje
ALTER TABLE faenas ADD COLUMN tipo_viaje TEXT CHECK (tipo_viaje IN ('inmediata', 'programada')) DEFAULT 'inmediata';

-- Actualizar ENUM de estado de faenas para incluir 'incidente'
-- En PostgreSQL para agregar a un constraint CHECK existente hay que dropearlo y recrearlo
ALTER TABLE faenas DROP CONSTRAINT faenas_estado_check;
ALTER TABLE faenas ADD CONSTRAINT faenas_estado_check CHECK (estado IN ('programada', 'ofrecida', 'asignada', 'chofer_en_camino', 'chofer_llegó', 'en_curso', 'finalizada', 'cancelada_cliente', 'cancelada_gebo', 'incidente'));

-- pg_cron para faenas programadas
-- Asigna choferes a faenas programadas 30 minutos antes de su inicio
SELECT cron.schedule(
    'faenas-programadas-job',
    '* * * * *', -- Cada minuto
    $$
        SELECT procesar_reasignacion_faena(id)
        FROM faenas
        WHERE estado = 'programada' 
          AND tipo_viaje = 'programada'
          AND fecha_hora_programada <= NOW() + INTERVAL '30 minutes';
    $$
);

-- 2. Chat Interno
CREATE TABLE mensajes_faena (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faena_id UUID REFERENCES faenas(id) ON DELETE CASCADE,
    emisor_id UUID NOT NULL, -- Puede ser chofer_id o cliente_id
    rol_emisor TEXT CHECK (rol_emisor IN ('cliente', 'chofer', 'admin')),
    contenido TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mensajes_faena ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participantes pueden leer mensajes de su faena"
ON mensajes_faena FOR SELECT
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    faena_id IN (
        SELECT id FROM faenas WHERE cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid())
        UNION
        SELECT id FROM faenas WHERE chofer_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid())
        UNION
        SELECT id FROM faenas WHERE chofer_ofrecido_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid())
    )
);

CREATE POLICY "Participantes pueden enviar mensajes"
ON mensajes_faena FOR INSERT
TO authenticated
WITH CHECK (
    faena_id IN (
        SELECT id FROM faenas WHERE cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid())
        UNION
        SELECT id FROM faenas WHERE chofer_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid())
    )
);

ALTER PUBLICATION supabase_realtime ADD TABLE mensajes_faena;

-- 3. Protocolo de Incidente
CREATE TABLE incidentes_faena (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faena_id UUID REFERENCES faenas(id) ON DELETE CASCADE,
    reportado_por_id UUID REFERENCES choferes(id),
    descripcion TEXT NOT NULL,
    fotos_urls TEXT[] DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    estado TEXT CHECK (estado IN ('reportado', 'en_revision', 'resuelto')) DEFAULT 'reportado'
);

ALTER TABLE incidentes_faena ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin puede gestionar incidentes"
ON incidentes_faena FOR ALL
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Chofer puede leer sus incidentes"
ON incidentes_faena FOR SELECT
TO authenticated
USING (reportado_por_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid()));

CREATE POLICY "Chofer puede crear incidente"
ON incidentes_faena FOR INSERT
TO authenticated
WITH CHECK (reportado_por_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid()));

-- 4. Notificaciones Push (Web Push Subscriptions)
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- auth.uid()
    endpoint TEXT NOT NULL UNIQUE,
    auth TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gestionan sus suscripciones"
ON push_subscriptions FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Enable pg_net for webhooks
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_send_push()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    request_id BIGINT;
BEGIN
    payload := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(NEW)
    );
    IF TG_OP = 'UPDATE' THEN
        payload := payload || jsonb_build_object('old_record', row_to_json(OLD));
    END IF;

    SELECT net.http_post(
        url := 'http://kong:8000/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('request.jwt.claim.role', true) -- Or anon key
        ),
        body := payload
    ) INTO request_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER push_on_mensaje
AFTER INSERT ON mensajes_faena
FOR EACH ROW EXECUTE FUNCTION trigger_send_push();

CREATE TRIGGER push_on_faena_update
AFTER UPDATE ON faenas
FOR EACH ROW 
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION trigger_send_push();

-- GRANT PRIVILEGES TO NEW TABLES
GRANT ALL ON TABLE mensajes_faena TO authenticated;
GRANT ALL ON TABLE mensajes_faena TO anon;
GRANT ALL ON TABLE incidentes_faena TO authenticated;
GRANT ALL ON TABLE incidentes_faena TO anon;
GRANT ALL ON TABLE push_subscriptions TO authenticated;
GRANT ALL ON TABLE push_subscriptions TO anon;

