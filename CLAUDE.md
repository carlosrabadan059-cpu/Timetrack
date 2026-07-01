CLAUDE.md
This file provides guidance to Claude Code when working with this repository.
Commands
# Frontend

npm run dev        # Dev server en puerto 5173 (auto-abre navegador)

npm run build      # Build de producción

npm run lint       # ESLint

npm run preview    # Preview del build

# Backend (desde /backend)

npm run dev        # Servidor en puerto 3000 (tsx watch)

npm run build      # tsc

npm run start      # node dist/index.js

No hay test runner configurado todavía.


Qué es este proyecto
Antigravity / TimeTrack es una plataforma de gestión de control de accesos y fichajes. Tiene dos roles: employee y admin/manager.

Estado actual:

✅ Frontend completo e integrado con el backend real
✅ Backend completo y desplegado en producción (Raspberry Pi + Cloudflare Tunnel)
✅ Todas las fases implementadas (0–5) — no hay mocks activos


Frontend (YA DESARROLLADO — no modificar salvo integración)
Stack
React 19 + Vite 6
React Router v7 con layouts anidados
Tailwind CSS v3 + CSS custom properties (colores en index.css, extendidos en tailwind.config.js)
Lucide React (iconos), Recharts (gráficas)
jsPDF + jspdf-autotable (PDF), xlsx (Excel)
Fuentes: Inter y Outfit
Auth y Estado
Auth mock-only en src/contexts/AuthContext.jsx + src/lib/mockData.js
Sesión persiste en localStorage
src/contexts/CorrectionsContext.jsx gestiona solicitudes de corrección
Routing
AdminLayout / EmployeeLayout en src/layouts/
src/components/ProtectedRoute.jsx guarda rutas por rol
Todas las rutas definidas en src/App.jsx
Páginas
src/pages/admin/ — dashboard, attendance, employees, corrections, reports, settings
src/pages/employee/ — dashboard, history, correction requests, reports, profile
src/pages/LoginPage.jsx — entrada antes de auth
⚠️ Archivos mock a sustituir al integrar el backend
src/lib/mockData.js — datos hardcodeados de usuarios y fichajes
src/contexts/AuthContext.jsx — sustituir por llamadas reales a Supabase Auth
src/contexts/CorrectionsContext.jsx — sustituir por llamadas a POST /api/me/incidencias
Cualquier fetch o constante hardcodeada en los servicios de cada página


Backend (COMPLETADO ✅)
Stack
Tecnología
Uso
Node.js 20 LTS + TypeScript strict
Runtime
Hono
Framework API
@supabase/supabase-js v2
DB + Auth
@microsoft/signalr
Eventos 2N en tiempo real
pdfkit
Generación PDF
exceljs
Generación Excel
zod
Validación de inputs

Estructura de carpetas
backend/src/

  api/

    routes/

      me.ts              # /api/me/* — empleado

      historial.ts       # /api/me/historial/*

      incidencias.ts

      reportes.ts

      webhooks.ts        # /webhooks/n8n/*, /webhooks/node-red/*

    middleware/

      auth.ts            # JWT Supabase → adjunta req.user

      role.ts            # requireRole(['admin','manager'])

      rate-limit.ts

  lib/

    supabase.ts          # supabasePublic + supabaseAdmin

    ac-client.ts         # REST client 2N Access Commander

    device-client.ts     # HTTP API dispositivos físicos (Digest Auth)

    n8n.ts               # Dispatcher webhooks → n8n

  services/

    signalr-listener.ts  # Proceso permanente — suscripción a eventos 2N

    attendance.ts        # Lógica cálculo jornada, emparejamiento in/out

    sse-broadcaster.ts   # Server-Sent Events al frontend

    report-generator.ts  # PDF y Excel

    sync-queue.ts        # Procesador cola de reintentos

  types/

    ac.types.ts

    supabase.types.ts    # Generado: supabase gen types typescript

    api.types.ts

  index.ts
Variables de entorno (backend/.env)
# Supabase

SUPABASE_URL=

SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

# 2N Access Commander

AC_BASE_URL=https://192.168.x.x

AC_API_TOKEN=           # Bearer token (preferido sobre user/pass)

AC_USERNAME=

AC_PASSWORD=

# n8n

