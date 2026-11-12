# Revisión independiente de arquitectura de despliegue — TimeTrack

**Fecha:** noviembre de 2026  
**Documento revisado:** `docs/architecture-review-2026-11.md`  
**Alcance:** revisión estática del repositorio. No se consultaron archivos `.env` reales ni la configuración efectiva de Portainer, Dokploy o Cloudflare.

## 1. ¿El backend no depende de la red local de la Pi?

**Respuesta corta: con matices.**

### Pruebas

- El cliente REST de 2N construye las peticiones desde `AC_BASE_URL`; no contiene una IP, hostname Docker ni ruta local fija: `backend/src/lib/ac-client.ts:41`, `backend/src/lib/ac-client.ts:134`.
- SignalR usa una URL configurable y añade `/mainhubv3`: `backend/src/services/signalr-listener.ts:291`.
- La configuración global procede de `AC_BASE_URL` y `AC_API_TOKEN`: `backend/src/services/signalr-listener.ts:417`.
- Sin embargo, las conexiones actuales pueden proceder de `company_settings.clocking_modes`, almacenadas en Supabase, no de variables de entorno: `backend/src/services/signalr-listener.ts:407`, `backend/src/services/signalr-listener.ts:426`. Revisar solamente `.env.example` no demuestra qué URL usa producción.
- El backend acepta expresamente direcciones LAN de 2N, incluidas `192.168.x.x`: `backend/src/api/routes/admin.ts:436`, `backend/src/api/routes/admin.ts:446`.
- `.env.example` todavía propone `https://192.168.x.x`: `backend/.env.example:6`.
- n8n se alcanza mediante `N8N_WEBHOOK_BASE_URL`, sin hostname `n8n` fijado en código: `backend/src/lib/n8n.ts:29`, `backend/src/lib/n8n.ts:53`.
- El `Dockerfile` no declara volúmenes ni rutas montadas; solo copia código y dependencias: `backend/Dockerfile:2`, `backend/Dockerfile:12`.

### Riesgos o pasos que faltan

- Consultar en Supabase todas las configuraciones `clocking_modes.twoN.ac_base_url`. Si alguna contiene `192.168.*`, un hostname interno o un certificado privado, Dokploy no podrá conectarse sin VPN/ruta LAN y confianza TLS.
- Comprobar las variables reales de Portainer para confirmar que `AC_BASE_URL` y `N8N_WEBHOOK_BASE_URL` son URLs públicas. Esa configuración no está en el repositorio.
- Probar desde el contenedor de Dokploy REST, negociación SignalR/WebSocket y webhook n8n. Que una URL abra por HTTPS no garantiza que Cloudflare permita correctamente SignalR.
- No hay dependencia de volúmenes visible en el backend, pero el compose real de Portainer no está versionado; no se puede descartar un montaje añadido allí.
- La afirmación de P2 debería cambiarse por: «el código no requiere la LAN de la Pi; pendiente de verificar las URLs efectivas guardadas en Supabase y Portainer».

## 2. ¿Es seguro ejecutar dos instancias?

**Respuesta corta: incorrecto. No es seguro con el diseño actual.**

### Pruebas

