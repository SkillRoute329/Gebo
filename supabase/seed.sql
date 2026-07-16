-- Seed data for Gebo

-- Re-create the 3 main test users in auth.users
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@gebo.com', crypt('gebo123', gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp, '{"provider":"email","providers":["email"],"role":"admin"}', '{"nombre_completo":"Super Admin"}', current_timestamp, current_timestamp, '', '', '', ''),
('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chofer1@gebo.com', crypt('gebo123', gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp, '{"provider":"email","providers":["email"],"role":"chofer"}', '{"nombre_completo":"Chofer Uno"}', current_timestamp, current_timestamp, '', '', '', ''),
('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente1@gebo.com', crypt('gebo123', gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp, '{"provider":"email","providers":["email"],"role":"cliente"}', '{"nombre_completo":"María Demo"}', current_timestamp, current_timestamp, '', '', '', '');

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', format('{"sub":"%s","email":"%s"}', '11111111-1111-1111-1111-111111111111', 'admin@gebo.com')::jsonb, 'email', '11111111-1111-1111-1111-111111111111', current_timestamp, current_timestamp, current_timestamp),
(gen_random_uuid(), '22222222-2222-2222-2222-222222222222', format('{"sub":"%s","email":"%s"}', '22222222-2222-2222-2222-222222222222', 'chofer1@gebo.com')::jsonb, 'email', '22222222-2222-2222-2222-222222222222', current_timestamp, current_timestamp, current_timestamp),
(gen_random_uuid(), '33333333-3333-3333-3333-333333333333', format('{"sub":"%s","email":"%s"}', '33333333-3333-3333-3333-333333333333', 'cliente1@gebo.com')::jsonb, 'email', '33333333-3333-3333-3333-333333333333', current_timestamp, current_timestamp, current_timestamp);

-- The trigger created 'usuarios', but we need to insert them into 'choferes' and 'clientes'
INSERT INTO choferes (id, usuario_id, nombre, telefono, estado, horas_conduccion_continua, maneja_manual, maneja_automatico, maneja_electrico, maneja_camion, maneja_suv)
VALUES 
('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Carlos Demo', '099000001', 'inactivo', 0, true, true, false, false, true);

INSERT INTO clientes (id, usuario_id, tipo, nombre, telefono)
VALUES
('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'particular', 'María Demo', '+59899000111');

-- Vehículo del cliente
INSERT INTO vehiculos_cliente (id, cliente_id, marca, modelo, año, patente, tipo, transmision, es_electrico)
VALUES
(gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Toyota', 'Corolla', 2022, 'SBC1234', 'auto', 'automatico', false);

-- Add a vagoneta for testing
INSERT INTO vagonetas (id, patente, modelo, capacidad, chofer_vagoneta_id)
VALUES
(gen_random_uuid(), 'SAB1234', 'Hyundai H1', 8, null);
