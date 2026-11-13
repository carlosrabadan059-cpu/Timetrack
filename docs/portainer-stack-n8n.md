# Stack `n8n` de Portainer (Raspberry Pi 5)

Compose del stack `n8n` en Portainer, en la Pi (192.168.1.10). Copia de referencia del 2026-11-13.

**Copia, no fuente de verdad.** Para cambiar el stack se edita en Portainer (Stacks → `n8n` → Editor). Si cambia allí, actualizar este fichero.

Los valores `${...}` están en las variables de entorno del stack en Portainer y **nunca se copian aquí**. Los secretos se guardan en Contraseñas.

## Servicios

| Servicio | Imagen | Función | Depende de |
|---|---|---|---|
| `postgres` | `postgres:17` | Base de datos de n8n (volumen `n8n_pgdata17`) | — |
| `n8n` | `n8nio/n8n:latest` | Orquestador, `https://n8n.rabadanhouse.space` | `postgres` sano |
| `backend` | `rabadanhouse/timetrack-backend:latest` | API de TimeTrack, puerto 3000 | `n8n` sano |
| `cloudflared` | `cloudflare/cloudflared:2026.10.4` | Túnel `Tunel_N8N` | `n8n` **y `backend`** sanos |
| `backup` | `rabadanhouse/timetrack-backup:latest` | `pg_dump` diario de Supabase a Drive, ver `docs/backups.md` | — |

Todos los servicios están en la red `n8n_net` (bridge). Por eso `cloudflared` llega a `http://backend:3000` y a `n8n:5678` por el nombre del servicio.

## Rutas de `Tunel_N8N` (Cloudflare Zero Trust)

| Hostname | Service |
|---|---|
| `api.rabadanhouse.space` | `http://backend:3000` (valores predeterminados) |
| `n8n.rabadanhouse.space` | n8n |
| `access.rabadanhouse.space` | 2N Access Commander (LAN) |
| `evolution.rabadanhouse.space` | Evolution API |
| `portainer.rabadanhouse.space` | Portainer |

## Variables por servicio (solo nombres)

- **`backend`:**
  - `SETTINGS_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
  - `AC_BASE_URL`, `AC_API_TOKEN`;
  - `AC_USERNAME`, `AC_PASSWORD`: sobrantes, el código ya no las usa;
  - `N8N_WEBHOOK_SECRET`, `NODE_RED_SECRET`.
  - Fijas en el compose: `NODE_ENV=production`, `PORT=3000`, `N8N_WEBHOOK_BASE_URL=https://n8n.rabadanhouse.space`, `N8N_HELP_WEBHOOK_URL=https://n8n.rabadanhouse.space/webhook/help-chat` y `FRONTEND_URL=https://timetrack.rabadanhouse.space`.
- **`n8n`:**
  - base de datos: `POSTGRES_*`;
  - TimeTrack: `N8N_WEBHOOK_SECRET` (mismo valor que en `backend`) y `AC_API_TOKEN`;
  - otros proyectos: `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`, `OPENAI_API_KEY`, `VINOTECA_SUPABASE_URL`, `VINOTECA_SUPABASE_SERVICE_KEY` y `BRAVE_SEARCH_API_KEY`.
  - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` hace falta para que los workflows lean `$env.N8N_WEBHOOK_SECRET`.
- **`cloudflared`:** `CLOUDFLARE_TUNNEL_TOKEN`.
- **`backup`:** `SUPABASE_DB_URL`, `AGE_RECIPIENT`, `RCLONE_CONFIG_B64`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y `HEARTBEAT_URL`.

## Puntos a tener en cuenta

- **`cloudflared` depende de `backend` (`service_healthy`).** Si el backend no arranca o se quita del compose, el túnel no se levanta, y con él caen `n8n`, `access` y `portainer`. Antes de parar o quitar el backend (migración a Dokploy, paso 3.1), hay que quitar esa dependencia.
- **El `backend` no define healthcheck en el compose.** Usa el `HEALTHCHECK` de su Dockerfile (`wget /health`).
- **Imágenes `:latest`** (`n8n`, `backend`, `backup`). Un "Update the stack" no siempre vuelve a descargarlas: ver `docs/signalr-resilience.md`.
- **El volumen `n8n_pgdata` ya no se usa** (era la versión antigua de Postgres). Se declara pero ningún servicio lo monta.
- **`N8N_CORS_ALLOW_ORIGIN=http://localhost:5173`:** solo afecta a llamadas a n8n desde el navegador en desarrollo. El frontend en producción no llama a n8n.

