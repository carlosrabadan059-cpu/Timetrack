# Análisis: TimeTrack como SaaS comercial (v3)

> **Naturaleza de este documento:** análisis estratégico, no plan de implementación inmediata.
> Recoge *todo lo que conllevaría* convertir TimeTrack en un SaaS multi-empresa comercializable.
> **No se ha implementado ni desplegado nada de esto.** Guardado el 2026-06-01.

---

## Contexto

TimeTrack está hoy desplegado como instalación **single-deployment**: un backend en una Raspberry Pi
dentro de la LAN del cliente, conectado a un único 2N Access Commander físico, con las empresas
dadas de alta **manualmente** por un superadmin. El objetivo de la v3 es comercializarlo como SaaS:
empresas que se registran solas, pagan una suscripción y operan de forma aislada en una infraestructura
en la nube compartida.

---

## Punto de partida — lo que YA existe (no hay que rehacerlo)

El código ya tiene una base multi-tenant sólida y madura:

| Capacidad | Estado actual |
|---|---|
| Tabla `companies` + `company_settings` | ✅ Existe (config por empresa: horario, festivos, geocerca, vacaciones, branches) |
| `profiles.company_id` + `manager_id` + 4 roles (`superadmin`/`admin`/`manager`/`employee`) | ✅ Existe |
| Config 2N AC **por empresa** (URL + token cifrado en `clocking_modes`) | ✅ Existe ([crypto-settings.ts], [admin.ts]) |
| Conexiones SignalR **por empresa** | ✅ Existe ([signalr-listener.ts] — `Map<companyId, connection>`) |
| Modo "device" (webhooks del lector → backend, alternativa al AC) | ✅ Parcial — secret por empresa ya generado |
| API keys por empresa (hash SHA-256, scopes) + API externa `/api/external/v1` | ✅ Existe ([admin.ts], [external.ts]) |
| Rol superadmin + panel `/superadmin/empresas` (alta manual de empresas) | ✅ Existe ([superadmin.ts], [SuperAdminCompaniesPage.jsx]) |
| RLS habilitado en todas las tablas | ⚠️ Habilitado pero el backend usa `service_role` y filtra por `company_id` **en código**, no por políticas |

**Conclusión:** la v3 no es "hacer el producto multi-tenant" — eso ya está. Es añadir la **capa comercial**,
el **self-service**, y resolver el **problema de conectividad con hardware on-premise desde la nube**.

---

## LA decisión arquitectónica central: conectividad 2N desde la nube

El 2N AC vive **siempre en local** (LAN del cliente). El modelo en uso hoy es el **Modelo C: Cloudflare
Tunnel (`cloudflared`)** — el túnel expone el AC local con una URL pública (ej. `api.rabadanhouse.space`)
y el backend habla REST + SignalR contra esa URL como si fuera directo. Esto **ya funciona en producción**,
así que la incógnita "¿cómo llega la nube al AC?" está resuelta a nivel de patrón. La pregunta de la v3 pasa
de "¿qué modelo?" a "**¿cómo automatizo y escalo un túnel por cada cliente?**".

| Modelo | Cómo | Estado / encaje SaaS |
|---|---|---|
| **C. Túnel por cliente (Cloudflare)** ⭐ EN USO | `cloudflared` en local expone el AC; backend cloud lo alcanza por la URL del túnel | **Patrón ya validado.** A escala: hay que **provisionar un túnel + hostname por tenant** y guardar su URL en `company_settings` (campo donde hoy va `ac_base_url`) |
| **A. Modo device (webhooks)** | El lector/Node-RED hace push al cloud vía HTTPS (`clocking_modes.type='device'`, ya soportado parcial) | Complementario: útil para clientes sin AC o que no quieran túnel; sin sync bidireccional |
| **B. Connector on-premise** | Mini-agente en la LAN mantiene SignalR+REST y túnel saliente | Alternativa si Cloudflare deja de encajar; más que construir/mantener |

### Implicaciones del Modelo C a escala SaaS (lo que hay que resolver)

1. **Provisión del túnel por tenant.** Hoy el túnel es manual (uno, el de tu Pi). Para self-service hay que
   automatizarlo: crear un Cloudflare Tunnel + hostname por empresa vía la **API de Cloudflare**, o entregar
   al cliente un instalador `cloudflared` preconfigurado con su token. La URL resultante se guarda en
   `company_settings.clocking_modes.twoN.ac_base_url` (ya existe ese campo, ya cifrado el token del AC).
