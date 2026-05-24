// Date/time utilities shared across routes and services

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const DAYS_FULL_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Infers the detail_type based on fichaje timestamp hour (local time).
 * 13:00–15:59 → 'comida', otherwise → 'normal'
 */
export function inferDetailType(timestamp: string): 'normal' | 'comida' {
  const hour = new Date(timestamp).getHours();
  return hour >= 13 && hour < 16 ? 'comida' : 'normal';
}

/**
 * Returns true if the fichaje falls outside the valid schedule window.
 * Entry ('in'):  valid within [scheduleStart, scheduleStart + flexMinutes].
 * Exit  ('out'): valid within [scheduleEnd,   scheduleEnd   + flexMinutes].
 * Also returns true when the day is not a working day.
 */
export function checkOutOfSchedule(
  ts: Date,
  direction: 'in' | 'out',
  scheduleStart: string,
  scheduleEnd: string,
  flexMinutes: number,
  workDays: number[],
): boolean {
  if (!workDays.includes(ts.getDay())) return true;

  const totalMins = ts.getHours() * 60 + ts.getMinutes();
  const [sh = 9, sm = 0] = scheduleStart.split(':').map(Number);
  const [eh = 18, em = 0] = scheduleEnd.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;

  if (direction === 'in') {
    return totalMins < startMins || totalMins > startMins + flexMinutes;
  }
  return totalMins < endMins || totalMins > endMins + flexMinutes;
}

/**
 * Human-readable source label for exports and display.
 */
export function humanizeSource(source: string): string {
  const map: Record<string, string> = {
    signalr: 'Lector Físico 2N',
    web: 'App Web',
    mobile: 'App Móvil',
    correction: 'Corrección',
  };
  return map[source] ?? source;
}

/**
 * Returns the ISO string for the start of the given day (00:00:00.000 UTC).
 */
export function startOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns the YYYY-MM-DD string for a Date.
 */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Returns the Monday of the week containing `date`, at 00:00:00.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysFromMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns a human label for a date string (YYYY-MM-DD).
 * "Hoy", "Ayer", or "Lunes 5 de abril"
 */
export function formatDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Hoy';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === toDateString(yesterday)) return 'Ayer';

  const d = new Date(dateStr + 'T12:00:00');
  const dayName = DAYS_FULL_ES[d.getDay()] ?? '';
  const month = MONTHS_ES[d.getMonth()] ?? '';
  return `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)} ${d.getDate()} de ${month}`;
}

/**
 * Short day abbreviation for the given date.
 */
export function shortDayName(date: Date): string {
  return DAYS_ES[date.getDay()] ?? '';
}

/**
 * "Enero 2026" format for export filenames.
 */
export function monthYearLabel(date: Date): string {
  const month = MONTHS_ES[date.getMonth()] ?? '';
  return `${month}-${date.getFullYear()}`;
}
