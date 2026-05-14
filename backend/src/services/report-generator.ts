import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { humanizeSource, toDateString } from '../lib/date-utils.js';
import { calculateDaySummary } from './attendance.js';
import type { AccessLog, Incidencia, Profile } from '../types/supabase.types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type PdfDoc = InstanceType<typeof PDFDocument>;
type Cell = string | { text: string; color: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];
const DAYS_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const INC_TYPE: Record<string, string> = {
  olvido: 'Olvido de fichaje',
  correccion: 'Corrección',
  ausencia: 'Ausencia',
  hora_extra: 'Hora extra',
};
const INC_STATUS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

// PDF layout
const M = 50;
const PW = 595.28;
const PH = 841.89;
const CW = PW - 2 * M;
const SAFE_BOTTOM = PH - M - 30;

// ── Small helpers ─────────────────────────────────────────────────────────────

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(d: Date): string { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function fmtTime(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

function minToH(min: number): string {
  return (Math.round(min * 10 / 60) / 10).toFixed(1) + 'h';
}

function getRange(month: number, year: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString(),
    lastDay,
  };
}

function buildDayMap(logs: AccessLog[]): Map<string, AccessLog[]> {
  const map = new Map<string, AccessLog[]>();
  for (const log of logs) {
    const k = toDateString(new Date(log.timestamp));
    const arr = map.get(k) ?? [];
    arr.push(log);
    map.set(k, arr);
  }
  return map;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

function drawTable(
  doc: PdfDoc,
  y: number,
  headers: string[],
  colWidths: number[],
  rows: Cell[][],
  rowH = 15,
  fontSize = 8,
): number {
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  doc.fontSize(fontSize);

  // Header row
  doc.font('Helvetica-Bold').fillColor('#1E293B');
  for (let i = 0; i < headers.length; i++) {
    const cx = M + colWidths.slice(0, i).reduce((s, w) => s + w, 0);
    doc.text(headers[i] ?? '', cx, y, { width: (colWidths[i] ?? 0) - 2, lineBreak: false });
  }
  y += rowH - 3;
  doc.moveTo(M, y).lineTo(M + totalW, y).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
  y += 5;

  // Data rows
  doc.font('Helvetica');
  for (const row of rows) {
    if (y > SAFE_BOTTOM) { doc.addPage(); y = M; }
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell === undefined) continue;
      const cx = M + colWidths.slice(0, i).reduce((s, w) => s + w, 0);
      const w = (colWidths[i] ?? 0) - 2;
      if (typeof cell === 'string') {
        doc.fillColor('#374151').text(cell, cx, y, { width: w, lineBreak: false });
      } else {
        doc.fillColor(cell.color).text(cell.text, cx, y, { width: w, lineBreak: false });
      }
    }
    y += rowH;
  }
  return y;
}

function pdfHead(doc: PdfDoc, empName: string, period: string, title: string): number {
  let y = M;
  const now = new Date();
  const genDate = `Generado el ${pad2(now.getDate())} ${MONTHS_ES[now.getMonth()]?.toLowerCase() ?? ''} ${now.getFullYear()}`;

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0F172A').text('TimeTrack', M, y);
  doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
    .text(genDate, M, y + 6, { width: CW, align: 'right' });
  y += 28;

  doc.font('Helvetica').fontSize(11).fillColor('#475569').text(title, M, y, { width: CW });
  y += 18;

  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#E2E8F0').lineWidth(1).stroke();
  y += 12;

  doc.font('Helvetica').fontSize(9).fillColor('#374151')
    .text(`Empleado: ${empName}   |   Período: ${period}`, M, y, { width: CW });
  y += 22;
  return y;
}

// ── generateMonthlyPDF ────────────────────────────────────────────────────────

