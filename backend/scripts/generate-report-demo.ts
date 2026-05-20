import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '../src/lib/supabase.js';

async function main() {
  const sb = getSupabaseAdmin();

  console.log('--- GENERADOR DE REPORTE CSV VÍA API REST EXTERNA ---');

  // 1. Buscar a Carlos Rabadan por correo en profiles para obtener su código legible de empleado
  const emailToFind = 'carlosrabadan059@gmail.com';
  const { data: profile, error: profError } = await sb
    .from('profiles')
    .select('id, full_name, email, employee_code')
    .ilike('email', emailToFind)
    .maybeSingle();

  if (profError) {
    console.error('Error al consultar perfil en la base de datos:', profError);
    process.exit(1);
  }

  if (!profile) {
    console.error(`No se encontró el perfil de Carlos Rabadan con el correo: ${emailToFind}`);
    process.exit(1);
  }

  console.log(`Usuario encontrado: ${profile.full_name}`);
  console.log(`Código de Empleado: ${profile.employee_code}`);
  console.log(`UUID en Supabase:   ${profile.id}`);

  // Usamos la API Key de prueba que creamos previamente para RabadanHouse
  const apiKey = 'tt_live_852a6cc548c9c2b9fb2dd23ce521e318';
  const startDate = '2026-05-01T00:00:00.000Z';
  const endDate = '2026-05-31T23:59:59.999Z';

  // 2. Consumir la API REST Externa que construimos
  const url = `http://localhost:3000/api/external/v1/fichajes?employee_code=${profile.employee_code}&start_date=${startDate}&end_date=${endDate}&limit=100`;
  console.log(`\nConsultando API REST Externa:\nGET ${url}`);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`Error HTTP ${res.status}:`, err);
      process.exit(1);
    }

    const payload = await res.json() as { data: any[], meta: any };
    const logs = payload.data ?? [];
    console.log(`Total de fichajes encontrados en mayo 2026: ${logs.length}`);

    // 3. Formatear y construir el CSV
    let csvContent = 'ID Fichaje,Empleado,Codigo Empleado,Direccion,Tipo,Fecha (UTC),Hora (UTC),Origen,Detalle Dispositivo\n';

    if (logs.length === 0) {
      csvContent += ',,,NO SE REGISTRARON FICHAJES EN EL PERIODO SOLICITADO,,,,,';
    } else {
      for (const log of logs) {
        const d = new Date(log.timestamp);
        const fecha = d.toISOString().split('T')[0];
        const hora = d.toISOString().split('T')[1].substring(0, 8);
        
        // Escapar comas en nombres
        const empName = `"${log.user.full_name}"`;
        const devInfo = log.device_info ? `"${log.device_info}"` : '';

        csvContent += `${log.id},${empName},${log.user.employee_code},${log.direction.toUpperCase()},${log.detail_type.toUpperCase()},${fecha},${hora},${log.source_human},${devInfo}\n`;
      }
    }

    // 4. Guardar archivo en la raíz del workspace
    const destPath = path.resolve('/Users/carlosrabadan/test/fichajes_carlos_rabadan_mayo.csv');
    fs.writeFileSync(destPath, csvContent, 'utf-8');

    console.log('\n--------------------------------------------------');
    console.log('¡Reporte CSV generado exitosamente!');
    console.log(`Ruta del archivo: ${destPath}`);
    console.log('--------------------------------------------------\n');

  } catch (err) {
    console.error('Error al conectarse a la API REST:', err);
  }
}

main().catch(err => {
  console.error('Error inesperado:', err);
});
