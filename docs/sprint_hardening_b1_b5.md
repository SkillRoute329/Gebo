# Documentación Consolidada: Sprint Hardening Competitivo (B1-B5)

Este documento consolida las mejoras de seguridad, robustez y experiencia de usuario implementadas durante el sprint de Hardening Competitivo, cerrando la brecha de calidad entre el MVP base y un estándar industrial realista (inspirado en líderes del sector como Uber, Lyft).

## Tabla Resumen de Implementación

| Bloque | Feature | Tablas/columnas nuevas | Políticas RLS nuevas | Tests agregados | Decisiones documentadas |
|---|---|---|---|---|---|
| **B1** | Sistema SOS (Fricción Cero) | Tabla `alertas_emergencia` | `is_user_in_viaje_or_admin` (UPDATE/SELECT/INSERT) | `test_rls.py` (Tests 8, 9, 10) | Mapeo riguroso de `auth.uid()` a PK de negocio en Políticas RLS y RPCs. |
| **B2** | Transparencia Tarifa/Multa | Ninguna | Ninguna | (Pruebas manuales UI) | Exposición explícita de recargos antes de confirmar viaje para evitar churn. |
| **B3** | Anti-Spoofing GPS | Tabla `anomalias_gps` | `jwt.role = 'admin'` (SELECT) | `test_rls.py` (Tests 11, 12) | Lógica 100% paralela (Edge Function / Python). Umbral=150km/h como constante. |
| **B4** | Alerta ETA Proactiva | Ninguna | Ninguna | (Pruebas manuales UI) | Estado efímero (`prevEta`) gestionado 100% en Frontend con WebSockets (Realtime). |
| **B5** | Cancelación Simétrica | `viajes.estado` (`cancelado_cliente`, `cancelado_chofer`), `viajes.penalizacion_cancelacion`, `viajes.asignado_en`. `viajes_ofertas_rechazadas.penalizado_por_demora` | RPCs con `SECURITY DEFINER`. RLS explícito en `viajes_ofertas_rechazadas`. | `test_asignacion_drift.py` (Cancelación) y `test_rls.py` (Tests 13, 14) | Constante `PENALIZACION_CANCELACION_TARDIA_UYU` documentada. Ventanas de gracia (1 min chofer, 2 min cliente). |

---

## Confirmaciones Exactas de la Suite de QA

Se ha corrido y superado la suite completa de aseguramiento de calidad (QA):

1. **`test_rls.py`**: **14/14 tests en verde**. Se verificó explícitamente el acceso a viajes, clientes, choferes, posiciones, alertas de emergencia, anomalías de GPS y llamadas a RPC de cancelación con identificadores cruzados.
2. **`simulacion_100_viajes.py`**: **En verde**. Imprimió `REGRESIÓN EXITOSA: El algoritmo de Asignación y Penalización (Fase 2) se mantuvo 100% idéntico. No hay alteraciones en Fases 4-9.` confirmando estabilidad total.
3. **`test_asignacion_drift.py`**: **100/100 en verde**, incluyendo un nuevo bloque específico (`CANCELACION DRIFT TEST PASS`) que valida que la lógica de cancelación y multa produce las mismas penalizaciones en Python y PostgreSQL PL/pgSQL ante distintos deltas de tiempo.

## Actualización de Documentación Clave
- **`inventario_rls.md`**: Actualizado. Contiene `alertas_emergencia`, `anomalias_gps`, y `viajes_ofertas_rechazadas`.
- **`viajes_ofertas_rechazadas`**: Esta tabla **ya existía** (creada en la migración `20260617_ofertas_y_reasignacion.sql` del Sprint A). Sin embargo, *no tenía política RLS explícita aplicada*. Durante B5, **se habilitó RLS** y se aplicó la política `"Admin puede leer ofertas rechazadas"`. Quedó documentada en el inventario.

---

## Deuda Técnica Abierta (Reporte Honesto)

Durante el sprint se identificaron los siguientes puntos de deuda técnica que no bloquean la demo, pero deberán abordarse en un futuro paso a producción real:

1. **Textos Hardcodeados en UI vs. Constantes Backend**: El valor de la multa ($30 UYU) y el tiempo (2 minutos) están declarados como constantes nombradas (`PENALIZACION_CANCELACION_TARDIA_UYU`) en Python y SQL, pero los textos de los Modales en React en `ClienteApp.jsx` y `ChoferApp.jsx` tienen el texto "30 UYU" y "2 minutos" *hardcodeados*. Si el negocio cambia la constante en la DB, el frontend dirá lo viejo hasta que se re-despliegue.
2. **Performance de la Política SOS RLS**: La función `is_user_in_viaje_or_admin` se ejecuta por cada fila al acceder a `alertas_emergencia`, y realiza un `JOIN` entre `viajes`, `clientes` y `choferes`. Si la tabla de alertas crece exponencialmente, esto causará un barrido secuencial pesado. Eventualmente requerirá una caché o desnormalizar el `usuario_id` del cliente y chofer directamente en la tabla de alertas.
3. **Acciones Anti-Spoofing Pasivas**: Actualmente registramos a `anomalias_gps`, pero no hay ninguna tarea recurrente (`cron`) que banee al chofer o le impida recibir viajes. El fraude se detecta pero no se detiene automáticamente.
4. **Impacto Vacío de `penalizado_por_demora`**: Agregamos el flag booleano a `viajes_ofertas_rechazadas` para asentar que un chofer canceló tarde, pero el actual algoritmo de asignación (Python/SQL) aún no utiliza esta métrica para rebajar su *Score* en futuras búsquedas.
5. **Race Condition de WebSockets**: Si un viaje pasa a `asignado` e inmediatamente (en milisegundos) se corta la conexión del cliente, podría no recibir el estado completo con el `asignado_en`, provocando que el frontend no pueda calcular el tiempo localmente hasta hacer un *hard-refresh* del viaje.