N8N_WEBHOOK_BASE_URL=https://n8n.tudominio.com

N8N_WEBHOOK_SECRET=     # Validar en header X-N8N-Secret

# Otros

NODE_RED_SECRET=

PORT=3000

NODE_ENV=development


Sistemas externos
Sistema
Rol
Cómo
Supabase
Auth + BD principal + RLS
REST + supabase-js
2N Access Commander v3.x
Control de acceso físico
REST API v3 + SignalR
n8n
Orquestador de workflows asíncronos
Webhooks
Node-RED (dentro de AC)
Automatizaciones offline locales
HTTP hacia backend



Reglas de arquitectura — NUNCA violar
El frontend NUNCA habla directamente con 2N ni con dispositivos físicos
Supabase = fuente maestra de identidad y perfiles
2N Access Commander = fuente maestra de permisos de acceso
SignalR para eventos — nunca polling para eventos en tiempo real
n8n gestiona todo lo asíncrono, con reintentos, o que conecta >2 sistemas
supabaseAdmin (service_role) solo en el servidor — nunca exponer al cliente
Insertar en sync_queue antes de disparar el webhook a n8n


Modos de fichaje
Hay tres fuentes que pueden registrar un fichaje. El campo source en access_logs identifica el origen.

Modo
Source
Cómo llega al backend
2N (lector físico)
signalr
SignalR listener — automático, sin acción del empleado
Web (botón en la app)
web
POST /api/me/fichar desde el navegador
App móvil
mobile
POST /api/me/fichar desde la app con GPS opcional

Endpoint de fichaje manual — web y móvil
POST /api/me/fichar

Auth: JWT del empleado obligatorio

Rate limit: máx 1 fichaje cada 5 minutos por usuario → 429

Body (todos los campos opcionales):

{

  direction?:    'in' | 'out'   // si no viene, el backend lo infiere

  latitude?:     number         // solo móvil — coordenada GPS

  longitude?:    number         // solo móvil — coordenada GPS

  device_info?:  string         // 'web' | 'ios' | 'android'

}

Lógica de inferencia de dirección (cuando direction no viene en el body):

Sin ningún access_log hoy → direction = 'in'
Último evento del día es in → direction = 'out'
Último evento del día es out → direction = 'in'
Si viene explícita en el body → usar la del body (tiene prioridad siempre)

Inferencia de detail_type:

Hora del fichaje entre 13:00–16:00 → detail_type = 'comida'
Resto de horas → detail_type = 'normal'
Aplica igual para los tres modos (2N, web, móvil)

Validaciones:

Dos in consecutivos o dos out consecutivos → 422 { error: { code: 'duplicate_direction', message: 'Ya tienes una entrada sin salida registrada' } }
El fichaje web/móvil NO pasa por 2N AC — se inserta directamente en access_logs
La geolocalización es opcional y no bloquea el fichaje — solo se almacena para auditoría

Respuesta exitosa:

{

  "data": {

    "id": "uuid",

    "direction": "in",

    "timestamp": "2026-04-10T09:05:00Z",

    "source": "web",

    "detail_type": "normal",

    "is_inside": true

  }

}
Botón del Dashboard — "Fuera de Horario" / "En Jornada"
El botón grande en la pantalla Dashboard del empleado llama a POST /api/me/fichar sin body. El backend infiere la dirección y retorna el nuevo estado. El frontend actualiza el badge y la hora en tiempo real vía la respuesta del endpoint (no necesita SSE para esto).


Integración 2N Access Commander
REST API
Base URL: https://{AC_IP}/api/v3/

Auth:     Authorization: Bearer {AC_API_TOKEN}

Endpoints principales:

  POST   /api/v3/users                Crear usuario (ExternalId = supabase UUID)

  PATCH  /api/v3/users/{id}           Modificar

  DELETE /api/v3/users/{id}           Eliminar

  POST   /api/v3/users/{id}/groups    Asignar grupo

  POST   /api/v3/users/{id}/cards     Asignar tarjeta RFID

  POST   /api/v3/users/{id}/switches  Asignar PIN

Data Query: filter, fields, sort, limit, offset en todos los GET de colecciones
SignalR (eventos en tiempo real — modo 2N)
Hub:      https://{AC_IP}/mainhubv3

Auth:     mismo Bearer Token que REST API

