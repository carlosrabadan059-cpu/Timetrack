import { supabase } from './supabase';

// Conexión del cliente API con el backend (inyectado desde variables de entorno o local)
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

async function request(method, path, { body, params } = {}) {
    const token = await getToken();
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        let errorBody;
        try { errorBody = await res.json(); } catch { errorBody = {}; }
        const err = new Error(errorBody?.error?.message ?? `HTTP ${res.status}`);
        err.code = errorBody?.error?.code ?? 'unknown';
        err.status = res.status;
        throw err;
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function download(path, params) {
    const token = await getToken();
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });
    }

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
}

export const api = {
    get: (path, params) => request('GET', path, { params }),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    delete: (path) => request('DELETE', path),
    download,
};
