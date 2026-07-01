# Resiliencia del listener SignalR (2N Access Commander)

## Problema original

El listener SignalR (`backend/src/services/signalr-listener.ts`) se conecta al hub
de 2N Access Commander (`{AC_BASE_URL}/mainhubv3`) para recibir fichajes en tiempo
real del lector físico. Antes del 2026-07-01, si esa conexión fallaba al arrancar
(por ejemplo, un corte transitorio del túnel de Cloudflare hacia 2N) o se cerraba
tras agotar los intentos de `withAutomaticReconnect`, el código solo hacía un
`console.warn` y terminaba — la conexión quedaba muerta para siempre. Los fichajes
físicos dejaban de llegar a `access_logs` sin ningún aviso, y la única forma de
recuperarlo era un `docker restart` manual del contenedor del backend.

## Fix

1. **Retry con backoff indefinido** — si `conn.start()` falla o `conn.onclose()`
   se dispara, se entra en un bucle de reintento propio
   (`retryConnectionLoop`) con delays `2s → 5s → 15s → 30s → 60s → 120s` (techo).
   El bucle se detiene solo si la conexión se restablece o si la empresa
   deshabilita 2N mientras tanto (`connectionStatus.delete(companyId)`).

2. **Estado consultable** — `getSignalRStatus()` expone por empresa:
   `connected`, `disconnectedSince`, `lastError`. Se actualiza en cada
   transición (`markUp`/`markDown`) desde `onreconnected`, `onreconnecting`,
   `onclose` y el catch de `startCompanyConnection`.

3. **`GET /health`** ahora incluye `signalr: ConnectionStatus[]` — se puede
   vigilar externamente sin depender de logs.

4. **Alerta a Telegram vía n8n** — un `setInterval` de 60s revisa las
   conexiones caídas; si alguna lleva más de 10 minutos sin reconectar
   (`DOWN_ALERT_THRESHOLD_MS`), dispara `dispatchN8nWebhook('2n-connection-down', {...})`
   una sola vez por caída (`alertSent`). El workflow de n8n `2N Connection Down
   Alert` (activo, ID `PemuhSSqVfOIOEWE`) valida el header `X-N8N-Secret` y
   reenvía el mensaje a Telegram.

## Qué NO cambia el fix

- No evita el fallo inicial de negociación en sí (si 2N/túnel está caído, la
  primera conexión seguirá fallando) — solo evita que el backend se quede
  colgado sin volver a intentarlo.
- No sustituye la necesidad de que `AC_BASE_URL` sea alcanzable desde el
  contenedor del backend. Si 2N está realmente caído (no un hiccup transitorio
  del túnel), los reintentos seguirán fallando indefinidamente cada 2 minutos
  hasta que 2N vuelva — es entonces cuando la alerta de Telegram cobra valor.

## Verificar tras un redeploy

```bash
docker logs --since 3m n8n-backend-1 | grep -E "^\[SignalR\]"
```

Si aparece `[SignalR][<empresa>] Conectado`, todo está bien — no hace falta
reiniciar nada. Si no aparece tras 2-3 minutos, revisar si 2N/el túnel están
realmente caídos (o esperar la alerta de Telegram a los 10 minutos).

## Requisito de infraestructura: `N8N_WEBHOOK_SECRET` en ambos servicios

El compose de Portainer (stack `n8n`) tenía `N8N_WEBHOOK_SECRET` solo en el
servicio `backend` (para firmar sus webhooks salientes). El workflow de alerta
necesita el mismo valor en el servicio `n8n` para poder validarlo al recibir
el webhook. Añadido como variable de entorno del stack — ver
`docs/n8n-stack.env.example` para la lista completa de variables externalizadas.

## Pendiente (no aplicado aún)

El compose de Portainer no tiene `depends_on` entre `backend` y `n8n`, ni entre
`cloudflared` y `backend`. Esto puede causar que un despliegue completo del
stack (los 4 contenedores a la vez) arranque el backend antes de que n8n esté
realmente sano, o que el túnel termine de negociar sus rutas de ingress antes
de que el backend acepte conexiones — requiriendo reiniciar contenedores uno
a uno tras un `docker compose up` completo. Fix propuesto (no aplicado):

```yaml
  backend:
    depends_on:
      n8n:
        condition: service_healthy
    # ...

  cloudflared:
    depends_on:
      n8n:
        condition: service_healthy
      backend:
        condition: service_healthy
    # ...
```

La imagen `rabadanhouse/timetrack-backend:latest` ya trae un `HEALTHCHECK`
en su Dockerfile (`wget -qO- http://localhost:3000/health`), así que Compose
puede usar `condition: service_healthy` sin configuración adicional.
