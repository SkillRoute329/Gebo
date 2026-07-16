# Decisiones de Arquitectura

## 2026-06-14: Duplicación de Lógica de Asignación (Python vs PL/pgSQL)

### Contexto
Durante la Fase 10 (Orden #4) se solicitó que la base de datos sea capaz de procesar por sí sola (a través de un cron job / RPC) la reasignación de un viaje cuando una oferta expira a los 15 segundos. Originalmente, el algoritmo de asignación fue diseñado puramente en Python (`logic/asignacion.py`) durante la Fase 2, principalmente para poder ser evaluado bajo regresión en memoria con `simulacion_100_viajes.py`.

### Decisión
Para evitar un alto overhead de latencia de red levantando workers externos cada 15 segundos, se decidió **portar el núcleo del algoritmo de asignación a PL/pgSQL** directamente en la base de datos (`procesar_reasignacion_viaje()`).

### Consecuencia (Riesgo de Drift)
Tenemos ahora **lógica de negocio crítica duplicada** en dos lenguajes distintos.
- **Python (`logic/asignacion.py`)**: Se utiliza para los tests unitarios y la simulación determinista `simulacion_100_viajes.py`.
- **PL/pgSQL (`procesar_reasignacion_viaje`)**: Se utiliza en el entorno de producción para el enrutamiento de Supabase.

### Mitigación (Roadmap)
Si alguien cambia las reglas de penalización o márgenes de flota en Python pero olvida cambiarlo en el SQL de migración (o viceversa), la simulación de QA podría pasar en verde contra una lógica falsa.

**Actualización 2026-06-15:** Se ejecutó una auditoría de Drift exhaustiva (`tests/test_asignacion_drift.py`) comprobando 100 escenarios generados aleatoriamente entre Python y PL/pgSQL. Tras solucionar las discrepancias y bugs (capacidad no controlada en SQL, ordenamiento incorrecto de taxis en Python, y consideraciones de zonas horarias y truncado temporal), el drift se ha reducido a **0/100 divergencias**. 

A partir de este momento, se declara **PL/pgSQL (`procesar_reasignacion_viaje`) como la fuente única de verdad para entornos de producción.** El pipeline de CI debe incorporar obligatoriamente el script `test_asignacion_drift.py` (gebo-devops-qa) impidiendo cualquier despliegue a producción en caso de divergencia con la lógica baseline en Python.

**Regla de Diseño Explícita (Mapeo de auth.uid()):**
"Toda política RLS o función SECURITY DEFINER nueva que involucre `auth.uid()` debe verificar primero el mapeo correcto hacia `usuarios.id` / `choferes.usuario_id` / `clientes.usuario_id`. NUNCA asumir que `auth.uid()` es directamente el PK de la tabla de negocio (`chofer_id` o `cliente_id`). Se debe agregar un test explícito de este mapeo en `test_rls.py` para cada política nueva para evitar errores silenciosos o falsos negativos."

**Regla de Diseño Explícita (Constantes y Números Mágicos):**
"Toda variable de reglas de negocio que afecte económicamente o a nivel seguridad (ej: `PENALIZACION_CANCELACION_TARDIA_UYU = 30.00`, `MARGEN_SEGURIDAD = 1`, `UMBRAL_SPOOFING_KMH = 150`) debe ser declarada como una constante nombrada en cada entorno que la requiera (Python o SQL) y nunca estar incrustada en forma de literal ("número mágico") dentro de las queries o lógica de backend. Estos montos quedan configurados para demo, siendo ajustables cuando haya pricing real de negocio."

**Decisión respecto al Rastreo de Taxis de Terceros:**
El filtro de inactividad GPS (5 minutos sin señal) **NO aplica** a taxis de terceros porque estos vehículos operan como un desborde logístico tercerizado (vía bases o radio) y en esta fase no llevan integrado nuestro tracker GPS mediante la app de chofer. Tanto la implementación Python como el PL/pgSQL fueron ajustados para reflejar esta excepción explícitamente, evaluando su proximidad mediante las posiciones reportadas estáticamente u otros métodos de registro.

**Decisión respecto a Topología y Edge Real:**
El despliegue se realizará bajo una topología **Self-Hosted en VPS**. La razón primordial es la soberanía estricta de datos (cumplimiento GDPR sobre localizaciones de usuarios en Uruguay) establecida en las premisas fundacionales del negocio y un costo fijo predecible. La contrapartida es la falta de distribución geográfica "Edge" (toda request viaja hasta el datacenter único), añadiendo ~30-50ms de latencia de red. Este retraso ha sido validado como insignificante matemáticamente para ventanas operativas de 15 segundos y mallas geográficas de 50 metros. *Esta decisión queda sujeta a revisión si las operaciones de Gebo se expanden fuera del territorio de Uruguay, donde la latencia de un único servidor local empezaría a afectar dramáticamente el performance y se justifyría la migración a Supabase Cloud Tier Pro.*

**Decisión respecto al Pipeline CI/CD:**
La ejecución del "Checklist del Laboratorio" se implementa sobre **GitHub Actions**, dado que soporta levantar imágenes efímeras de contenedores (`supabase start`), es gratuito para el tamaño del proyecto actual y reduce la curva de aprendizaje frente a sistemas paralelos, integrando la validación del Drift y RLS directamente en cada PR.

## 2026-06-15: Autenticación y Cálculos de ETA en Frontend

### Decisión respecto a Componentes Auth (UI):
Se decidió **implementar un formulario de autenticación personalizado** en `Login.jsx` usando directamente el SDK de Supabase Auth (`supabase.auth.signInWithPassword`), rechazando el uso del componente pre-armado `@supabase/auth-ui-react`.
- **Razón:** El diseño visual de Gebo (Dark Slate, gradiente Pink/Magenta, glassmorphism, fuente Outfit) es un pilar fundamental del proyecto, validado en Fases 5-7. Incorporar componentes externos genéricos habría roto la coherencia visual desde la primera interacción del usuario.

### Decisión respecto al Cálculo de ETA en Frontend:
Se decidió utilizar **la fórmula de Haversine + velocidad promedio** calculada directamente en el frontend del cliente (`ClienteApp.jsx`), rechazando temporalmente integraciones con motores de ruteo como OSRM.
- **Razón:** Para el MVP y validación de la demo, la latencia y complejidad operativa de integrar OSRM no estaban justificadas. La fórmula de Haversine (línea recta) permite estimar distancias con bajo margen de error para zonas urbanas, aplicando una constante de velocidad (ej. 25 km/h) para calcular tiempos razonables. Esta constante puede ajustarse fácilmente sin requerir servicios externos, manteniendo la aplicación fluida y autónoma. Se evaluará OSRM u otros proveedores (Google Maps/Mapbox Directions API) para una fase post-MVP.

## 2026-06-15: Anti-Spoofing GPS (Hardening B3)

### Contexto
Se introdujo una validación matemática de saltos GPS imposibles (velocidad implícita > 150 km/h) para detectar choferes usando apps falsificadoras de ubicación (GPS Spoofing).

### Decisión
La detección del salto anómalo (Bouncing/Spoofing) ocurre **exclusivamente a nivel intra-ráfaga** (dentro del mismo payload que envía el dispositivo móvil, comparando la coordenada actual con la anterior en el array en RAM). No se ejecuta un `SELECT` en la base de datos para comparar con la última coordenada del payload de hace 3 segundos. Adicionalmente, las anomalías detectadas son **registradas pasivamente** en una nueva tabla (`anomalias_gps`), pero NO bloquean la inserción de las posiciones originales.

### Razón
1. **Performance Crítico:** Hacer un `SELECT` a la tabla de posiciones en la Edge Function penalizaría la latencia en el *path crítico* de ingesta masiva de GPS (cero I/O en validación de arribo).
2. **Mitigación de Falsos Positivos:** Bloquear posiciones de forma drástica al superar el umbral puede derivar de un error genuino del sensor del teléfono o un salto natural tras perder señal en un túnel, rompiendo la funcionalidad de ETA o asignaciones si se rechaza incorrectamente.
3. **Mejora Futura:** El spoofing "inter-ráfaga" o el baneo automático de choferes queda diferido como una labor en diferido (proceso batch/cron nocturno o de auditoría periódica), fuera del alcance en tiempo real del MVP.
