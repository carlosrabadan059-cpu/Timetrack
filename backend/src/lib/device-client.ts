// HTTP API client for 2N physical devices (Digest Auth)
// TODO: implement Digest Auth and device-specific endpoints in Fase 5

export type DeviceCommand = {
  deviceIp: string;
  endpoint: string;
  body?: unknown;
};

export async function sendDeviceCommand(cmd: DeviceCommand): Promise<unknown> {
  // Digest Auth implementation required — placeholder for Fase 5
  throw new Error(
    `deviceClient.sendDeviceCommand not yet implemented (target: ${cmd.deviceIp}${cmd.endpoint})`
  );
}
