# n8n Workflows — Pasos Exactos

Header de seguridad obligatorio en todos los webhooks:
`X-N8N-Secret: {N8N_WEBHOOK_SECRET}`

Callback siempre a: `POST {BACKEND_URL}/webhooks/n8n/callback`

---

## WF user-create
Trigger: `POST /webhook/user-create`
Payload: `{ supabase_user_id, full_name, email, company_id, group_id? }`

1. POST `{AC_URL}/api/v3/users` con body:
   `{ Name: full_name, Email: email, ExternalId: supabase_user_id }`
2. Si error → Wait 30s → reintento. Máx 3 intentos.
3. Si fallo definitivo → callback `{ status:'failed', error }`
4. Extraer `ac_user_id` de la respuesta
5. POST `{AC_URL}/api/v3/users/{ac_user_id}/groups` `{ groupId: group_id }`
6. Callback éxito: `{ workflow:'user-create', supabase_user_id, ac_external_id: ac_user_id, status:'success' }`

---

## WF user-update
Trigger: `POST /webhook/user-update`
Payload: `{ supabase_user_id, ac_external_id, changes: { Name?, Email? } }`

1. PATCH `{AC_URL}/api/v3/users/{ac_external_id}` con `changes`
2. Si 404 → callback `{ status:'failed', error:'user_not_found_in_ac' }` (no re-crear)
3. Si ok → callback `{ status:'success' }`

---

## WF user-delete
Trigger: `POST /webhook/user-delete`
Payload: `{ supabase_user_id, ac_external_id }`

ORDEN OBLIGATORIO — AC rechaza DELETE si el usuario tiene credenciales activas:
1. GET `{AC_URL}/api/v3/users/{ac_external_id}/cards` → DELETE cada tarjeta
2. DELETE `{AC_URL}/api/v3/users/{ac_external_id}/switches` (PIN)
3. GET grupos del usuario → DELETE de cada grupo individualmente
4. DELETE `{AC_URL}/api/v3/users/{ac_external_id}`
5. Callback con resultado

---

## WF credential-card
Trigger: `POST /webhook/credential-card`
Payload: `{ ac_external_id, action: 'assign'|'revoke', card_number }`

Si action='assign':
  POST `{AC_URL}/api/v3/users/{ac_external_id}/cards` `{ CardNumber: card_number }`

Si action='revoke':
  GET `/api/v3/users/{ac_external_id}/cards` → encontrar card por número
  DELETE `/api/v3/users/{ac_external_id}/cards/{cardId}`

Callback con resultado + actualizar credentials en Supabase vía HTTP Request al backend.

---

## WF credential-pin
Trigger: `POST /webhook/credential-pin`
Payload: `{ ac_external_id, action: 'assign'|'revoke', pin? }`

Si action='assign':
  POST `/api/v3/users/{ac_external_id}/switches` `{ SwitchCode: pin }`

Si action='revoke':
  DELETE `/api/v3/users/{ac_external_id}/switches`

Callback con resultado.

---

## WF incidencia-nueva
Trigger: `POST /webhook/incidencia-nueva`
Payload: `{ incidencia_id, user_name, type, date, reason, manager_email }`

Acción: Email al manager:
  Asunto: "Nueva incidencia de {user_name}"
  Cuerpo: "Tipo: {type} | Fecha: {date} | Motivo: {reason}"

---

## WF incidencia-resuelta
Trigger: `POST /webhook/incidencia-resuelta`
Payload: `{ incidencia_id, user_email, status, manager_note }`

Acción: Email al empleado:
  Si status='approved': "Tu incidencia ha sido aprobada. {manager_note}"
  Si status='rejected': "Tu incidencia ha sido rechazada. {manager_note}"

---

## WF sync-retry (Cron cada 15 min)

1. GET Supabase: `sync_queue` WHERE `status='failed'` AND `retries < 5`
2. Por cada item:
   - UPDATE `retries = retries + 1`, `updated_at = now()`
   - Re-disparar el webhook correspondiente según `action`
3. Si `retries >= 5` → UPDATE `status='abandoned'`
   + HTTP Request al backend: `POST /webhooks/n8n/callback` `{ status:'failed', error:'max_retries' }`

---

## WF reconciliation (Cron 2:00 AM)

**IMPORTANTE:** Solo compara usuarios y permisos. NUNCA toca access_logs.

1. GET `{AC_URL}/api/v3/users?fields=Id,ExternalId,Name&limit=100&offset=0`
   Repetir con offset hasta agotar resultados (paginación)
2. GET Supabase profiles WHERE `ac_external_id IS NOT NULL`
3. Comparar listas:
   - En AC sin ExternalId → alerta "usuario huérfano en AC"
   - En Supabase sin match en AC → encolar user-create
4. Si hay discrepancias → Email resumen al admin
5. Insertar resultado en Supabase tabla `sync_logs` (si existe)
