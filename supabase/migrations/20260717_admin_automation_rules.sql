-- supabase/migrations/20260717_admin_automation_rules.sql

CREATE TABLE IF NOT EXISTS configuracion_automatizacion (
    id SERIAL PRIMARY KEY,
    despacho_autonomo_h3 BOOLEAN DEFAULT false,
    bloqueo_fatiga_estricto BOOLEAN DEFAULT true,
    auditoria_automatica_limite BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar configuración inicial si no existe
INSERT INTO configuracion_automatizacion (id, despacho_autonomo_h3, bloqueo_fatiga_estricto, auditoria_automatica_limite)
VALUES (1, false, true, false)
ON CONFLICT (id) DO NOTHING;
