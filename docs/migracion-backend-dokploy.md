# Plan: migrar el backend de la Raspberry Pi a Dokploy

Estado: **pendiente de ejecutar**. Origen: `docs/architecture-review-2026-11.md` (propuesta P2) y la revisión independiente `docs/architecture-review-codex.md`.

Objetivo: que el backend se despliegue igual que el frontend (push a `main` → Dokploy construye y despliega), eliminando el build en el Mac, Docker Hub, `:latest` y la verificación manual en Portainer.

| Antes | Después |
|---|---|
| Backend en la Pi (Portainer, stack `n8n`, arm64) | Backend en Dokploy (Debian 12, x86_64) |
| `api.rabadanhouse.space` → Cloudflare Tunnel de la Pi | `api.rabadanhouse.space` → Dokploy (Debian) |
| Build manual en el Mac + push a Docker Hub | Build automático en Dokploy desde Git |

La Pi conserva n8n, su Postgres, cloudflared (para `n8n.rabadanhouse.space`) y el contenedor de backup. Supabase sigue en la nube.

---

## Datos ya verificados

- **Sin dependencia de la red local de la Pi.**
  - La URL del 2N guardada en Supabase (`company_settings.clocking_modes.twoN.ac_base_url`) es `https://access.rabadanhouse.space/`, pública.
  - n8n se alcanza por `N8N_WEBHOOK_BASE_URL`, también pública.
- **Los workflows de n8n llaman al backend por su URL pública** (`https://api.rabadanhouse.space/webhooks/n8n/...`), no por `backend:3000`. Revisados los 10 workflows TimeTrack (paso 0.3, 2026-11-12).
- **`backend/Dockerfile` vale para x86_64**: la imagen base `node:26-alpine` (fijada por digest) es multiarquitectura e incluye `amd64`.
- **El backend ya está preparado para el corte** (commit `5404132`):
  - cierre limpio en `SIGTERM`;
  - índice único `access_logs_signalr_dedup`, que impide fichajes 2N duplicados aunque coincidan dos procesos;
  - outbox con reclamación atómica;
  - `/health` con `version` y `status: degraded`.
- **El frontend en Dokploy** (app `timetrack-4uibyn`) tiene el dominio `timetrack.rabadanhouse.space` en HTTP, puerto 80 y sin certificado: el TLS lo pone Cloudflare delante.

---

## Riesgo principal: dos backends a la vez

Cada backend abre su propia conexión SignalR con el 2N al arrancar. Con dos backends a la vez:

- **Fichajes:** el índice único evita ya filas duplicadas (de 2026-06-01 en adelante).
- **Alertas:** las de 2N caído o recuperado y los crons podrían llegar dos veces.
- **Dirección de entrada o salida:** la inferencia de `in`/`out`, cuando el 2N no la manda, podría competir entre los dos.

**Regla:** nunca dos backends con SignalR activo a la vez. Para poder probar el nuevo antes del corte se usa la variable `SIGNALR_DISABLED=true` (paso 1.1).

---

## Fase 0 — Comprobaciones previas (sin impacto)

0.1. **Cómo llega Internet al Dokploy del Debian.** El frontend `timetrack.rabadanhouse.space` llega al Debian de alguna forma: un Cloudflare Tunnel en el Debian o un registro DNS con proxy de Cloudflare hacia la IP de casa. El backend usará **el mismo mecanismo**. Mirarlo en Cloudflare Zero Trust → *Networks → Tunnels* (hostnames públicos de cada túnel) o en *DNS*.

0.2. **Inventario de variables del servicio `backend` en Portainer** (Stacks → `n8n`). Anotar los **nombres** y guardar los valores en Contraseñas, nunca en el chat:
- **Obligatorias:**
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
  - `SETTINGS_ENCRYPTION_KEY`: **exactamente la misma**. Sin ella no se pueden descifrar los tokens 2N guardados en Supabase;
  - `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET`: el mismo valor que tiene n8n;
  - `FRONTEND_URL=https://timetrack.rabadanhouse.space`: sin ella falla el CORS del navegador;
  - `NODE_ENV=production`.
