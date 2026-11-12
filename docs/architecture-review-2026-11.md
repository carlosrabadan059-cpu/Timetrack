# Revisión de arquitectura de despliegue — noviembre 2026

Estado: **propuesta, pendiente de verificar**. Nada de esto está aplicado salvo lo marcado como "hecho".

Objetivo del documento: que un revisor independiente (Codex u otra persona) compruebe el diagnóstico y las propuestas contra el código y la infraestructura real antes de ejecutar nada.

---

## 1. Arquitectura actual

| Pieza | Dónde corre | Cómo se despliega |
|---|---|---|
| Frontend (React + Vite, nginx) | **Dokploy**, en un servidor Debian en casa. App `Timetrack` (`timetrack-4uibyn`), https://timetrack.rabadanhouse.space | Automático: push a `main` → Dokploy construye `Dockerfile` |
| Backend (Hono/TypeScript) | **Raspberry Pi** (192.168.1.10, arm64), Portainer, stack `n8n`, contenedor `n8n-backend-1`. Expuesto en https://api.rabadanhouse.space por Cloudflare Tunnel | Manual: `docker buildx build --platform linux/arm64 --push` desde el Mac → Portainer → *Update the stack* con re-pull → comprobar el ID de imagen a mano |
| n8n + su Postgres | Pi, mismo stack `n8n` | Portainer |
| cloudflared | Pi, mismo stack `n8n` | Portainer |
| Backup (`pg_dump` → age → Google Drive) | Pi, mismo stack `n8n`, contenedor `n8n-backup-1` | Igual que el backend |
| Base de datos + Auth | **Supabase en la nube**, proyecto `bflflqxwndzewnrxmohd` (eu-west-1) | Migraciones con el MCP de Supabase |
| 2N Access Commander | En casa, accesible por Cloudflare en `access.rabadanhouse.space` | — |
| Supabase self-hosted | Servidor Debian (el mismo de Dokploy). **No lo usa TimeTrack** | — |

Referencias: `CLAUDE.md` (notas de despliegue), `HANDOFF.md`, `docs/signalr-resilience.md`, `docs/backups.md`.

---

## 2. Problemas observados (con evidencia)

### 2.1 El despliegue del backend no es fiable
- El 2026-11-11 y el 2026-11-12, en **2 de 3 despliegues** el contenedor siguió con la imagen anterior tras *Update the stack* con "Re-pull image" (IDs vistos: `9300…` y `331a…` en lugar de `87cf…` y `8013…`). Hubo que hacer *Pull image* a mano en Portainer y repetir.
- Causa probable: todas las imágenes se publican solo como `:latest`. Portainer no detecta siempre el cambio.
- No hay forma sencilla de saber qué versión corre: `/health` no devuelve versión ni commit. Hay que comparar hashes en la UI de Portainer, donde la fila "ID" (contenedor) se confunde con la fila "Image".
- No hay CI (`.github/workflows/` no existe). La imagen se construye en el Mac del responsable: puede incluir cambios sin commitear.

