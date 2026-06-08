# Handoff — Antigravity / TimeTrack
**Date:** 2026-06-08  
**Repo:** https://github.com/carlosrabadan059-cpu/Timetrack  
**Branch:** `main` (commit `b90fef3`)

---

## What happened this session

### Graphify installed (commits `fa96904`, `e964cdc`)
- `graphifyy` installed via `pipx install graphifyy`
- `graphify claude install` añadió sección a `CLAUDE.md` y hooks `PreToolUse` en `.claude/settings.json`
- Grafo construido con `graphify update .`: 3,536 nodos, 3,658 aristas, 381 comunidades (solo código, sin LLM key)
- `graphify-out/cache/` excluido de git via `.gitignore`
- Skills de agente añadidos en `.agents/skills/` y docs en `docs/agents/`

### Auth bug fixed (commits `4004298`, `b90fef3`)

**Root cause:** Race condition en `src/contexts/AuthContext.jsx`.  
Al hacer login con otro usuario, `onAuthStateChange` seteaba el nuevo `user` pero `profile` seguía teniendo los datos del usuario anterior. `LoginPage` redirigía en cuanto `isAuthenticated = true` usando el perfil stale — siempre entraba en el dashboard del usuario equivocado (Carlos Rabadán en lugar de Admin).

**Fixes aplicados:**
1. `src/contexts/AuthContext.jsx`: `setProfile(null)` antes de llamar a `loadProfile()` en `onAuthStateChange` — limpia el perfil anterior antes de cargar el nuevo.
2. `src/pages/LoginPage.jsx`: la redirección ahora requiere `isAuthenticated && profile` — espera al perfil real antes de navegar.
3. `src/contexts/AuthContext.jsx`: `loadProfile()` tiene fallback directo a Supabase `profiles` si `/api/me` no responde — el login funciona aunque el backend esté caído.
4. `src/pages/LoginPage.jsx`: timeout de 8s muestra error y desbloquea el botón si el perfil nunca llega.

### Incidente de infraestructura (resuelto)
- El contenedor `cloudflared` perdió la red `n8n_net` de Docker tras un fallo de recreación en Portainer — causó errores 502/1033 en `api.rabadanhouse.space`.
- Resuelto con redeploy completo del stack desde Portainer (Stacks → n8n → Update the stack).
- Backend confirmado healthy: `GET /health` devuelve `{"status":"ok"}`.

---

## Current project state

Todas las fases 0–5 completadas. Sin trabajo pendiente. App operativa.

- Backend: `https://api.rabadanhouse.space` (Docker en Raspberry Pi 192.168.1.10 via Cloudflare Tunnel)
- Frontend: Vercel (auto-deploy desde `main`)
- Stack compose: Portainer → Stack `n8n` (postgres, n8n, backend, cloudflared en red `n8n_net`)

Ver `CLAUDE.md` para referencia completa de arquitectura, schema y endpoints.

---

## Cómo usar el grafo de conocimiento

```bash
# Pregunta focalizada (preferido — mucho más pequeño que grep)
graphify query "how does the fichar endpoint work"

# Relación entre dos nodos
graphify path "POST /api/me/fichar" "access_logs"

# Explicar un concepto
graphify explain "SignalR listener"

# Actualizar tras cambios de código (no necesita API key)
graphify update .
```

El grafo NO incluye docs/imágenes. Para añadir extracción semántica: `ANTHROPIC_API_KEY=<key> graphify .`

---

## Si el backend vuelve a dar 502/530

1. Portainer → Container `backend` — comprobar que está running
2. Portainer → Container `cloudflared` — comprobar que está en red `n8n_net`
3. Si alguno no está en la red: Stacks → n8n → **Update the stack**

---

## Suggested skills

- **`antigravity-backend`** — cargar siempre antes de tocar rutas backend, schema Supabase, SignalR, n8n o lógica de fichaje
- **`graphify`** — `graphify-out/` existe y está poblado; usar `graphify query` antes de explorar código fuente
- **`verification-before-completion`** — ejecutar antes de dar cualquier fix o feature por terminado
- **`systematic-debugging`** — usar si aparecen nuevos bugs; el flujo de auth está corregido pero pueden surgir edge cases en SSE/SignalR
