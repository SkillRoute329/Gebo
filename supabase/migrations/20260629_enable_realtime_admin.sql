-- Activar publicación de Realtime para las tablas requeridas por el Admin Dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE faenas;
ALTER PUBLICATION supabase_realtime ADD TABLE choferes;
ALTER PUBLICATION supabase_realtime ADD TABLE posiciones;
ALTER PUBLICATION supabase_realtime ADD TABLE clientes;
ALTER PUBLICATION supabase_realtime ADD TABLE vehiculos_cliente;
ALTER PUBLICATION supabase_realtime ADD TABLE vagonetas;
