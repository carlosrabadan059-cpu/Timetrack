# Parrilla de pruebas — HelpBot TimeTrack

Flujo completo: `HelpBot.jsx` → `POST /api/help/chat` → Backend (Hono) → n8n webhook → OpenAI → respuesta normalizada → renderMarkdown en frontend.

**Cómo marcar:** cambia `[ ]` a `[x]` conforme vayas probando.  
**Entorno:** app en producción — https://timetrack-bice.vercel.app  
**Prerrequisito:** n8n workflow `timetrack-help-bot` activo con credencial OpenAI asignada.

---

## Bloque 1 — Apertura y UI básica

| # | Acción | Resultado esperado | ✓ |
|---|--------|--------------------|---|
| 1.1 | Clic en el botón flotante `💬` | Panel del HelpBot se abre con animación | [x] |
| 1.2 | Panel abierto — estado inicial | Se muestra el mensaje de bienvenida + 4 sugerencias rápidas | [x] |
| 1.3 | Clic en `ChevronDown` (cabecera) | Panel se cierra | [x] |
| 1.4 | Clic en `X` (FAB cuando está abierto) | Panel se cierra | [x] |
| 1.5 | Abrir de nuevo | El historial se conserva (no se resetea al cerrar/abrir) | [x] |

---

## Bloque 2 — Sugerencias rápidas (camino feliz)

Clic directo en cada sugerencia sin escribir nada.

| # | Sugerencia | Resultado esperado | ✓ |
|---|------------|--------------------|---|
| 2.1 | `¿Cómo ficho la entrada?` | Respuesta coherente: botón grande en el dashboard, inferencia automática de dirección | [x] |
| 2.2 | `¿Cómo solicito una corrección?` | Menciona Incidencias → Nueva Incidencia → tipos: Olvido, Corrección, Ausencia, Hora extra | [x] |
| 2.3 | `¿Cómo exporto mis fichajes?` | Menciona PDF y Excel desde la sección Reportes | [x] |
| 2.4 | `¿Qué es una incidencia?` | Explica los 4 tipos y los 3 estados (Pendiente, Aprobada, Rechazada) | [x] |

---

## Bloque 3 — Preguntas libres cubriendo el manual

Escríbelas manualmente en el input.

| # | Pregunta | Resultado esperado | ✓ |
|---|----------|--------------------|---|
| 3.1 | `¿Qué pasa si olvido fichar la salida?` | Recomienda crear incidencia de tipo Olvido | [x] |
| 3.2 | `¿El GPS es obligatorio para fichar?` | No, es opcional, solo se guarda para auditoría | [x] |
| 3.3 | `¿Puedo fichar desde el móvil?` | Sí, la app web es responsive | [x] |
| 3.4 | `¿Qué significa EMP-0001?` | Código de empleado único, asignado automáticamente | [x] |
| 3.5 | `¿Qué es una API Key y para qué sirve?` | Credencial para integración con sistemas externos (ERP, nóminas), se crea en Ajustes → API Keys | ⚠️ admin |
| 3.6 | `¿Puedo tener varios administradores?` | Sí, se asigna rol admin/manager desde Gestión de Empleados | ⚠️ admin |
| 3.7 | `¿Qué hace el geofencing?` | Valida que el fichaje GPS esté dentro del radio configurado de la sede | [x] |
| 3.8 | `¿Los managers pueden aprobar incidencias?` | Sí, igual que los admins, pero no gestionan empleados ni integraciones | ⚠️ admin |
| 3.9 | `¿Cómo me cambio la contraseña?` | Mi Perfil → Cambiar contraseña | [x] |
| 3.10 | `¿Qué es el tipo Comida en los fichajes?` | Fichajes entre 13:00 y 15:59 se clasifican automáticamente como tipo Comida | [x] |

---

## Bloque 4 — Conciencia del contexto de página (`page` pathname)

Abre el HelpBot desde distintas páginas y haz una pregunta genérica.  
El bot debería orientar la respuesta al contexto de la página actual.

| # | Página | Pregunta | Resultado esperado | ✓ |
|---|--------|----------|--------------------|---|
| 4.1 | `/dashboard` | `¿Cómo uso esto?` | Explica el botón de fichaje y el resumen del día | [x] |
| 4.2 | `/history` | `¿Cómo uso esto?` | Explica filtros, agrupación por día, exportación | [x] |
| 4.3 | `/corrections` | `¿Cómo uso esto?` | Explica cómo crear una incidencia | [x] |
| 4.4 | `/reports` | `¿Cómo uso esto?` | Explica resumen mensual, navegación y descarga | [x] |
| 4.5 | `/admin/dashboard` | `¿Cómo uso esto?` | Explica el panel de estado en tiempo real | [x] |
| 4.6 | `/admin/settings` | `¿Cómo uso esto?` | Explica las pestañas de configuración (General, Calendario, API Keys…) | [x] |

---

## Bloque 5 — Conversación multi-turno (historial)

Simula una conversación encadenada donde cada mensaje depende del anterior.

