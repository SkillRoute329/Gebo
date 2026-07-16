-- 20260707_push_subscriptions.sql

-- 0. Fix: Migrar alertas_emergencia a faenas (deuda de la migración de schema)
ALTER TABLE alertas_emergencia DROP CONSTRAINT alertas_emergencia_viaje_id_fkey;
ALTER TABLE alertas_emergencia RENAME COLUMN viaje_id TO faena_id;

ALTER TABLE alertas_emergencia
    ADD CONSTRAINT alertas_emergencia_faena_id_fkey 
    FOREIGN KEY (faena_id) REFERENCES faenas(id) ON DELETE CASCADE;

-- Recrear función RLS que dependía de viaje_id
DROP FUNCTION IF EXISTS is_user_in_viaje_or_admin(UUID);
CREATE OR REPLACE FUNCTION is_user_in_viaje_or_admin(p_faena_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cliente_id UUID;
    v_chofer_id UUID;
BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
        RETURN TRUE;
    END IF;

    SELECT cliente_id, chofer_id INTO v_cliente_id, v_chofer_id
    FROM faenas WHERE id = p_faena_id;

    IF auth.uid() = (SELECT usuario_id FROM clientes WHERE id = v_cliente_id) THEN
        RETURN TRUE;
    END IF;

    IF v_chofer_id IS NOT NULL AND auth.uid() = (SELECT usuario_id FROM choferes WHERE id = v_chofer_id) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 1. Tabla para almacenar las suscripciones web push de los usuarios
DROP TABLE IF EXISTS push_subscriptions CASCADE;
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    auth_key TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios gestionan sus propias suscripciones" ON push_subscriptions;
CREATE POLICY "Usuarios gestionan sus propias suscripciones"
ON push_subscriptions FOR ALL
USING (usuario_id = auth.uid())
WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "Admins leen todas las suscripciones" ON push_subscriptions;
CREATE POLICY "Admins leen todas las suscripciones"
ON push_subscriptions FOR SELECT
USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- 2. Función genérica para enviar notificaciones push a través de pg_net hacia el Edge Function
-- (En desarrollo usaremos una invocación HTTP asíncrona hacia la URL local del Edge Function o la URL configurada)
CREATE OR REPLACE FUNCTION notify_push(
    p_usuario_id UUID,
    p_title TEXT,
    p_body TEXT,
    p_data JSONB DEFAULT '{}'::jsonb
) RETURNS void AS $$
DECLARE
    v_url TEXT;
    v_anon_key TEXT;
    v_payload JSONB;
BEGIN
    -- Obtenemos las URLs y Keys de la configuración (o definimos fallback local)
    -- En producción se deberían tomar de current_setting('app.settings.edge_function_url') o similar.
    -- Para este proyecto, definimos un webhook hacia http://host.docker.internal:54321/functions/v1/push-notify
    v_url := COALESCE(current_setting('app.settings.push_edge_function_url', true), 'http://host.docker.internal:54321/functions/v1/push-notify');
    v_anon_key := COALESCE(current_setting('app.settings.anon_key', true), 'ANON_KEY_PLACEHOLDER');

    v_payload := jsonb_build_object(
        'usuario_id', p_usuario_id,
        'title', p_title,
        'body', p_body,
        'data', p_data
    );

    -- Usamos pg_net para invocar de forma asíncrona (si está habilitado)
    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_anon_key
        ),
        body := v_payload
    );
EXCEPTION WHEN OTHERS THEN
    -- Fallback silencioso si net.http_post falla
    RAISE WARNING 'Fallo al invocar webhook push: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Triggers para Faenas (Cambios de Estado)
CREATE OR REPLACE FUNCTION trg_faena_estado_push()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario_id UUID;
    v_title TEXT;
    v_body TEXT;
    v_rol_destino TEXT;
