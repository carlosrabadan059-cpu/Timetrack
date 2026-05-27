import { Hono } from 'hono';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth.js';
import { humanizeSource } from '../../lib/date-utils.js';
import type { AppVariables } from '../../types/api.types.js';

const external = new Hono<{ Variables: AppVariables }>();

// Aplicar middleware de autenticación por API Key a todas las rutas externas
external.use('*', apiKeyAuthMiddleware);

const fichajesQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  employee_code: z.string().optional(),
  company_name: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  source: z.enum(['web', 'mobile', 'signalr', 'correction']).optional(),
  format: z.enum(['json', 'pdf', 'csv']).default('json'),
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(50),
});

const M = 50;
const PW = 595.28;
const CW = PW - 2 * M;
const SAFE_BOTTOM = 841.89 - M - 30;

function pad2(n: number) { return String(n).padStart(2, '0'); }
function fmtTs(ts: string) {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

type FichajeItem = {
  id: string;
  user: { id: string; full_name: string; email: string; employee_code: string };
  direction: string;
  detail_type: string;
  timestamp: string;
  source: string;
  source_human: string;
  device_info: string | null;
  latitude: number | null;
  longitude: number | null;
  corrected: boolean;
};

function buildFichajesPDF(items: FichajeItem[], empName: string, period: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const now = new Date();
      const genDate = `Generado el ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;

      // Header
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#0F172A').text('TimeTrack', M, M);
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8').text(genDate, M, M + 6, { width: CW, align: 'right' });
      let y = M + 28;
      doc.font('Helvetica').fontSize(11).fillColor('#475569').text('Listado de Fichajes — API Externa', M, y, { width: CW });
      y += 18;
      doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#E2E8F0').lineWidth(1).stroke();
      y += 12;
      doc.font('Helvetica').fontSize(9).fillColor('#374151')
        .text(`Empleado: ${empName}   |   Período: ${period}   |   Total: ${items.length} registros`, M, y, { width: CW });
      y += 22;

      // Table headers
      const cols = [90, 55, 60, 70, 130, 90];
      const headers = ['Fecha/Hora', 'Dirección', 'Tipo', 'Origen', 'Dispositivo', 'Empleado'];
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1E293B');
      let cx = M;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i] ?? '', cx, y, { width: (cols[i] ?? 0) - 2, lineBreak: false });
        cx += cols[i] ?? 0;
      }
      y += 12;
      doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
      y += 5;

      // Rows
      doc.font('Helvetica').fontSize(8).fillColor('#374151');
      for (const item of items) {
        if (y > SAFE_BOTTOM) { doc.addPage(); y = M; }
        const row = [
          fmtTs(item.timestamp),
          item.direction === 'in' ? 'Entrada' : 'Salida',
          item.detail_type,
          item.source_human,
          item.device_info ?? '—',
          item.user.full_name,
        ];
        cx = M;
        for (let i = 0; i < row.length; i++) {
          const color = item.direction === 'in' ? '#16A34A' : '#DC2626';
          doc.fillColor(i === 1 ? color : '#374151')
            .text(row[i] ?? '', cx, y, { width: (cols[i] ?? 0) - 2, lineBreak: false });
          cx += cols[i] ?? 0;
        }
        y += 14;
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function sanitizeCsvCell(value: string): string {
  const s = String(value ?? '');
  return /^[=+\-@\t\r\n]/.test(s) ? `'${s}` : s;
}

function buildFichajesCSV(items: FichajeItem[]): string {
  const header = 'id,fecha_hora,empleado,codigo,direccion,tipo,origen,dispositivo,latitud,longitud,corregido';
  const rows = items.map(i =>
    [
      i.id,
      i.timestamp,
      `"${sanitizeCsvCell(i.user.full_name)}"`,
      sanitizeCsvCell(i.user.employee_code ?? ''),
      i.direction,
      i.detail_type,
      i.source_human,
      sanitizeCsvCell(i.device_info ?? ''),
      i.latitude ?? '',
      i.longitude ?? '',
      i.corrected,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

external.get('/fichajes', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) {
    return c.json({ error: { code: 'forbidden', message: 'Contexto de empresa no configurado en la llave' } }, 403);
  }

  const query = c.req.query();
  const parsed = fichajesQuerySchema.safeParse(query);

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'invalid_params',
          message: 'Parámetros de consulta incorrectos',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const { user_id, employee_code, start_date, end_date, source, format, page, limit, company_name } = parsed.data;
  const effectiveLimit = format !== 'json' ? 1000 : limit;
  const offset = format !== 'json' ? 0 : (page - 1) * limit;

  const sb = getSupabaseAdmin();

  // 0. Si viene company_name en la query, validar estrictamente que coincida con la de la API Key (seguridad multi-tenant explícita)
  if (company_name) {
    const { data: company, error: compErr } = await sb
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();

    if (compErr || !company) {
      return c.json({ error: { code: 'forbidden', message: 'No se pudo verificar la empresa asociada a la API Key' } }, 403);
    }

    if (company.name.toLowerCase().trim() !== company_name.toLowerCase().trim()) {
      return c.json(
        {
          error: {
            code: 'tenant_mismatch',
            message: `Acceso denegado. La API Key provista no pertenece a la empresa "${company_name}".`,
          },
        },
        403
      );
    }
  }

  // 1. Si se suministra un employee_code, resolverlo primero para obtener el targetUserId
  let targetUserId = user_id;
  if (employee_code) {
    const { data: profile } = await sb
      .from('profiles')
      .select('id')
      .eq('employee_code', employee_code)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!profile) {
      return c.json({
        data: [],
        meta: {
          page,
          total: 0,
          has_more: false,
        },
      });
    }
    targetUserId = profile.id;
  }

  // 2. Construir la consulta a access_logs uniendo perfiles
  let q = sb
    .from('access_logs')
    .select('*, profiles!inner(id, full_name, email, employee_code)', { count: 'exact' })
    .eq('profiles.company_id', companyId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + effectiveLimit - 1);

  if (targetUserId) {
    q = q.eq('user_id', targetUserId);
  }
  if (start_date) {
    q = q.gte('timestamp', start_date);
  }
  if (end_date) {
    q = q.lte('timestamp', end_date);
  }
  if (source) {
    q = q.eq('source', source);
  }

  const { data: logs, count, error } = await q;

  if (error) {
    console.error('[external] Error fetching access logs:', error);
    return c.json(
      {
        error: {
          code: 'internal_error',
          message: 'Error al consultar fichajes en la base de datos',
        },
      },
      500
    );
  }

  // 3. Dar formato de respuesta estandarizado
  const items = (logs ?? []).map((log: any) => ({
    id: log.id,
    user: {
      id: log.profiles.id,
      full_name: log.profiles.full_name,
      email: log.profiles.email,
      employee_code: log.profiles.employee_code,
    },
    direction: log.direction,
    detail_type: log.detail_type,
    timestamp: log.timestamp,
    source: log.source,
    source_human: humanizeSource(log.source),
    device_info: log.device_info,
    latitude: log.latitude ? Number(log.latitude) : null,
    longitude: log.longitude ? Number(log.longitude) : null,
    corrected: log.corrected,
  }));

  if (format === 'csv') {
    const csv = buildFichajesCSV(items);
    const filename = `fichajes-${employee_code ?? 'todos'}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === 'pdf') {
    const empName = items[0]?.user.full_name ?? employee_code ?? 'Empleado';
    const from = start_date ? start_date.slice(0, 10) : '—';
    const to = end_date ? end_date.slice(0, 10) : '—';
    const period = `${from} / ${to}`;
    const pdfBuffer = await buildFichajesPDF(items, empName, period);
    const filename = `fichajes-${employee_code ?? 'todos'}.pdf`;
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return c.json({
    data: items,
    meta: {
      page,
      total: count ?? 0,
      has_more: offset + effectiveLimit < (count ?? 0),
    },
  });
});

export default external;
