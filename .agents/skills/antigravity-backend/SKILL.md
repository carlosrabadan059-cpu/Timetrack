---
name: antigravity-backend
description: >
  Backend de Antigravity/TimeTrack: control de accesos y fichajes con tres modos
  (2N SignalR, App Web, App Móvil). Stack: Node.js + TypeScript + Hono + Supabase
  + n8n + 2N Access Commander v3.x. Usar SIEMPRE para: integración 2N (REST API,
  SignalR, HTTP API dispositivos), fichaje/fichar/jornada, POST /api/me/fichar,
  access_logs, sync_queue, incidencias, emparejamiento in/out, inferencia de
  dirección, detail_type comida, source signalr/web/mobile/correction, SSE live,
  workflows n8n (user-create, user-update, user-delete, sync-retry, reconciliation),
  schema Supabase (profiles, access_logs, incidencias, sync_queue), RLS roles
  employee/manager/admin, sincronización usuarios Supabase↔2N AC, ac-client,
  endpoints /api/me/* /api/users/* /webhooks/*, cualquier decisión técnica del
  stack Antigravity. También usar si el usuario menciona: Access Commander,
  SignalR topic, n8n webhook, rate limit fichaje, GPS móvil, humanizeSource,
  inferDetailType, startOfDay, attendance, DaySummary
---

# Antigravity Backend — Guía Completa de Implementación

## Stack y Reglas Fundamentales

**Runtime:** Node.js 20 LTS + TypeScript strict  
**Framework:** Hono + @hono/node-server  
**BD/Auth:** Supabase (@supabase/supabase-js v2)  
**Eventos 2N:** @microsoft/signalr  
**PDF:** pdfkit | **Excel:** exceljs | **Validación:** zod

### Reglas de arquitectura — NUNCA violar

1. El frontend **NUNCA habla directamente con 2N** ni con dispositivos físicos
2. **Supabase** = Single Source of Truth para identidad y perfiles
3. **2N Access Commander** = Single Source of Truth para permisos de acceso
4. **SignalR para eventos** — nunca polling para eventos en tiempo real
5. **n8n** gestiona todo lo asíncrono, con reintentos, o que conecta >2 sistemas
6. `supabaseAdmin` (service_role) solo en el servidor — nunca exponer al cliente
7. Insertar en `sync_queue` **antes** de disparar el webhook a n8n
8. Los fichajes web/móvil **NUNCA se sincronizan con 2N AC**

---

## Los Tres Modos de Fichaje

Este es el concepto más importante del proyecto. Leerlo antes de implementar cualquier lógica de fichaje.

| Modo | Campo `source` | Cómo llega | Auth requerida |
|------|---------------|------------|----------------|
| **2N** (lector físico) | `signalr` | SignalR listener automático | No (service_role) |
| **Web** (botón app) | `web` | POST /api/me/fichar | Sí (JWT) |
| **Móvil** (botón app) | `mobile` | POST /api/me/fichar + GPS | Sí (JWT) |
| **Corrección** (incidencia) | `correction` | Al aprobar incidencia tipo olvido | No (service_role) |

**Regla fundamental:** Los tres modos tienen IGUAL valor para TODOS los cálculos.  
Un par in/out de distintos sources es completamente válido.  
El algoritmo de emparejamiento es agnóstico del source.

> Para detalles completos de implementación → ver `references/fichaje-modos.md`

---

## Integración 2N Access Commander

### REST API
```
Base URL: https://{AC_IP}/api/v3/
Auth:     Authorization: Bearer {AC_API_TOKEN}
```

Endpoints principales: ver `references/2n-api.md`

### SignalR — Hub v3
```
URL:      https://{AC_IP}/mainhubv3
Librería: @microsoft/signalr
Topics:   accesslog | userchange | devicemonitor

Reconexión: withAutomaticReconnect([0, 2000, 5000, 10000, 30000, 60000])
Recovery:   connection.invoke('Update', lastEventTimestamp) al reconectar
```

### Inferencia de detail_type (aplica a los 3 modos)
```typescript
// En src/lib/date-utils.ts
export function inferDetailType(timestamp: string): 'normal' | 'comida' {
  const hour = new Date(timestamp).getHours()
  return (hour >= 13 && hour < 16) ? 'comida' : 'normal'
}
```

### Humanización de source (para reportes y exports)
```typescript
export function humanizeSource(source: string): string {
  const map: Record<string, string> = {
    signalr: 'Lector 2N', web: 'App Web',
    mobile: 'App Móvil', correction: 'Corrección'
  }
  return map[source] ?? source
}
```

---

## Integración n8n

**Patrón obligatorio:**
1. INSERT en `sync_queue` con `status: 'pending'` ANTES de llamar a n8n
2. Disparar webhook con header `X-N8N-Secret`
3. n8n ejecuta + llama a `POST /webhooks/n8n/callback`
4. Backend actualiza `sync_queue` y `profiles.ac_external_id`

| Workflow | Webhook | Qué hace |
|----------|---------|----------|
| `user-create` | POST /webhook/user-create | Crea usuario en AC + asigna grupo |
| `user-update` | POST /webhook/user-update | PATCH usuario en AC |
| `user-delete` | POST /webhook/user-delete | Revoca credenciales + DELETE en AC |
| `credential-card` | POST /webhook/credential-card | Asigna/revoca tarjeta RFID |
| `credential-pin` | POST /webhook/credential-pin | Asigna/revoca PIN |
| `incidencia-nueva` | POST /webhook/incidencia-nueva | Email al manager |
| `incidencia-resuelta` | POST /webhook/incidencia-resuelta | Email al empleado |
| `sync-retry` | Cron cada 15 min | Reintenta sync_queue fallidos |
| `reconciliation` | Cron 2:00 AM | Reconcilia usuarios Supabase↔AC |

**WF user-delete — orden OBLIGATORIO** (AC rechaza DELETE con credenciales activas):
1. GET cards → DELETE cada tarjeta
2. DELETE switches (PIN)
3. GET grupos → DELETE de cada grupo
4. DELETE usuario

> Para payloads completos de cada workflow → ver `references/n8n-workflows.md`

---

## Schema de Supabase

### profiles
```sql
id uuid PRIMARY KEY REFERENCES auth.users
full_name text, email text
employee_code text UNIQUE        -- "EMP-0001" — visible en UI
role text DEFAULT 'employee'     -- admin | manager | employee
company_id uuid
ac_external_id text UNIQUE       -- ID en 2N AC — campo clave de sync
ac_synced_at timestamptz
access_valid_from timestamptz, access_valid_to timestamptz
notifications_email boolean DEFAULT true
two_factor_enabled boolean DEFAULT false
avatar_url text
created_at timestamptz DEFAULT now()
```

**RLS:** employee → SELECT+UPDATE solo su fila. Manager → SELECT de su company_id.  
**NO usar `FOR ALL`** — permite auto-borrado. Usar políticas separadas por operación.

### access_logs
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id uuid REFERENCES profiles
device_id text, device_name text, zone_id text, zone_name text
event_type text  -- granted | denied | doorbell | remote_open
direction text   -- in | out
detail_type text -- normal | comida | otro
timestamp timestamptz NOT NULL
source text      -- signalr | web | mobile | correction
corrected boolean DEFAULT false
original_timestamp timestamptz  -- timestamp anterior si fue corregido
latitude numeric(10,7)          -- GPS opcional (source=mobile)
longitude numeric(10,7)
device_info text                -- 'web' | 'ios' | 'android' | nombre lector 2N
raw_payload jsonb               -- payload SignalR completo (source=signalr)
```

**RLS insert:** solo service_role. La inferencia de dirección filtra SOLO `event_type='granted'`.

### incidencias
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id uuid REFERENCES profiles, company_id uuid
type text    -- olvido | correccion | ausencia | hora_extra
status text  -- pending | approved | rejected
date date
original_timestamp timestamptz, requested_timestamp timestamptz
requested_direction text        -- 'in'|'out' — obligatorio si type='olvido'
reason text, manager_note text
reviewed_by uuid REFERENCES profiles, reviewed_at timestamptz
access_log_id uuid REFERENCES access_logs  -- obligatorio si type='correccion'
```

**Al aprobar type='olvido':** INSERT en access_logs con source='correction' (nunca 'web' ni 'mobile')  
**Al aprobar type='correccion':** UPDATE access_log, mantener source original, corrected=true

### sync_queue
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
action text   -- create_user | update_user | delete_user | assign_card | ...
payload jsonb
status text   -- pending | processing | done | failed | abandoned
retries int DEFAULT 0, error_message text
created_at timestamptz DEFAULT now()
```

**Sin políticas RLS** — solo service_role accede.

---

## Endpoints del Backend

### Empleado (/api/me/*)
```
GET   /api/me                    Perfil completo
PATCH /api/me                    Actualiza nombre, notificaciones, avatar
POST  /api/me/change-password    Cambiar contraseña
POST  /api/me/notifications      Toggle notificaciones email
POST  /api/me/2fa/toggle         Toggle 2FA
GET   /api/me/sync-status        Estado sync con 2N AC

POST  /api/me/fichar             Fichar desde web o móvil
  Body: { direction?, latitude?, longitude?, device_info? }
  Rate limit: 1 fichaje cada 5 min → 429
  Error duplicado: 422 { code: 'duplicate_direction' }
  Source determinado por device_info, NO por GPS

GET   /api/me/dashboard          KPIs semana + gráfica + estado jornada
GET   /api/me/historial          Lista agrupada por día (filtros: period, type, source)
GET   /api/me/historial/export   Excel/CSV con columna Origen humanizada
GET   /api/me/live               SSE — eventos en tiempo real de los 3 modos

GET   /api/me/incidencias        Lista propia (paginada, filtrable por status)
POST  /api/me/incidencias        Crear incidencia (validaciones cruzadas con zod superRefine)
GET   /api/me/incidencias/:id    Detalle

GET   /api/me/reportes/summary          KPIs mensuales
GET   /api/me/reportes/activity         Tabla actividad con columna Origen
GET   /api/me/reportes/download/monthly PDF o Excel mensual
GET   /api/me/reportes/download/incidencias  PDF incidencias del período
```

### Admin/Manager (/api/users/*, /api/incidencias/*)
```
POST  /api/users              Alta + triggerWorkflow('user-create')
GET   /api/users              Lista empresa con estado ac_synced
GET   /api/users/:id          Perfil + último acceso + sync_status
GET   /api/users/:id/sync-status  Estado real de sync
PATCH /api/users/:id          Editar + triggerWorkflow('user-update')
DELETE /api/users/:id         Soft delete + triggerWorkflow('user-delete')

GET   /api/incidencias        Lista empresa (filtros: status, user_id, fechas)
PATCH /api/incidencias/:id    Aprobar/rechazar con lógica según type
```

### Webhooks (/webhooks/*)
```
POST /webhooks/n8n/callback   Callback de n8n → actualiza profiles + sync_queue
POST /webhooks/node-red/*     Alertas de Node-RED (emergencias locales)
```

---

## Respuestas estándar de la API

```typescript
// Éxito
{ data: T, meta?: { page, total, has_more } }

// Error
{ error: { code: string, message: string, details?: unknown } }

// Códigos HTTP
// 400 Body inválido (zod)      401 Sin token / inválido
// 403 Rol insuficiente         404 No encontrado
// 422 Lógica negocio           429 Rate limit
// 500 Error interno
```

---

## Estado de Fases del Proyecto

Consultar para saber qué está implementado:

- [ ] Fase 0 — Setup: estructura, deps, middleware auth, GET /health
- [ ] Fase 1 — Auth + Perfil: GET /api/me, toggle notificaciones
- [ ] Fase 2 — Fichajes: SignalR + /api/me/fichar + Dashboard + Historial + SSE
- [ ] Fase 3 — Incidencias: crear + aprobar/rechazar + corrección en access_logs
- [ ] Fase 4 — Reportes: PDF, Excel, tabla actividad, navegación por mes
- [ ] Fase 5 — Sync 2N: usuarios vía n8n, callback, reconciliación nocturna

> Para los prompts completos de cada fase → ver `references/fases.md`

---

## Referencias adicionales

- `references/fichaje-modos.md` — Implementación detallada de los 3 modos + lógica de inferencia
- `references/2n-api.md` — Endpoints AC REST v3, SignalR topics, Data Query
- `references/n8n-workflows.md` — Pasos exactos de cada workflow n8n
- `references/fases.md` — Prompts completos para Codex por fase