BEGIN
    -- Determinar destino según el estado
    IF NEW.estado = 'asignada' THEN
        -- Notificamos al Chofer
        SELECT usuario_id INTO v_usuario_id FROM choferes WHERE id = NEW.chofer_id;
        v_title := 'Faena Asignada';
        v_body := 'Tenés una nueva faena asignada a las ' || to_char(NEW.fecha_hora_programada, 'HH24:MI');
        v_rol_destino := 'chofer';

    ELSIF NEW.estado = 'chofer_en_camino' THEN
        -- Notificamos al Cliente
        SELECT usuario_id INTO v_usuario_id FROM clientes WHERE id = NEW.cliente_id;
        v_title := 'Chofer en Camino';
        v_body := 'Tu chofer está en camino a tu ubicación.';
        v_rol_destino := 'cliente';

    ELSIF NEW.estado = 'chofer_llegó' THEN
        -- Notificamos al Cliente
        SELECT usuario_id INTO v_usuario_id FROM clientes WHERE id = NEW.cliente_id;
        v_title := 'Chofer Llegó';
        v_body := 'Tu chofer ha llegado al origen.';
        v_rol_destino := 'cliente';

    ELSIF NEW.estado = 'finalizada' THEN
        -- Notificamos al Cliente
        SELECT usuario_id INTO v_usuario_id FROM clientes WHERE id = NEW.cliente_id;
        v_title := 'Faena Finalizada';
        v_body := 'Tu faena ha finalizado. Costo: $' || NEW.costo_total;
        v_rol_destino := 'cliente';
    ELSE
        RETURN NEW;
    END IF;

    -- Llamar a la función de push si hay un usuario válido
    IF v_usuario_id IS NOT NULL THEN
        PERFORM notify_push(v_usuario_id, v_title, v_body, jsonb_build_object('faena_id', NEW.id, 'rol', v_rol_destino));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_faena_estado_push
AFTER UPDATE ON faenas
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION trg_faena_estado_push();

-- 4. Triggers para Nuevos Mensajes de Chat
CREATE OR REPLACE FUNCTION trg_nuevo_mensaje_push()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario_id UUID;
    v_title TEXT := 'Nuevo Mensaje';
    v_body TEXT;
    v_cliente_id UUID;
    v_chofer_id UUID;
    v_rol_destino TEXT;
BEGIN
    -- Extraer IDs de faena
    SELECT cliente_id, chofer_id INTO v_cliente_id, v_chofer_id FROM faenas WHERE id = NEW.faena_id;

    IF NEW.rol_emisor = 'chofer' THEN
        -- Envia a cliente
        SELECT usuario_id INTO v_usuario_id FROM clientes WHERE id = v_cliente_id;
        v_rol_destino := 'cliente';
    ELSIF NEW.rol_emisor = 'cliente' THEN
        -- Envia a chofer
        SELECT usuario_id INTO v_usuario_id FROM choferes WHERE id = v_chofer_id;
        v_rol_destino := 'chofer';
    ELSE
        RETURN NEW;
    END IF;

    -- Limitar longitud del mensaje
    v_body := LEFT(NEW.contenido, 50) || CASE WHEN LENGTH(NEW.contenido) > 50 THEN '...' ELSE '' END;

    IF v_usuario_id IS NOT NULL THEN
        PERFORM notify_push(v_usuario_id, v_title, v_body, jsonb_build_object('faena_id', NEW.faena_id, 'rol', v_rol_destino));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_nuevo_mensaje_push
AFTER INSERT ON mensajes_faena
FOR EACH ROW
EXECUTE FUNCTION trg_nuevo_mensaje_push();

-- 5. Triggers para SOS (alertas_emergencia)
CREATE OR REPLACE FUNCTION trg_alerta_sos_push()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    -- Buscar todos los administradores y enviarles push
    FOR v_admin_id IN SELECT id FROM auth.users WHERE (raw_app_meta_data->>'role') = 'admin' LOOP
        PERFORM notify_push(v_admin_id, '¡ALERTA SOS!', 'Nueva alerta de emergencia registrada.', jsonb_build_object('alerta_id', NEW.id, 'faena_id', NEW.faena_id));
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_alerta_sos_push
AFTER INSERT ON alertas_emergencia
FOR EACH ROW
EXECUTE FUNCTION trg_alerta_sos_push();
