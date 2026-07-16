-- =========================================================================
-- FASE 11: PRIVACIDAD GDPR BIOMÉTRICA (FOTO DEL CHOFER)
-- =========================================================================

-- 1. Añadir columna foto_url a choferes
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- 2. Eliminar política genérica original y re-definir visibilidad de perfiles de chofer.
DROP POLICY IF EXISTS "Choferes ven su propio perfil" ON choferes;
DROP POLICY IF EXISTS "Admin puede leer choferes" ON choferes;
-- La tabla choferes tenía políticas básicas, ahora aplicamos seguridad PII estricta.

-- Los choferes ven sus propios datos siempre.
CREATE POLICY "Choferes ven su propio perfil" ON choferes
    FOR SELECT USING (usuario_id = auth.uid());

-- Administrador ve todos los perfiles en su radar.
CREATE POLICY "Admin puede leer choferes" ON choferes
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. POLÍTICA GDPR PARA CLIENTES (Pasajeros)
-- Creamos una función SECURITY DEFINER para evitar la recursión infinita con la política de viajes de choferes.
CREATE OR REPLACE FUNCTION es_chofer_de_viaje_activo_del_cliente(p_chofer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_activo BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM viajes 
        WHERE (viajes.chofer_ofrecido_id = p_chofer_id OR viajes.vehiculo_id IN (SELECT id FROM vehiculos WHERE chofer_id = p_chofer_id))
          AND viajes.cliente_id = auth.uid()
          AND viajes.estado IN ('asignado', 'en_camino', 'en_punto', 'en_curso')
    ) INTO v_activo;
    RETURN v_activo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Clientes ven datos del chofer activo" ON choferes
    FOR SELECT USING (es_chofer_de_viaje_activo_del_cliente(id));
