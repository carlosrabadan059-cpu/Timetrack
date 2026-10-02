// Email notifications with digital disconnection (art. 88 LOPDGDD):
// outside the company's working hours they are held in notification_outbox and
// sent at the start of the next working period.

import { getSupabaseAdmin } from './supabase.js';
import { triggerWorkflow, type N8nWorkflow } from './n8n.js';

const TZ = 'Europe/Madrid';
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

interface WorkSchedule {
  start: string; // 'HH:MM' local time
  end: string;
  days: number[]; // 0 = Sunday
  holidays: string[]; // 'YYYY-MM-DD'
}

interface LocalParts {
  date: string;
  dow: number;
  minutes: number;
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

function localParts(d: Date): LocalParts {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p['year']}-${p['month']}-${p['day']}`,
    dow: DOW[p['weekday'] ?? 'Mon'] ?? 1,
    minutes: Number(p['hour']) * 60 + Number(p['minute']),
  };
}

function toMinutes(hhmm: string, fallback: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) ? (h ?? 0) * 60 + (m ?? 0) : fallback;
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

/**
 * Returns null if `now` is inside working hours (send immediately),
 * otherwise the start of the next working period.
 */
export function nextWorkingStart(now: Date, s: WorkSchedule): Date | null {
  const start = toMinutes(s.start, 9 * 60);
  const end = toMinutes(s.end, 18 * 60);
  const isWorkday = (p: LocalParts) => s.days.includes(p.dow) && !s.holidays.includes(p.date);

  const today = localParts(now);
  if (isWorkday(today) && today.minutes >= start && today.minutes < end) return null;
  if (isWorkday(today) && today.minutes < start) return localToUtc(today.date, start);

  for (let i = 1; i <= 31; i++) {
    const p = localParts(new Date(now.getTime() + i * 24 * 60 * 60 * 1000));
    if (isWorkday(p)) return localToUtc(p.date, start);
  }
  return null; // no working day configured in the next month: don't hold the email forever
}

async function loadSchedule(companyId: string): Promise<WorkSchedule> {
  const { data } = await getSupabaseAdmin()
    .from('company_settings')
    .select('work_schedule_start, work_schedule_end, work_schedule_days, holidays')
    .eq('company_id', companyId)
    .maybeSingle();
  const row = data as {
    work_schedule_start?: string | null;
    work_schedule_end?: string | null;
    work_schedule_days?: number[] | null;
    holidays?: { date?: string }[] | null;
  } | null;
  return {
    start: row?.work_schedule_start ?? '09:00',
    end: row?.work_schedule_end ?? '18:00',
    days: row?.work_schedule_days ?? [1, 2, 3, 4, 5],
    holidays: (row?.holidays ?? []).map((h) => h.date ?? '').filter(Boolean),
  };
}

/**
 * Sends an email-notification workflow, honouring the recipient's `notifications_email`
 * preference and the company's working hours. Never throws.
 */
export async function notify(
  workflow: N8nWorkflow,
  payload: Record<string, unknown>,
  opts: { companyId: string | null; recipientId: string | null }
): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (opts.recipientId) {
      const { data: rcpt } = await sb
        .from('profiles')
        .select('notifications_email')
        .eq('id', opts.recipientId)
        .maybeSingle();
      if ((rcpt as { notifications_email?: boolean } | null)?.notifications_email === false) return;
    }

    const sendAfter = opts.companyId ? nextWorkingStart(new Date(), await loadSchedule(opts.companyId)) : null;
    if (!sendAfter) {
      await triggerWorkflow(workflow, payload);
      return;
    }

    const { error } = await sb.from('notification_outbox').insert({
      workflow,
      payload,
      company_id: opts.companyId,
      send_after: sendAfter.toISOString(),
    });
    if (error) console.error('[notify] outbox insert failed:', error.message);
  } catch (err) {
    console.error('[notify] failed:', err);
  }
}

/** Sends held notifications whose working period has started. */
export async function flushOutbox(): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('notification_outbox')
    .select('id, workflow, payload, attempts')
    .is('sent_at', null)
    .lte('send_after', new Date().toISOString())
    .lt('attempts', 5)
    .order('send_after')
    .limit(50);
  if (error) {
    console.error('[notify] outbox read failed:', error.message);
    return;
  }
  for (const row of (data ?? []) as { id: string; workflow: N8nWorkflow; payload: Record<string, unknown>; attempts: number }[]) {
    // Mark first so a slow webhook can't cause a double send on the next tick
    await sb.from('notification_outbox').update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq('id', row.id);
    await triggerWorkflow(row.workflow, row.payload);
  }
}

export function startOutboxFlusher(): void {
  const tick = () => { flushOutbox().catch((err: unknown) => console.error('[notify] flush failed:', err)); };
  tick();
  setInterval(tick, FLUSH_INTERVAL_MS);
}
