-- 20260718_refactor_faenas_y_roles.sql
-- Refactorización Arquitectónica: Modelo de Choferes de Reemplazo (VRPPD)

-- 1. Renombrar la tabla principal de Viajes a Faenas
ALTER TABLE viajes RENAME TO faenas;

-- 2. Renombrar la tabla de Vehiculos a Flota Logistica
ALTER TABLE vehiculos RENAME TO flota_logistica;

-- 3. Modificar la Flota Logistica (Las vagonetas de la empresa)
-- Agregamos la restricción de que solo puede ser vagoneta o taxi_tercero
ALTER TABLE flota_logistica DROP CONSTRAINT IF EXISTS chk_tipo_vehiculo;
ALTER TABLE flota_logistica ADD CONSTRAINT chk_tipo_vehiculo CHECK (tipo IN ('vagoneta', 'taxi_tercero'));

-- 4. Adaptar la tabla de Faenas al nuevo modelo logístico
-- Eliminamos el campo vehiculo_id genérico porque ahora hay 3 componentes:
-- a) El chofer de reemplazo (que maneja el auto del cliente)
-- b) El vehículo de dropoff (vagoneta que lo lleva)
-- c) El vehículo de pickup (vagoneta que lo rescata)

-- Primero, permitimos nulos temporalmente
ALTER TABLE faenas RENAME COLUMN vehiculo_id TO chofer_reemplazo_id;
-- Nota: chofer_reemplazo_id ya era una FK a flota_logistica (ex vehiculos). 
-- Necesitamos que apunte a 'choferes'.
ALTER TABLE faenas DROP CONSTRAINT IF EXISTS viajes_vehiculo_id_fkey;
ALTER TABLE faenas ADD CONSTRAINT faenas_chofer_reemplazo_fkey FOREIGN KEY (chofer_reemplazo_id) REFERENCES choferes(id);

-- Añadimos las referencias a la logística
ALTER TABLE faenas ADD COLUMN vagoneta_dropoff_id UUID REFERENCES flota_logistica(id) ON DELETE SET NULL;
ALTER TABLE faenas ADD COLUMN vagoneta_pickup_id UUID REFERENCES flota_logistica(id) ON DELETE SET NULL;

-- 5. Manejo de Reservas (Agenda Anticipada)
ALTER TABLE faenas ADD COLUMN tipo_reserva TEXT DEFAULT 'anticipada' CHECK (tipo_reserva IN ('anticipada', 'on_demand'));
ALTER TABLE faenas ADD COLUMN hora_contratada TIMESTAMP WITH TIME ZONE;
-- Inicializamos hora_contratada con hora_pactada
UPDATE faenas SET hora_contratada = hora_pactada;

-- 6. Estados de Faena Refactorizados
ALTER TABLE faenas DROP CONSTRAINT IF EXISTS chk_estado_viaje;
ALTER TABLE faenas DROP CONSTRAINT IF EXISTS viajes_estado_check;

-- Nuevos estados lógicos para el VRP
-- agendado: Contratación anticipada, aún no asignada a una ruta.
-- agrupado_en_faena: El sistema lo metió en la ruta de una vagoneta.
-- vagoneta_en_camino: La vagoneta está llevando al chofer de reemplazo al cliente.
-- chofer_en_origen: El chofer de reemplazo llegó al auto del cliente.
-- en_curso: El chofer está conduciendo el auto del cliente.
-- cliente_entregado: El chofer llegó al destino del cliente.
-- esperando_rescate: El chofer de reemplazo está varado esperando a la vagoneta.
-- completado / cancelado
ALTER TABLE faenas ADD CONSTRAINT chk_estado_faena CHECK (estado IN (
    'solicitado', 'agendado', 'agrupado_en_faena', 'vagoneta_en_camino', 
    'chofer_en_origen', 'en_curso', 'cliente_entregado', 'esperando_rescate', 
    'completado', 'cancelado_cliente', 'cancelado_chofer', 'cancelado'
));

-- 7. Modificar Funciones RPC para reflejar la nueva tabla "faenas" en vez de "viajes"
-- Recrearemos las funciones críticas más adelante, pero primero aseguramos que los índices funcionen.
ALTER INDEX IF EXISTS idx_viajes_origen RENAME TO idx_faenas_origen;
ALTER INDEX IF EXISTS idx_viajes_destino RENAME TO idx_faenas_destino;
ALTER INDEX IF EXISTS idx_viajes_estado RENAME TO idx_faenas_estado;

-- Actualizamos la tabla viajes_ofertas_rechazadas a faenas_ofertas_rechazadas
ALTER TABLE viajes_ofertas_rechazadas RENAME TO faenas_ofertas_rechazadas;
ALTER TABLE faenas_ofertas_rechazadas RENAME COLUMN viaje_id TO faena_id;

-- Renombrar políticas RLS asociadas a "viajes" (Opcional, pero recomendado por limpieza)
-- Se requeriría dropear y recrear las políticas RLS. Para no perder seguridad:
DROP POLICY IF EXISTS "Clientes ven sus viajes" ON faenas;
CREATE POLICY "Clientes ven sus faenas" ON faenas
    FOR SELECT USING (
        cliente_id IN (SELECT id FROM clientes WHERE usuario_id = auth.uid())
    );

DROP POLICY IF EXISTS "Choferes ven sus viajes asignados" ON faenas;
CREATE POLICY "Choferes ven sus faenas asignadas" ON faenas
    FOR SELECT USING (
        chofer_reemplazo_id IN (SELECT id FROM choferes WHERE usuario_id = auth.uid())
    );

-- Nota: Hay muchas más funciones (como procesar_reasignacion_viaje, cancelar_viaje)
-- que deben ser recreadas en la siguiente migración para apuntar a 'faenas'.
