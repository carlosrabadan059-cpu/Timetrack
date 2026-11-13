// Attendance calculation service — source-agnostic
// All three modes (signalr, web, mobile) are treated identically.

import type { AccessLog } from '../types/supabase.types.js';
import { shortDayName, toDateString } from '../lib/date-utils.js';
import { workWindow, type ScheduleSettings } from '../lib/schedule.js';

export type DaySummary = {
  total_minutes: number;
  descanso_minutes: number;
  is_inside: boolean;
  first_entry: string | null;
  last_exit: string | null;
};

/**
 * Calculates worked/break minutes for a single day.
 * Pairs in→out sequentially, source-agnostic.
 * Ignores denied events.
 * With `schedule`, worked time on a working day only counts between the official
 * start and the expected exit (see workWindow in lib/schedule.ts).
 */
export function calculateDaySummary(fichajes: AccessLog[], schedule?: ScheduleSettings | null): DaySummary {
  const granted = fichajes
    .filter((f) => f.event_type !== 'denied')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let total_minutes = 0;
  let descanso_minutes = 0;
  let first_entry: string | null = null;
  let last_exit: string | null = null;
  let pendingIn: AccessLog | null = null;

  const firstIn = granted.find((f) => f.direction === 'in');
  const win = schedule && firstIn ? workWindow(new Date(firstIn.timestamp), schedule) : null;

  for (const log of granted) {
    if (log.direction === 'in') {
      pendingIn = log;
      if (!first_entry) first_entry = log.timestamp;
    } else if (log.direction === 'out' && pendingIn !== null) {
      const inTime = new Date(pendingIn.timestamp).getTime();
      const outTime = new Date(log.timestamp).getTime();
      if (pendingIn.detail_type === 'comida') {
        descanso_minutes += (outTime - inTime) / 60_000;
      } else {
        const from = win ? Math.max(inTime, win.start.getTime()) : inTime;
        const to = win ? Math.min(outTime, win.end.getTime()) : outTime;
        total_minutes += Math.max(0, to - from) / 60_000;
      }
      last_exit = log.timestamp;
      pendingIn = null;
    }
  }

  return {
    total_minutes: Math.round(total_minutes),
    descanso_minutes: Math.round(descanso_minutes),
    is_inside: pendingIn !== null,
    first_entry,
    last_exit,
  };
}

/**
 * Builds the weekly bar chart data from pre-fetched logs.
 * weekDates: array of YYYY-MM-DD strings (Mon–Fri).
 */
export function buildWeekBars(
  weekLogs: AccessLog[],
  weekDates: string[],
  schedule?: ScheduleSettings | null
): Array<{ day: string; date: string; minutes: number }> {
  return weekDates.map((date) => {
    const dayLogs = weekLogs.filter((l) => l.timestamp.startsWith(date));
    const { total_minutes } = calculateDaySummary(dayLogs, schedule);
    const d = new Date(date + 'T12:00:00');
    return {
      day: shortDayName(d),
      date,
      minutes: total_minutes,
    };
  });
}

/**
 * Breaks today's worked time into trabajo/descanso/otros buckets.
 */
export function buildTodayDistribution(todayLogs: AccessLog[], schedule?: ScheduleSettings | null): {
  trabajo_minutes: number;
  descanso_minutes: number;
  otros_minutes: number;
} {
  const { total_minutes, descanso_minutes } = calculateDaySummary(todayLogs, schedule);
  return {
    trabajo_minutes: total_minutes,
    descanso_minutes,
    otros_minutes: 0,
  };
}

/**
 * Determines jornada status from today's logs.
 * working: currently inside
 * paused:  last event was 'out' with detail_type in PAUSE_TYPES
 * out:     no events or last event was normal 'out'
 */
const PAUSE_TYPES = new Set(['comida', 'descanso', 'medico', 'otro']);

export function getJornadaStatus(
  todayLogs: AccessLog[]
): 'working' | 'paused' | 'out' {
  const granted = todayLogs
    .filter((f) => f.event_type !== 'denied')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (granted.length === 0) return 'out';

  const last = granted[granted.length - 1];
  if (!last) return 'out';
  if (last.direction === 'in') return 'working';
  if (last.direction === 'out' && last.detail_type && PAUSE_TYPES.has(last.detail_type)) return 'paused';
  return 'out';
}

// ── Legacy helpers (kept for backward-compat) ─────────────────────────────────

export type InferredDirection = 'in' | 'out';
export type DetailType = 'normal' | 'comida' | 'descanso' | 'medico' | 'otro';

export function inferDirection(todayLogs: AccessLog[]): InferredDirection {
  if (todayLogs.length === 0) return 'in';
  const last = todayLogs[todayLogs.length - 1];
  return last?.direction === 'in' ? 'out' : 'in';
}

export function isDuplicateDirection(
  todayLogs: AccessLog[],
  direction: InferredDirection
): boolean {
  if (todayLogs.length === 0) return false;
  const last = todayLogs[todayLogs.length - 1];
  return last?.direction === direction;
}

export { toDateString };
