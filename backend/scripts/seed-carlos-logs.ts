import 'dotenv/config';
import { getSupabaseAdmin } from '../src/lib/supabase.js';

async function main() {
  const sb = getSupabaseAdmin();
  const userId = '0fa2a39b-231c-48ca-9cf6-532e8d32318c'; // Carlos Rabadan Sainz

  console.log('--- SEMBRANDO FICHAJES DE EJEMPLO PARA CARLOS RABADAN (MAYO 2026) ---');

  const testLogs = [
    {
      user_id: userId,
      direction: 'in',
      detail_type: 'normal',
      timestamp: '2026-05-18T07:05:00.000Z', // 09:05 local aprox
      source: 'web',
      device_info: 'Web App (Chrome / macOS)'
    },
    {
      user_id: userId,
      direction: 'out',
      detail_type: 'normal',
      timestamp: '2026-05-18T16:15:00.000Z', // 18:15 local aprox
      source: 'web',
      device_info: 'Web App (Chrome / macOS)'
    },
    {
      user_id: userId,
      direction: 'in',
      detail_type: 'normal',
      timestamp: '2026-05-19T06:58:00.000Z', // 08:58 local aprox
      source: 'web',
      device_info: 'Web App (Firefox / macOS)'
    },
    {
      user_id: userId,
      direction: 'out',
      detail_type: 'normal',
      timestamp: '2026-05-19T15:59:00.000Z', // 17:59 local aprox
      source: 'web',
      device_info: 'Web App (Firefox / macOS)'
    }
  ];

  const { data, error } = await sb
    .from('access_logs')
    .insert(testLogs)
    .select('id, direction, timestamp');

  if (error) {
    console.error('Error al sembrar fichajes:', error);
    process.exit(1);
  }

  console.log(`¡Sembrados con éxito ${data.length} fichajes para Carlos Rabadan en mayo de 2026!`);
}

main().catch(err => {
  console.error('Error inesperado:', err);
});
