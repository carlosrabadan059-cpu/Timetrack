# 2N Access Commander — API Reference

## REST API v3

```
Base URL: https://{AC_IP}/api/v3/
Auth:     Authorization: Bearer {AC_API_TOKEN}
Docs:     https://{AC_IP}/support/api
```

## Endpoints principales

### Usuarios
```
GET    /api/v3/users                     Lista usuarios (soporta Data Query)
POST   /api/v3/users                     Crear usuario
PATCH  /api/v3/users/{id}                Modificar usuario
DELETE /api/v3/users/{id}                Eliminar (requiere sin credenciales activas)
POST   /api/v3/users/{id}/groups         Asignar a grupo  { groupId }
DELETE /api/v3/users/{id}/groups/{gId}   Quitar de grupo
GET    /api/v3/users/{id}/cards          Listar tarjetas RFID
POST   /api/v3/users/{id}/cards          Asignar tarjeta  { CardNumber }
DELETE /api/v3/users/{id}/cards/{cardId} Revocar tarjeta
POST   /api/v3/users/{id}/switches       Asignar PIN  { SwitchCode }
DELETE /api/v3/users/{id}/switches       Revocar PIN
```

**CRÍTICO al crear usuario:** incluir `ExternalId = supabase_uuid` en el body.
Este campo es el puente entre Supabase y AC.

### Grupos y Zonas
```
GET /api/v3/groups          Lista grupos
GET /api/v3/zones           Lista zonas
GET /api/v3/accessRules     Reglas de acceso
GET /api/v3/devices         Lista dispositivos
GET /api/v3/timeProfiles    Perfiles horarios
```

### Dispositivos físicos (HTTP API — diferente al REST de AC)
```
Auth: HTTPS + Digest Authentication
URL:  https://{DEVICE_IP}/api/

GET /api/switch/ctrl?switch=1&action=trigger  Abrir puerta
```

## Data Query — Filtrado y paginación

Todos los GET de colecciones soportan:
```
?filter={"Name":{"$eq":"John"}}&fields=Id,Name,ExternalId&sort=-Name&limit=100&offset=0
```

Operadores: `$eq` `$ne` `$gt` `$lt` `$gte` `$lte` `$like` `$in`

Patrón de paginación para sync masiva:
```typescript
async function getAllUsers(): Promise<ACUser[]> {
  const PAGE_SIZE = 100
  let offset = 0
  const all: ACUser[] = []

  while (true) {
    const res = await acClient.getUsers(
      `fields=Id,Name,ExternalId,Email&limit=${PAGE_SIZE}&offset=${offset}`
    )
    all.push(...res)
    if (res.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}
```

Sync incremental (solo cambios recientes):
```
?filter={"ModifiedAt":{"$gt":"2026-04-01T00:00:00Z"}}&fields=Id,ExternalId,Name
```

## SignalR — Topics y Payloads

### Hub URL v3
```
https://{AC_IP}/mainhubv3
Auth: mismo Bearer Token que REST API
```

### Topic: accesslog
```json
{
  "type": "accesslog",
  "action": "new",
  "data": {
    "id": "event-uuid",
    "timestamp": "2026-04-10T09:05:00Z",
    "deviceId": "device-uuid",
    "deviceName": "Puerta Principal",
    "userId": "ac-user-uuid",
    "userName": "John Doe",
    "externalId": "supabase-uuid",    ← campo clave para linking
    "cardNumber": "12345678",
    "eventType": "AccessGranted",     ← AccessGranted | AccessDenied | Doorbell
    "zoneName": "Recepción",
    "direction": "in"                 ← in | out
  }
}
```

### Topic: userchange
```json
{
  "type": "userchange",
  "data": {
    "changeType": "modified",         ← created | modified | deleted
    "userId": "ac-user-uuid",
    "externalId": "supabase-uuid",
    "changedFields": ["Name", "Email"]
  }
}
```

### Topic: devicemonitor
```json
{
  "type": "devicemonitor",
  "data": {
    "deviceId": "device-uuid",
    "deviceName": "Interfono Planta 2",
    "status": "offline",              ← online | offline | warning
    "ipAddress": "192.168.1.50",
    "timestamp": "ISO"
  }
}
```

### Comandos SignalR
```typescript
// Suscribirse
await connection.invoke('Subscribe', 'accesslog', null)   // null = sin filtro

// Recuperar eventos perdidos al reconectar
await connection.invoke('Update', lastEventTimestamp)

// Cancelar suscripción
await connection.invoke('Unsubscribe', subscriptionId)
```
