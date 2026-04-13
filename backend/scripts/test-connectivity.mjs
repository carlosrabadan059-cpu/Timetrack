/**
 * test-connectivity.mjs
 * Verifica la conectividad con Supabase y 2N Access Commander.
 * Uso: node scripts/test-connectivity.mjs
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Cargar .env manualmente (sin dependencia de dotenv) ──────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
const envLines = readFileSync(envPath, 'utf-8').split('\n');

for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [key, ...rest] = trimmed.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

// ── Colores para la terminal ─────────────────────────────────────────────────
const ok  = (msg) => console.log(`  ✅ ${msg}`);
const err = (msg) => console.log(`  ❌ ${msg}`);
const hdr = (msg) => console.log(`\n━━━  ${msg}  ━━━`);

// ── 1. TEST SUPABASE ─────────────────────────────────────────────────────────
async function testSupabase() {
  hdr('SUPABASE');

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    err('SUPABASE_URL o SUPABASE_ANON_KEY no definidas en .env');
    return;
  }

  // Una tabla inexistente con error de schema cache = conexión OK (PostgREST responde)
  const isConnectionOk = (error) =>
    !error ||
    error.code === '42P01' ||
    error.message?.includes('does not exist') ||
    error.message?.includes('schema cache');

  // Test con anon key (public client)
  try {
    const client = createClient(url, anonKey);
    const { error } = await client.from('_dummy_ping_').select('id').limit(1);
    if (isConnectionOk(error)) {
      ok('Conexión con ANON KEY exitosa → PostgREST responde correctamente');
    } else {
      err(`ANON KEY — Error inesperado: ${error.message}`);
    }
  } catch (e) {
    err(`ANON KEY — Excepción de red: ${e.message}`);
  }

  // Test con service role key (admin client)
  if (!serviceKey) {
    err('SUPABASE_SERVICE_ROLE_KEY no definida — omitiendo test admin');
    return;
  }

  if (serviceKey.startsWith('sb_publishable_')) {
    err('SUPABASE_SERVICE_ROLE_KEY contiene la Publishable key — ¡clave incorrecta!');
    err('  → Ve a Supabase > Project Settings > API > Secret keys (sb_secret_...)');
    return;
  }

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.from('_dummy_ping_').select('id').limit(1);
    if (isConnectionOk(error)) {
      ok('Conexión con SERVICE ROLE KEY exitosa → Admin client listo');
    } else {
      err(`SERVICE ROLE KEY — Error inesperado: ${error.message}`);
    }
  } catch (e) {
    err(`SERVICE ROLE KEY — Excepción de red: ${e.message}`);
  }
}

// ── Helper: HTTP/HTTPS request como Promise ──────────────────────────────────
import http from 'http';

function httpRequest(pathname, baseUrl, token) {
  const url = new URL(pathname, baseUrl);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const defaultPort = isHttps ? 443 : 80;

  return new Promise((resolve) => {
    const options = {
      hostname: url.hostname,
      port: url.port || defaultPort,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      rejectUnauthorized: false, // permite certificados autofirmados en LAN
      timeout: 5000,
    };

    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, url: url.href }));
    });

    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '', url: url.href }); });
    req.on('error', (e) => resolve({ status: e.code, body: e.message, url: url.href }));
    req.end();
  });
}

// ── 2. TEST 2N ACCESS COMMANDER ──────────────────────────────────────────────
async function test2N() {
  hdr('2N ACCESS COMMANDER');

  const rawBaseUrl = process.env.AC_BASE_URL;
  const token = process.env.AC_API_TOKEN;

  if (!rawBaseUrl || !token) {
    err('AC_BASE_URL o AC_API_TOKEN no definidas en .env');
    return;
  }

  // Normalizar host sin protocolo para probar ambos
  const hostOnly = rawBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Probar combinaciones de protocolo + puerto
  const basesToTry = [
    `https://${hostOnly}`,
    `http://${hostOnly}`,
    `https://${hostOnly}:8443`,
    `http://${hostOnly}:8080`,
  ];

  // Endpoints conocidos según versión de firmware 2N Access Commander
  const apiPaths = [
    { path: '/api/v2/system/info',   label: 'System Info v2' },
    { path: '/api/v1/system/info',   label: 'System Info v1' },
    { path: '/api/v2/system/status', label: 'System Status v2' },
    { path: '/api/v2/log/events',    label: 'Log Events v2' },
  ];

  let connected = false;

  for (const base of basesToTry) {
    console.log(`  🔎 Intentando: ${base}`);

    for (const { path, label } of apiPaths) {
      const { status, body } = await httpRequest(path, base, token);

      if (status === 200) {
        ok(`Conexión exitosa → ${base}${path}  [${label}]`);
        try {
          const data = JSON.parse(body);
          const info = data?.result ?? data;
          if (info.version) ok(`Versión firmware: ${info.version}`);
          if (info.model)   ok(`Modelo: ${info.model}`);
          if (info.name)    ok(`Nombre: ${info.name}`);
        } catch { /* respuesta no-JSON, igual es OK */ }
        connected = true;
        break;
      } else if (status === 401) {
        ok(`Servidor alcanzado en ${base}${path} — pero token inválido (401)`);
        err(`  → Verifica el valor de AC_API_TOKEN`);
        connected = true;
        break;
      } else if (status === 403) {
        ok(`Servidor alcanzado en ${base}${path} — pero sin permisos (403)`);
        err(`  → El token no tiene acceso a este endpoint`);
        connected = true;
        break;
      } else if (status === 'TIMEOUT' || status === 'ECONNREFUSED' || status === 'ENOTFOUND') {
        // Este base no funciona, probar el siguiente
        break;
      }
      // 404 → probar el siguiente path en el mismo base
    }

    if (connected) break;
  }

  if (!connected) {
    err(`No se pudo conectar a 192.168.1.135 en ningún protocolo/puerto`);
    err(`  → ¿Estás conectado a la misma red local?`);
    err(`  → Prueba abrir http://192.168.1.135 en el navegador`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 Diagnóstico de conectividad — TimeTrack Backend\n');
  await testSupabase();
  await test2N();
  console.log('\n');
}

main().catch(console.error);
