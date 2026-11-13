# Plan: migrar el backend de la Raspberry Pi a Dokploy

Estado: **corte hecho el 2026-11-13 a las ~18:15 (Madrid)**. Desde entonces el backend corre en Dokploy (Debian) y el contenedor de la Pi está parado (`replicas: 0`), no borrado.
- **Fase 4 (marcha atrás):** disponible hasta el 2026-11-20.
- **Fase 5 (limpieza):** a partir de esa fecha si no hay incidencias.

**Verificación (3.4), todo OK:**
- `/health`: `connected: true`.
- `/api/me` sin token: `401`.
- CORS correcto.
- Login como admin.
- Fichajes del 2026-11-13 a las 18:21–18:23: tres web y uno físico en "Puerta Entrada" (`source = 'signalr'`). Hay **una fila por fichaje**, sin duplicados.

**Incidencia del corte:** al borrar la ruta `api` de `Tunel_N8N`, Cloudflare borró también su registro DNS. Al añadirla en el túnel del Debian no se volvió a crear y hubo que crear a mano el CNAME `api` → `<túnel Debian>.cfargotunnel.com`, con proxy. En la marcha atrás puede pasar lo mismo.

Origen: Origen: `docs/architecture-review-2026-11.md` (propuesta P2) y la revisión independiente `docs/architecture-review-codex.md`.

Objetivo: que el backend se despliegue igual que el frontend (push a `main` → Dokploy construye y despliega), eliminando el build en el Mac, Docker Hub, `:latest` y la verificación manual en Portainer.

| Antes | Después |
|---|---|
| Backend en la Pi (Portainer, stack `n8n`, arm64) | Backend en Dokploy (Debian 12, x86_64) |
| `api.rabadanhouse.space` → Cloudflare Tunnel de la Pi | `api.rabadanhouse.space` → Dokploy (Debian) |
| Build manual en el Mac + push a Docker Hub | Build automático en Dokploy desde Git |

La Pi conserva n8n, su Postgres, cloudflared y el contenedor de backup. Supabase sigue en la nube.

**Túneles de Cloudflare:**
- **Pi, `Tunel_N8N`:** `n8n`, `evolution`, `portainer`, `access` (el 2N) y `api`.
- **Debian, `Tunel_DEBIAN-S…`:** `supabase`, `supabase-api`, `ha-madrid`, `dokploy`, `timetrack`, `vinoteca` y `rutinex`.

**Dependencia que se mantiene:** `access.rabadanhouse.space`, por donde el backend habla con el 2N (REST y SignalR), sigue saliendo por el túnel de la Pi. Si la Pi o su túnel caen, el backend en el Debian pierde el 2N: saltará la alerta de 2N desconectado, pero los fichajes web seguirán funcionando. Ocurre lo mismo con n8n. Quitar esta dependencia, publicando `access` desde el Debian, queda fuera de alcance.

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

0.1. ✅ **Hecho (2026-11-13).** El Debian tiene su propio Cloudflare Tunnel (`Tunel_DEBIAN-S…`), que ya publica `supabase`, `supabase-api`, `ha-madrid`, `dokploy`, `timetrack`, `vinoteca` y `rutinex`. No es el túnel de la Pi y no corre como contenedor Docker. Para el backend no hace falta crear un túnel: basta con añadir un *Public Hostname* a ese túnel, con el **mismo Service** que tiene `timetrack.rabadanhouse.space` (Traefik de Dokploy). Traefik reparte por dominio.

0.2. ✅ **Hecho (2026-11-13): valores guardados en Contraseñas.** Inventario de variables del servicio `backend` en Portainer (Stacks → `n8n`). Los nombres ya están en `docs/portainer-stack-n8n.md`. Falta copiar los **valores** del stack de Portainer a Contraseñas, nunca al chat. `AC_USERNAME` y `AC_PASSWORD` sobran y no se pasan a Dokploy.
- **Obligatorias:**
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
  - `SETTINGS_ENCRYPTION_KEY`: **exactamente la misma**. Sin ella no se pueden descifrar los tokens 2N guardados en Supabase;
  - `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET`: el mismo valor que tiene n8n;
  - `FRONTEND_URL=https://timetrack.rabadanhouse.space`: sin ella falla el CORS del navegador;
  - `NODE_ENV=production`.
- **Según uso:** `AC_BASE_URL` y `AC_API_TOKEN` (las usa la reconciliación nocturna), `N8N_HELP_WEBHOOK_URL` (bot de ayuda) y `NODE_RED_SECRET`.
- **Sobrante:** `PORT`. Tiene 3000 por defecto.

0.3. ✅ **Hecho (2026-11-12).** Revisados los 10 workflows TimeTrack de n8n. Todos llaman al backend por `https://api.rabadanhouse.space` y al 2N por `https://access.rabadanhouse.space`. El Help Bot usa una IP de Tailscale (`100.115.151.21`) desde n8n, que sigue en la Pi: no le afecta la migración.

0.4. ✅ **Hecho (2026-11-13), con datos del MCP de Dokploy:**
- RAM: 6,0 de 16,6 GB en uso.
- Disco: 49 de 251 GB en uso.
- 4 CPU y 21 contenedores.

El backend (150–250 MB) cabe de sobra.

---

## Fase 1 — Preparar la app en Dokploy (sin tráfico)

1.1. ✅ **Hecho (2026-11-12).** `SIGNALR_DISABLED=true` hace que el backend no conecte con el 2N, ni al arrancar ni cuando el admin guarda los ajustes (`restartCompanyConnection`). Probado en local. No hace falta redesplegar la Pi: allí la variable no existe y SignalR sigue activo.

