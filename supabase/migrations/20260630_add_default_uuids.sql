-- Agregar DEFAULT uuid_generate_v4() a las tablas que lo necesitan

ALTER TABLE vehiculos_cliente ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE vagonetas ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE faenas ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE traslados_equipo ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE paradas_traslado ALTER COLUMN id SET DEFAULT uuid_generate_v4();
