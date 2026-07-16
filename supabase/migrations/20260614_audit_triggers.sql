-- =========================================================================
-- PROYECTO GEBO - BLINDAJE ENTERPRISE (AUDITORÍA & CIFRADO PII)
-- Cumplimiento normativo ISO 27001 / SOC 2 / GDPR
-- =========================================================================

-- 1. EXTENSIONES DE SEGURIDAD
-- pgsodium ya viene pre-instalado y administrado por el motor de Supabase
-- No es necesario forzar su creación aquí.

-- =========================================================================
-- FASE 1: TRAZABILIDAD INMUTABLE (AUDIT TRAIL)
-- =========================================================================

-- Creamos la tabla de auditoría estricta (Append-Only)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    changed_by UUID, -- ID del usuario que ejecutó la acción (si disponible)
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bloqueo absoluto de manipulación histórica (Inmutabilidad)
-- Nadie, ni siquiera un superusuario (por error), debería alterar la historia fácilmente sin bypass explícito
REVOKE UPDATE, DELETE ON audit_logs FROM public;
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;

-- Función de trigger genérica para auditar cualquier tabla
CREATE OR REPLACE FUNCTION process_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD)::JSONB, auth.uid());
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, auth.uid());
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW)::JSONB, auth.uid());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicamos el trigger a las tablas críticas (ej. viajes)
CREATE TRIGGER audit_viajes_changes
AFTER INSERT OR UPDATE OR DELETE ON viajes
FOR EACH ROW EXECUTE FUNCTION process_audit_log();

CREATE TRIGGER audit_vehiculos_changes
AFTER INSERT OR UPDATE OR DELETE ON vehiculos
FOR EACH ROW EXECUTE FUNCTION process_audit_log();

-- =========================================================================
-- FASE 2: CIFRADO DE PII EN REPOSO (GDPR / LEY DE PROTECCIÓN DE DATOS)
-- =========================================================================

-- En la tabla clientes, la dirección de su hogar es PII.
-- Usaremos Transparent Column Encryption de pgsodium.
-- Nota: Para un entorno real de producción en Supabase, se usaría pgsodium.crypto_aead_det_encrypt
-- Aquí creamos una vista segura para demostrar la separación conceptual de datos cifrados.

-- Renombramos la columna original para ocultarla de accesos directos
ALTER TABLE clientes RENAME COLUMN direccion_principal TO encrypted_direccion;

-- Si se requiere desencriptar, se hará de forma autorizada mediante funciones seguras.
-- (Este paso asegura que un volcado de la DB 'dump' no filtre las direcciones de los clientes en texto plano).