✅ **Pasos 1.2, 1.3 y la parte de Dokploy del 1.6 hechos (2026-11-13) con el MCP de Dokploy.**
- App "Timetrack Backend", `appName` `timetrack-backend-qmxtok`, applicationId `7-gnQzXTY66PBNuN5bTnX`, en el mismo entorno que el frontend.
- **Auto Deploy desactivado a propósito** mientras dure la prueba, para que un push a `backend/**` no despliegue sin las variables. Se activa en el corte (paso 3.2).
- Ruta `api-new.rabadanhouse.space` → `http://localhost:80` añadida en `Tunel_DEBIAN-S…`. Es el mismo Service que tienen `timetrack`, `vinoteca` y `rutinex`.
- **Docker Context Path = `backend`**, no `.`. Con `.` el contexto es la raíz del repo y el build compilaba el frontend con Vite: `Cannot find module '/app/dist/index.js'`.
- **1.4:** Dokploy no pasa el commit como `GIT_SHA`, así que `/health` muestra `version: "unknown"`. El commit desplegado se ve en *Deployments*.
- **1.7 y 2.1 OK (2026-11-13):**
  - logs: `SUPABASE_* present: true` y `[SignalR] Deshabilitado (SIGNALR_DISABLED=true)`;
  - `https://api-new.rabadanhouse.space/health` devuelve `{"status":"ok","signalr":[]}`.
- El Debian también tiene Portainer (en la IP de Tailscale), pero la app se gestiona **solo desde Dokploy**: no tocar sus contenedores ni servicios desde Portainer.
- El *Environment* ya tiene las variables no secretas y `SIGNALR_DISABLED=true`. Las secretas quedan como comentarios para pegarlas desde Contraseñas.

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

1.6. **Dominio de prueba** (no el definitivo): por ejemplo `api-new.rabadanhouse.space`, puerto `3000`, HTTPS desactivado si Cloudflare pone el TLS, igual que el frontend. Publicarlo en el túnel del Debian: Zero Trust → *Networks → Tunnels* → túnel `Tunel_DEBIAN-S…` → *Agregar ruta*, con hostname `api-new` y el mismo Service que `timetrack` (paso 0.1).

1.7. **Deploy.** Comprobar en los logs:
- `[server] Running on http://localhost:3000`
- `SUPABASE_* present: true`
- que no aparece `[SignalR] ... Conectado`, porque está deshabilitado.

---

## Fase 2 — Pruebas antes del corte (con la Pi aún en servicio)

2.1. `curl -s https://api-new.rabadanhouse.space/health` debe devolver `status: ok`, `signalr: []` y la `version` esperada (o `unknown`, ver 1.4).

2.2. ⚠️ **Parcial (2026-11-13).**
- **Comprobado en `api-new`:**
  - `/api/me` sin token devuelve `401`;
  - el preflight CORS desde `https://timetrack.rabadanhouse.space` devuelve `204` con `access-control-allow-origin` correcto;
  - el outbox consulta Supabase con la service role al arrancar sin errores.
- **Sin probar con un token real.** La CSP del frontend (`connect-src` en `nginx/security-headers.conf`) solo permite `api.rabadanhouse.space`, así que el navegador no puede llamar a `api-new`, y la extensión de Chrome no tiene permiso en ese dominio.
- **Queda cubierto en el corte (3.4):** al entrar como admin y como empleado.
- **No hace falta tocar la CSP:** tras el corte, el dominio vuelve a ser `api`.

**Supabase y autenticación.** Llamar a un endpoint protegido con un token real: lo más fácil es abrir el frontend en local (`npm run dev`) con `VITE_API_URL` apuntando a `api-new`. O pedir a Claude una prueba con `curl` y un token de la cuenta de demo.

✅ **2.3 y 2.4 OK (2026-11-13).** Desde la consola del contenedor en Dokploy, con `node -e "fetch(...)"`, `https://access.rabadanhouse.space/` y `https://n8n.rabadanhouse.space/healthz` devuelven **200**. Sin 502 ni errores de TLS.

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
   - Para que Portainer no lo vuelva a levantar al actualizar el stack, cambiar en el compose el servicio `backend` a `deploy: replicas: 0`, o comentarlo.
   - **Confirmado:** `cloudflared` tiene `depends_on: backend: condition: service_healthy` (ver `docs/portainer-stack-n8n.md`). **Antes** de tocar el backend, borrar ese bloque `backend:` del `depends_on` de `cloudflared` (dejar solo `n8n`) y actualizar el stack. Si no, el túnel de la Pi no arrancará y caerán `n8n`, `access` y `portainer`.

3.2. **Activar SignalR en Dokploy:** quitar `SIGNALR_DISABLED`, o ponerlo a `false`, **activar Auto Deploy** y redesplegar. `/health` en `api-new` debe mostrar `signalr[].connected: true`.

3.3. **Cambiar el dominio definitivo:**
   - En Dokploy, añadir el dominio `api.rabadanhouse.space` (puerto 3000) a la app.
   - En Cloudflare, **primero** quitar la ruta `api.rabadanhouse.space` de `Tunel_N8N` (Pi). Las demás rutas, en especial `n8n` y `access`, se quedan intactas. **Después**, añadirlo al túnel del Debian con el mismo Service que `timetrack`. Cloudflare no deja el mismo hostname en dos túneles a la vez.

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
2. En Cloudflare: quitar `api.rabadanhouse.space` del túnel del Debian y volver a añadirlo a `Tunel_N8N` (Pi) con Service `http://backend:3000` y los valores predeterminados.
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