### 2.2 Todo en un único stack
- `postgres`, `n8n`, `backend`, `cloudflared` y `backup` están en el mismo stack de Portainer. *Update the stack* recrea los cinco: durante un despliegue del backend el túnel cae (`error code: 1033` de Cloudflare observado el 2026-11-12) y n8n se reinicia.
- El compose y sus variables solo existen dentro de Portainer, no en Git. Si se pierde la Pi se pierde también cómo estaba montado (relacionado con la issue #34).

### 2.3 Secretos repartidos y duplicados
- Ubicaciones: variables del stack de Portainer, credenciales de n8n, app Contraseñas del Mac, Supabase, Google Cloud.
- `N8N_WEBHOOK_SECRET` debe tener el mismo valor en los servicios `n8n` y `backend`; si no coinciden, la validación falla sin aviso (el nodo IF del workflow simplemente no continúa).

### 2.4 Saltos innecesarios en caminos críticos
- La alerta "2N caído" recorre: backend → webhook → n8n → comprobación de secreto → credencial de Telegram → Telegram. El 2026-11-11 fallaron tres eslabones distintos:
  1. el mensaje superaba 4096 caracteres porque incluía el HTML del 502 de Cloudflare (corregido en `e25828e`);
  2. un cambio en el workflow quedó como borrador sin publicar;
  3. la credencial de Telegram del nodo había cambiado sin que constara.
- Además el workflow no guarda las ejecuciones correctas (`saveDataSuccessExecution: none`), así que un envío correcto no deja rastro verificable.
- Contraste: el contenedor de backup avisa a Telegram directamente con `curl` y no ha fallado.

---

## 3. Propuestas

Por orden de impacto. Las 1–2 no tocan producción.

### P1. Versión visible en `/health`
`GET /health` devuelve el commit desplegado (p. ej. `"version": "f7f8d9a"`), inyectado en el build (`ARG GIT_SHA` → variable de entorno). Verificar un despliegue pasa a ser un `curl`.

### P2. Mover el backend a Dokploy (recomendada)
- El backend **no necesita la red local de la Pi**: llega al 2N por `access.rabadanhouse.space` y a n8n por `n8n.rabadanhouse.space` (ambos públicos vía Cloudflare). Verificar en `backend/.env.example` y en las variables `AC_BASE_URL` y `N8N_WEBHOOK_BASE_URL` del stack.
- Dokploy ya despliega el frontend desde Git sin problemas: build desde `backend/Dockerfile` en cada push a `main`, sin Mac, sin Docker Hub, sin `:latest`, y la UI muestra el commit desplegado.
- Exponer `api.rabadanhouse.space` desde el Debian con `cloudflared` (sin abrir puertos), igual que ahora en la Pi.
- El Debian es **x86_64** (confirmado con `uname -m`): desaparece también la compilación cruzada a arm64.

Resultado:

| Dónde | Qué | Frecuencia de cambios |
|---|---|---|
| Debian en casa (Dokploy) | frontend + backend (+ backup, opcional) | Cada push a `main`, automático |
| Pi (Portainer) | n8n + postgres + cloudflared | Rara vez |
| Supabase nube | BD + Auth | Migraciones |

Riesgos de la migración:
1. **Nunca dos backends a la vez**: ambos abrirían conexión SignalR con el 2N y cada fichaje físico se insertaría dos veces en `access_logs`. Orden: parar el de la Pi → arrancar el de Dokploy.
2. Cambiar el destino de `api.rabadanhouse.space` (túnel de la Pi → túnel del Debian).
3. Trasladar todas las variables de entorno del servicio `backend` (`SUPABASE_*`, `AC_*`, `N8N_*`, `SETTINGS_ENCRYPTION_KEY`, …) a Dokploy.
4. Marcha atrás: dejar el contenedor de la Pi parado, no borrado, unos días.

### P3. Si el backend se queda en la Pi (alternativa a P2)
- CI con GitHub Actions: build arm64 en cada push a `main`, etiquetas `:<sha>` y `:latest`.
- El stack fija la etiqueta `:<sha>` y Actions llama al webhook de redeploy de Portainer (o Watchtower solo para el backend).
- Separar el stack en dos: `backend`+`backup` y `n8n`+`postgres`+`cloudflared`.
- Compose versionado en Git (`deploy/`) y stack de Portainer leído desde Git; variables en Portainer.

### P4. Alertas críticas directas a Telegram
El backend envía las alertas de 2N caído/recuperado directamente a la API de Telegram (como hace el backup) en lugar de pasar por n8n. n8n se queda para la orquestación real (sincronización con 2N y reintentos). **Choca con la regla de `CLAUDE.md`** "n8n gestiona todo lo asíncrono…": requiere decisión explícita y, si se acepta, un ADR en `docs/adr/`.

### Decisión: NO mover la base de datos al Supabase self-hosted
- Un corte de luz o de internet en casa dejaría a todos los empleados sin fichar ni entrar; con la BD en la nube, solo se retrasan los fichajes del 2N.
- Supabase self-hosted son ~10 servicios que mantener (Postgres, GoTrue, Kong, Realtime…).
- RGPD: conservación de 4 años del registro de jornada; la nube UE con DPA es más fácil de justificar.
- Uso propuesto del self-hosted: **destino de la prueba de restauración de #34** y plan B ante una caída de Supabase nube.

---

## 4. Cambios ya aplicados en esta sesión (para contexto)

| Commit | Qué |
|---|---|
| `7a90b45`, `468f7d2`, `6e042b6` | Horario flexible y horario por sucursal (`backend/src/lib/schedule.ts`, tests en `schedule.test.ts`) |
| `e25828e` | `summarizeError()` en `signalr-listener.ts`: `lastError` corto para que la alerta quepa en Telegram |
| `9472417` | Aviso "2N reconectado" (`event: 'restored'` al mismo webhook) |
| `673ce27`, `f9a5512`, `aefc678` | Documentación (`docs/signalr-resilience.md`, `HANDOFF.md`, #34 aplazada) |
| `f7f8d9a` | `GET /api/me/schedule` y sucursal/horario en Mi Perfil |
| — | `N8N_WEBHOOK_SECRET` rotado (fuera del repo) |
| — | Workflow n8n `2N Connection Down Alert` (`PemuhSSqVfOIOEWE`) editado y publicado: mensaje de recuperación y fechas en hora de Madrid |

---

## 5. Qué pedir al revisor

1. ¿Es correcto que el backend no depende de la red local de la Pi? Revisar `backend/src/lib/ac-client.ts`, `backend/src/services/signalr-listener.ts`, `backend/src/lib/n8n.ts` y cualquier IP privada (`192.168.`) en el código o en los docs.
2. ¿Hay algo en el backend que impida ejecutar **dos instancias** a la vez sin duplicar fichajes, o que haga peligrosa la migración? (SignalR, crons internos, `setInterval`, colas.)
3. ¿`backend/Dockerfile` sirve tal cual para que Dokploy lo construya en x86_64, o tiene supuestos de arm64?
4. ¿Qué variables de entorno necesita el backend? Contrastar `backend/.env.example` con todos los `process.env[...]` del código.
5. ¿Hay riesgos o pasos que falten en P2 (orden de corte, DNS, rollback)?
6. ¿Es razonable P4 o conviene mantener n8n como único canal de notificaciones?
7. Revisar el diagnóstico de la sección 2: ¿falta algún punto de fallo relevante?

Servidor Debian: Debian 12 (bookworm), x86_64 (confirmado). La imagen base del backend (`node:26-alpine`, fijada por digest) es multiarquitectura e incluye amd64.
