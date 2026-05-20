import 'dotenv/config';
import { getSupabaseAdmin } from '../src/lib/supabase.js';

async function main() {
  const sb = getSupabaseAdmin();
  const userId = '0fa2a39b-231c-48ca-9cf6-532e8d32318c'; // Carlos Rabadan Sainz
  const companyId = '00243ff0-fb91-4ada-a8fe-cab5b9a88d4c'; // RabadanHouse

  console.log('--- ACTUALIZANDO EMPRESA DE CARLOS RABADAN ---');

  const { data, error } = await sb
    .from('profiles')
    .update({ company_id: companyId })
    .eq('id', userId)
    .select('id, full_name, company_id');

  if (error) {
    console.error('Error al actualizar el perfil:', error);
    process.exit(1);
  }

  console.log('¡Perfil actualizado con éxito!');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(err => {
  console.error(err);
});
