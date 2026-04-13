// 2N Access Commander v3 REST API types

export type AcUser = {
  Id: string;
  ExternalId: string; // Supabase UUID
  FirstName: string;
  LastName: string;
  Email?: string;
  Enabled: boolean;
};

export type AcCard = {
  Id: string;
  UserId: string;
  CardNumber: string;
  Description?: string;
};

export type AcAccessGroup = {
  Id: string;
  Name: string;
};

// SignalR event payloads
export type AcAccessLogEvent = {
  Id: string;
  UserId?: string;
  ExternalUserId?: string;
  DeviceId: string;
  DeviceName: string;
  ZoneId?: string;
  ZoneName?: string;
  EventType: 'granted' | 'denied' | 'doorbell' | 'remote_open';
  Direction?: 'in' | 'out';
  Timestamp: string; // ISO 8601
};

export type AcUserChangeEvent = {
  UserId: string;
  ExternalId?: string;
  ChangeType: 'created' | 'updated' | 'deleted';
};

export type AcDeviceMonitorEvent = {
  DeviceId: string;
  Status: 'online' | 'offline' | 'error';
  Timestamp: string;
};
