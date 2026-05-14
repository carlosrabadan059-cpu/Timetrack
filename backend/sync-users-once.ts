// One-time script: creates missing users in 2N AC and links ac_external_id in Supabase.
// Bypasses n8n — calls 2N AC directly, then updates Supabase.
// Run: cd backend && npx tsx sync-users-once.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!
);

const AC_BASE = process.env['AC_BASE_URL']!;
const AC_TOKEN = process.env['AC_API_TOKEN']!;

async function acPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${AC_BASE}/api/v3${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AC_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _raw: text, _status: res.status };
  }
}

async function main() {
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, full_name, email, company_id, ac_external_id')
    .is('ac_external_id', null);

  if (error) {
    console.error('Error fetching profiles:', error.message);
    process.exit(1);
  }

  console.log(`Profiles without ac_external_id: ${profiles?.length ?? 0}\n`);

  if (!profiles || profiles.length === 0) {
    console.log('Nothing to sync.');
    return;
  }

  for (const profile of profiles) {
    console.log(`Syncing: ${profile.full_name} (${profile.email})`);

    const nameParts = (profile.full_name ?? '').trim().split(/\s+/);
    const firstName = nameParts[0] ?? profile.email?.split('@')[0] ?? 'Usuario';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const acBody = {
      ExternalId: profile.id,
      FirstName: firstName,
      LastName: lastName,
      Email: profile.email,
      Enabled: true,
    };

    const acRes = await acPost('/users', acBody);
    console.log('  2N AC response:', JSON.stringify(acRes).slice(0, 200));

    const acId = acRes['Id'] as string | undefined;

    if (!acId) {
      // User may already exist in 2N AC — try to find by ExternalId
      console.log('  No Id in response — trying to find by ExternalId...');
      const searchRes = await fetch(
        `${AC_BASE}/api/v3/users?filter=ExternalId:eq:${encodeURIComponent(profile.id)}`,
        { headers: { Authorization: `Bearer ${AC_TOKEN}`, Accept: 'application/json' } }
      );
      const searchData = await searchRes.json() as Record<string, unknown>;
      const items = (Array.isArray(searchData) ? searchData : (searchData['Result'] ?? searchData['items'] ?? [])) as Array<Record<string, unknown>>;
      const existing = items[0];
      if (existing?.['Id']) {
        const existingId = existing['Id'] as string;
        console.log(`  Found existing user in 2N AC: ${existingId}`);
        await sb.from('profiles').update({ ac_external_id: existingId, ac_synced_at: new Date().toISOString() }).eq('id', profile.id);
        console.log(`  Updated profiles.ac_external_id = ${existingId}`);
      } else {
        console.error('  Could not get ac_external_id — skipping');
      }
    } else {
      await sb.from('profiles').update({ ac_external_id: acId, ac_synced_at: new Date().toISOString() }).eq('id', profile.id);
      console.log(`  Created in 2N AC: ${acId} — profiles updated`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
