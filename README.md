# ⏱️ TimeTrack — Control de Accesos y Fichajes

Plataforma de gestión de control de accesos y fichajes para empresas. Integra dispositivos físicos **2N Access Commander** con una interfaz web moderna, ofreciendo registro automático (lector RFID), fichaje manual desde la web/móvil y un panel de administración completo.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite)                     │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Employee UI  │  │      Admin Panel       │   │
│  └──────────────┘  └────────────────────────┘   │
└─────────────────────┬───────────────────────────┘
                      │ REST API + SSE
┌─────────────────────▼───────────────────────────┐
│  Backend (Node 20 + Hono + TypeScript strict)   │
│  ┌────────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Auth JWT  │ │  Routes  │ │ SignalR Lstnr │  │
│  └────────────┘ └──────────┘ └───────────────┘  │
└────┬────────────────┬─────────────────┬──────────┘
     │                │                 │
┌────▼────┐    ┌──────▼──────┐  ┌──────▼───────┐
│Supabase │    │ 2N Access   │  │     n8n      │
│Auth + DB│    │ Commander   │  │  Workflows   │
└─────────┘    └─────────────┘  └──────────────┘
```

## ✨ Funcionalidades

### Empleado
- **Dashboard** con estado en tiempo real (dentro/fuera)
- **Botón de fichaje** — infiere dirección automáticamente
- **Historial** de accesos con filtros y exportación (PDF/Excel)
- **Incidencias** — solicitar correcciones de fichaje
- **Reportes** mensuales descargables

### Administrador / Manager
- **Panel de empleados** — gestión completa + sync con 2N AC
- **Control de asistencia** en tiempo real
- **Gestión de incidencias** — aprobar/rechazar solicitudes
- **Reportes globales** de la empresa

### Sistema
- **3 modos de fichaje**: lector físico 2N (SignalR), web y móvil (GPS)
- **SSE** para actualizaciones en tiempo real al frontend
- **Rate limiting** — máx. 1 fichaje cada 5 minutos por usuario
- **Inferencia de dirección** (in/out) automática
- **Cola de sincronización** con reintentos vía n8n

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v3, React Router v7 |
| Backend | Node.js 20 LTS, TypeScript strict, Hono |
| Base de datos | Supabase (PostgreSQL + Auth + RLS) |
| Control de acceso | 2N Access Commander v3 (REST + SignalR) |
| Automatización | n8n (workflows asíncronos con reintentos) |
| Generación docs | pdfkit, exceljs |
| Validación | Zod |

---

## 🚀 Inicio rápido

### Requisitos
- Node.js 20 LTS
- Cuenta Supabase
- (Opcional) Instancia 2N Access Commander

### Frontend

```bash
npm install
npm run dev        # http://localhost:5173
```

### Backend

```bash
cd backend
cp .env.example .env   # Rellenar las variables de entorno
npm install
npm run dev            # http://localhost:3000
```

### Variables de entorno (backend)

Copia `backend/.env.example` a `backend/.env` y rellena:

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # Solo servidor, nunca exponer al cliente

# 2N Access Commander
AC_BASE_URL=https://192.168.x.x
AC_API_TOKEN=...

# n8n
N8N_WEBHOOK_BASE_URL=https://n8n.tudominio.com
N8N_WEBHOOK_SECRET=...

# Servidor
PORT=3000
NODE_ENV=development
```

---

## 📁 Estructura del proyecto

```
timetrack/
├── src/                    # Frontend React
│   ├── pages/
│   │   ├── admin/          # Dashboard, empleados, correcciones, reportes
│   │   └── employee/       # Dashboard, historial, incidencias, perfil
│   ├── layouts/            # AdminLayout / EmployeeLayout
│   ├── components/         # Componentes reutilizables
│   ├── contexts/           # AuthContext, CorrectionsContext
│   └── lib/                # Utilidades y datos mock (a sustituir)
│
└── backend/
    └── src/
        ├── api/
        │   ├── routes/     # me.ts, historial.ts, incidencias.ts, reportes.ts
        │   └── middleware/  # auth.ts, role.ts, rate-limit.ts
        ├── lib/            # supabase.ts, ac-client.ts, n8n.ts
        ├── services/       # signalr-listener, attendance, sse-broadcaster
        └── types/          # Tipos TypeScript compartidos
```

---

## 📊 Schema de base de datos (Supabase)

| Tabla | Descripción |
|-------|-------------|
| `profiles` | Usuarios (vinculados a `auth.users`), rol, sync con 2N AC |
| `access_logs` | Registro de fichajes (fuente: signalr / web / mobile / correction) |
| `incidencias` | Solicitudes de corrección de fichaje |
| `sync_queue` | Cola de operaciones pendientes hacia 2N AC vía n8n |

---

## 🔄 Estado de desarrollo

- [x] Fase 0 — Setup backend: estructura, dependencias, middleware auth, GET /health
- [x] Fase 1 — Auth + Perfil: GET /api/me
- [x] Fase 2 — Fichajes: POST /api/me/fichar + Dashboard + Historial + SSE live
- [x] Fase 3 — Incidencias: crear + aprobar/rechazar
- [x] Fase 4 — Reportes: PDF, Excel, tabla actividad
- [x] Fase 5 — Sync 2N: usuarios vía n8n, reconciliación nocturna

---

## 📜 Licencia

Proyecto privado. Todos los derechos reservados.
# Timetrack
