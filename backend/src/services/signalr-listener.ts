import * as signalR from '@microsoft/signalr';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { inferDetailType } from '../lib/date-utils.js';
import { sseBroadcaster } from './sse-broadcaster.js';

const AC_BASE_URL = process.env['AC_BASE_URL'] ?? '';
const AC_API_TOKEN = process.env['AC_API_TOKEN'] ?? '';

let lastEventTimestamp: string | null = null;

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleAccessLog(data: Record<string, unknown>): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const timestamp = typeof data['timestamp'] === 'string' ? data['timestamp'] : new Date().toISOString();
  lastEventTimestamp = timestamp;

  // Find profile by ac_external_id
  const externalId = data['externalId'] ?? data['userId'];
  if (!externalId) return;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('ac_external_id', String(externalId))
    .maybeSingle();

  if (!profile) return; // User not yet synced to Supabase

  const rawEventType = typeof data['eventType'] === 'string' ? data['eventType'] : '';
  const eventType = rawEventType.toLowerCase().includes('granted') ? 'granted' : 'denied';
  const rawDir = data['direction'];
  const direction: 'in' | 'out' = rawDir === 'out' ? 'out' : 'in';
  const detailType = inferDetailType(timestamp);
  const zoneName = typeof data['zoneName'] === 'string' ? data['zoneName'] : null;
  const deviceName = typeof data['deviceName'] === 'string' ? data['deviceName'] : null;
  const deviceId = typeof data['deviceId'] === 'string' ? data['deviceId'] : null;

  const { data: log, error } = await supabaseAdmin
    .from('access_logs')
    .insert({
      user_id: profile.id,
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
    console.error('[SignalR] Error inserting access_log:', error.message);
    return;
  }

  if (log && eventType === 'granted') {
    sseBroadcaster.emit(profile.id, {
      type: 'access_event',
      direction,
      timestamp: log.timestamp as string,
      zone_name: zoneName,
      source: 'signalr',
      detail_type: log.detail_type,
    });
  }
}

async function handleUserChange(data: Record<string, unknown>): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  if (data['changeType'] !== 'modified') return;

  const externalId = data['externalId'];
  const userName = data['userName'];
  if (!externalId || !userName) return;

  await supabaseAdmin
    .from('profiles')
    .update({ full_name: String(userName) })
    .eq('ac_external_id', String(externalId));
}

async function handleDeviceMonitor(data: Record<string, unknown>): Promise<void> {
  // Devices table not yet in schema — log only
  console.log('[SignalR] devicemonitor event:', JSON.stringify(data).slice(0, 100));
}

// ── Connection setup ──────────────────────────────────────────────────────────

let connection: signalR.HubConnection | null = null;

async function subscribe(conn: signalR.HubConnection): Promise<void> {
  await conn.invoke('Subscribe', 'accesslog', null);
  await conn.invoke('Subscribe', 'userchange', null);
  await conn.invoke('Subscribe', 'devicemonitor', null);
}

export async function startSignalRListener(): Promise<void> {
  if (!AC_BASE_URL || !AC_API_TOKEN) {
    console.warn('[SignalR] AC_BASE_URL or AC_API_TOKEN not set — listener not started');
    return;
  }

  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${AC_BASE_URL}/mainhubv3`, {
      headers: { Authorization: `Bearer ${AC_API_TOKEN}` },
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000, 60000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  connection.onreconnected(async (connectionId) => {
    console.log(`[SignalR] Reconnected (${connectionId ?? 'unknown'})`);
    if (lastEventTimestamp) {
      await connection!.invoke('Update', lastEventTimestamp);
    }
    await subscribe(connection!);
  });

  connection.on('ReceiveMessage', (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const msg = message as Record<string, unknown>;
    const type = msg['type'];
    const data = (msg['data'] ?? {}) as Record<string, unknown>;

    if (type === 'accesslog') void handleAccessLog(data);
    if (type === 'userchange') void handleUserChange(data);
    if (type === 'devicemonitor') void handleDeviceMonitor(data);
  });

  try {
    await connection.start();
    await subscribe(connection);
    console.log('[SignalR] Conectado a 2N Access Commander');
  } catch (err) {
    console.error('[SignalR] Error de conexión (reintentará automáticamente):', err);
  }
}

export function stopSignalRListener(): Promise<void> {
  return connection?.stop() ?? Promise.resolve();
}
