// 2N Access Commander v3 REST API client

import type { AcUser, AcCard } from '../types/ac.types.js';

type ListResponse<T> = { Result?: T[]; items?: T[] } | T[];

function extractList<T>(res: ListResponse<T>): T[] {
  if (Array.isArray(res)) return res;
  if (res.Result) return res.Result;
  if (res.items) return res.items;
  return [];
}

export type AcClient = ReturnType<typeof createAcClient>;

export type AcCompany = { Id: string; Name: string; [key: string]: unknown };

export function createAcClient(baseUrl: string, apiToken: string): {
  getUsers(query?: string): Promise<AcUser[]>;
  getCompanies(): Promise<AcCompany[]>;
  createUser(data: Omit<AcUser, 'Id'>): Promise<AcUser>;
  updateUser(acId: string, data: Partial<Omit<AcUser, 'Id'>>): Promise<AcUser>;
  deleteUser(acId: string): Promise<void>;
  assignGroup(acUserId: string, groupId: string): Promise<void>;
  removeFromGroup(acUserId: string, groupId: string): Promise<void>;
  getUserCards(acUserId: string): Promise<AcCard[]>;
  addCard(acUserId: string, cardNumber: string): Promise<AcCard>;
  removeCard(acUserId: string, cardId: string): Promise<void>;
  setPin(acUserId: string, pin: string): Promise<void>;
  removePin(acUserId: string): Promise<void>;
  createCompany(data: { Name: string }): Promise<AcCompany>;
} {
  function headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}/api/v3${path}`;
    const init: RequestInit = { method, headers: headers() };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`AC API ${method} ${path} → ${res.status}: ${text}`);
    }

    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return undefined as T;

    return res.json() as Promise<T>;
  }

  return {
    async getUsers(query?: string): Promise<AcUser[]> {
      const qs = query ? `?${query}` : '';
      const res = await request<ListResponse<AcUser>>('GET', `/users${qs}`);
      return extractList(res);
    },

    async getCompanies(): Promise<AcCompany[]> {
      const res = await request<ListResponse<AcCompany>>('GET', '/companies');
      return extractList(res);
    },

    createUser(data: Omit<AcUser, 'Id'>): Promise<AcUser> {
      return request<AcUser>('POST', '/users', data);
    },

    updateUser(acId: string, data: Partial<Omit<AcUser, 'Id'>>): Promise<AcUser> {
      return request<AcUser>('PATCH', `/users/${acId}`, data);
    },

    async deleteUser(acId: string): Promise<void> {
      await request<void>('DELETE', `/users/${acId}`);
    },

    async assignGroup(acUserId: string, groupId: string): Promise<void> {
      await request<void>('POST', `/users/${acUserId}/groups`, { groupId });
    },

    async removeFromGroup(acUserId: string, groupId: string): Promise<void> {
      await request<void>('DELETE', `/users/${acUserId}/groups/${groupId}`);
    },

    async getUserCards(acUserId: string): Promise<AcCard[]> {
      const res = await request<ListResponse<AcCard>>('GET', `/users/${acUserId}/cards`);
      return extractList(res);
    },

    addCard(acUserId: string, cardNumber: string): Promise<AcCard> {
      return request<AcCard>('POST', `/users/${acUserId}/cards`, { CardNumber: cardNumber });
    },

    async removeCard(acUserId: string, cardId: string): Promise<void> {
      await request<void>('DELETE', `/users/${acUserId}/cards/${cardId}`);
    },

    async setPin(acUserId: string, pin: string): Promise<void> {
      await request<void>('POST', `/users/${acUserId}/switches`, { SwitchCode: pin });
    },

    async removePin(acUserId: string): Promise<void> {
      await request<void>('DELETE', `/users/${acUserId}/switches`);
    },

    createCompany(data: { Name: string }): Promise<AcCompany> {
      return request<AcCompany>('POST', '/companies', data);
    },
  };
}

// Singleton global usando env vars — usado por users.ts y n8n callbacks
export const acClient = createAcClient(
  process.env['AC_BASE_URL'] ?? '',
  process.env['AC_API_TOKEN'] ?? ''
);
