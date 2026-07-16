-- Fix RLS para admin en nuevo esquema (Asegurar ALL operations)

-- Clientes
DROP POLICY IF EXISTS "Admins ven clientes" ON clientes;
CREATE POLICY "Admins full clientes" ON clientes
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Vehiculos Cliente
DROP POLICY IF EXISTS "Admins ven vehiculos" ON vehiculos_cliente;
CREATE POLICY "Admins full vehiculos" ON vehiculos_cliente
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Choferes
DROP POLICY IF EXISTS "Admins ven choferes" ON choferes;
CREATE POLICY "Admins full choferes" ON choferes
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Vagonetas
DROP POLICY IF EXISTS "Admins ven vagonetas" ON vagonetas;
CREATE POLICY "Admins full vagonetas" ON vagonetas
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Faenas
DROP POLICY IF EXISTS "Admins ven faenas" ON faenas;
CREATE POLICY "Admins full faenas" ON faenas
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Traslados de Equipo
DROP POLICY IF EXISTS "Admins ven traslados" ON traslados_equipo;
CREATE POLICY "Admins full traslados" ON traslados_equipo
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Paradas de Traslado
DROP POLICY IF EXISTS "Admins ven paradas" ON paradas_traslado;
CREATE POLICY "Admins full paradas" ON paradas_traslado
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Posiciones
DROP POLICY IF EXISTS "Admins ven posiciones" ON posiciones;
CREATE POLICY "Admins full posiciones" ON posiciones
    FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