Librería: @microsoft/signalr

Topics a suscribir:

  accesslog     → INSERT en access_logs (source='signalr') + emitir SSE al frontend

  userchange    → actualizar profiles en Supabase

  devicemonitor → actualizar devices.status

Reconexión: withAutomaticReconnect([0, 2000, 5000, 10000, 30000, 60000])

Recovery:   connection.invoke('Update', lastEventTimestamp) al reconectar


Integración n8n
Patrón obligatorio:

Backend inserta en sync_queue con status: 'pending'
Backend dispara webhook a n8n con header X-N8N-Secret
n8n ejecuta el workflow (con reintentos internos)
n8n llama a POST /webhooks/n8n/callback con resultado
Backend actualiza sync_queue y profiles.ac_external_id

Workflow
Endpoint webhook
Alta usuario
/webhook/user-create
Modificar usuario
/webhook/user-update
Baja usuario
/webhook/user-delete
Tarjeta RFID
/webhook/credential-card
PIN
/webhook/credential-pin
Nueva incidencia
/webhook/incidencia-nueva
Incidencia resuelta
/webhook/incidencia-resuelta
Re-sync fallidos
Cron cada 15 min
Reconciliación AC↔Supabase
Cron 2:00 AM



Schema de Supabase
profiles
id uuid PRIMARY KEY REFERENCES auth.users

full_name text

email text

employee_code text UNIQUE        -- "ID de Empleado" visible en UI (EMP-0001)

role text DEFAULT 'employee'     -- admin | manager | employee

company_id uuid

ac_external_id text UNIQUE       -- ID en 2N AC — campo clave de sync

ac_synced_at timestamptz

access_valid_from timestamptz

access_valid_to timestamptz

notifications_email boolean DEFAULT true

two_factor_enabled boolean DEFAULT false

avatar_url text

created_at timestamptz DEFAULT now()
access_logs
id uuid PRIMARY KEY DEFAULT gen_random_uuid()

user_id uuid REFERENCES profiles

device_id text

device_name text

zone_id text

zone_name text

event_type text   -- granted | denied | doorbell | remote_open

direction text    -- in | out

detail_type text  -- normal | comida | otro

timestamp timestamptz NOT NULL

source text NOT NULL DEFAULT 'signalr'

  -- signalr:    lector físico 2N (automático vía SignalR)

  -- web:        botón fichaje en la app web

  -- mobile:     botón fichaje en la app móvil

  -- correction: fichaje creado al aprobar una incidencia tipo 'olvido'

corrected boolean DEFAULT false

original_timestamp timestamptz   -- si es corrección, timestamp original

latitude numeric(10,7)           -- GPS (solo fichajes móvil, opcional)

longitude numeric(10,7)          -- GPS (solo fichajes móvil, opcional)

device_info text                 -- 'web' | 'ios' | 'android' | nombre dispositivo 2N

raw_payload jsonb                -- payload completo de SignalR (solo source=signalr)

created_at timestamptz DEFAULT now()
incidencias
id uuid PRIMARY KEY DEFAULT gen_random_uuid()

user_id uuid REFERENCES profiles

company_id uuid

type text         -- olvido | correccion | ausencia | hora_extra

status text       -- pending | approved | rejected

date date

original_timestamp timestamptz

requested_timestamp timestamptz

reason text

manager_note text

reviewed_by uuid REFERENCES profiles

reviewed_at timestamptz

access_log_id uuid REFERENCES access_logs

created_at timestamptz DEFAULT now()
sync_queue
id uuid PRIMARY KEY DEFAULT gen_random_uuid()

action text       -- create_user | update_user | delete_user | assign_card | revoke_card | assign_pin | revoke_pin

payload jsonb

status text       -- pending | processing | done | failed | abandoned

retries int DEFAULT 0

error_message text

created_at timestamptz DEFAULT now()