- **Según uso:** `AC_BASE_URL` y `AC_API_TOKEN` (las usa la reconciliación nocturna), `N8N_HELP_WEBHOOK_URL` (bot de ayuda) y `NODE_RED_SECRET`.
- **Sobrante:** `PORT`. Tiene 3000 por defecto.

0.3. ✅ **Hecho (2026-11-12).** Revisados los 10 workflows TimeTrack de n8n. Todos llaman al backend por `https://api.rabadanhouse.space` y al 2N por `https://access.rabadanhouse.space`. El Help Bot usa una IP de Tailscale (`100.115.151.21`) desde n8n, que sigue en la Pi: no le afecta la migración.

0.4. **Recursos del Debian:** que tenga RAM y disco suficientes junto a Supabase self-hosted. El backend usa unos 150–250 MB.

---

## Fase 1 — Preparar la app en Dokploy (sin tráfico)

1.1. ✅ **Hecho (2026-11-12).** `SIGNALR_DISABLED=true` hace que el backend no conecte con el 2N, ni al arrancar ni cuando el admin guarda los ajustes (`restartCompanyConnection`). Probado en local. No hace falta redesplegar la Pi: allí la variable no existe y SignalR sigue activo.

1.2. **Crear la app** en Dokploy, en el mismo proyecto que el frontend: *Create Service → Application*, nombre `timetrack-backend`.
- **Source:** GitHub, repo `carlosrabadan059-cpu/Timetrack`, rama `main`.
- **Build type:** Dockerfile.
- **Build Path:** `/backend`, con **Dockerfile** `Dockerfile` y **Docker Context Path** `.`. El contexto debe ser `backend/`: con la raíz copiaría el `package.json` del frontend.
- **Watch Paths:** `backend/**`, para que solo se redespliegue cuando cambie el backend.
- **Auto Deploy:** activado.

1.3. **Swarm (Advanced):**
- **Replicas:** `1`.
- **Update Config:** `{"Parallelism": 1, "Order": "stop-first"}`. Así el contenedor viejo se para antes de arrancar el nuevo y nunca hay dos.
- **Stop Grace Period:** `10s`. El backend cierra en menos de 8 s.

1.4. **Versión en `/health`.** El Dockerfile acepta `ARG GIT_SHA`. Comprobar si Dokploy expone el commit como build arg o variable. Si no, `version` saldrá `unknown` y el commit desplegado se ve en la pestaña *Deployments* de Dokploy. **Verificar al hacer el primer build.**

1.5. **Variables de entorno:** pegar las del paso 0.2 en *Environment*, más `SIGNALR_DISABLED=true`.

1.6. **Dominio de prueba** (no el definitivo): por ejemplo `api-new.rabadanhouse.space`, puerto `3000`, HTTPS desactivado si Cloudflare pone el TLS, igual que el frontend. Publicarlo con el mismo mecanismo que el frontend (paso 0.1).

1.7. **Deploy.** Comprobar en los logs:
- `[server] Running on http://localhost:3000`
- `SUPABASE_* present: true`
- que no aparece `[SignalR] ... Conectado`, porque está deshabilitado.

---

## Fase 2 — Pruebas antes del corte (con la Pi aún en servicio)

2.1. `curl -s https://api-new.rabadanhouse.space/health` debe devolver `status: ok`, `signalr: []` y la `version` esperada (o `unknown`, ver 1.4).

2.2. **Supabase y autenticación.** Llamar a un endpoint protegido con un token real: lo más fácil es abrir el frontend en local (`npm run dev`) con `VITE_API_URL` apuntando a `api-new`. O pedir a Claude una prueba con `curl` y un token de la cuenta de demo.

2.3. **Acceso a 2N por REST desde el Debian**, desde la consola del contenedor en Dokploy:
```sh
wget -qO- --header="Authorization: Bearer <token>" https://access.rabadanhouse.space/api/v3/... 
```
Lo importante es comprobar que no da 502 ni error de TLS. El token está en Contraseñas.

