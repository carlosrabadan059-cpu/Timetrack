// Email notifications with digital disconnection (art. 88 LOPDGDD):
// outside the company's working hours they are held in notification_outbox and
// sent at the start of the next working period.

import { getSupabaseAdmin } from './supabase.js';
import { triggerWorkflow, dispatchN8nWebhook, type N8nWorkflow } from './n8n.js';
import { localParts, localToUtc, toMinutes, type LocalParts } from './madrid-time.js';

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

interface WorkSchedule {
  start: string; // 'HH:MM' local time
  end: string;
  days: number[]; // 0 = Sunday
  holidays: string[]; // 'YYYY-MM-DD'
}

export { localToUtc };

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
    // Atomic claim: only the caller whose UPDATE still sees sent_at IS NULL owns the row,
    // so a slow webhook or a second instance can't send it twice.
    const { data: claimed } = await sb
      .from('notification_outbox')
      .update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
      .eq('id', row.id)
      .is('sent_at', null)
      .select('id');
    if (!claimed?.length) continue;
    try {
      await dispatchN8nWebhook(row.workflow, row.payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('→ 404')) continue; // workflow not configured in n8n: nothing to retry
      console.error(`[notify] ${row.workflow} failed (attempt ${row.attempts + 1}/5):`, msg);
      // Back to the queue; `attempts` stops retries after 5 tries.
      await sb.from('notification_outbox').update({ sent_at: null }).eq('id', row.id);
    }
  }
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startOutboxFlusher(): void {
  const tick = () => { flushOutbox().catch((err: unknown) => console.error('[notify] flush failed:', err)); };
  tick();
  flushTimer = setInterval(tick, FLUSH_INTERVAL_MS);
}

export function stopOutboxFlusher(): void {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
}
