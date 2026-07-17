-- supabase/migrations/20260717_production_security_rls.sql

-- Habilitar RLS en las tablas solicitadas
ALTER TABLE posiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats_faenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_financieras_chofer ENABLE ROW LEVEL SECURITY;
ALTER TABLE centros_de_costo ENABLE ROW LEVEL SECURITY;

-- Política para posiciones: Permite INSERT y UPDATE si auth.uid() coincide con chofer_id
DROP POLICY IF EXISTS "posiciones_chofer_policy" ON posiciones;
CREATE POLICY "posiciones_chofer_policy" ON posiciones
    FOR ALL
    TO authenticated
    USING (chofer_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
    WITH CHECK (chofer_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid);

-- Política para chats_faenas: Permite SELECT e INSERT si el usuario es el chofer o el cliente de la faena
CREATE OR REPLACE VIEW chats_faenas_view AS SELECT * FROM chats_faenas;
DROP POLICY IF EXISTS "chats_faenas_policy" ON chats_faenas;
CREATE POLICY "chats_faenas_policy" ON chats_faenas
    FOR ALL
    TO authenticated
    USING (
        faena_id IN (
            SELECT id FROM faenas 
            WHERE chofer_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid 
               OR cliente_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        )
    )
    WITH CHECK (
        faena_id IN (
            SELECT id FROM faenas 
            WHERE chofer_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid 
               OR cliente_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        )
    );

-- Política para solicitudes_financieras_chofer: Permite todo a su propio chofer
DROP POLICY IF EXISTS "solicitudes_financieras_policy" ON solicitudes_financieras_chofer;
CREATE POLICY "solicitudes_financieras_policy" ON solicitudes_financieras_chofer
    FOR ALL
    TO authenticated
    USING (gebo_driver_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
    WITH CHECK (gebo_driver_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid);

-- Política para centros_de_costo: Permite SELECT a usuarios de la misma empresa
DROP POLICY IF EXISTS "centros_de_costo_policy" ON centros_de_costo;
CREATE POLICY "centros_de_costo_policy" ON centros_de_costo
    FOR SELECT
    TO authenticated
    USING (empresa_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid);

-- Otorgar permisos básicos a la base de datos para los usuarios autenticados
GRANT SELECT, INSERT, UPDATE, DELETE ON posiciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chats_faenas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON solicitudes_financieras_chofer TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON centros_de_costo TO authenticated;
GRANT SELECT ON faenas TO authenticated;

