import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ data: T }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { response: { data: json, status: res.status } });
  }
  return json;
}

export const api = {
  get:   <T>(path: string) => request<T>('GET', path),
  post:  <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
};
