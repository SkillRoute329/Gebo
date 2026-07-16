-- Habilitar la transmisión en tiempo real (WebSockets) para la tabla de viajes
-- Esto es crítico para el Radar del Admin y las alertas del Chofer
ALTER PUBLICATION supabase_realtime ADD TABLE viajes;
