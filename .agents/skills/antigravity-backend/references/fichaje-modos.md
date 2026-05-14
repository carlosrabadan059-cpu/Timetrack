# Modos de Fichaje — Implementación Detallada

## Los 4 valores de source

```
signalr    → lector físico 2N vía SignalR (automático)
web        → botón en la app web
mobile     → botón en la app móvil (puede incluir GPS)
correction → creado al aprobar incidencia tipo 'olvido'
```

## Modo 2N — SignalR Listener

```typescript
// src/services/signalr-listener.ts

async function handleAccessLog(data: any) {
  lastEventTimestamp = data.timestamp

  // Resolver user_id por ac_external_id
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('id')
    .eq('ac_external_id', data.externalId).single()

  if (!profile) return // No sincronizado aún — ignorar

  await supabaseAdmin.from('access_logs').insert({
    user_id: profile.id,
    device_id: data.deviceId,
    device_name: data.deviceName,
    zone_id: data.zoneId,
    zone_name: data.zoneName,
    event_type: data.eventType === 'AccessGranted' ? 'granted' : 'denied',
    direction: data.direction ?? 'in',
    detail_type: inferDetailType(data.timestamp),
    timestamp: data.timestamp,
    source: 'signalr',
    device_info: data.deviceName,
    raw_payload: data
  })

  sseBroadcaster.emit(profile.id, {
    type: 'access_event',
    direction: data.direction ?? 'in',
    timestamp: data.timestamp,
    zone_name: data.zoneName ?? null,
    source: 'signalr',
    detail_type: inferDetailType(data.timestamp)
  })
}
```

## Modo Web y Móvil — POST /api/me/fichar

```typescript
// Rate limit: 1 cada 5 minutos por usuario → 429
// Todos los campos del body son opcionales

const ficharSchema = z.object({
  direction:   z.enum(['in', 'out']).optional(),
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
  device_info: z.enum(['web', 'ios', 'android']).optional().default('web')
})

// Paso 1: Obtener último fichaje VÁLIDO de hoy
// CRÍTICO: filtrar por event_type='granted' — los 'denied' de 2N no cuentan
const { data: lastLog } = await supabaseAdmin
  .from('access_logs')
  .select('direction, timestamp, source')
  .eq('user_id', user.id)
  .eq('event_type', 'granted')               // ← solo fichajes válidos
  .gte('timestamp', startOfDay(now).toISOString())
  .order('timestamp', { ascending: false })
  .limit(1)
  .maybeSingle()                             // null si no hay ninguno hoy

// Paso 2: Inferir dirección
const direction = body.direction
  ?? ((!lastLog || lastLog.direction === 'out') ? 'in' : 'out')

// Paso 3: Validar no duplicado
if (lastLog && lastLog.direction === direction) {
  return 422 { code: 'duplicate_direction' }
}

// Paso 4: Determinar source por device_info, NO por GPS
// GPS puede estar presente en web también — no es indicador fiable de móvil
const source: 'web' | 'mobile' =
  (body.device_info === 'ios' || body.device_info === 'android') ? 'mobile' : 'web'

// Paso 5: INSERT
await supabaseAdmin.from('access_logs').insert({
  user_id: user.id,
  event_type: 'granted',
  direction,
  detail_type: inferDetailType(now.toISOString()),
  timestamp: now.toISOString(),
  source,
  latitude: body.latitude ?? null,
  longitude: body.longitude ?? null,
  device_info: body.device_info ?? 'web'
})
```

## Modo Corrección — al aprobar incidencia tipo 'olvido'

```typescript
// PATCH /api/incidencias/:id con status='approved' y type='olvido'

await supabaseAdmin.from('access_logs').insert({
  user_id: incidencia.user_id,
  event_type: 'granted',
  direction: incidencia.requested_direction,  // definida por el empleado al crear la incidencia
  detail_type: inferDetailType(incidencia.requested_timestamp),
  timestamp: incidencia.requested_timestamp,
  source: 'correction',    // SIEMPRE 'correction' — nunca 'web' ni 'mobile'
  corrected: false,        // es un log nuevo, no una modificación de uno existente
  device_info: 'correction'
})

// tipo='correccion' → NO crear nuevo log, modificar el existente
await supabaseAdmin.from('access_logs')
  .update({
    corrected: true,
    original_timestamp: logExistente.timestamp,  // guardar original
    timestamp: incidencia.requested_timestamp,
    // source NO cambia — mantener el original (signalr/web/mobile)
  })
  .eq('id', incidencia.access_log_id)
```

## Algoritmo de emparejamiento in/out

```typescript
// src/services/attendance.ts
// AGNÓSTICO del source — un 'in' de SignalR + 'out' de web es un par válido

function calculateDaySummary(fichajes: Fichaje[]): DaySummary {
  // 1. Ignorar fichajes denied — solo trabajar con granted
  const valid = fichajes.filter(f => f.event_type !== 'denied')

  // 2. Ordenar ASC por timestamp (mezcla de sources — no importa)
  const sorted = valid.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  let totalMinutes = 0
  let descansoMinutes = 0
  let isInside = false
  let pendingIn: Fichaje | null = null

  for (const fichaje of sorted) {
    if (fichaje.direction === 'in') {
      pendingIn = fichaje
      isInside = true
    } else if (fichaje.direction === 'out' && pendingIn) {
      const durationMin = Math.floor(
        (new Date(fichaje.timestamp).getTime() - new Date(pendingIn.timestamp).getTime()) / 60000
      )
      // La pausa comida se identifica por el detail_type del 'in', no del 'out'
      if (pendingIn.detail_type === 'comida') {
        descansoMinutes += durationMin
      } else {
        totalMinutes += durationMin
      }
      pendingIn = null
      isInside = false
    }
  }
  // pendingIn sin 'out' → isInside = true, no computar ese período

  return { total_minutes: totalMinutes, descanso_minutes: descansoMinutes, is_inside: isInside }
}
```

## Tabla de comportamiento por modo

| Aspecto | signalr | web | mobile | correction |
|---------|---------|-----|--------|------------|
| Requiere JWT | No | Sí | Sí | No |
| GPS disponible | No | No | Opcional | No |
| Va a 2N AC | Viene de 2N | ✗ Nunca | ✗ Nunca | ✗ Nunca |
| Inferencia dirección | Del payload 2N | Automática (solo granted) | Automática (solo granted) | Del manager |
| Rate limit 5 min | No | Sí | Sí | No |
| Cuenta para horas | ✅ | ✅ | ✅ | ✅ |
| Visible en Historial | ✅ | ✅ | ✅ | ✅ marcado |
| En PDF/Excel | ✅ | ✅ | ✅ | ✅ asterisco |
| Emite SSE | ✅ | ✅ | ✅ | ✅ al aprobar |
