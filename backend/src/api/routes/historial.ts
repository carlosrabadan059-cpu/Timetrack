import { Hono } from 'hono';
import ExcelJS from 'exceljs';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AppVariables } from '../../types/api.types.js';
import type { AccessLog } from '../../types/supabase.types.js';
import {
  startOfDayISO,
  toDateString,
  formatDateLabel,
  humanizeSource,
  monthYearLabel,
} from '../../lib/date-utils.js';
import { calculateDaySummary } from '../../services/attendance.js';

const historial = new Hono<{ Variables: AppVariables }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDateRange(
  period: string,
  dateFrom?: string,
  dateTo?: string
): { from: string; to: string } {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  if (period === 'today') {
    return { from: startOfDayISO(now), to: todayEnd.toISOString() };
  }
  if (period === 'week') {
    const monday = new Date(now);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    return { from: monday.toISOString(), to: todayEnd.toISOString() };
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: first.toISOString(), to: todayEnd.toISOString() };
  }
  if (period === 'custom' && dateFrom && dateTo) {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  // Default: current month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: first.toISOString(), to: todayEnd.toISOString() };
}

// ── GET /api/me/historial ─────────────────────────────────────────────────────
historial.get('/', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  const period = c.req.query('period') ?? 'month';
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const typeFilter = c.req.query('type') ?? 'all'; // 'all' | 'in' | 'out'
  const sourceFilter = c.req.query('source') ?? 'all'; // 'all' | 'signalr' | 'web' | 'mobile'
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(90, Math.max(1, Number(c.req.query('limit') ?? '30')));

  const { from, to } = buildDateRange(period, dateFrom, dateTo);

  let query = supabaseAdmin
    .from('access_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('timestamp', from)
    .lte('timestamp', to)
    .order('timestamp', { ascending: false });

  if (typeFilter !== 'all') {
    query = query.eq('direction', typeFilter);
  }
  if (sourceFilter !== 'all') {
    query = query.eq('source', sourceFilter);
  }

  const { data: allLogs, error } = await query;

  if (error) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al obtener historial' } },
      500
    );
  }

  const logs: AccessLog[] = (allLogs ?? []) as AccessLog[];

  // Group by day (descending)
  const dayMap = new Map<string, AccessLog[]>();
  for (const log of logs) {
    const dayKey = toDateString(new Date(log.timestamp));
    let dayLogs = dayMap.get(dayKey);
    if (!dayLogs) {
      dayLogs = [];
      dayMap.set(dayKey, dayLogs);
    }
    dayLogs.push(log);
  }

  const sortedDays = [...dayMap.keys()].sort((a, b) => b.localeCompare(a));
  const total_days = sortedDays.length;
  const offset = (page - 1) * limit;
  const pageDays = sortedDays.slice(offset, offset + limit);
  const todayStr = toDateString(new Date());

  const days = pageDays.map((date) => {
    const dayLogs = dayMap.get(date) ?? [];
    const { total_minutes } = calculateDaySummary(dayLogs);
    return {
      date,
      label: formatDateLabel(date, todayStr),
      fichajes_count: dayLogs.length,
      total_minutes,
      fichajes: dayLogs.map((l) => ({
        id: l.id,
        direction: l.direction,
        timestamp: l.timestamp,
        detail_type: l.detail_type,
        source: l.source,
        corrected: l.corrected,
        device_info: l.device_info,
        latitude: l.latitude,
        longitude: l.longitude,
      })),
    };
  });

  // Summary over ALL matching logs (not just current page)
  const granted = logs.filter((l) => l.event_type !== 'denied');
  const allDaySummaries = [...dayMap.entries()].map(([, dayLogs]) =>
    calculateDaySummary(dayLogs)
  );
  const total_worked_minutes = allDaySummaries.reduce((s, d) => s + d.total_minutes, 0);
  const days_worked = allDaySummaries.filter((d) => d.total_minutes > 0).length;

  return c.json({
    data: {
      summary: {
        total_worked_minutes,
        days_worked,
        daily_average_minutes:
          days_worked > 0 ? Math.round(total_worked_minutes / days_worked) : 0,
        total_fichajes: granted.length,
      },
      days,
      total_days,
      page,
      has_more: offset + limit < total_days,
    },
  });
});

// ── GET /api/me/historial/export ──────────────────────────────────────────────
historial.get('/export', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  const period = c.req.query('period') ?? 'month';
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const format = c.req.query('format') ?? 'excel'; // 'excel' | 'csv'

  const { from, to } = buildDateRange(period, dateFrom, dateTo);
  const refDate = dateFrom ? new Date(dateFrom) : new Date();
  const filename = `historial-${monthYearLabel(refDate)}`;

  const { data: allLogs, error } = await supabaseAdmin
    .from('access_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('timestamp', from)
    .lte('timestamp', to)
    .order('timestamp', { ascending: true });

  if (error) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al generar exportación' } },
      500
    );
  }

  const logs: AccessLog[] = (allLogs ?? []) as AccessLog[];
  const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  if (format === 'csv') {
    const header = ['Fecha', 'Día', 'Hora', 'Tipo', 'Detalle', 'Origen', 'Zona', 'Corregido'];
    const rows = logs.map((l) => {
      const d = new Date(l.timestamp);
      return [
        toDateString(d),
        DAYS_ES[d.getDay()] ?? '',
        d.toTimeString().slice(0, 5),
        l.direction === 'in' ? 'Entrada' : 'Salida',
        l.detail_type === 'comida' ? 'Comida' : 'Normal',
        humanizeSource(l.source),
        l.zone_name ?? '-',
        l.corrected ? 'Sí' : 'No',
      ].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Antigravity TimeTrack';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Historial');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Día', key: 'dia', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Detalle', key: 'detalle', width: 10 },
    { header: 'Origen', key: 'origen', width: 15 },
    { header: 'Zona', key: 'zona', width: 20 },
    { header: 'Corregido', key: 'corregido', width: 10 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  for (const l of logs) {
    const d = new Date(l.timestamp);
    ws.addRow({
      fecha: toDateString(d),
      dia: DAYS_ES[d.getDay()] ?? '',
      hora: d.toTimeString().slice(0, 5),
      tipo: l.direction === 'in' ? 'Entrada' : 'Salida',
      detalle: l.detail_type === 'comida' ? 'Comida' : 'Normal',
      origen: humanizeSource(l.source),
      zona: l.zone_name ?? '-',
      corregido: l.corrected ? 'Sí' : 'No',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
});

export default historial;
