#!/usr/bin/env node
// Crea la cuenta demo dedicada para prospeccion comercial:
//   demomarketing@mecha.app / Demo2026!
// 1) Aplica migrations/demo-marketing-account.sql via Management API
//    (rol privilegiado: alta de auth.user + identidad + perfil owner/pro
//    en demo_salon_001, con mecha.identity_ctx para el trigger de identidad).
// 2) Verifica login y perfil final con la clave anon.
// Uso: SB_TOKEN=sbp_... node scripts/crear-demo-marketing.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const REF = 'vtrggiogjrhqtwbhbgia';
const SB_TOKEN = process.env.SB_TOKEN;
if (!SUPABASE_URL || !ANON || !SB_TOKEN) {
  console.error('Faltan credenciales (.env + SB_TOKEN en entorno)');
  process.exit(1);
}

const EMAIL = 'demomarketing@mecha.app';
const PASSWORD = 'Demo2026!';

// 1) Aplicar la migracion via Management API
const sql = readFileSync(new URL('../migrations/demo-marketing-account.sql', import.meta.url), 'utf8');
console.log('Aplicando migrations/demo-marketing-account.sql...');
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SB_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});
const bodyText = await res.text();
if (!res.ok) {
  console.error(`✗ Management API HTTP ${res.status}:`, bodyText.slice(0, 500));
  process.exit(1);
}
console.log('✓ Migracion aplicada:', bodyText.slice(0, 200));

// 2) Verificar con clave anon: login + perfil final
const pub = createClient(SUPABASE_URL, ANON);
const { data: auth, error: authErr } =
  await pub.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error('✗ Login falló:', authErr.message); process.exit(1); }
console.log('✓ Login OK (user:', auth.user.id + ')');

const { data: prof, error: profErr } = await pub
  .from('profiles')
  .select('email, negocio_id, role, plan')
  .eq('id', auth.user.id)
  .single();
if (profErr) { console.error('✗ Perfil:', profErr.message); process.exit(1); }
console.log('✓ Perfil final:', JSON.stringify(prof));
if (prof.negocio_id !== 'demo_salon_001' || prof.role !== 'owner' || prof.plan === 'free') {
  console.error('✗ Perfil inesperado, revisar a mano');
  process.exit(1);
}

// 3) Smoke RLS: leer citas del salon demo con la nueva sesion
const { data: citas, error: citasErr } = await pub
  .from('citas')
  .select('id')
  .limit(3);
if (citasErr) { console.error('✗ Lectura citas:', citasErr.message); process.exit(1); }
console.log(`✓ RLS OK: ${citas.length} citas visibles del salon demo`);

console.log('\nListo: demomarketing@mecha.app / Demo2026!');
await pub.auth.signOut();
