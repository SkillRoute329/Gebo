-- supabase/migrations/20260717_driver_secure_suite.sql

ALTER TABLE faenas ADD COLUMN IF NOT EXISTS propina DECIMAL(10,2) DEFAULT 0.0;
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS saldo_billetera DECIMAL(10,2) DEFAULT 0.0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_cuenta DECIMAL(10,2) DEFAULT 0.0;

CREATE TABLE IF NOT EXISTS chats_faenas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faena_id UUID REFERENCES faenas(id) ON DELETE CASCADE,
    remitente_tipo VARCHAR(50) CHECK (remitente_tipo IN ('chofer', 'cliente', 'admin')),
    mensaje TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solicitudes_financieras_chofer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gebo_driver_id UUID REFERENCES choferes(id) ON DELETE CASCADE,
    tipo VARCHAR(50) CHECK (tipo IN ('anticipo', 'reembolso')),
    monto DECIMAL(10,2) NOT NULL,
    motivo TEXT NOT NULL,
    estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RPC para Asignar Propina Atómicamente
CREATE OR REPLACE FUNCTION public.asignar_propina(p_faena_id uuid, p_monto decimal)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_faena RECORD;
BEGIN
    SELECT * INTO v_faena FROM faenas WHERE id = p_faena_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Faena no encontrada';
    END IF;

    -- Actualizar faena
    UPDATE faenas SET propina = propina + p_monto WHERE id = p_faena_id;
    
    -- Sumar a billetera del chofer y debitar de cuenta del cliente
    IF v_faena.chofer_id IS NOT NULL THEN
        UPDATE choferes SET saldo_billetera = saldo_billetera + p_monto WHERE id = v_faena.chofer_id;
    END IF;
    
    IF v_faena.cliente_id IS NOT NULL THEN
        UPDATE clientes SET saldo_cuenta = saldo_cuenta - p_monto WHERE id = v_faena.cliente_id;
    END IF;

    RETURN json_build_object('success', true);
END;
$function$;

-- RPC para Procesar Solicitud Financiera Atómicamente
CREATE OR REPLACE FUNCTION public.procesar_solicitud_financiera(p_solicitud_id uuid, p_accion varchar)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_solicitud RECORD;
BEGIN
    SELECT * INTO v_solicitud FROM solicitudes_financieras_chofer WHERE id = p_solicitud_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solicitud no encontrada';
    END IF;
    
    IF v_solicitud.estado != 'pendiente' THEN
        RAISE EXCEPTION 'La solicitud ya fue procesada';
    END IF;

    IF p_accion = 'aprobar' THEN
        UPDATE solicitudes_financieras_chofer SET estado = 'aprobado' WHERE id = p_solicitud_id;
        UPDATE choferes SET saldo_billetera = saldo_billetera + v_solicitud.monto WHERE id = v_solicitud.gebo_driver_id;
    ELSIF p_accion = 'rechazar' THEN
        UPDATE solicitudes_financieras_chofer SET estado = 'rechazado' WHERE id = p_solicitud_id;
    END IF;

    RETURN json_build_object('success', true);
END;
$function$;
