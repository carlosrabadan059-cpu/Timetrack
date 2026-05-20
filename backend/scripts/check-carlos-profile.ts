import 'dotenv/config';
import { getSupabaseAdmin } from '../src/lib/supabase.js';

async function main() {
  const sb = getSupabaseAdmin();
  const userId = '0fa2a39b-231c-48ca-9cf6-532e8d32318c'; // Carlos Rabadan Sainz

  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  console.log('--- PERFIL DE CARLOS RABADAN ---');
  console.log(JSON.stringify(profile, null, 2));

  const { data: companies } = await sb
    .from('companies')
    .select('*');

  console.log('\n--- EMPRESAS ---');
  console.log(JSON.stringify(companies, null, 2));
}

main().catch(err => {
  console.error(err);
});