- Cada proceso inicia su propio listener SignalR al arrancar: `backend/src/index.ts:102`, `backend/src/index.ts:108`.
- Las conexiones se coordinan mediante un `Map` únicamente en memoria del proceso: `backend/src/services/signalr-listener.ts:289`. No hay elección de líder ni bloqueo distribuido.
- Cada instancia se suscribe a `accesslog`: `backend/src/services/signalr-listener.ts:386`.
- Existe deduplicación por usuario, timestamp y `source='signalr'`: `backend/src/services/signalr-listener.ts:229`.
- Esa deduplicación es un `SELECT` seguido de un `INSERT`: `backend/src/services/signalr-listener.ts:229`, `backend/src/services/signalr-listener.ts:246`. Dos instancias pueden observar simultáneamente cero filas e insertar las dos. No aparece en el repositorio una migración con restricción única que cierre esa carrera.
- Si 2N no suministra dirección, ambas instancias infieren `in/out` leyendo el último fichaje antes de insertar: `backend/src/services/signalr-listener.ts:208`, `backend/src/services/signalr-listener.ts:214`. La carrera puede producir dos filas con la misma dirección.
- Cada proceso ejecuta el comprobador de caída cada 60 segundos y mantiene `alertSent` en memoria: `backend/src/services/signalr-listener.ts:21`, `backend/src/services/signalr-listener.ts:72`, `backend/src/services/signalr-listener.ts:95`. Dos instancias pueden enviar dos alertas de caída y dos de recuperación.
- Cada proceso inicia un `setInterval` de cinco minutos para `notification_outbox`: `backend/src/lib/notify.ts:9`, `backend/src/lib/notify.ts:120`.
- El outbox hace `SELECT` y después marca la fila, sin reclamación atómica ni condición `sent_at IS NULL` en el `UPDATE`: `backend/src/lib/notify.ts:99`, `backend/src/lib/notify.ts:113`. Dos instancias pueden enviar la misma notificación.
- Los crons de reintento, reconciliación y retención no son internos: son endpoints invocados por n8n: `backend/src/services/sync-queue.ts:4`, `backend/src/api/routes/webhooks.ts:136`, `backend/src/api/routes/webhooks.ts:197`.
- `sync-retry` tampoco reclama filas de forma atómica: primero selecciona `failed` y después actualiza a `processing`: `backend/src/api/routes/webhooks.ts:157`, `backend/src/api/routes/webhooks.ts:173`. Dos invocaciones concurrentes podrían reenviar la misma operación.

### Riesgos o pasos que faltan

- «Nunca dos backends» es actualmente un requisito correcto, aunque la propuesta debería mencionar que la deduplicación existente reduce duplicados secuenciales, pero no evita la carrera.
- El corte debe impedir solapamientos durante reinicios automáticos, rollback y despliegues rolling de Dokploy. Configurar una sola réplica y estrategia `stop-first`, no `start-first`.
- Antes de permitir escalado horizontal hacen falta:
  - Una clave idempotente estable del evento 2N y una restricción única en BD.
  - Inserción atómica mediante `INSERT ... ON CONFLICT`, en vez de `SELECT` seguido de `INSERT`.
  - Elección de líder o un listener SignalR separado.
  - Reclamación atómica de outbox y `sync_queue`, por ejemplo mediante una función SQL con `FOR UPDATE SKIP LOCKED`.
  - Idempotencia en los workflows n8n y en las operaciones 2N.

## 3. ¿Sirve el Dockerfile en x86_64?

**Respuesta corta: correcto, con matices.**

### Pruebas

- No contiene `--platform=linux/arm64`, binarios descargados por arquitectura ni compilaciones específicas: `backend/Dockerfile:1`, `backend/Dockerfile:8`.
- Las dependencias se instalan con `npm ci` en la arquitectura del constructor: `backend/Dockerfile:3`, `backend/Dockerfile:10`.
- El proyecto usa dependencias Node/TypeScript normales y no declara módulos nativos específicos de ARM: `backend/package.json:12`.
- La referencia a arm64 está en la documentación del proceso actual, no en el Dockerfile: `CLAUDE.md:567`.

### Riesgos o pasos que faltan

- Dokploy debe usar `backend/` como contexto de construcción. El Dockerfile hace `COPY package*.json ./`; con la raíz del repositorio como contexto copiaría los `package*.json` del frontend: `backend/Dockerfile:2`.
- Verificar que el digest fijado de `node:26-alpine` incluya `linux/amd64`. El documento lo afirma, pero el manifiesto remoto no se puede verificar solo desde el repositorio.
- Node 26 no coincide con la documentación que declara Node 20 LTS. No bloquea x86_64, pero debe decidirse y documentarse la versión soportada.
- Ejecutar build y healthcheck en Dokploy antes del corte.

