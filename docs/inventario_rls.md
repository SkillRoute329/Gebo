# Inventario de Políticas RLS (Row Level Security)

Este documento centraliza el inventario de las políticas de seguridad (RLS) habilitadas en PostgreSQL. Cada política garantiza el acceso a datos basado en los claims del JWT (Identity & Access Management).

## Tabla de Políticas Activas

| Tabla | Operación | Política / Nombre | Rol Autorizado | Criterio (USING) | Validación de QA |
|---|---|---|---|---|---|
| `choferes` | SELECT | `Choferes ven su propio perfil` | Chofer (Dueño) | `usuario_id = auth.uid()` | `test_rls.py (TEST 1)` |
| `choferes` | SELECT | `Admin puede leer choferes` | Administrador | `jwt.role = 'admin'` | `test_rls.py (TEST 2)` |
| `choferes` | SELECT | `Clientes ven datos del chofer activo` | Cliente (Pasajero) | Viaje activo vinculado al chofer (`es_chofer_de_viaje_activo_del_cliente`) | `test_rls.py (TEST 6, 7)` |
| `clientes` | SELECT | `Clientes ven su propio perfil` | Cliente (Dueño) | `usuario_id = auth.uid()` | `test_rls.py (Implícito)` |
| `clientes` | SELECT | `Choferes ven clientes de sus viajes` | Chofer Asignado | Chofer tiene un viaje asignado a ese cliente | `test_rls.py (TEST 1)` |
| `clientes` | SELECT | `Admin puede leer clientes` | Administrador | `jwt.role = 'admin'` | `test_rls.py (TEST 4)` |
| `posiciones` | SELECT | `Admin puede leer posiciones` | Administrador | `jwt.role = 'admin'` | `test_rls.py (TEST 5)` |
| `posiciones` | SELECT | `Clientes ven posicion de su chofer asignado` | Cliente (Pasajero) | Cliente tiene viaje `en_camino`/`en_curso` con ese chofer | Funcional / Edge Function |
| `posiciones` | INSERT | *Sin RLS directa (Edge)* | Edge Function (`service_role`) | Inserta por el chofer verificando sub claim | `test_edge.py` |
| `vehiculos` | SELECT | `Choferes ven su vehiculo` | Chofer (Dueño) | `chofer_id` = Perfil del auth.uid() | `test_rls.py (TEST 1)` |
| `vehiculos` | SELECT | `Admin puede leer vehiculos` | Administrador | `jwt.role = 'admin'` | `test_rls.py (Implícito)` |
| `vehiculos` | UPDATE | `Admin puede actualizar vehiculos` | Administrador | `jwt.role = 'admin'` | `test_rls.py (TEST 3)` |
| `vehiculos` | INSERT | `Admin puede insertar vehiculos` | Administrador | `jwt.role = 'admin'` | `test_rls.py (Implícito)` |
| `viajes` | SELECT | `Clientes ven sus viajes` | Cliente (Creador) | `cliente_id` vinculado al auth.uid() | `test_rls.py (Implícito)` |
| `viajes` | SELECT | `Choferes ven sus viajes asignados` | Chofer (Asignado) | Vehículo asignado vinculado al auth.uid() (`get_viajes_asignados_chofer`) | `test_rls.py (TEST 1)` |
| `viajes` | SELECT | `Admin puede leer viajes` | Administrador | `jwt.role = 'admin'` | `test_rls.py (TEST 2)` |
| `viajes` | UPDATE | `Admin puede actualizar viajes` | Administrador | `jwt.role = 'admin'` | `test_rls.py (Implícito)` |
| `viajes` | INSERT | `Admin puede insertar viajes` | Administrador | `jwt.role = 'admin'` | `test_rls.py (Implícito)` |
| `alertas_emergencia` | INSERT | `Permitir insertar alerta a participantes` | Participantes / Admin | `is_user_in_viaje_or_admin` | `test_rls.py (TEST 8, 9, 10)` |
| `alertas_emergencia` | SELECT | `Permitir leer alertas a participantes y admins` | Participantes / Admin | `is_user_in_viaje_or_admin` | `test_rls.py (TEST 8, 9, 10)` |
| `alertas_emergencia` | UPDATE | `Permitir actualizar alertas` | Participantes / Admin | `is_user_in_viaje_or_admin` | `test_rls.py (TEST 8, 9, 10)` |
| `anomalias_gps` | SELECT | `Permitir leer anomalias_gps a admins` | Administrador | `jwt.role = 'admin'` | `test_rls.py (TEST 11, 12)` |
| `viajes_ofertas_rechazadas` | SELECT | `Admin puede leer ofertas rechazadas` | Administrador | `jwt.role = 'admin'` | `(Implícito)` |

---
**Nota de Diseño (GDPR):** La tabla `audit_logs` no registra eventos `SELECT` por motivos de cumplimiento estricto GDPR y limitación nativa de `pgAudit` en entornos compartidos, delegando el track de lectura crítica (como la foto del conductor) a los logs de la puerta de enlace (API Gateway).
