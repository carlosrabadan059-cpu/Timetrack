# Prompts por Fase para Claude Code

Pegar uno a uno en Claude Code. Esperar a que los criterios de éxito estén en verde antes de pasar al siguiente.

---

## FASE 0 — Setup

Objetivos: estructura de carpetas, package.json, tsconfig.json, date-utils.ts, supabase.ts, index.ts con GET /health.

Criterio de éxito:
- npm run dev arranca en puerto 3000 sin errores
- GET /health responde { status: 'ok', timestamp: ISO }
- npm run build compila sin errores TypeScript

---

## FASE 1 — Auth + Perfil

Objetivos: tabla profiles con RLS, trigger auto-creación, middleware auth.ts, endpoints GET/PATCH /api/me, POST /api/me/change-password, POST /api/me/notifications, GET /api/me/sync-status.

RLS IMPORTANTE: usar FOR SELECT y FOR UPDATE por separado, NO FOR ALL (permite auto-borrado).

Criterio de éxito:
- GET /api/me sin token → 401
- Nuevo usuario en Supabase Auth → perfil auto-creado con employee_code
- PATCH /api/me actualiza y persiste
- Empleado no puede borrar su propio perfil

---

## FASE 2 — Fichajes (Tres Modos)

Objetivos: tabla access_logs con RLS, SignalR listener (modo 2N), POST /api/me/fichar (web/móvil), rate-limit.ts, attendance.ts (cálculo agnóstico del source), GET /api/me/dashboard, GET /api/me/historial, GET /api/me/historial/export, GET /api/me/live (SSE).

CRÍTICOS:
- Inferencia de source por device_info, NO por GPS
- Filtrar lastLog por event_type='granted' (no 'denied')
- Un par in/out de distintos sources es válido
- startOfDay() viene de date-utils.ts

Criterio de éxito:
- Fichar → source correcto en access_logs
- Par in/out de distintos sources → cálculo de horas correcto
- Dos 'in' seguidos → 422 duplicate_direction
- Más de 1 fichaje en 5 min → 429

---

## FASE 3 — Incidencias

Objetivos: tabla incidencias con RLS, endpoints GET/POST /api/me/incidencias, PATCH /api/incidencias/:id con lógica según type (olvido/correccion/ausencia), lib/n8n.ts, workflows n8n incidencia-nueva e incidencia-resuelta.

CRÍTICOS:
- Validaciones cruzadas en zod con .superRefine()
- Aprobar 'olvido' → INSERT con source='correction' (nunca 'web' ni 'mobile')
- Aprobar 'correccion' → UPDATE, mantener source original

Criterio de éxito:
- GET vacío → { total: 0 }
- Aprobar olvido → nuevo access_log source='correction'
- Aprobar correccion → log original corrected=true, source sin cambiar

---

## FASE 4 — Reportes

Objetivos: endpoints GET /api/me/reportes/summary, GET /api/me/reportes/activity, GET /api/me/reportes/download/monthly (PDF+Excel), GET /api/me/reportes/download/incidencias.

PDF: columnas FECHA|DÍA|HORA|TIPO|DETALLE|ORIGEN, correcciones con asterisco.
Excel: 3 hojas (Actividad, Resumen diario, KPIs con desglose por origen).

Criterio de éxito:
- KPIs incluyen fichajes de los 4 sources
- has_next_month: false para mes actual
- PDF y Excel se descargan y abren correctamente

---

## FASE 5 — Sync 2N AC

Objetivos: tabla sync_queue, ac-client.ts completo, endpoints /api/users/*, POST /webhooks/n8n/callback, workflows n8n user-create/update/delete/sync-retry/reconciliation.

CRÍTICOS:
- INSERT en sync_queue ANTES de llamar a n8n
- WF user-delete orden: tarjetas → PIN → grupos → DELETE
- Reconciliación NUNCA toca access_logs
- Fichajes web/móvil NUNCA generan llamadas a 2N AC

Criterio de éxito:
- Alta usuario → sync AC → callback actualiza ac_external_id
- POST /api/me/fichar NO genera entrada en sync_queue
- WF user-delete falla si orden incorrecto (AC rechaza DELETE)
