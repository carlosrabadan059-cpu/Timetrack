// Flexible working hours: entry window and expected exit computed from the actual entry.
//
// With official start S, end E, flex F minutes and exit tolerance T:
//   - first 'in' of the (Madrid) day after S+F  → 'late_entry'
//   - expected exit = max(entry, S) + (E − S)     (the lunch break is inside E − S)
//   - a normal 'out' before expected exit − T     → 'early_exit'
// Flags are informative only: a fichaje is never blocked because of them.

import { getSupabaseAdmin } from './supabase.js';
import { localParts, localToUtc, startOfLocalDay, toMinutes } from './madrid-time.js';

export type ScheduleFlag = 'late_entry' | 'early_exit';

export interface ScheduleSettings {
  start: string; // 'HH:MM' Madrid time
  end: string;
  flexEnabled: boolean;
  flexMinutes: number;
  exitToleranceMinutes: number;
  workDays: number[]; // 0 = Sunday
  holidays: string[]; // 'YYYY-MM-DD'
}

/** Pause types: an 'out' with one of these is a break, not the end of the day. */
const PAUSE_TYPES = new Set(['comida', 'descanso', 'medico', 'otro']);

function isWorkingDay(d: Date, s: ScheduleSettings): boolean {
  const p = localParts(d);
  return s.workDays.includes(p.dow) && !s.holidays.includes(p.date);
}

/** Minutes of the official day (E − S); 0 if the schedule is inconsistent. */
export function dayDurationMinutes(s: ScheduleSettings): number {
  return Math.max(0, toMinutes(s.end, 18 * 60) - toMinutes(s.start, 9 * 60));
}

/** Latest entry time (minutes since local midnight) that is not flagged as late. */
export function latestOnTimeEntry(s: ScheduleSettings): number {
  return toMinutes(s.start, 9 * 60) + (s.flexEnabled ? s.flexMinutes : 0);
}

/**
 * Expected exit for a day whose first entry was `firstIn`.
 * An entry before the official start counts as the official start.
 */
export function expectedExit(firstIn: Date, s: ScheduleSettings): Date | null {
  const duration = dayDurationMinutes(s);
  if (duration === 0) return null;
  const p = localParts(firstIn);
  const startMin = toMinutes(s.start, 9 * 60);
  if (p.minutes <= startMin) return localToUtc(p.date, startMin + duration);
  return new Date(firstIn.getTime() + duration * 60_000);
}

export interface EvaluateInput {
  ts: Date;
  direction: 'in' | 'out';
  detailType: string | null | undefined;
  /** First granted 'in' of the same Madrid day before `ts`, if any. */
  firstInToday: Date | null;
  settings: ScheduleSettings;
}

export function evaluateFichaje({ ts, direction, detailType, firstInToday, settings }: EvaluateInput): ScheduleFlag | null {
  if (!isWorkingDay(ts, settings)) return null;

  if (direction === 'in') {
    if (firstInToday) return null; // back from a break, not the start of the day
    return localParts(ts).minutes > latestOnTimeEntry(settings) ? 'late_entry' : null;
  }

  if (detailType && PAUSE_TYPES.has(detailType)) return null;
  if (!firstInToday) return null;
  const exit = expectedExit(firstInToday, settings);
  if (!exit) return null;
  const limit = exit.getTime() - settings.exitToleranceMinutes * 60_000;
  return ts.getTime() < limit ? 'early_exit' : null;
}

// ── Company and branch schedule ───────────────────────────────────────────────

export interface HolidayEntry {
  id?: string | number;
  date?: string;
  name?: string;
  type?: string;
  scope?: string; // 'global' or a branch id
}

/** Branch override stored in company_settings.branches[].schedule. Absent = use the company's. */
export interface BranchSchedule {
  start?: string;
  end?: string;
  days?: number[];
  flexEnabled?: boolean;
  flexMinutes?: number;
  courtesyMinutes?: number;
}

export interface CompanyScheduleRow {
  work_schedule_start?: string | null;
  work_schedule_end?: string | null;
  work_schedule_days?: number[] | null;
  holidays?: HolidayEntry[] | null;
  flexible_schedule_enabled?: boolean | null;
  flexible_schedule_minutes?: number | null;
  courtesy_minutes?: number | null;
  branches?: { id?: string | number; name?: string; schedule?: BranchSchedule | null }[] | null;
}

/** Holidays that apply to an employee: the global ones plus those of their branch. */
export function holidaysFor(holidays: HolidayEntry[] | null | undefined, branchId: string | null): HolidayEntry[] {
  return (holidays ?? []).filter(
    (h) => !h.scope || h.scope === 'global' || (branchId !== null && String(h.scope) === branchId),
  );
}

