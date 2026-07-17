-- supabase/migrations/20260717_corporate_client_suite.sql

CREATE TABLE IF NOT EXISTS centros_de_costo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    nombre_departamento VARCHAR(100) NOT NULL,
    presupuesto_mensual DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    gasto_acumulado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar vinculación del pasajero (empleado) a su empresa y centro de costo
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS centro_de_costo_id UUID REFERENCES centros_de_costo(id) ON DELETE SET NULL;

-- Función RPC para validar presupuesto atómicamente antes de crear un viaje
CREATE OR REPLACE FUNCTION public.validar_y_descontar_presupuesto_departamento(p_empleado_id uuid, p_monto_estimado decimal)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_empleado RECORD;
    v_centro RECORD;
BEGIN
    -- Bloquear y obtener datos del empleado y centro de costo
    SELECT * INTO v_empleado FROM usuarios WHERE id = p_empleado_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empleado no encontrado';
    END IF;

    IF v_empleado.centro_de_costo_id IS NULL THEN
        RAISE EXCEPTION 'Empleado no tiene un centro de costo asignado';
    END IF;

    -- Bloquear el centro de costo para la transacción atómica
    SELECT * INTO v_centro FROM centros_de_costo WHERE id = v_empleado.centro_de_costo_id FOR UPDATE;
    
    IF NOT v_centro.activo THEN
        RAISE EXCEPTION 'Centro de costo inactivo';
    END IF;

    -- Validar si hay fondos suficientes
    IF (v_centro.gasto_acumulado + p_monto_estimado) > v_centro.presupuesto_mensual THEN
        RAISE EXCEPTION 'Presupuesto excedido para el centro de costo: %', v_centro.nombre_departamento;
    END IF;

    -- Descontar (sumar al gasto acumulado)
    UPDATE centros_de_costo 
    SET gasto_acumulado = gasto_acumulado + p_monto_estimado 
    WHERE id = v_centro.id;

    RETURN json_build_object(
        'success', true,
        'nuevo_gasto', v_centro.gasto_acumulado + p_monto_estimado
    );
END;
$function$;
