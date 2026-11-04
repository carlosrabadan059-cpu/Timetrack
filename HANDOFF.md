# Handoff — Antigravity / TimeTrack
**Fecha:** 2026-11-04
**Repo:** https://github.com/carlosrabadan059-cpu/Timetrack (rama `main`)

Estado del proyecto y trabajo pendiente. La arquitectura, el schema y los endpoints están en `CLAUDE.md`.

---

## Estado actual

Todas las fases (0–5) están en producción. Del lado del código, la auditoría RGPD (#30) está hecha salvo el punto 8 (aplazado). No hay trabajo a medias en el repo.

### Despliegue

| Pieza | Dónde | Cómo se actualiza |
|---|---|---|
| Frontend | **Dokploy**, app `Timetrack` (`timetrack-4uibyn`), https://timetrack.rabadanhouse.space | Auto-deploy al hacer push a `main` |
| Backend | Docker en Raspberry Pi (192.168.1.10), stack **`n8n`** de Portainer, contenedor `n8n-backend-1`, expuesto en https://api.rabadanhouse.space por Cloudflare Tunnel | `docker buildx build --platform linux/arm64 --push` → Portainer → Containers → *Recreate* con re-pull (ver `docs/signalr-resilience.md`) |
| n8n | Mismo stack, https://n8n.rabadanhouse.space | — |
| Copias de seguridad | Mismo stack, contenedor `n8n-backup-1` (imagen `rabadanhouse/timetrack-backup:latest`) | Igual que el backend. Detalle en `docs/backups.md` |
| Base de datos | Supabase, proyecto *Control horario* (`bflflqxwndzewnrxmohd`, eu-west-1, Postgres 17) | Migraciones con el MCP de Supabase |

**No hay despliegue en Vercel.** Restos eliminados (#33). Las cabeceras de seguridad que definía `vercel.json` no se aplican en Dokploy: ver #35.

### Copias de seguridad (punto 17 de #30, cerrado el 2026-11-04)

- Cada noche a las **03:30** se hace un `pg_dump` de los esquemas `public` y `auth` de Supabase, por el *Session pooler*.
- Se cifra con **age** y se sube a **Google Drive** (`timetrack-backups/`).
  - **Rotación:** 14 días de copias diarias y 400 días de mensuales.
  - **Si falla:** aviso por Telegram (`@timetrack_backups_rabadan_bot`). El contenedor pasa a *unhealthy* si pasan 26 h sin un backup correcto.
- **Restauración probada con una copia real:** las 47 tablas tienen los mismos recuentos y el mismo md5 que producción.
- **Secretos, todos en la app Contraseñas del Mac:**
  - clave privada age (*TimeTrack backup age*);
  - token del bot de Telegram;
  - ID y secreto del cliente OAuth de Google (proyecto `rclone-timetrack`, publicado *En producción*);
  - contraseña de la base de datos de Supabase.
- El 2026-11-04 se rotaron el token de Telegram y el de Drive, porque se habían expuesto en un chat.

### Cambios de la sesión del 2026-11-04

- `ac317e9`, `63f3a0a`: pantalla **Registro de auditoría** en *Ajustes → Privacidad*, que lee `GET /api/admin/audit` con filtro por acción y nombres legibles.
- `d34a6cd`: los docs ya dicen Dokploy en lugar de Vercel.
- `aefc6e0`, `ad559db`, `f8acb06`, `046e4f3`, `20ba36b`: contenedor de backup, healthcheck, avisos y documentación.
- `n8n-skills/` añadido a `.gitignore` (es un repo externo clonado).

---

## Pendiente

### Issues abiertas

| # | Qué | Quién | Estado |
|---|---|---|---|
| **#30** | Auditoría RGPD: documentación legal — 13 DPA y subencargados, 14 EIPD (GPS), 15 registro de tratamientos, 19 política de desconexión digital, 20 procedimiento de brechas; revisión de `/privacidad` por un asesor | Responsable / asesor legal (Claude puede redactar borradores) | Pendiente |
| #30 | Punto 8: RLS real por `company_id` | Código | Aplazado hasta que haya una 2.ª empresa |
| **#31** | Alta de usuarios en 2N: "Company must be specified" | Código | Aplazado: la licencia de desarrollo de 2N solo admite 5 usuarios |
| **#28** | Cuentas de prueba (`admin@`/`empleado@timetrack.com`) con contraseña `123456` | Responsable | Se mantienen a propósito hasta el uso real |
| **#32** | `npm run lint` falla: ESLint 9 sin `eslint.config.js` | Código | Listo para hacer, ~15 min |
| **#35** | Cabeceras de seguridad (CSP, HSTS, X-Frame-Options…) no se envían desde que el frontend está en Dokploy (regresión de CN-002) | Dokploy/Traefik o Cloudflare | Pendiente |
| **#34** | Copias: probar la recuperación en un proyecto nuevo de Supabase; las credenciales de n8n no tienen copia | Decisión + prueba | Pendiente |

### Antes de usar la app con empleados reales

1. **#28:** cambiar las contraseñas de las cuentas de prueba o borrar esas cuentas.
2. **#31:** licencia de 2N de producción y probar el alta de usuarios.
3. **#30:** tener firmados el DPA, la EIPD y la política de desconexión, y la página `/privacidad` revisada.
4. **#35:** cabeceras de seguridad activas en el frontend.

### Mantenimiento recurrente

- **Cada trimestre:** prueba de restauración local de una copia real (procedimiento en `docs/backups.md`).
- **Tras publicar una imagen nueva** del backend o del backup: comprobar con `docker inspect` que el contenedor usa el digest nuevo.

---

## Si algo falla

- **Backend 502/530:** comprueba en Portainer que `n8n-backend-1` y `n8n-cloudflared-1` están *running* y en la red `n8n_net`. Si no: Stacks → `n8n` → *Update the stack*.
- **Aviso de Telegram "TimeTrack backup FALLO":** mira los logs de `n8n-backup-1`. Causas habituales: la contraseña de Supabase ha cambiado (`SUPABASE_DB_URL`), el token de Drive se ha revocado o caducado (`rclone config reconnect gdrive:` y actualizar `RCLONE_CONFIG_B64`) o hay un valor mal pegado en Portainer. Diagnóstico en `docs/backups.md`.
- **2N desconectado:** el aviso llega por Telegram desde el workflow de n8n *2N Connection Down Alert*. Ver `docs/signalr-resilience.md`.

---

## Grafo de conocimiento

```bash
graphify query "how does the fichar endpoint work"
graphify path "POST /api/me/fichar" "access_logs"
graphify update .   # tras cambios de código, sin API key
```

## Skills recomendadas

- **`antigravity-backend`:** antes de tocar rutas del backend, el schema de Supabase, SignalR, n8n o la lógica de fichaje.
- **`verification-before-completion`:** antes de dar algo por terminado.
- **`systematic-debugging`:** si aparecen bugs nuevos.
