import 'dotenv/config';
import crypto from 'crypto';
import { getSupabaseAdmin } from '../src/lib/supabase.js';

async function main() {
  const sb = getSupabaseAdmin();

  console.log('--- GENERADOR DE API KEY DE PRUEBAS ---');

  // 1. Obtener una empresa de prueba de la BD
  const { data: companies, error: compError } = await sb
    .from('companies')
    .select('id, name')
    .limit(1);

  if (compError) {
    console.error('Error al obtener empresas:', compError);
    process.exit(1);
  }

  if (!companies || companies.length === 0) {
    console.error('No se encontraron empresas en la base de datos. Por favor, crea una empresa antes de correr el script.');
    process.exit(1);
  }

  const targetCompany = companies[0];
  console.log(`Empresa objetivo seleccionada: ${targetCompany.name} (ID: ${targetCompany.id})`);

  // 2. Obtener un administrador o usuario de esa empresa para asociarle la creación (opcional)
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', targetCompany.id)
    .limit(1);

  const creatorId = profiles && profiles.length > 0 ? profiles[0].id : null;
  if (creatorId) {
    console.log(`Creador asignado: ${profiles[0].full_name} (ID: ${creatorId})`);
  } else {
    console.log('No se encontraron perfiles de usuario para esta empresa. Se creará sin creador asignado.');
  }

  // 3. Generar la API Key
  const randomHex = crypto.randomBytes(16).toString('hex');
  const apiKey = `tt_live_${randomHex}`;
  const keyPrefix = apiKey.substring(0, 16);
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // 4. Insertar en la BD
  const { data, error: insertError } = await sb
    .from('api_keys')
    .insert({
      company_id: targetCompany.id,
      name: 'API Key de Prueba M2M (Script)',
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: ['fichajes:read'],
      is_active: true,
      created_by: creatorId,
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('Error al insertar la API Key en la BD:', insertError);
    process.exit(1);
  }

  console.log('\n¡API Key creada exitosamente!');
  console.log('--------------------------------------------------');
  console.log(`ID en DB:     ${data.id}`);
  console.log(`Nombre:       ${data.name}`);
  console.log(`Prefijo:      ${data.key_prefix}`);
  console.log(`Scopes:       ${JSON.stringify(data.scopes)}`);
  console.log(`Activa:       ${data.is_active}`);
  console.log(`Empresa ID:   ${data.company_id}`);
  console.log('--------------------------------------------------');
  console.log('>>> TU API KEY (GUARDA ESTE VALOR, NO SE MOSTRARÁ DE NUEVO):');
  console.log(`\x1b[36m${apiKey}\x1b[0m`);
  console.log('--------------------------------------------------\n');

  console.log('Para probarla con curl, puedes ejecutar:');
  console.log(`curl -i -H "Authorization: Bearer ${apiKey}" http://localhost:3000/api/external/v1/fichajes`);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
});