2. **Credenciales por tenant.** Cada túnel tiene su token; almacenarlo cifrado (reutilizar [crypto-settings.ts]).
   Considerar **Cloudflare Access (service tokens)** para que solo tu backend pueda atravesar el túnel y el AC
   no quede expuesto al internet abierto.
3. **Coste operativo.** Un túnel por cliente implica gestión de hostnames, rotación de tokens y monitorización
   de "túnel caído" (= no entran fichajes 2N de ese tenant). Necesita alerta por tenant.
4. **El `signalr-listener` ya está por empresa** ([signalr-listener.ts] usa `Map<companyId, conn>` con
   `ac_base_url`/`ac_api_token` por empresa) → encaja directo: cada empresa con su URL de túnel levanta su
   conexión. El reto no es el código de conexión, es **dónde corre ese proceso y cómo escala** (ver workstream 5).

> **Recomendación de análisis:** mantener **Modelo C (Cloudflare Tunnel)** como vía principal —ya probado—,
> automatizando la provisión del túnel por tenant; ofrecer **Modelo A (webhooks)** como alternativa ligera
> para clientes sin necesidad de sync bidireccional con el AC.

---

## Brechas para ser SaaS comercial (agrupadas por workstream)

### 1. Facturación y suscripciones (no existe nada)
- Integrar **Stripe** (Billing + Customer Portal): planes, precios, trials, prorrateo, dunning.
- Nuevas columnas/tabla: `companies.plan`, `subscription_status` (`trialing/active/past_due/canceled`),
  `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `current_period_end`.
- Webhooks de Stripe → actualizar estado de la empresa; suspender acceso si `past_due/canceled`.
- Tabla `plans` (o config) con límites: nº máx. empleados, módulos habilitados, retención de datos.

### 2. Onboarding self-service (hoy es manual vía superadmin)
- Página pública `/registro`: alta de empresa + admin en un paso → crea `companies` + `company_settings`
  + usuario admin + suscripción trial. Reutiliza la lógica de [superadmin.ts] `POST /companies`.
- Verificación de email del nuevo tenant (Supabase Auth ya lo soporta).
- **Wizard de configuración inicial** post-registro: horario, geocerca, modo de fichaje, invitar empleados.
- Flujo de invitación de empleados por email (hoy se crean con password temporal).

### 3. Gating por plan y cuotas (no existe)
- Middleware backend que valide límites antes de crear empleados / usar 2N / crear API keys según plan.
- Feature flags por tier (ej: integración 2N y API externa solo en plan Pro+).
- Mostrar límites y uso en el panel admin; CTA de upgrade al alcanzarlos.

### 4. Aislamiento de datos (defensa en profundidad)
- Hoy el aislamiento es **solo por código** (`service_role` + filtros `company_id`). Un bug = fuga cross-tenant.
- Escribir **políticas RLS reales** keyed por `company_id` (vía claim en JWT o `auth.uid()` → profile),
  de modo que incluso con un fallo de código la BD impida el cruce.
- Hacer `profiles.company_id` **NOT NULL** (hoy nullable → riesgo de perfiles huérfanos).
- Auditar cada endpoint que use `service_role` para confirmar el filtro de tenant.

### 5. Infraestructura y escalado (hoy: 1 Raspberry Pi = SPOF)
- Mover el backend Hono/Node a una plataforma cloud escalable (Fly.io / Railway / contenedor gestionado).
  El frontend ya está en Vercel.
- **Problema del SignalR listener:** hoy es un proceso único con un `Map` en memoria de todas las
  conexiones. No escala horizontalmente, un redeploy tira todas las conexiones, y dos réplicas
  generarían **eventos duplicados**. Hay que extraerlo a un **servicio "connector" dedicado y stateful**
  (o workers por tenant) separado de la API stateless. Implementar recovery (`Update lastEventTimestamp`).
- Home para n8n y la `sync_queue` (procesador de reintentos) en la nube.

### 6. Consola de operador (superadmin) ampliada
- Hoy solo lista/crea empresas. Añadir: métricas (MRR, tenants activos/trial/morosos), estado de
  suscripción, **suspender/reactivar** tenant, **impersonación** para soporte, uso por empresa,
  visor de `audit_events` (tabla ya existe, sin uso).

### 7. Branding y dominios por tenant
- Logo y colores por empresa en el panel y en PDFs/Excel.
- Opcional: subdominio (`empresa.timetrack.app`) o dominio propio por tenant.

### 8. Email transaccional
- Hoy depende de los emails de Supabase Auth. SaaS necesita proveedor transaccional (Resend/Postmark)
  para: bienvenida, fin de trial, factura, pago fallido, notificaciones de incidencias/vacaciones.
- Ya hay disparadores n8n (`incidencia-nueva`, `incidencia-resuelta`) → encajan aquí.

### 9. Legal y cumplimiento (crítico — datos sensibles)
- El registro de jornada está **regulado por ley en España** (RD-ley 8/2019): conservación **4 años**,
  accesible a trabajador, sindicatos e Inspección.
- GDPR: DPA con clientes, política de privacidad/términos, **export y borrado** de datos (derecho de
  supresión), política de retención, registro de tratamientos.
- Datos de control de acceso físico = categoría especialmente sensible.

### 10. Observabilidad y soporte
- Error tracking (Sentry), logs por tenant, uptime/alertas.
- Rate-limiting por tenant (hoy hay rate-limit de fichaje por usuario; falta a nivel API/tenant).
- Activar el `audit_events` para trazabilidad de acciones admin.

---

## Cambios de modelo de datos (resumen)

```sql
-- companies: capa comercial
ALTER TABLE companies ADD COLUMN plan text DEFAULT 'trial';
ALTER TABLE companies ADD COLUMN subscription_status text DEFAULT 'trialing';
ALTER TABLE companies ADD COLUMN stripe_customer_id text;
ALTER TABLE companies ADD COLUMN stripe_subscription_id text;
ALTER TABLE companies ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE companies ADD COLUMN current_period_end timestamptz;
ALTER TABLE companies ADD COLUMN branding jsonb DEFAULT '{}';   -- logo, colores
ALTER TABLE companies ADD COLUMN suspended_at timestamptz;

