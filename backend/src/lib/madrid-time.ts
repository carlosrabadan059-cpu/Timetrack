// Wall-clock helpers for Europe/Madrid. The server runs in UTC, so any comparison
// with a company schedule ('08:00') has to go through these, never Date#getHours().

export const TZ = 'Europe/Madrid';

export interface LocalParts {
  date: string; // 'YYYY-MM-DD' local date
  dow: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
}

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date): LocalParts {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p['year']}-${p['month']}-${p['day']}`,
    dow: DOW[p['weekday'] ?? 'Mon'] ?? 1,
    minutes: Number(p['hour']) * 60 + Number(p['minute']),
  };
}

/** 'HH:MM' → minutes since midnight; `fallback` if it can't be parsed. */
export function toMinutes(hhmm: string | null | undefined, fallback: number): number {
  if (!hhmm) return fallback;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) ? (h ?? 0) * 60 + (Number.isFinite(m) ? (m ?? 0) : 0) : fallback;
}

/** UTC instant for a Madrid wall-clock time on a given local date. */
export function localToUtc(date: string, minutes: number): Date {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  const guess = new Date(`${date}T${hh}:${mm}:00Z`);
  const p = localParts(guess);
  const [y, mo, d] = p.date.split('-').map(Number);
  const asLocal = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, Math.floor(p.minutes / 60), p.minutes % 60);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

/** UTC instant of local midnight (Madrid) for the day containing `d`. */
export function startOfLocalDay(d: Date): Date {
  return localToUtc(localParts(d).date, 0);
}