Pantallas → Endpoints
Pantalla frontend
Archivo mock actual
Endpoint real
Employee Dashboard
mockData.js
GET /api/me/dashboard
Botón fichar (dashboard)
hardcoded
POST /api/me/fichar
Employee Historial
mockData.js
GET /api/me/historial
Historial export
—
GET /api/me/historial/export
Badge dentro/fuera
hardcoded
GET /api/me/live (SSE)
Incidencias lista
CorrectionsContext.jsx
GET /api/me/incidencias
Nueva incidencia
CorrectionsContext.jsx
POST /api/me/incidencias
Reportes summary
mockData.js
GET /api/me/reportes/summary
Reportes tabla
mockData.js
GET /api/me/reportes/activity
Reportes PDF
jsPDF local
GET /api/me/reportes/download/monthly?format=pdf
Reportes Excel
xlsx local
GET /api/me/reportes/download/monthly?format=excel
Mi Perfil
AuthContext.jsx
GET /api/me
Guardar perfil
AuthContext.jsx
PATCH /api/me
Cambiar contraseña
mock
POST /api/me/change-password
Login
AuthContext.jsx
Supabase Auth directo



Convenciones de código
API responses
// Éxito

{ data: T, meta?: { page, total, has_more } }

// Error

{ error: { code: string, message: string, details?: unknown } }
HTTP Status codes
400 Body inválido (zod)
401 Sin token o inválido
403 Rol insuficiente
404 No encontrado
422 Error de lógica de negocio (ej: fichaje duplicado)
429 Rate limit (ej: fichar más de 1 vez en 5 minutos)
500 Error interno
Reglas TypeScript
strict: true — sin any
Zod en todos los bodies de entrada
Tipos exportados desde src/types/


Estado de fases
Actualiza los checkboxes al completar cada fase:

✅ Fase 0 — Setup backend: estructura, dependencias, middleware auth, GET /health
✅ Fase 1 — Auth + Perfil: GET /api/me con datos reales, toggle notificaciones
✅ Fase 2 — Fichajes: SignalR listener + POST /api/me/fichar (web/móvil) + Dashboard + Historial + SSE live
✅ Fase 3 — Incidencias: crear + aprobar/rechazar + corrección en access_logs
✅ Fase 4 — Reportes: PDF, Excel, tabla actividad, navegación por mes
✅ Fase 5 — Sync 2N: usuarios vía n8n, callback, reconciliación nocturna

Notas de despliegue:
- Backend desplegado en Docker en Raspberry Pi (192.168.1.10), expuesto vía Cloudflare Tunnel como https://api.rabadanhouse.space
- Imagen Docker: rabadanhouse/timetrack-backend:latest (Docker Hub, arm64)
- Stack Docker en Portainer junto a n8n (red n8n_net) — compose en Portainer
- Frontend en Vercel conectado al backend en api.rabadanhouse.space
- Fix aplicado: conexión SignalR global desactivada cuando hay conexión por empresa (evita fichajes duplicados)
- Fix aplicado (2026-07-01): el listener SignalR reintenta con backoff (2s→5s→15s→30s→60s→120s) si falla al conectar o se cierra tras agotar la reconexión nativa — antes se quedaba colgado en silencio hasta un restart manual del contenedor. Estado por empresa expuesto en `GET /health` (`signalr: [...]`); si una conexión lleva 10+ min caída se dispara `POST /webhook/2n-connection-down` a n8n, que reenvía un aviso a Telegram. Detalle en `docs/signalr-resilience.md`. Requiere `N8N_WEBHOOK_SECRET` también en el servicio `n8n` del compose (antes solo estaba en `backend`), y que el workflow `2N Connection Down Alert` esté activo en n8n.
- Fix aplicado (2026-07-01): `depends_on` en cascada en el compose de Portainer (postgres→n8n→backend→cloudflared con `condition: service_healthy`) para evitar que un despliegue completo deje conexiones rotas entre servicios. Ojo: un "Update the stack" con re-pull en Portainer no siempre refresca la imagen del registry — verificar con `docker images --digests rabadanhouse/timetrack-backend` que el digest coincide tras publicar una imagen nueva; si no, `docker pull` manual + recrear el contenedor. Detalle en `docs/signalr-resilience.md`.

Piensa antes de actuar. Lee los archivos antes de escribir código.

Edita solo lo que cambia, no reescribas archivos enteros.

No releas archivos que ya hayas leído salvo que hayan cambiado.

No repitas código sin cambios en tus respuestas.

Sin preámbulos, sin resúmenes al final, sin explicar lo obvio.

Testea antes de dar por terminado.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`carlosrabadan059-cpu/Timetrack`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` at root + `docs/adr/`. See `docs/agents/domain.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
