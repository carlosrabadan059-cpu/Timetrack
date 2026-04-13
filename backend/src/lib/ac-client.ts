// 2N Access Commander v3 REST API client
// TODO: implement full CRUD in Fase 5

const AC_BASE_URL = process.env['AC_BASE_URL'] ?? '';
const AC_API_TOKEN = process.env['AC_API_TOKEN'] ?? '';

function headers(): Record<string, string> {
  return {
    'Authorization': `Bearer ${AC_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${AC_BASE_URL}/api/v3${path}`;
  const init: RequestInit = { method, headers: headers() };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AC API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export const acClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
