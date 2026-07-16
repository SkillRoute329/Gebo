# Requisitos Recomendados para VPS Self-Hosted (Gebo)

## Arquitectura y Componentes
El entorno en producción ejecutará Docker Compose y contendrá los siguientes servicios empaquetados por Supabase:
- **PostgreSQL 15+ con PostGIS** (Carga principal: escrituras geolocalizadas frecuentes de `sync-gps` y transacciones RLS complejas).
- **GoTrue** (Autenticación JWT).
- **PostgREST** (API de Datos directa a PostgreSQL).
- **Realtime** (Elixir/Phoenix: Notificaciones WebSockets bidireccionales de choferes y clientes).
- **Deno / Edge Runtime** (Procesamiento del endpoint `sync-gps` y lógica pesada).
- **Storage / S3 Compatible Minio** (Almacenamiento de fotos de perfil).

## Especificaciones Mínimas (Arranque de Producción)
Para el tráfico proyectado real en los primeros meses (decenas de miles de usuarios diarios, asíncrono, no equivalente al pico de QA):
- **CPU**: 2 vCPUs dedicadas (PostgreSQL en un thread, Realtime/Deno en otro).
- **RAM**: 4 GB a 8 GB (PostgreSQL necesitará ~2GB mínimo para caché efectiva, Deno y Realtime consumen memoria moderada por cada WebSocket).
- **Disco**: 50 GB SSD NVMe (Velocidad crítica para PostGIS y logs del audit trail).
- *Este es el perfil inicial recomendado y alineado al principio de "costo mínimo". Es fácilmente alcanzable con instancias como Hetzner CX-tier económico o DO Droplets de entrada.*

## Especificaciones de Test de Carga (Laboratorio QA)
Para soportar explícitamente **100 viajes por segundo simultáneos** (como se simuló en los tests de regresión):

## Especificaciones Recomendadas (Escalamiento de Producción)
Para manejar 100+ viajes/segundo (El volumen testeado en el laboratorio local):
- **CPU**: 4 a 8 vCPUs dedicadas. PostgreSQL paraleliza lecturas espaciales eficientemente con PostGIS.
- **RAM**: 16 GB a 32 GB. Permite elevar `shared_buffers` para el índice espacial de `posiciones`.
- **Disco**: 100 GB+ SSD NVMe con esquema de volúmenes replicado/RAID 10 para evitar cuellos de botella de IOPS.

## Costos de Referencia
- **DigitalOcean / Hetzner**: ~$20-$40 USD mensuales (Droplet o Cloud server en el nivel medio).
- **AWS EC2 (ej. t3.large o c6a.large)**: ~$60-$85 USD mensuales (sin contar transferencia).

## Nota Operativa
Al usar un VPS Self-Hosted, es **obligatorio** configurar un bucket de backups externos periódicos (AWS S3, Backblaze B2, R2) para `pg_dump` automáticos cada 24 horas (y logs WAL). No se debe depender exclusivamente del snapshot del host del VPS.
