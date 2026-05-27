// Supabase table row types
// TODO: replace with `supabase gen types typescript` output once project is linked

export type Company = {
  id: string;
  name: string;
  cif: string | null;
  address: string | null;
  email: string | null;
  created_by: string | null;
  created_at: string;
};

export type ClockingModes = {
  web: boolean;
  mobile: boolean;
  twoN: {
    enabled: boolean;
    type: 'ac' | 'device' | null;
    ac_base_url: string | null;
    ac_api_token: string | null;
    device_webhook_secret: string | null;
  };
};

export type CompanySettings = {
  id: string;
  company_id: string;
  company_name: string;
  company_cif: string;
  company_address: string;
  company_email: string;
  geo_fence_radius: number;
  courtesy_minutes: number;
  headquarter_lat: number;
  headquarter_lon: number;
  work_schedule_start: string;
  work_schedule_end: string;
  work_schedule_days: number[];
  branches: unknown[];
  holidays: unknown[];
  vacation_days_per_year: number;
  clocking_modes: ClockingModes;
  updated_at: string | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
  role: 'superadmin' | 'admin' | 'manager' | 'employee';
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
  detail_type: 'normal' | 'comida' | 'descanso' | 'medico' | 'otro' | null;
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
  requested_direction: 'in' | 'out' | null;
  reason: string | null;
  manager_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  access_log_id: string | null;
  created_at: string;
};

export type VacationRequest = {
  id: string;
  user_id: string;
  company_id: string;
  type: 'vacaciones' | 'permiso_retribuido' | 'asuntos_propios';
  start_date: string;
  end_date: string;
  working_days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  manager_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
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
  updated_at: string;
};
