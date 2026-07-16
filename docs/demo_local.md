# Guía de Ejecución de Demo Local (Gebo)

Este documento detalla los pasos para levantar el entorno completo de demostración en una computadora local y navegar las 3 interfaces (Cliente, Chofer, Admin). Contiene las actualizaciones recientes de las versiones B1-B5.

## 1. Levantar la Infraestructura

Abre una terminal en la raíz del proyecto (`Gebo/`) y ejecuta:
```bash
# Iniciar base de datos, APIs y Edge Functions localmente
supabase start

# Reiniciar base si deseas restaurar los datos semilla del demo limpios
supabase db reset
```

## 2. Levantar el Frontend (PWAs)

Abre otra terminal en `Gebo/frontend/` y ejecuta:
```bash
npm install
npm run dev
```

Esto iniciará el servidor Vite. El frontend es un único proyecto que enruta hacia las distintas vistas. 

## 3. URLs y Credenciales de Prueba

Para la demostración, te sugiero abrir **tres ventanas de incógnito** o navegadores distintos, para simular las 3 partes operando simultáneamente. La demo utiliza un seed de datos narrativos preparados para este fin.

### 🚗 Ecosistema Chofer (Carlos)
- **URL**: `http://localhost:5173/chofer`
- **Vista**: PWA Móvil Dark Mode.
- **Acción**: Haz clic en "Iniciar Turno" para conectarte al radar. Carlos es un chofer de la empresa manejando una vagoneta Gebo.

### 🧍 Ecosistema Cliente (María)
- **URL**: `http://localhost:5173/cliente`
- **Vista**: PWA Móvil Light Mode.
- **Acción**: Selecciona el destino "Aeropuerto de Carrasco" para María, que está ubicada en Pocitos (Bv. España y Rambla). Haz clic en "Confirmar".

### 🗼 Torre de Control (Admin)
- **URL**: `http://localhost:5173/admin`
- **Vista**: Dashboard Desktop Fullscreen.
- **Acción**: Verás los choferes conectados y los viajes en curso en el radar en tiempo real. 

*(Nota: En la interfaz actual, el login Auth UI todavía no está implementado de forma visual en React, las vistas interactúan directamente con Supabase asumiendo un rol para la visualización. Los datos reales ya están cargados en Supabase).*

## Recorrido del Flujo Narrativo (Demo Client)

Este recorrido está diseñado para mostrar las características principales (Transparencia de Tarifas, Asignación Híbrida, Botón SOS y Reasignación) sin interrupciones.

1. **Preparación**: Abre las 3 interfaces y pon a Carlos (Chofer) en "Online".
2. **Transparencia y Solicitud**: En la pantalla de Cliente (María), ingresa el destino. La app mostrará el desglose de tarifa estimada y la política de cancelación. Haz clic en "Confirmar".
3. **Radar Admin**: Observa en la ventana del Admin cómo el Radar registra el nuevo viaje en tiempo real y muestra a María y Carlos en el mapa.
4. **Asignación Híbrida**: El algoritmo evalúa distancias y penalidades, y asigna el viaje a la vagoneta más cercana (Carlos). 
5. **Aceptación**: Carlos recibirá un popup rojo pulsante "¡NUEVO VIAJE!" con un sonido de notificación. Carlos acepta el viaje.
6. **Alarma SOS (Simulacro)**: María presiona accidentalmente el botón SOS. 
   - La pantalla se pone roja con una cuenta regresiva de 10 segundos. 
   - El admin escucha una sirena instantáneamente.
   - Antes de que expire el tiempo, María pulsa "Cancelar Alarma". La alerta se marca como `falsa_alarma` y se tranquiliza la UI del admin.
7. **Finalización del Viaje**: Carlos cambia su estado a "Viaje en Curso" y luego a "Finalizado". El sistema vuelve a su estado inicial, listo para otro viaje.

## Estado de la Aplicación (Sprint B)
- **Transparencia de Tarifa**: Mostrada antes de aceptar.
- **Reasignación por Demora**: Activa y con políticas de cancelación justas.
- **Botón de Emergencia (SOS)**: Funcionando con cancelación de falsa alarma.
- **Performance RLS y Anti-Spoofing**: Protegiendo los accesos sin penalizar los tiempos de carga de la base de datos (Trigger de desnormalización implementado).
