import * as signalR from '@microsoft/signalr';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { inferDetailType, startOfDayISO } from '../lib/date-utils.js';
import { sseBroadcaster } from './sse-broadcaster.js';
import type { ClockingModes } from '../types/supabase.types.js';

// ── Core event handler ─────────────────────────────────────────────────────────
// companyId is passed when the event comes from a per-company SignalR connection.
// Falls back to profile lookup by ac_external_id for backward compatibility.

export async function handleAccessEvent(
  data: Record<string, unknown>,
  companyId?: string
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const isNative =
    typeof data['Category'] === 'string' &&
    typeof data['Person'] === 'object' &&
    data['Person'] !== null;

  let timestamp: string;
  let acUserId: string | null;
  let rawCategory: string;
  let rawDir: unknown;
  let deviceName: string | null = null;
  let deviceId: string | null = null;
  let zoneName: string | null = null;

  if (isNative) {
    const person = data['Person'] as Record<string, unknown>;
    const device =
      typeof data['Device'] === 'object' && data['Device'] !== null
        ? (data['Device'] as Record<string, unknown>)
        : null;
    const zoneEntered =
      typeof data['ZoneEntered'] === 'object' && data['ZoneEntered'] !== null
        ? (data['ZoneEntered'] as Record<string, unknown>)
        : null;
    const zoneExited =
      typeof data['ZoneExited'] === 'object' && data['ZoneExited'] !== null
        ? (data['ZoneExited'] as Record<string, unknown>)
        : null;

    timestamp = typeof data['Time'] === 'string' ? data['Time'] : new Date().toISOString();
    acUserId = typeof person['Id'] === 'string' ? person['Id'] : null;
    rawCategory = typeof data['Category'] === 'string' ? data['Category'] : '';
    rawDir = data['Direction'];
    deviceName = typeof device?.['Name'] === 'string' ? device['Name'] : null;
    deviceId = typeof device?.['Id'] === 'string' ? String(device['Id']) : null;
    const zone = zoneEntered ?? zoneExited;
    zoneName = typeof zone?.['Name'] === 'string' ? zone['Name'] : null;
  } else {
    timestamp =
      typeof data['timestamp'] === 'string' ? data['timestamp'] : new Date().toISOString();
    const flat = data['externalId'] ?? data['userId'] ?? data['personId'];
    acUserId = flat != null ? String(flat) : null;
    rawCategory = typeof data['eventType'] === 'string' ? data['eventType'] : '';
    rawDir = data['direction'];
    deviceName = typeof data['deviceName'] === 'string' ? data['deviceName'] : null;
    deviceId = typeof data['deviceId'] === 'string' ? data['deviceId'] : null;
    zoneName = typeof data['zoneName'] === 'string' ? data['zoneName'] : null;
  }

  // Also capture the numeric user number from the Person object (if present)
  const acUserNumber: number | null =
    isNative && typeof (data['Person'] as Record<string, unknown>)?.['Number'] === 'number'
      ? ((data['Person'] as Record<string, unknown>)['Number'] as number)
      : null;

  if (!acUserId && acUserNumber === null) {
    console.warn('[2N] Event without user ID or Number — skipping');
    return;
  }

  // Build lookup: try UUID first, then ac_user_number as fallback
  let profileId: string | null = null;

  if (acUserId) {
    let q = supabaseAdmin
      .from('profiles')
      .select('id')
      .or(`id.eq.${acUserId},ac_external_id.eq.${acUserId}`);
    if (companyId) q = q.eq('company_id', companyId) as typeof q;
    const { data: p } = await q.maybeSingle();
    if (p) profileId = p.id as string;
  }

  if (!profileId && acUserNumber !== null) {
    let q = supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('ac_user_number', acUserNumber);
    if (companyId) q = q.eq('company_id', companyId) as typeof q;
    const { data: p } = await q.maybeSingle();
    if (p) profileId = p.id as string;
  }

  if (!profileId) {
    console.warn(`[2N] No profile found for acUserId=${acUserId} acUserNumber=${acUserNumber}`);
    return;
  }

  // Auto-store the Number if we didn't have it yet
  if (acUserNumber !== null) {
    await supabaseAdmin
      .from('profiles')
      .update({ ac_user_number: acUserNumber })
      .eq('id', profileId)
      .is('ac_user_number', null);
  }

  const eventType = rawCategory.toLowerCase().includes('granted') ? 'granted' : 'denied';

  let direction: 'in' | 'out';
  if (rawDir === 'in' || rawDir === 'Entry') {
    direction = 'in';
  } else if (rawDir === 'out' || rawDir === 'Exit') {
    direction = 'out';
  } else {
    const todayStart = startOfDayISO(new Date(timestamp));
    const { data: lastLog } = await supabaseAdmin
      .from('access_logs')
      .select('direction')
      .eq('user_id', profileId)
      .eq('event_type', 'granted')
      .gte('timestamp', todayStart)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    direction = !lastLog || lastLog.direction === 'out' ? 'in' : 'out';
  }

  const detailType = inferDetailType(timestamp);

  // Dedup: reject duplicate events from parallel SignalR connections (same timestamp + user)
  const { count: existing } = await supabaseAdmin
    .from('access_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profileId)
    .eq('timestamp', timestamp)
    .eq('source', 'signalr');
  if (existing && existing > 0) {
    console.log(`[2N] Duplicate event skipped — user=${profileId} timestamp=${timestamp}`);
    return;
  }

  const { data: log, error } = await supabaseAdmin
    .from('access_logs')
    .insert({
      user_id: profileId,
      device_id: deviceId,
      device_name: deviceName,
      zone_name: zoneName,
      event_type: eventType,
      direction,
      detail_type: detailType,
      timestamp,
      source: 'signalr',
      device_info: deviceName,
      raw_payload: data,
    })
    .select('id, direction, timestamp, detail_type')
    .single();

  if (error) {
    console.error('[2N] Error inserting access_log:', error.message);
    return;
  }

  console.log(`[2N] Fichaje — user=${profileId} direction=${direction} eventType=${eventType}`);

  if (log && eventType === 'granted') {
    sseBroadcaster.emit(profileId, {
      type: 'access_event',
      direction,
      timestamp: log.timestamp as string,
      zone_name: zoneName,
      source: 'signalr',
      detail_type: log.detail_type,
    });
  }
}

// ── Per-company SignalR connections ────────────────────────────────────────────

const connections = new Map<string, signalR.HubConnection>();

function buildConnection(acBaseUrl: string, acApiToken: string): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${acBaseUrl}/mainhubv3`, {
      headers: { Authorization: `Bearer ${acApiToken}` },
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000, 60000])
    .withServerTimeout(120_000)
    .withKeepAliveInterval(20_000)
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}

function attachHandlers(
  conn: signalR.HubConnection,
  companyId: string,
  label: string
): void {
  conn.on('ReceiveMessage', (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const msg = message as Record<string, unknown>;
    let payload = (msg['data'] ?? msg) as Record<string, unknown> | unknown[];
    if (Array.isArray(payload)) payload = payload[0] as Record<string, unknown>;
    void handleAccessEvent(payload as Record<string, unknown>, companyId);
  });

  conn.on('accesslog', (data: unknown) => {
    if (typeof data !== 'object' || data === null) return;
    const msg = data as Record<string, unknown>;
    let payload: Record<string, unknown>;
    if (Array.isArray(msg['data']) && msg['data'].length > 0) {
      payload = msg['data'][0] as Record<string, unknown>;
    } else {
      payload = msg;
    }
    void handleAccessEvent(payload, companyId);
  });

  conn.onreconnected(() => {
    console.log(`[SignalR][${label}] Reconectado`);
    void conn.invoke('Subscribe', 'accesslog', null).catch((err: unknown) => {
      console.warn(`[SignalR][${label}] Error re-suscribiendo:`, err instanceof Error ? err.message : err);
    });
  });
}

async function startCompanyConnection(
  companyId: string,
  acBaseUrl: string,
  acApiToken: string,
  label: string
): Promise<void> {
  // Stop existing connection if any
  const existing = connections.get(companyId);
  if (existing) {
    await existing.stop().catch(() => null);
    connections.delete(companyId);
  }

  const conn = buildConnection(acBaseUrl, acApiToken);
  attachHandlers(conn, companyId, label);

  try {
    await conn.start();
    await conn.invoke('Subscribe', 'accesslog', null);
    console.log(`[SignalR][${label}] Conectado`);
    connections.set(companyId, conn);
  } catch (err) {
    console.warn(
      `[SignalR][${label}] No se pudo conectar:`,
      err instanceof Error ? err.message : err
    );
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function startSignalRListener(): Promise<void> {
  const sb = getSupabaseAdmin();

  // Load all companies with 2N AC enabled
  const { data: settingsRows } = await sb
    .from('company_settings')
    .select('company_id, company_name, clocking_modes');

  const hasCompanyConnections = (settingsRows ?? []).some((row) => {
    const modes = row.clocking_modes as ClockingModes | null;
    return modes?.twoN?.enabled && modes.twoN.type === 'ac' && modes.twoN.ac_base_url && modes.twoN.ac_api_token;
  });

  // Only start global connection if no company-level connections are configured (dev/legacy fallback)
  if (!hasCompanyConnections) {
    const globalUrl = process.env['AC_BASE_URL'];
    const globalToken = process.env['AC_API_TOKEN'];
    if (globalUrl && globalToken) {
      await startCompanyConnection('__global__', globalUrl, globalToken, 'global');
    }
  }

  for (const row of settingsRows ?? []) {
    const modes = row.clocking_modes as ClockingModes | null;
    if (
      modes?.twoN?.enabled &&
      modes.twoN.type === 'ac' &&
      modes.twoN.ac_base_url &&
      modes.twoN.ac_api_token
    ) {
      await startCompanyConnection(
        row.company_id,
        modes.twoN.ac_base_url,
        modes.twoN.ac_api_token,
        row.company_name ?? row.company_id
      );
    }
  }
}

/** Call after updating clocking_modes for a company to restart its SignalR connection */
export async function restartCompanyConnection(companyId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: row } = await sb
    .from('company_settings')
    .select('company_name, clocking_modes')
    .eq('company_id', companyId)
    .single();

  if (!row) return;

  const modes = row.clocking_modes as ClockingModes | null;

  // Stop existing connection regardless
  const existing = connections.get(companyId);
  if (existing) {
    await existing.stop().catch(() => null);
    connections.delete(companyId);
  }

  if (
    modes?.twoN?.enabled &&
    modes.twoN.type === 'ac' &&
    modes.twoN.ac_base_url &&
    modes.twoN.ac_api_token
  ) {
    await startCompanyConnection(
      companyId,
      modes.twoN.ac_base_url,
      modes.twoN.ac_api_token,
      row.company_name ?? companyId
    );
  }
}

export async function stopSignalRListener(): Promise<void> {
  for (const [id, conn] of connections) {
    await conn.stop().catch(() => null);
    connections.delete(id);
  }
}
