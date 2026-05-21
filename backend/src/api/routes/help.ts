import { Hono } from 'hono';
import { z } from 'zod';
import type { AppVariables } from '../../types/api.types.js';

const help = new Hono<{ Variables: AppVariables }>();

const MANUAL = `
# Manual de TimeTrack

## Roles
- Empleado: fichar, historial propio, incidencias, reportes propios, perfil.
- Manager: todo lo del empleado + ver todos los fichajes de empresa, gestionar incidencias.
- Admin: todo lo del manager + gestión de empleados, API Keys, ajustes de empresa, integración 2N.

## EMPLEADOS

### Dashboard
- Botón grande: ficha entrada o salida con un clic. El sistema infiere la dirección: sin fichajes hoy → Entrada; último fichaje fue entrada → Salida.
- Badge verde "En Jornada" o gris "Fuera de Horario".
- Resumen del día: horas trabajadas, primera entrada, última salida.
- El fichaje web/móvil no requiere acción extra — solo pulsar el botón.

### Historial
- Lista de todos los fichajes propios ordenados por fecha.
- Filtros: rango de fechas, dirección (Entrada/Salida), origen.
- Exportar PDF o Excel del período filtrado.
- Tipo "Comida" = fichaje entre 13:00 y 15:59 (automático).

### Incidencias
- Para solicitar correcciones cuando olvidaste fichar o fichaste mal.
- Tipos: Olvido (olvidé fichar), Corrección (hora incorrecta), Ausencia, Hora Extra.
- Estado: Pendiente → Aprobada (crea fichaje de corrección) o Rechazada (con nota del admin).
- Proceso: Nueva Incidencia → completar tipo/fecha/hora/motivo → Enviar.

### Reportes
- Resumen mensual: horas totales, días con fichaje, media diaria.
- Tabla día a día con entradas, salidas y total.
- Navegar por mes con las flechas.
- Descargar PDF o Excel del mes.

### Perfil
- Editar nombre, email, foto de perfil.
- Activar/desactivar notificaciones por email.
- Cambiar contraseña.

## ADMINS Y MANAGERS

### Dashboard Admin
- Empleados en jornada ahora mismo, total plantilla, incidencias pendientes.
- Actividad reciente: últimos fichajes de la empresa.
- Estado por empleado: quién está dentro y desde qué hora.

### Asistencia
- Tabla completa de fichajes de toda la empresa.
- Filtros: empleado, fechas, dirección.

### Empleados
- Crear, editar, eliminar empleados.
- Códigos EMP-XXXX asignados automáticamente.
- Sincronizar con 2N Access Commander si hay integración activa.

### Correcciones
- Revisar solicitudes de incidencia de todos los empleados.
- Aprobar: si era olvido, crea fichaje de corrección automáticamente.
- Rechazar: con nota explicativa para el empleado.

### Ajustes → General
- Nombre, CIF, dirección, email de la empresa.

### Ajustes → Sucursales
- Sedes o centros de trabajo adicionales.

### Ajustes → Control Horario
- Radio de geofencing (metros), minutos de cortesía, coordenadas sede, horario laboral.

### Ajustes → Modos de Fichaje
- Activar/desactivar Web, Móvil, Lector 2N.
- Para 2N: URL del servidor AC + token. Botón "Probar conexión" e "Importar empleados".

### Ajustes → Calendario Laboral
- Festivos nacionales (globales) o por sucursal.

### Ajustes → API Keys
- Crear clave para integración externa (ERP, nóminas). Formato: tt_live_...
- Solo visible al crear — guardarla de inmediato.
- Revocar elimina el acceso permanentemente.

## FAQ
- ¿No puedo fichar dos veces? → El sistema bloquea dos entradas o salidas consecutivas. Crea una incidencia si fue un error.
- ¿Olvidé fichar la salida? → Crea incidencia tipo "Olvido" con la hora correcta. Si se aprueba, se crea el fichaje.
- ¿GPS obligatorio? → No. Se guarda si está disponible pero no bloquea el fichaje.
- ¿Qué es EMP-0001? → Código único de empleado asignado automáticamente.
- ¿Qué es una API Key? → Credencial para que sistemas externos lean fichajes automáticamente.
- ¿Managers pueden aprobar incidencias? → Sí.
`;

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).default([]),
  page: z.string().optional(),
});

help.post('/chat', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: { code: 'invalid_body', message: 'Mensaje inválido' } }, 400);
  }

  const webhookUrl = process.env['N8N_HELP_WEBHOOK_URL'];
  if (!webhookUrl) {
    return c.json({ error: { code: 'not_configured', message: 'Bot de ayuda no configurado' } }, 503);
  }

  const { message, history, page } = parsed.data;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        page: page ?? '',
        user_role: user?.role ?? 'employee',
        manual: MANUAL,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error('[help] n8n webhook error:', res.status);
      return c.json({ error: { code: 'bot_error', message: 'Error al procesar tu pregunta' } }, 502);
    }

    const data = await res.json() as unknown;
    // n8n puede responder como { answer } o { output } o directamente un string
    let answer: string;
    if (typeof data === 'string') {
      answer = data;
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      answer = String(d['answer'] ?? d['output'] ?? d['text'] ?? d['message'] ?? 'Sin respuesta');
    } else {
      answer = 'Sin respuesta';
    }

    return c.json({ data: { answer } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[help] Error calling n8n:', msg);
    return c.json({ error: { code: 'bot_error', message: 'No se pudo contactar con el bot de ayuda' } }, 503);
  }
});

export default help;