## 4. ¿Qué variables de entorno necesita el backend?

**Respuesta corta: incorrecto. `backend/.env.example` está incompleto y contiene variables sin uso.**

### Pruebas

| Variable | Uso | Situación |
|---|---|---|
| `SUPABASE_URL` | Clientes Supabase: `backend/src/lib/supabase.ts:15` | Documentada; obligatoria |
| `SUPABASE_ANON_KEY` | Cliente público: `backend/src/lib/supabase.ts:17` | Documentada; obligatoria para rutas que usan el cliente público |
| `SUPABASE_SERVICE_ROLE_KEY` | Cliente administrador: `backend/src/lib/supabase.ts:26` | Documentada; obligatoria |
| `AC_BASE_URL` | Cliente REST global y fallback SignalR: `backend/src/lib/ac-client.ts:134`, `backend/src/services/signalr-listener.ts:417` | Documentada; necesaria para compatibilidad global y reconciliación actual |
| `AC_API_TOKEN` | Igual que la anterior | Documentada |
| `N8N_WEBHOOK_BASE_URL` | Webhooks salientes: `backend/src/lib/n8n.ts:29` | Documentada; necesaria para integraciones |
| `N8N_WEBHOOK_SECRET` | Webhooks salientes y entrantes: `backend/src/lib/n8n.ts:30`, `backend/src/api/routes/webhooks.ts:19` | Documentada; necesaria |
| `NODE_RED_SECRET` | Autenticación del webhook Node-RED: `backend/src/api/routes/webhooks.ts:351` | Documentada; opcional si no se usa ese modo |
| `SETTINGS_ENCRYPTION_KEY` | Cifrado/descifrado AES-GCM: `backend/src/lib/crypto-settings.ts:6` | Documentada; obligatoria en producción si hay valores cifrados o secretos en cola |
| `PORT` | Puerto HTTP: `backend/src/index.ts:100` | Documentada; tiene valor por defecto |
| `NODE_ENV` | Logging, documentación y errores: `backend/src/index.ts:44`, `backend/src/index.ts:80` | Documentada; debe ser `production` |
| `FRONTEND_URL` | CORS: `backend/src/index.ts:29` | **Falta en `.env.example`**; necesaria en producción |
| `N8N_HELP_WEBHOOK_URL` | Bot de ayuda: `backend/src/api/routes/help.ts:115` | **Falta en `.env.example`**; opcional según funcionalidad |

`.env.example` documenta `AC_USERNAME` y `AC_PASSWORD` en `backend/.env.example:9`, pero no aparecen usados en `backend/src`. El código usa token Bearer.

### Riesgos o pasos que faltan

- Añadir `FRONTEND_URL=https://timetrack.rabadanhouse.space` en Dokploy; sin ella, el navegador no pasará CORS.
- Añadir `N8N_HELP_WEBHOOK_URL` si el bot de ayuda debe funcionar.
- Mantener exactamente la misma `SETTINGS_ENCRYPTION_KEY`. Cambiarla impediría descifrar tokens 2N y secretos ya almacenados: `backend/src/lib/crypto-settings.ts:23`.
- No basta con copiar las variables: hay configuración 2N cifrada en Supabase que depende de esa clave.
- Quitar o marcar como legado `AC_USERNAME` y `AC_PASSWORD`.
- No se inspeccionó ningún `.env` real ni se pueden confirmar los valores definidos en Portainer.

## 5. ¿Faltan pasos o riesgos en P2?

**Respuesta corta: con matices.**

### Pruebas

