BEGIN;

-- Añadir parámetros a configuracion_negocio
ALTER TABLE configuracion_negocio 
ADD COLUMN IF NOT EXISTS limite_conduccion_minutos INTEGER DEFAULT 240,
ADD COLUMN IF NOT EXISTS descanso_obligatorio_minutos INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS jornada_maxima_minutos INTEGER DEFAULT 480;

-- Modificar choferes (estado) para incluir 'en_descanso' y 'jornada_finalizada'
ALTER TABLE choferes DROP CONSTRAINT IF EXISTS choferes_estado_check;
ALTER TABLE choferes ADD CONSTRAINT choferes_estado_check CHECK (
    estado IN ('disponible', 'ocupado', 'en_faena', 'en_traslado', 'inactivo', 'ausente_preventivo', 'reten_activo', 'en_descanso', 'jornada_finalizada')
);

-- Tabla de turnos
CREATE TABLE IF NOT EXISTS turnos_chofer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chofer_id UUID REFERENCES choferes(id),
    inicio_jornada TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fin_jornada TIMESTAMP WITH TIME ZONE,
    minutos_conduccion_acumulados INTEGER DEFAULT 0,
    estado_laboral VARCHAR(30) DEFAULT 'activo', -- 'activo', 'en_descanso', 'jornada_finalizada'
    fin_descanso_estimado TIMESTAMP WITH TIME ZONE
);

-- Función PL/pgSQL
CREATE OR REPLACE FUNCTION fn_registrar_minutos_conduccion(p_chofer_id UUID, p_minutos INTEGER)
RETURNS VOID AS $$
DECLARE
    v_turno_id UUID;
    v_acumulado INTEGER;
    v_lim_conduccion INTEGER;
    v_lim_jornada INTEGER;
    v_descanso INTEGER;
BEGIN
    -- Leer parametros
    SELECT limite_conduccion_minutos, jornada_maxima_minutos, descanso_obligatorio_minutos 
    INTO v_lim_conduccion, v_lim_jornada, v_descanso
    FROM configuracion_negocio LIMIT 1;

    -- Obtener turno activo
    SELECT id, minutos_conduccion_acumulados INTO v_turno_id, v_acumulado
    FROM turnos_chofer
    WHERE chofer_id = p_chofer_id AND estado_laboral = 'activo'
    ORDER BY inicio_jornada DESC LIMIT 1;
    
    IF v_turno_id IS NOT NULL THEN
        v_acumulado := v_acumulado + p_minutos;
        
        IF v_acumulado >= v_lim_jornada THEN
            UPDATE turnos_chofer 
            SET minutos_conduccion_acumulados = v_acumulado, estado_laboral = 'jornada_finalizada', fin_jornada = NOW() 
            WHERE id = v_turno_id;
            
            UPDATE choferes SET estado = 'jornada_finalizada' WHERE id = p_chofer_id;
            
        ELSIF v_acumulado >= v_lim_conduccion THEN
            UPDATE turnos_chofer 
            SET minutos_conduccion_acumulados = v_acumulado, estado_laboral = 'en_descanso', fin_descanso_estimado = NOW() + (v_descanso || ' minutes')::interval
            WHERE id = v_turno_id;
            
            UPDATE choferes SET estado = 'en_descanso' WHERE id = p_chofer_id;
        ELSE
            UPDATE turnos_chofer SET minutos_conduccion_acumulados = v_acumulado WHERE id = v_turno_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
