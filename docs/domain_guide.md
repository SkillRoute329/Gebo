# GEBO - GuÃ­a Definitiva de Dominio y Negocio (Domain-Driven Design)

> **ATENCIÃ“N A FUTUROS AGENTES DE IA Y DESARROLLADORES:**
> ESTE DOCUMENTO ES LA FUENTE ÃšNICA DE VERDAD DEL NEGOCIO. LEER SIEMPRE ANTES DE MODIFICAR LA LÃ“GICA DE ASIGNACIÃ“N O BASE DE DATOS.

## Â¿QuÃ© es Gebo?
Gebo **NO ES UBER**. No es una aplicaciÃ³n de solicitud de taxis convencionales.
Gebo es un servicio de **Choferes de Reemplazo (Designated Driver)**. 
El usuario/cliente solicita **un chofer para que conduzca el propio vehÃ­culo del cliente** (por ejemplo, si el cliente bebiÃ³ alcohol en una fiesta y necesita volver a casa en su auto de forma segura).

## La Operativa LogÃ­stica (El Problema de Ruteo)
La complejidad de la plataforma radica en **cÃ³mo la empresa transporta a los choferes** hacia donde estÃ¡ el cliente, y cÃ³mo los recoge una vez que el chofer termina su trabajo.

### Componentes de la Flota:
1. **El Chofer (Designated Driver):** Empleado de Gebo que conducirÃ¡ el auto del cliente.
2. **La Vagoneta (Shuttle/Transporte Interno):** VehÃ­culo conducido por personal fijo de Gebo. Funciona como un transporte de distribuciÃ³n ("Nodriza"). Lleva a varios choferes a bordo.
3. **Taxi de Terceros:** Apoyo logÃ­stico externo. Se contrata cuando la Vagoneta estÃ¡ colapsada o muy lejos, para transportar al chofer hacia o desde el cliente.

### Ciclo de Vida de un Servicio (Faena):
Un servicio completo consta de 3 etapas logÃ­sticas obligatorias:

1. **Despacho (Drop-off del Chofer):**
   - La plataforma asigna la **Vagoneta** mÃ¡s Ã³ptima (o un taxi de apoyo) para llevar a un **Chofer** hasta el *Punto de Origen* donde estÃ¡ el cliente y su auto.
2. **Servicio Principal (El Viaje del Cliente):**
   - El Chofer conduce el auto del cliente desde el *Punto de Origen* hasta el *Destino*.
3. **Recogida (Pick-up del Chofer):**
   - Al finalizar, el Chofer queda "varado" en el Destino del cliente. 
   - La plataforma debe organizar que la **Vagoneta** (o un taxi) vaya a recoger a ese Chofer para reintegrarlo al flujo operativo y llevarlo a su prÃ³ximo servicio.

## El Algoritmo de AsignaciÃ³n y Ruteo
A diferencia de un ride-hailing donde 1 VehÃ­culo = 1 Viaje, el algoritmo de Gebo es un sistema de **Vehicle Routing Problem con Pickup & Delivery (VRPPD)**:
- La plataforma debe optimizar las rutas de la Vagoneta.
- La Vagoneta tiene que calcular su ruta de forma que pueda ir "soltando" choferes en distintos puntos A, y "recogiendo" choferes en distintos puntos B, minimizando tiempos muertos.

## Nomenclatura Estricta (Lenguaje Ubicuo)
- **Servicio / Solicitud:** En lugar de "Viaje", ya que implica la logÃ­stica completa de soltar, conducir y recoger.
- **Cliente:** El dueÃ±o del auto que solicita el chofer.
- **Chofer de Reemplazo:** Quien conduce el auto del cliente.
- **Conductor de Vagoneta (LogÃ­stica):** Quien conduce el vehÃ­culo de transporte de la empresa.
- **Vagoneta:** El vehÃ­culo de la empresa que distribuye choferes.

---
*Fin del documento core. Si modificas este archivo, asegura que la narrativa de los 3 pasos de servicio se mantenga intacta.*


## Optimización de Recursos y Tiers de Servicio

