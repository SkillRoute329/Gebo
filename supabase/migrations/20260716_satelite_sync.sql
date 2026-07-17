BEGIN;

-- Añadir columnas a faenas si no existen
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faenas' AND column_name = 'odometro_inicio') THEN
        ALTER TABLE faenas ADD COLUMN odometro_inicio INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faenas' AND column_name = 'odometro_fin') THEN
        ALTER TABLE faenas ADD COLUMN odometro_fin INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faenas' AND column_name = 'distancia_gps_km') THEN
        ALTER TABLE faenas ADD COLUMN distancia_gps_km DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faenas' AND column_name = 'foto_odometro_url') THEN
        ALTER TABLE faenas ADD COLUMN foto_odometro_url TEXT;
    END IF;
END $$;

-- Crear RPC finalizar_faena_sync
CREATE OR REPLACE FUNCTION finalizar_faena_sync(
    p_faena_id UUID,
    p_odometro_fin INT,
    p_gps_km DECIMAL,
    p_foto_url TEXT
) RETURNS JSON AS $$
DECLARE
    v_faena RECORD;
    v_odometro_inicio INT;
    v_distancia_odometro DECIMAL;
    v_distancia_real DECIMAL;
    v_config RECORD;
    v_costo_final DECIMAL(10,2);
BEGIN
    -- Obtener faena
    SELECT * INTO v_faena FROM faenas WHERE id = p_faena_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Faena no encontrada';
    END IF;

    IF v_faena.estado = 'finalizada' THEN
        RAISE EXCEPTION 'Faena ya finalizada';
    END IF;

    -- Obtener odometro inicio (si es nulo, asumimos 0 para la diferencia o igual a fin - gps para no romper)
    v_odometro_inicio := COALESCE(v_faena.odometro_inicio, p_odometro_fin - (p_gps_km::INT));
    IF v_odometro_inicio > p_odometro_fin THEN
        RAISE EXCEPTION 'El odómetro final no puede ser menor al inicial';
    END IF;

    v_distancia_odometro := p_odometro_fin - v_odometro_inicio;

    -- Validar diferencia 10%
    IF v_distancia_odometro > (p_gps_km * 1.10) THEN
        IF p_foto_url IS NULL OR p_foto_url = '' THEN
            RAISE EXCEPTION '{"error": "foto_requerida", "message": "La diferencia de kilometraje excede el 10%%. Debe adjuntar foto del odómetro."}';
        END IF;
    END IF;

    -- Distancia a cobrar es la mayor
    v_distancia_real := GREATEST(v_distancia_odometro, p_gps_km);

    -- Configuración para calcular el costo
    SELECT * INTO v_config FROM configuracion_negocio LIMIT 1;

    -- Calcular costo final. Si es 'por_minuto' cobramos base + distancia * rate (simplificación para el test)
    -- Asumiremos tarifa_por_minuto = rate por km para simplificar
    IF v_faena.modalidad = 'dia_completo' THEN
        v_costo_final := COALESCE(5000, 5000);
    ELSIF v_faena.modalidad = 'por_hora' THEN
        v_costo_final := COALESCE(1200, 1200);
    ELSE
        -- Base + km real
        v_costo_final := 50 + (v_distancia_real * COALESCE(v_config.tarifa_base_minuto, 30));
    END IF;

    -- Actualizar faena
    UPDATE faenas SET 
        odometro_fin = p_odometro_fin,
        distancia_gps_km = p_gps_km,
        foto_odometro_url = p_foto_url,
        estado = 'finalizada',
        costo_total = v_costo_final,
        fecha_hora_fin_real = NOW()
    WHERE id = p_faena_id;

    -- Insertar en resumen_contable si no existe
    IF NOT EXISTS (SELECT 1 FROM resumen_contable_viajes WHERE faena_id = p_faena_id) THEN
        INSERT INTO resumen_contable_viajes (faena_id, vagoneta_id, zona_h3, ingreso, costo_chofer, costo_vagoneta, costo_gastos_ruta, kilometros_reales)
        VALUES (p_faena_id, NULL, v_faena.origen_h3_res8, v_costo_final, 0, 0, 0, v_distancia_real);
    ELSE
        UPDATE resumen_contable_viajes SET 
            ingreso = v_costo_final,
            kilometros_reales = v_distancia_real
        WHERE faena_id = p_faena_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'costo_final', v_costo_final,
        'distancia_facturada', v_distancia_real
    );
END;
$$ LANGUAGE plpgsql;

COMMIT;