- El orden propuesto «parar Pi → arrancar Dokploy» evita el solapamiento del listener, que se inicia con el servidor: `backend/src/index.ts:102`, `backend/src/index.ts:109`.
- `/health` devuelve estado SignalR, pero `status` sigue siendo `ok` aunque SignalR esté desconectado: `backend/src/index.ts:49`.
- El healthcheck Docker solo comprueba que `/health` responda: `backend/Dockerfile:16`. No garantiza acceso a Supabase, n8n ni 2N.
- La infraestructura actual tiene dependencias y rutas en un compose que solo existe en Portainer: `docs/signalr-resilience.md:73`, `CLAUDE.md:568`.

### Riesgos o pasos que faltan

1. Preparar Dokploy con una sola réplica, estrategia `stop-first` y autoescalado deshabilitado.
2. Verificar antes del corte, desde el nuevo contenedor, Supabase, REST 2N, negociación y suscripción SignalR, y webhooks n8n.
3. Confirmar las URLs 2N guardadas en `company_settings`, no solo las variables del contenedor.
4. Copiar `FRONTEND_URL`, `N8N_HELP_WEBHOOK_URL` si aplica y, especialmente, la misma `SETTINGS_ENCRYPTION_KEY`.
5. Configurar el contexto de build como `backend/`.
6. Crear el túnel/ingress del Debian antes del corte, pero sin publicar simultáneamente dos rutas activas ambiguas.
7. Definir TTL, cambio de ruta y validación de `api.rabadanhouse.space`. La configuración real de Cloudflare no está en el repositorio.
8. Drenar o aceptar el corte de conexiones SSE durante la conmutación.
9. Tras arrancar, exigir que `/health.signalr[]` muestre `connected:true`; un HTTP 200 no es suficiente.
10. Hacer un fichaje físico controlado y verificar una sola fila en `access_logs`.
11. Probar un webhook n8n de ida y callback de vuelta.
12. Para rollback, detener completamente Dokploy antes de reactivar la Pi. Debe evitarse que Portainer reinicie automáticamente el contenedor antiguo.
13. No mover `cloudflared` de la Pi sin separar antes sus rutas de n8n y del backend. Si el túnel actual sirve ambos hostnames, retirarlo entero podría cortar n8n.
14. Añadir manejo de `SIGTERM` para detener limpiamente SignalR. No aparece un cierre explícito en `index.ts`, lo que aumenta el riesgo de solapamiento durante un redeploy.

## 6. ¿Es razonable P4?

**Respuesta corta: con matices.**

### Pruebas

- Actualmente la alerta depende de n8n: `backend/src/services/signalr-listener.ts:72`, `backend/src/services/signalr-listener.ts:80`.
- El envío de recuperación usa el mismo canal: `backend/src/services/signalr-listener.ts:46`.
- Si el webhook falla, solo se registra el error; no se persiste ni reintenta la alerta: `backend/src/services/signalr-listener.ts:86`.
- La documentación reconoce que el aviso depende de un workflow y de un secreto compartido: `docs/signalr-resilience.md:30`, `docs/signalr-resilience.md:65`.
- P4 contradice la regla vigente de centralizar lo asíncrono en n8n: `CLAUDE.md:194`.

### Riesgos o pasos que faltan

- Es razonable eliminar n8n de una alerta operativa crítica: la alerta debe tener menos dependencias que el sistema que vigila.
- No conviene convertir Telegram en lógica dispersa. Debería existir un módulo de notificación operativa con timeout, mensajes acotados, deduplicación persistente y una interfaz que permita cambiar de proveedor.
- Introduciría dos secretos nuevos en el backend, previsiblemente `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`, además de dependencia directa del proveedor.
- El estado `alertSent` seguiría siendo por proceso. Antes de permitir dos réplicas, la deduplicación debe persistirse.
- Una alternativa más robusta es monitorización externa que consulte `/health` y alerte independientemente tanto del backend como de n8n. Para ello `/health` debería reflejar degradación con un estado adecuado.
- Si se adopta P4, corresponde un ADR que limite la excepción a alertas operativas críticas; n8n puede seguir siendo el canal de notificaciones de negocio.

