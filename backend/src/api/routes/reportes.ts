import { Hono } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AppVariables } from '../../types/api.types.js';
import type { AccessLog } from '../../types/supabase.types.js';
import { humanizeSource, toDateString } from '../../lib/date-utils.js';
import { calculateDaySummary } from '../../services/attendance.js';
import {
  generateMonthlyPDF,
  generateMonthlyExcel,
  generateIncidenciasPDF,
} from '../../services/report-generator.js';

const reportes = new Hono<{ Variables: AppVariables }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function parseParams(month?: string, year?: string): { month: number; year: number } | null {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y || m < 1 || m > 12 || y < 2000 || y > 2100) return null;
  return { month: m, year: y };
}

function getRange(month: number, year: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString(),
    lastDay,
  };
}

// ── GET /api/me/reportes/summary ──────────────────────────────────────────────

reportes.get('/summary', async (c) => {
  const user = c.get('user');
  const params = parseParams(c.req.query('month'), c.req.query('year'));
  if (!params) {
    return c.json({ error: { code: 'invalid_params', message: 'month (1-12) y year requeridos' } }, 400);
  }
  const { month, year } = params;
  const { from, to, lastDay } = getRange(month, year);
  const mp = String(month).padStart(2, '0');
  const ldp = String(lastDay).padStart(2, '0');

  const sb = getSupabaseAdmin();
  const [logsRes, incRes] = await Promise.all([
    sb.from('access_logs').select('*').eq('user_id', user.id)
      .gte('timestamp', from).lte('timestamp', to).order('timestamp', { ascending: true }),
    sb.from('incidencias').select('status').eq('user_id', user.id)
      .gte('date', `${year}-${mp}-01`).lte('date', `${year}-${mp}-${ldp}`),
  ]);

  if (logsRes.error) {
    return c.json({ error: { code: 'internal_error', message: 'Error al obtener datos' } }, 500);
  }

  const logs = (logsRes.data ?? []) as AccessLog[];

  // Group by day → calculate worked minutes
  const dayMap = new Map<string, AccessLog[]>();
  for (const log of logs) {
    const k = toDateString(new Date(log.timestamp));
    const arr = dayMap.get(k) ?? [];
    arr.push(log);
    dayMap.set(k, arr);
  }

  const sums = [...dayMap.values()].map(d => calculateDaySummary(d));
  const totalMin = sums.reduce((s, d) => s + d.total_minutes, 0);
  const daysWorked = sums.filter(d => d.total_minutes > 0).length;
  const total_hours = Math.round(totalMin * 10 / 60) / 10;
  const daily_average = daysWorked > 0 ? Math.round((totalMin / daysWorked) * 10 / 60) / 10 : 0;

  // has_next_month: false if queried month >= current month
  const now = new Date();
  const curM = now.getUTCMonth() + 1;
  const curY = now.getUTCFullYear();
  const has_next_month = year < curY || (year === curY && month < curM);

  const monthShort = MONTHS_SHORT[month - 1] ?? '';
  const period_label = `01 ${monthShort} - ${lastDay} ${monthShort} ${year}`;

  const incs = incRes.data ?? [];

  return c.json({
    data: {
      month,
      year,
      period_label,
      total_hours,
      days_worked: daysWorked,
      daily_average,
      incidencias_summary: {
        total: incs.length,
        approved: incs.filter(i => i.status === 'approved').length,
        pending: incs.filter(i => i.status === 'pending').length,
        rejected: incs.filter(i => i.status === 'rejected').length,
      },
      has_previous_month: true,
      has_next_month,
    },
  });
});

// ── GET /api/me/reportes/activity ─────────────────────────────────────────────

reportes.get('/activity', async (c) => {
  const user = c.get('user');
  const params = parseParams(c.req.query('month'), c.req.query('year'));
  if (!params) {
    return c.json({ error: { code: 'invalid_params', message: 'month (1-12) y year requeridos' } }, 400);
  }
  const { month, year } = params;
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '50')));
  const { from, to } = getRange(month, year);

  const sb = getSupabaseAdmin();
  const { data, error, count } = await sb
    .from('access_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .gte('timestamp', from)
    .lte('timestamp', to)
    .order('timestamp', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    return c.json({ error: { code: 'internal_error', message: 'Error al obtener actividad' } }, 500);
  }

  const logs = (data ?? []) as AccessLog[];
  const total = count ?? 0;

  const items = logs.map(l => {
    const d = new Date(l.timestamp);
    return {
      fecha: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      dia: DAYS_FULL[d.getDay()] ?? '',
      hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      tipo: l.direction === 'in' ? 'ENTRADA' : 'SALIDA',
      detalle: l.detail_type ?? 'normal',
      origen: l.corrected ? 'Corrección*' : humanizeSource(l.source),
      corrected: l.corrected,
    };
  });

  return c.json({ data: { items, total, page, has_more: page * limit < total } });
});

// ── GET /api/me/reportes/download/monthly ─────────────────────────────────────

reportes.get('/download/monthly', async (c) => {
  const user = c.get('user');
  const params = parseParams(c.req.query('month'), c.req.query('year'));
  if (!params) {
    return c.json({ error: { code: 'invalid_params', message: 'month (1-12) y year requeridos' } }, 400);
  }
  const { month, year } = params;
  const format = c.req.query('format') ?? 'pdf';
  const mp = String(month).padStart(2, '0');

  try {
    if (format === 'excel') {
      const buf = await generateMonthlyExcel(user.id, month, year);
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="timetrack-${mp}-${year}.xlsx"`,
        },
      });
    }
    const buf = await generateMonthlyPDF(user.id, month, year);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="timetrack-${mp}-${year}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[reportes] download/monthly:', err);
    return c.json({ error: { code: 'internal_error', message: 'Error al generar el informe' } }, 500);
  }
});

// ── GET /api/me/reportes/download/incidencias ─────────────────────────────────

reportes.get('/download/incidencias', async (c) => {
  const user = c.get('user');
  const params = parseParams(c.req.query('month'), c.req.query('year'));
  if (!params) {
    return c.json({ error: { code: 'invalid_params', message: 'month (1-12) y year requeridos' } }, 400);
  }
  const { month, year } = params;
  const mp = String(month).padStart(2, '0');

  try {
    const buf = await generateIncidenciasPDF(user.id, month, year);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="incidencias-${mp}-${year}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[reportes] download/incidencias:', err);
    return c.json({ error: { code: 'internal_error', message: 'Error al generar el informe' } }, 500);
  }
});

export default reportes;