| # | Turno | Mensaje | Resultado esperado | ✓ |
|---|-------|---------|---------------------|---|
| 5.1 | 1 | `¿Qué tipos de incidencia existen?` | Lista los 4 tipos | [x] |
| 5.2 | 2 | `¿Y cuál uso si me olvidé de fichar?` | Responde "Olvido" recordando el contexto anterior | [x] |
| 5.3 | 3 | `¿Cuánto tarda en aprobarse?` | Responde en el contexto de incidencias (no cambia de tema) | [x] |
| 5.4 | 4 | `¿Y si la rechazan?` | Menciona el estado Rechazada y la posible nota del admin | [x] |
| 5.5 | — | Nueva sesión: cerrar y reabrir panel | El historial persiste dentro de la misma sesión del navegador | [x] |

---

## Bloque 6 — Casos límite y errores

| # | Situación | Cómo provocarla | Resultado esperado | ✓ |
|---|-----------|-----------------|---------------------|---|
| 6.1 | Enter en campo vacío | No escribir nada y pulsar Enter | Nada ocurre, no se envía ningún mensaje | [x] |
| 6.2 | Botón Enviar deshabilitado | Input vacío | Botón `Send` aparece deshabilitado (no clickable) | [x] |
| 6.3 | Mensaje mientras carga | Pulsar Enter durante el loading | Bloqueado — no se envía (el `if (loading) return` lo impide) | [x] |
| 6.4 | Backend caído / sin conexión | Apagar el backend o bloquear la petición en DevTools | Aparece el banner rojo de error, el mensaje del usuario se elimina del historial | ⏳ pendiente |
| 6.5 | Mensaje muy largo | Escribir >500 caracteres | Se envía correctamente, sin truncar | [x] |
| 6.6 | Pregunta fuera de dominio | `¿Cuál es la capital de Francia?` | El bot responde que solo puede ayudar con TimeTrack (o redirige a temas de la app) | [x] |

---

## Bloque 7 — Renderizado de markdown

Verifica que el componente `renderMarkdown` procesa correctamente las respuestas del bot.

| # | Formato | Cómo verificarlo | Resultado esperado | ✓ |
|---|---------|-----------------|---------------------|---|
| 7.1 | **Negrita** | Pregunta `¿Cómo ficho?` y observa la respuesta | Las palabras clave aparecen en negrita (`<strong>`) | [x] |
| 7.2 | Lista con guiones | Pregunta `¿Qué tipos de incidencia hay?` | Se renderiza como `<ul>` con `<li>` por cada tipo | [x] |
| 7.3 | Lista numerada | Pregunta `¿Cómo creo una incidencia paso a paso?` | Se renderiza como lista numerada (`<ol>` o `<ul>` con números) | [x] |
| 7.4 | Párrafos separados | Respuesta larga del bot | Párrafos separados visualmente, no todo en una sola línea | [x] |

---

## Bloque 8 — Infraestructura y trazabilidad

Pruebas a nivel técnico (usar DevTools → Network).

| # | Verificación | Cómo | Resultado esperado | ✓ |
|---|-------------|------|--------------------|---|
| 8.1 | Request correcto | DevTools → Network → POST `/api/help/chat` | Body contiene `message`, `history` (array), `page` (pathname actual) | [ ] |
| 8.2 | Historial limitado a 10 | Enviar 12 mensajes y revisar el 13º request | El campo `history` tiene máximo 10 entradas | [ ] |
| 8.3 | Respuesta normalizada | Ver respuesta del backend | `{ data: { answer: "..." } }` — el campo `answer` siempre presente | [ ] |
| 8.4 | n8n recibe el request | Logs en n8n → executions del workflow `timetrack-help-bot` | Ejecución visible con status SUCCESS | [ ] |
| 8.5 | Tiempo de respuesta | Cronometrar desde envío hasta respuesta | Menos de 10 s en condiciones normales | [ ] |

---

## Resumen de cobertura

| Bloque | Área | Tests | Completados |
|--------|------|-------|-------------|
| 1 | UI básica | 5 | ✅ 5 / 5 |
| 2 | Sugerencias rápidas | 4 | ✅ 4 / 4 |
| 3 | Preguntas libres | 10 | ✅ 7 / 10 — 3 pendientes con rol admin |
| 4 | Contexto de página | 6 | ✅ 6 / 6 |
| 5 | Multi-turno | 5 | ✅ 5 / 5 |
| 6 | Casos límite | 6 | ⏳ 5 / 6 — 6.4 pendiente |
| 7 | Markdown | 4 | ✅ 4 / 4 |
| 8 | Infraestructura | 5 | — |
| **Total** | | **45** | **36 / 45** — (6.4 pendiente + 3 pendientes con rol admin) |

---

## Notas de entorno

- **Variable crítica:** `N8N_HELP_WEBHOOK_URL` en `backend/.env` — si falta, el backend devuelve 503.
- **Workflow n8n:** importar `timetrack-help-bot.json` y activarlo. Asignar credencial "OpenAI API Key" al nodo "Call OpenAI".
- **Roles probados:** los tests 3 y 4 aplican a rol `employee`. Para rol `admin` comprobar que las preguntas de los bloques 4.5 y 4.6 también reciben contexto correcto.
