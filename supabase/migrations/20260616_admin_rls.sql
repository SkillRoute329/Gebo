-- =========================================================================
-- FASE 9.1: BYPASS RLS DE ADMINISTRADOR (GRANULAR)
-- =========================================================================
-- Verificación del Claim:
-- Los claims generados por Supabase u otorgados por el backend (vía admin API)
-- se alojan típicamente en 'app_metadata'. Por lo tanto verificamos:
-- (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
-- 0. FIX CRÍTICO FASE 1: Bucle de Recursión Infinita
-- Las políticas originales de 'viajes' y 'clientes' se referenciaban mutuamente,
-- causando que PostgreSQL entrara en un bucle infinito al evaluar los ORs.
-- Lo solucionamos creando una función SECURITY DEFINER (Bypass) solo para la evaluación.

CREATE OR REPLACE FUNCTION get_viajes_asignados_chofer()
RETURNS SETOF uuid AS $$
    SELECT cliente_id FROM viajes 
    WHERE vehiculo_id IN (SELECT id FROM vehiculos WHERE chofer_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid()))
      AND estado IN ('asignado', 'en_camino', 'en_punto', 'en_curso')
$$ LANGUAGE sql SECURITY DEFINER;

-- Reemplazamos la política problemática de 'clientes'
DROP POLICY IF EXISTS "Choferes ven clientes de sus viajes" ON clientes;
CREATE POLICY "Choferes ven clientes de sus viajes" ON clientes
    FOR SELECT USING (id IN (SELECT get_viajes_asignados_chofer()));

-- =========================================================================

-- 1. Políticas de LECTURA (SELECT) exclusivas para el Radar del Administrador
CREATE POLICY "Admin puede leer choferes" ON choferes
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede leer clientes" ON clientes
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede leer posiciones" ON posiciones
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede leer vehiculos" ON vehiculos
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede leer viajes" ON viajes
    FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. Políticas de ESCRITURA (UPDATE/INSERT) para el Despacho Manual
-- Se limita la escritura a tablas logísticas. Los datos personales de clientes
-- y perfiles de choferes no pueden ser manipulados por políticas de despacho.

CREATE POLICY "Admin puede insertar vehiculos" ON vehiculos
    FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede actualizar vehiculos" ON vehiculos
    FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede insertar viajes" ON viajes
    FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin puede actualizar viajes" ON viajes
    FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- NOTA AUDIT TRAIL:
-- Los triggers creados en '20260614_audit_triggers.sql' operan a nivel de base 
-- de datos (FOR EACH ROW) y no son suprimidos por RLS. Todo INSERT o UPDATE que
-- el Administrador realice en 'viajes' o 'vehiculos' activará la función
-- 'process_audit_log()' y registrará la modificación inmutablemente.