## Compose

```yaml
version: "3.9"
name: n8n

services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - TZ=Europe/Madrid
    volumes:
      - n8n_pgdata17:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      n8n_net:
        aliases:
          - postgres

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - TZ=Europe/Madrid
      - GENERIC_TIMEZONE=Europe/Madrid
      - N8N_DEFAULT_TIMEZONE=Europe/Madrid
      - N8N_CORS_ENABLED=true
      - N8N_CORS_ALLOW_ORIGIN=http://localhost:5173
      - N8N_TRUST_PROXY=true
      - N8N_PROXY_HOPS=1
      - N8N_PROTOCOL=https
      - N8N_HOST=n8n.rabadanhouse.space
      - N8N_WEBHOOK_URL=https://n8n.rabadanhouse.space
      - N8N_EDITOR_BASE_URL=https://n8n.rabadanhouse.space
      - N8N_PORT=5678
      - N8N_LISTEN_ADDRESS=0.0.0.0
      - N8N_PAYLOAD_SIZE_MAX=32
      - N8N_WEBHOOK_SECRET=${N8N_WEBHOOK_SECRET}
      - AC_API_TOKEN=${AC_API_TOKEN}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_USER=${POSTGRES_USER}
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
      - DB_POSTGRESDB_DATABASE=${POSTGRES_DB}
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
      - NODE_FUNCTION_ALLOW_BUILTIN=*
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - GOOGLE_CSE_ID=${GOOGLE_CSE_ID}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - VINOTECA_SUPABASE_URL=${VINOTECA_SUPABASE_URL}
      - VINOTECA_SUPABASE_SERVICE_KEY=${VINOTECA_SUPABASE_SERVICE_KEY}
      - BRAVE_SEARCH_API_KEY=${BRAVE_SEARCH_API_KEY}
    volumes:
      - n8n_data:/home/node/.n8n
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:5678/healthz >/dev/null 2>&1 || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 20
      start_period: 30s
    networks:
      - n8n_net

  backend:
    image: rabadanhouse/timetrack-backend:latest
    restart: unless-stopped
    depends_on:
      n8n:
        condition: service_healthy
    environment:
      - SETTINGS_ENCRYPTION_KEY=${SETTINGS_ENCRYPTION_KEY}
      - NODE_ENV=production
      - PORT=3000
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - AC_BASE_URL=${AC_BASE_URL}
      - AC_API_TOKEN=${AC_API_TOKEN}
      - AC_USERNAME=${AC_USERNAME}
      - AC_PASSWORD=${AC_PASSWORD}
      - N8N_WEBHOOK_BASE_URL=https://n8n.rabadanhouse.space
      - N8N_WEBHOOK_SECRET=${N8N_WEBHOOK_SECRET}
      - N8N_HELP_WEBHOOK_URL=https://n8n.rabadanhouse.space/webhook/help-chat
      - NODE_RED_SECRET=${NODE_RED_SECRET}
      - FRONTEND_URL=https://timetrack.rabadanhouse.space
    networks:
      - n8n_net

  cloudflared:
    image: cloudflare/cloudflared:2026.10.4
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on:
      n8n:
        condition: service_healthy
      backend:
        condition: service_healthy
    networks:
      - n8n_net

  backup:
    image: rabadanhouse/timetrack-backup:latest
    restart: unless-stopped
    environment:
      - TZ=Europe/Madrid
      - BACKUP_CRON=30 3 * * *
      - BACKUP_MAX_AGE_H=26
      - SUPABASE_DB_URL=${SUPABASE_DB_URL}
      - AGE_RECIPIENT=${AGE_RECIPIENT}
      - RCLONE_REMOTE=gdrive:timetrack-backups
      - RCLONE_CONFIG_B64=${RCLONE_CONFIG_B64}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
      - HEARTBEAT_URL=${HEARTBEAT_URL}
    networks:
      - n8n_net

volumes:
  n8n_data:
    name: n8n_data
  n8n_pgdata:
    name: n8n_pgdata
  n8n_pgdata17:
    name: n8n_pgdata17

networks:
  n8n_net:
    name: n8n_net
    driver: bridge
```
