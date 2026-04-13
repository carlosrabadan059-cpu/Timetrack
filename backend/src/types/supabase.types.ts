// Supabase table row types
// TODO: replace with `supabase gen types typescript` output once project is linked

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
  role: 'admin' | 'manager' | 'employee';
  company_id: string | null;
  ac_external_id: string | null;
  ac_synced_at: string | null;
  access_valid_from: string | null;
  access_valid_to: string | null;
  notifications_email: boolean;
  two_factor_enabled: boolean;
  avatar_url: string | null;
  created_at: string;
};

export type AccessLog = {
  id: string;
  user_id: string;
  device_id: string | null;
  device_name: string | null;
  zone_id: string | null;
  zone_name: string | null;
  event_type: string | null;
  direction: 'in' | 'out' | null;
  detail_type: 'normal' | 'comida' | 'otro' | null;
  timestamp: string;
  source: 'signalr' | 'web' | 'mobile' | 'correction';
  corrected: boolean;
  original_timestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  device_info: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

export type Incidencia = {
  id: string;
  user_id: string;
  company_id: string | null;
  type: 'olvido' | 'correccion' | 'ausencia' | 'hora_extra';
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  original_timestamp: string | null;
  requested_timestamp: string | null;
  reason: string | null;
  manager_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  access_log_id: string | null;
  created_at: string;
};

export type SyncQueueEntry = {
  id: string;
  action:
    | 'create_user'
    | 'update_user'
    | 'delete_user'
    | 'assign_card'
    | 'revoke_card'
    | 'assign_pin'
    | 'revoke_pin';
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'abandoned';
  retries: number;
  error_message: string | null;
  created_at: string;
};