2.4. **n8n:** desde la misma consola, `wget -qO- https://n8n.rabadanhouse.space/healthz` debe responder.

2.5. **SignalR** (opcional, en una ventana sin fichajes): parar el backend de la Pi y arrancar el nuevo con `SIGNALR_DISABLED=false` unos minutos. `/health` debe mostrar `connected: true`. Después volver al estado anterior. Si se prefiere, esta prueba se hace directamente en la Fase 3.

---

## Fase 3 — Corte (ventana sin fichajes, p. ej. por la noche)

Se puede volver atrás en cualquier momento (Fase 4).

3.1. **Parar el backend de la Pi:** Portainer → Containers → `n8n-backend-1` → **Stop**. **No borrarlo.**
   - Para que Portainer no lo vuelva a levantar al actualizar el stack, cambiar en el compose el servicio `backend` a `deploy: replicas: 0`, o comentarlo. Si `cloudflared` tiene `depends_on: backend`, quitar esa dependencia primero, o el túnel no arrancará.

3.2. **Activar SignalR en Dokploy:** quitar `SIGNALR_DISABLED`, o ponerlo a `false`, y redesplegar. `/health` en `api-new` debe mostrar `signalr[].connected: true`.

3.3. **Cambiar el dominio definitivo:**
   - En Dokploy, añadir el dominio `api.rabadanhouse.space` (puerto 3000) a la app.
   - En Cloudflare, apuntar `api.rabadanhouse.space` al Debian con el mismo mecanismo que el frontend.
   - En el túnel de la Pi, **quitar solo el hostname público `api.rabadanhouse.space`** y dejar `n8n.rabadanhouse.space` intacto.

3.4. **Verificación:**
   - `curl -s https://api.rabadanhouse.space/health`: `status: ok`, `connected: true`.
   - Entrar en https://timetrack.rabadanhouse.space como admin y como empleado. El dashboard y Mi Perfil cargan sin errores de CORS (consola del navegador).
   - **Un fichaje físico en el lector 2N:** debe aparecer **una sola fila** en `access_logs` (`source = 'signalr'`). Claude lo comprueba con SQL.
   - Un fichaje web.
   - **Ida y vuelta con n8n:** esperar a la siguiente ejecución de *Sync Retry* (cada 15 min) y comprobar que no hay errores en n8n.

3.5. **Quitar el dominio de prueba** `api-new` de Dokploy y de Cloudflare.

---

## Fase 4 — Marcha atrás (si algo falla)

1. En Dokploy: **Stop** de `timetrack-backend`, para que solo quede un listener.
2. En Cloudflare: devolver `api.rabadanhouse.space` al túnel de la Pi.
3. En Portainer: **Start** de `n8n-backend-1`, o restaurar `replicas` en el compose.
4. `curl -s https://api.rabadanhouse.space/health` debe devolver la versión de la Pi y `connected: true`.

El contenedor de la Pi se mantiene parado, sin borrar, **al menos 7 días** después del corte.

---

## Fase 5 — Limpieza (tras 7 días sin incidencias)

- Quitar el servicio `backend` del compose de Portainer y borrar el contenedor y las imágenes `rabadanhouse/timetrack-backend` de la Pi.
- Documentación:
  - `CLAUDE.md`: nueva sección de despliegue, quitando el build arm64 y la nota de Portainer.
  - `HANDOFF.md`: tabla de despliegue.
  - `docs/signalr-resilience.md`.
  - `backend/.env.example`: `SIGNALR_DISABLED`.
- Opcional: añadir `Watch Paths` también al frontend (`src/**`, `public/**`, `index.html`, `package*.json`, `vite.config.js`, `nginx/**`, `Dockerfile`) para que un cambio solo de backend no lo reconstruya.
- Opcional: dejar de publicar la imagen en Docker Hub.

---

## Fuera de alcance (decisiones aparte)

- Mover n8n o el backup al Debian.
- P4: alertas críticas directas a Telegram. Necesita un ADR.
- Mover la base de datos a Supabase self-hosted. Descartado: ver `docs/architecture-review-2026-11.md`.