/** Holiday entries for an employee of `branchId` (ignores a branch id that no longer exists). */
export function effectiveHolidays(row: CompanyScheduleRow, branchId: string | null): HolidayEntry[] {
  const exists = branchId !== null && (row.branches ?? []).some((b) => String(b.id) === branchId);
  return holidaysFor(row.holidays, exists ? branchId : null);
}

/** Effective schedule for an employee: the branch's own schedule if it has one, else the company's. */
export function effectiveSchedule(row: CompanyScheduleRow, branchId: string | null): ScheduleSettings {
  const company: ScheduleSettings = {
    start: row.work_schedule_start ?? '09:00',
    end: row.work_schedule_end ?? '18:00',
    flexEnabled: row.flexible_schedule_enabled ?? false,
    flexMinutes: row.flexible_schedule_minutes ?? 15,
    exitToleranceMinutes: row.courtesy_minutes ?? 0,
    workDays: row.work_schedule_days ?? [1, 2, 3, 4, 5],
    holidays: [],
  };
  const branch = branchId !== null ? (row.branches ?? []).find((b) => String(b.id) === branchId) : undefined;
  const o = branch?.schedule;
  const merged: ScheduleSettings = o
    ? {
        start: o.start || company.start,
        end: o.end || company.end,
        flexEnabled: o.flexEnabled ?? company.flexEnabled,
        flexMinutes: o.flexMinutes ?? company.flexMinutes,
        exitToleranceMinutes: o.courtesyMinutes ?? company.exitToleranceMinutes,
        workDays: o.days?.length ? o.days : company.workDays,
        holidays: [],
      }
    : company;
  merged.holidays = effectiveHolidays(row, branchId)
    .map((h) => h.date ?? '')
    .filter(Boolean);
  return merged;
}

/** 'weekend' (not a working day of the schedule), 'holiday', or null — in Madrid time. */
export function nonWorkingKind(ts: Date, s: ScheduleSettings): 'weekend' | 'holiday' | null {
  const p = localParts(ts);
  if (!s.workDays.includes(p.dow)) return 'weekend';
  if (s.holidays.includes(p.date)) return 'holiday';
  return null;
}

// ── Loading (cached per company) ──────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: CompanyScheduleRow | null }>();

export async function loadCompanyScheduleRow(companyId: string): Promise<CompanyScheduleRow | null> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const { data } = await getSupabaseAdmin()
    .from('company_settings')
    .select('work_schedule_start, work_schedule_end, work_schedule_days, holidays, flexible_schedule_enabled, flexible_schedule_minutes, courtesy_minutes, branches')
    .eq('company_id', companyId)
    .maybeSingle();
  const value = (data as CompanyScheduleRow | null) ?? null;
  cache.set(companyId, { at: Date.now(), value });
  return value;
}

/** Drop the cached settings after the admin saves them. */
export function invalidateScheduleSettings(companyId: string): void {
  cache.delete(companyId);
}

export async function userBranchId(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from('profiles').select('branch_id').eq('id', userId).maybeSingle();
  const v = (data as { branch_id?: string | null } | null)?.branch_id;
  return v ? String(v) : null;
}

/** Effective schedule of an employee (their branch's, or the company's). */
export async function loadScheduleSettings(companyId: string, branchId: string | null = null): Promise<ScheduleSettings | null> {
  const row = await loadCompanyScheduleRow(companyId);
  return row ? effectiveSchedule(row, branchId) : null;
}

export async function loadUserSchedule(userId: string, companyId: string): Promise<ScheduleSettings | null> {
  return loadScheduleSettings(companyId, await userBranchId(userId));
}

/** First granted 'in' of the user's Madrid day containing `ts`, strictly before `ts`. */
export async function firstInOfDay(userId: string, ts: Date): Promise<Date | null> {
  const { data } = await getSupabaseAdmin()
    .from('access_logs')
    .select('timestamp')
    .eq('user_id', userId)
    .eq('event_type', 'granted')
    .eq('direction', 'in')
    .gte('timestamp', startOfLocalDay(ts).toISOString())
    .lt('timestamp', ts.toISOString())
    .order('timestamp', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.timestamp ? new Date(data.timestamp as string) : null;
}

/** Schedule flag for a new fichaje (web, mobile or 2N). Never throws: returns null on error. */
export async function scheduleFlagFor(
  userId: string,
  companyId: string | null,
  ts: Date,
  direction: 'in' | 'out',
  detailType: string | null | undefined,
): Promise<ScheduleFlag | null> {
  if (!companyId) return null;
  try {
    const settings = await loadUserSchedule(userId, companyId);
    if (!settings) return null;
    const firstInToday = await firstInOfDay(userId, ts);
    return evaluateFichaje({ ts, direction, detailType, firstInToday, settings });
  } catch (err) {
    console.error('[schedule] evaluation failed', err);
    return null;
  }
}