export async function generateMonthlyPDF(userId: string, month: number, year: number): Promise<Buffer> {
  const sb = getSupabaseAdmin();
  const { from, to, lastDay } = getRange(month, year);
  const monthShort = MONTHS_SHORT[month - 1] ?? '';
  const monthName = MONTHS_ES[month - 1] ?? '';
  const period = `01 ${monthShort} - ${lastDay} ${monthShort} ${year}`;

  const [pRes, lRes] = await Promise.all([
    sb.from('profiles').select('full_name, employee_code').eq('id', userId).single(),
    sb.from('access_logs').select('*').eq('user_id', userId)
      .gte('timestamp', from).lte('timestamp', to).order('timestamp', { ascending: true }),
  ]);

  if (pRes.error) throw new Error('profile: ' + pRes.error.message);
  if (lRes.error) throw new Error('logs: ' + lRes.error.message);

  const profile = pRes.data as Pick<Profile, 'full_name' | 'employee_code'>;
  const logs = (lRes.data ?? []) as AccessLog[];
  const empName = profile.full_name ?? profile.employee_code ?? userId;

  // KPIs
  const dayMap = buildDayMap(logs);
  const sortedDays = [...dayMap.keys()].sort();
  const summaries = sortedDays.map(d => ({ date: d, ...calculateDaySummary(dayMap.get(d) ?? []) }));
  const totalMin = summaries.reduce((s, d) => s + d.total_minutes, 0);
  const daysWorked = summaries.filter(d => d.total_minutes > 0).length;
  const totalH = (Math.round(totalMin * 10 / 60) / 10).toFixed(1);
  const avgH = daysWorked > 0 ? (Math.round((totalMin / daysWorked) * 10 / 60) / 10).toFixed(1) : '0.0';
  const hasCorrected = logs.some(l => l.corrected);

  const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      let y = pdfHead(doc, empName, period, `Informe Mensual — ${monthName} ${year}`);

      // ── KPIs ──
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A')
        .text('Resumen del período', M, y, { width: CW });
      y += 14;

      const kpis = [
        { label: 'Total Horas', value: totalH + 'h' },
        { label: 'Días Trabajados', value: String(daysWorked) },
        { label: 'Promedio Diario', value: avgH + 'h' },
      ];
      const boxW = CW / 3;

      for (let i = 0; i < kpis.length; i++) {
        const bx = M + i * boxW;
        doc.rect(bx, y, boxW - 8, 52).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#0F172A')
          .text(kpis[i]?.value ?? '', bx + 8, y + 8, { width: boxW - 24, align: 'center', lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor('#64748B')
          .text(kpis[i]?.label ?? '', bx + 8, y + 34, { width: boxW - 24, align: 'center', lineBreak: false });
      }
      y += 64;

      // ── Activity table ──
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A')
        .text('Actividad detallada', M, y, { width: CW });
      y += 14;

      const actCols = [75, 70, 45, 65, 60, 85];
      const actRows: Cell[][] = logs.map(l => {
        const d = new Date(l.timestamp);
        return [
          fmtDate(d),
          DAYS_FULL[d.getDay()] ?? '',
          fmtTime(d),
          l.direction === 'in'
            ? { text: 'ENTRADA', color: '#65A30D' }
            : { text: 'SALIDA', color: '#6B7280' },
          l.detail_type ?? 'normal',
          l.corrected ? 'Corrección*' : humanizeSource(l.source),
        ];
      });

      y = drawTable(doc, y, ['FECHA', 'DÍA', 'HORA', 'TIPO', 'DETALLE', 'ORIGEN'], actCols, actRows);
      y += 16;

      // ── Daily summary table ──
      if (y > SAFE_BOTTOM - 60) { doc.addPage(); y = M; }
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A')
        .text('Resumen diario', M, y, { width: CW });
      y += 14;

      const sumCols = [90, 100, 110, 80];
      const sumRows: Cell[][] = summaries.map(s => {
        const p = s.date.split('-');
        return [
          `${p[2] ?? ''}/${p[1] ?? ''}/${p[0] ?? ''}`,
          s.first_entry ? fmtTime(new Date(s.first_entry)) : '—',
          s.last_exit ? fmtTime(new Date(s.last_exit)) : '—',
          s.total_minutes > 0 ? minToH(s.total_minutes) : '—',
        ];
      });

      y = drawTable(doc, y, ['FECHA', '1ª ENTRADA', 'ÚLTIMA SALIDA', 'HORAS NETAS'], sumCols, sumRows);

      // ── Footer ──
      if (hasCorrected) {
        doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
          .text('* Fichaje creado por corrección de incidencia aprobada', M, PH - M - 20, { width: CW });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── generateMonthlyExcel ──────────────────────────────────────────────────────

export async function generateMonthlyExcel(userId: string, month: number, year: number): Promise<Buffer> {
  const sb = getSupabaseAdmin();
  const { from, to } = getRange(month, year);

  const [pRes, lRes] = await Promise.all([
    sb.from('profiles').select('full_name, employee_code').eq('id', userId).single(),
    sb.from('access_logs').select('*').eq('user_id', userId)
      .gte('timestamp', from).lte('timestamp', to).order('timestamp', { ascending: true }),
  ]);

  if (pRes.error) throw new Error('profile: ' + pRes.error.message);
  if (lRes.error) throw new Error('logs: ' + lRes.error.message);

  const logs = (lRes.data ?? []) as AccessLog[];
  const dayMap = buildDayMap(logs);
  const sortedDays = [...dayMap.keys()].sort();
  const summaries = sortedDays.map(d => ({ date: d, ...calculateDaySummary(dayMap.get(d) ?? []) }));
  const totalMin = summaries.reduce((s, d) => s + d.total_minutes, 0);
  const daysWorked = summaries.filter(d => d.total_minutes > 0).length;
  const totalH = Math.round(totalMin * 10 / 60) / 10;
  const avgH = daysWorked > 0 ? Math.round((totalMin / daysWorked) * 10 / 60) / 10 : 0;

  const srcCount = {
    signalr: logs.filter(l => l.source === 'signalr').length,
    web: logs.filter(l => l.source === 'web').length,
    mobile: logs.filter(l => l.source === 'mobile').length,
    correction: logs.filter(l => l.source === 'correction').length,
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Antigravity TimeTrack';
  wb.created = new Date();

  const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' },
  };

  // ── Hoja 1: Actividad ──
  const wsA = wb.addWorksheet('Actividad');
  wsA.columns = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Día', key: 'dia', width: 13 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Detalle', key: 'detalle', width: 10 },
    { header: 'Origen', key: 'origen', width: 16 },
    { header: 'Corregido', key: 'corregido', width: 10 },
  ];
  wsA.getRow(1).font = { bold: true };
  wsA.getRow(1).fill = HEADER_FILL;

  for (const l of logs) {
    const d = new Date(l.timestamp);
    const row = wsA.addRow({
      fecha: fmtDate(d),
      dia: DAYS_FULL[d.getDay()] ?? '',
      hora: fmtTime(d),
      tipo: l.direction === 'in' ? 'ENTRADA' : 'SALIDA',
      detalle: l.detail_type ?? 'normal',
      origen: humanizeSource(l.source),
      corregido: l.corrected ? 'Sí' : 'No',
    });
    row.getCell('tipo').font = {
      color: { argb: l.direction === 'in' ? 'FF65A30D' : 'FF6B7280' },
      bold: true,
    };
  }

  // ── Hoja 2: Resumen diario ──
  const wsS = wb.addWorksheet('Resumen diario');
  wsS.columns = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: '1ª Entrada', key: 'primera_entrada', width: 14 },
    { header: 'Última Salida', key: 'ultima_salida', width: 16 },
    { header: 'Horas Netas', key: 'horas_netas', width: 14 },
  ];
  wsS.getRow(1).font = { bold: true };
  wsS.getRow(1).fill = HEADER_FILL;

  for (const { date, total_minutes, first_entry, last_exit } of summaries) {
    const p = date.split('-');
    wsS.addRow({
      fecha: `${p[2] ?? ''}/${p[1] ?? ''}/${p[0] ?? ''}`,
      primera_entrada: first_entry ? fmtTime(new Date(first_entry)) : '—',
      ultima_salida: last_exit ? fmtTime(new Date(last_exit)) : '—',
      horas_netas: total_minutes > 0 ? minToH(total_minutes) : '—',
    });
  }

  // ── Hoja 3: KPIs ──
  const wsK = wb.addWorksheet('KPIs');
  wsK.columns = [
    { header: 'Métrica', key: 'metrica', width: 30 },
    { header: 'Valor', key: 'valor', width: 15 },
  ];
  wsK.getRow(1).font = { bold: true };
  wsK.getRow(1).fill = HEADER_FILL;

  const kpiRows = [
    { metrica: 'Total horas', valor: totalH.toFixed(1) + 'h' },
    { metrica: 'Días trabajados', valor: String(daysWorked) },
    { metrica: 'Promedio diario', valor: avgH.toFixed(1) + 'h' },
    { metrica: '', valor: '' },
    { metrica: 'Fichajes por Lector 2N', valor: String(srcCount.signalr) },
    { metrica: 'Fichajes por App Web', valor: String(srcCount.web) },
    { metrica: 'Fichajes por App Móvil', valor: String(srcCount.mobile) },
    { metrica: 'Fichajes por Corrección', valor: String(srcCount.correction) },
  ];
  for (const r of kpiRows) wsK.addRow(r);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── generateIncidenciasPDF ────────────────────────────────────────────────────

export async function generateIncidenciasPDF(userId: string, month: number, year: number): Promise<Buffer> {
  const sb = getSupabaseAdmin();
  const { lastDay } = getRange(month, year);
  const mp = pad2(month);
  const ldp = pad2(lastDay);
  const monthShort = MONTHS_SHORT[month - 1] ?? '';
  const monthName = MONTHS_ES[month - 1] ?? '';
  const period = `01 ${monthShort} - ${lastDay} ${monthShort} ${year}`;

  const [pRes, iRes] = await Promise.all([
    sb.from('profiles').select('full_name, employee_code').eq('id', userId).single(),
    sb.from('incidencias').select('*').eq('user_id', userId)
      .gte('date', `${year}-${mp}-01`).lte('date', `${year}-${mp}-${ldp}`)
      .order('date', { ascending: true }),
  ]);

  if (pRes.error) throw new Error('profile: ' + pRes.error.message);
  if (iRes.error) throw new Error('incidencias: ' + iRes.error.message);

  const profile = pRes.data as Pick<Profile, 'full_name' | 'employee_code'>;
  const incs = (iRes.data ?? []) as Incidencia[];
  const empName = profile.full_name ?? profile.employee_code ?? userId;

  const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      let y = pdfHead(doc, empName, period, `Informe de Incidencias — ${monthName} ${year}`);

      if (incs.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
          .text('No hay incidencias en este período.', M, y, { width: CW });
      } else {
        const cols = [72, 105, 72, 115, 107];
        const rows: Cell[][] = incs.map(inc => {
          const p = inc.date.split('-');
          const statusCell: Cell =
            inc.status === 'approved' ? { text: 'Aprobada', color: '#16A34A' } :
            inc.status === 'rejected' ? { text: 'Rechazada', color: '#DC2626' } :
            (INC_STATUS[inc.status] ?? inc.status);
          return [
            `${p[2] ?? ''}/${p[1] ?? ''}/${p[0] ?? ''}`,
            INC_TYPE[inc.type] ?? inc.type,
            statusCell,
            truncate(inc.reason ?? '—', 30),
            truncate(inc.manager_note ?? '—', 28),
          ];
        });

        y = drawTable(doc, y, ['FECHA', 'TIPO', 'ESTADO', 'MOTIVO', 'NOTA MANAGER'], cols, rows);
        y += 20;

        if (y > SAFE_BOTTOM - 80) { doc.addPage(); y = M; }

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A')
          .text('Resumen', M, y, { width: CW });
        y += 14;

        const approved = incs.filter(i => i.status === 'approved').length;
        const rejected = incs.filter(i => i.status === 'rejected').length;
        const pending = incs.filter(i => i.status === 'pending').length;

        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        for (const line of [
          `Total: ${incs.length}`,
          `Aprobadas: ${approved}`,
          `Rechazadas: ${rejected}`,
          `Pendientes: ${pending}`,
        ]) {
          doc.text(line, M, y, { width: CW }); y += 14;
        }
      }

      const now = new Date();
      doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
        .text(
          `Generado el ${pad2(now.getDate())} ${MONTHS_ES[now.getMonth()]?.toLowerCase() ?? ''} ${now.getFullYear()}`,
          M, PH - M - 20, { width: CW },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