## 7. ¿Es correcto el diagnóstico de la sección 2?

**Respuesta corta: con matices.**

### Pruebas

- El uso actual de imagen `:latest`, ARM64 y Portainer está documentado: `CLAUDE.md:567`, `HANDOFF.md:18`.
- La incidencia de Portainer reutilizando una imagen antigua también está documentada: `docs/signalr-resilience.md:104`.
- El acoplamiento de arranque entre n8n, backend y cloudflared está documentado: `docs/signalr-resilience.md:73`.
- La ausencia de versión en `/health` es real: `backend/src/index.ts:49`.
- La alerta actual carece de cola y reintento persistente: `backend/src/services/signalr-listener.ts:80`, `backend/src/services/signalr-listener.ts:86`.

### No verificable desde el repositorio

- Los «2 de 3 despliegues».
- Los IDs concretos de imagen.
- El error 1033 observado.
- La configuración efectiva del stack de Portainer.
- La configuración y publicación real del workflow n8n.
- Las credenciales de Telegram.
- Los túneles, ingress, DNS y políticas de Cloudflare.
- Que Debian y Pi tengan actualmente las rutas y conectividad descritas.

### Puntos de fallo relevantes que faltan

- `/health` produce un falso positivo operativo cuando SignalR está caído.
- No valida al arrancar que estén presentes todas las variables críticas; varios módulos aceptan cadenas vacías y fallarán más tarde.
- `SETTINGS_ENCRYPTION_KEY` es parte del estado operativo de producción: perderla o cambiarla rompe la configuración cifrada.
- La deduplicación de fichajes SignalR no es atómica.
- `notification_outbox` no es seguro con dos instancias.
- `sync-retry` tampoco reclama trabajo atómicamente.
- No hay cierre explícito de SignalR ante `SIGTERM`.
- La configuración 2N efectiva reside parcialmente en Supabase, no solo en Portainer.
- El compose real no está versionado, por lo que tampoco están auditadas redes, políticas de reinicio, healthchecks, montajes ni dependencias.
- La reconciliación usa el `acClient` global basado en variables de entorno: `backend/src/api/routes/webhooks.ts:218`. Esto merece revisión en un sistema con configuración 2N por empresa.
- La cola de notificaciones marca `sent_at` antes de saber si el webhook funcionó: `backend/src/lib/notify.ts:113`. Como `triggerWorkflow` de notificación absorbe errores, una notificación puede quedar marcada como enviada aunque no lo haya sido: `backend/src/lib/n8n.ts:109`.

## Cambios priorizados en la propuesta

1. Convertir «nunca dos backends» en requisito técnico de despliegue: una réplica, `stop-first`, sin solapamiento rolling y rollback con parada previa.
2. Verificar las URLs 2N efectivas de todas las empresas en Supabase; no afirmar todavía que no existe dependencia LAN.
3. Completar el inventario de entorno con `FRONTEND_URL` y `N8N_HELP_WEBHOOK_URL`; conservar exactamente `SETTINGS_ENCRYPTION_KEY` y retirar o marcar `AC_USERNAME` y `AC_PASSWORD` como legado.
4. Añadir al plan una prueba previa desde Dokploy de Supabase, REST 2N, SignalR/WebSocket y n8n.
5. Configurar explícitamente `backend/` como contexto de construcción.
6. Separar la ruta Cloudflare del backend sin detener accidentalmente el túnel que sirve n8n; documentar ingress, rollback y TTL.
7. Hacer que `/health` exponga versión y un estado degradado verificable cuando SignalR no esté conectado.
8. Añadir idempotencia en BD para eventos 2N y reclamación atómica de `notification_outbox` y `sync_queue` antes de contemplar alta disponibilidad.
9. Incorporar cierre limpio en `SIGTERM`.
10. Aceptar P4 solo como excepción documentada para alertas operativas, preferiblemente complementada por monitorización externa independiente.