-- aislamiento
ALTER TABLE profiles ALTER COLUMN company_id SET NOT NULL;  -- tras migrar huérfanos

-- nuevas tablas: plans (límites/features), invoices opcional (Stripe es fuente de verdad),
-- audit_events (ya existe — activar uso)
```

Más: políticas RLS por `company_id` en todas las tablas de datos; índices por `company_id`.

---

## Roadmap por fases (sin compromiso de fechas)

- **Fase A — Comercial mínima:** planes + Stripe + estado de suscripción + gating de límites + suspensión.
- **Fase B — Self-service:** registro público + wizard de onboarding + invitación de empleados + email transaccional.
- **Fase C — Endurecimiento:** RLS real, `company_id` NOT NULL, auditoría de endpoints, observabilidad.
- **Fase D — Infra/escalado:** salir de la Raspberry Pi, extraer el connector SignalR a servicio dedicado.
- **Fase E — Conectividad hardware:** automatizar la provisión de **Cloudflare Tunnel por tenant** (Modelo C, ya validado) + monitorización de túnel caído; opcional modo webhooks (A) como alternativa.
- **Fase F — Operación:** consola superadmin (métricas, impersonación), branding por tenant, legal/GDPR.

> Las fases A–C aportan valor sin tocar el hardware; E es la más arriesgada y debe pilotarse aparte.

---

## Riesgos principales

1. **Provisión y monitorización del túnel por tenant.** El patrón (Cloudflare Tunnel) ya funciona, pero a
   escala un túnel caído = sin fichajes 2N de ese cliente sin que nadie se entere. Requiere automatización + alertas.
2. **SignalR no escala horizontalmente** tal cual está; redeploys cortan fichajes en tiempo real.
3. **Aislamiento solo por código** — un bug expone datos de otra empresa hasta tener RLS.
4. **Cumplimiento legal** del registro de jornada (responsabilidad legal real con clientes de pago).
5. **Soporte de hardware on-premise** a escala (si se elige el modelo connector).

---

## Siguientes pasos del análisis

Antes de planificar la implementación de cualquier fase haría falta:
1. Diseñar la **automatización del túnel Cloudflare por tenant** (API de Cloudflare vs. instalador preconfigurado) — el modelo (C) ya está decidido por estar en producción.
2. Definir **planes y precios** concretos (nº de tiers, límites, qué módulos por tier).
3. Decidir **plataforma de hosting** del backend y del connector.
4. Confirmar alcance legal (asesoría GDPR + registro de jornada) por ser dato sensible y regulado.