Dado que los recursos (Choferes y Vagonetas) son finitos, el algoritmo debe optimizar costos y tiempos. Si la empresa opera con 4 choferes y 1 vagoneta, la plataforma debe anticipar cuellos de botella.

### Tiers de Servicio (Upselling)
1. **Servicio Estándar (Ruta Vagoneta):** El chofer es entregado al cliente a través de la ruta logística compartida de la Vagoneta. Tiempo de espera variable según la cola de tareas. Costo base.
2. **Servicio Exclusivo / Express:** Si el cliente no quiere esperar la ruta de la vagoneta, la plataforma le ofrece un servicio premium de mayor costo. En este caso, la empresa envía a un chofer de inmediato de forma exclusiva utilizando un 	axi_tercero o despacho directo, saltándose la cola de la vagoneta.

### Casos de Borde Cotidianos (Edge Cases)
- **Rescate Lejano vs Taxi:** Si un chofer termina un viaje muy lejos y la vagoneta está ocupada, la plataforma debe evaluar qué es más barato: dejar al chofer ocioso esperando 40 min, o pagar un taxi de inmediato para reintegrarlo a la base y que pueda tomar otro viaje lucrativo.
- **Ruteo Enjambre (Clustering):** Si hay 2 clientes cerca, la vagoneta deja a 2 choferes secuencialmente antes de ir a rescatar a otro.
- **Saturación Total:** Si los 4 choferes están conduciendo, el sistema debe informar al siguiente cliente el ETA real basado en cuándo el *primer chofer terminará su viaje actual + el tiempo que tardará la vagoneta en recogerlo y llevarlo al nuevo cliente*.


## Contratación Anticipada y Prioridad de Agenda
Los servicios de Gebo **no son exclusivamente on-demand**. La mayor parte de la operación se basa en **contrataciones anticipadas** (reservas programadas). Estas reservas tienen prioridad absoluta. La plataforma agrupa estos servicios programados para estructurar la aena (hoja de ruta de la vagoneta) antes de que inicie el turno. Cualquier solicitud en tiempo real debe acomodarse en los espacios vacíos de la vagoneta o derivarse al tier Premium (Taxi).

## Roles e Interfaces del Sistema (UIs)
El sistema se divide en 4 pantallas o aplicaciones distintas:
1. **Operador General (Admin):** Pantalla de control maestro. Supervisa las reservas anticipadas, monitorea cómo el algoritmo agrupa los viajes, interviene en caso de cuellos de botella y visualiza el radar general.
2. **Conductor de Logística (Vagoneta):** Pantalla enfocada en Ruteo. Muestra un listado ordenado de puntos: a qué Chofer recoger, a quién llevar y a qué cliente ir. 
3. **Cliente:** Interfaz para reservar (anticipada o en el momento), pagar, elegir tier de servicio y monitorear el estado de su Chofer asignado.
4. **Chofer de Reemplazo:** Interfaz operativa para su tarea. Le indica a dónde debe conducir el auto del cliente, reportar incidentes, y señalar cuándo está libre esperando ser rescatado por la vagoneta.


## El Rol del Operador General (Administrador)
El Operador General es el controlador de tráfico y recursos. Sus facultades incluyen:
- **Gestión de Personal:** Dar de alta/baja a choferes y conductores de vagoneta, y modificar sus perfiles.
- **Intervención Manual:** Forzar la reasignación de choferes o vagonetas si el algoritmo no cubre un escenario imprevisto (ej. cliente VIP, chofer enfermo).
- **Gestión Económica:** Alterar tarifas base, aplicar descuentos manuales o perdonar/aplicar multas.

## Casos Especiales (Edge Cases) a Contemplar
- **Fallas de Vehículo:** ¿Qué pasa si la vagoneta se avería con choferes a bordo? El operador debe poder despachar taxis de rescate masivos.
- **Incidente con Auto del Cliente:** Si el auto del cliente falla o hay un accidente, el chofer debe tener un botón de emergencia para reportar al operador y pausar la faena.
- **No-Show:** El cliente no aparece en el origen, o el chofer no llega a tiempo. El operador debe gestionar las penalidades o reagendamientos.
