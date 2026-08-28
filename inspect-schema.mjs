import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  await supabase.auth.signInWithPassword({
    email: 'carlitosocanamartinez@gmail.com',
    password: 'minicharlie2007',
  });
  
  const negocioId = 'nose_03801';
  
  const { data: profs } = await supabase.from('profesionales').select('*').eq('negocio_id', negocioId).limit(2);
  console.log('Profesional columns:', profs);
  
  const { data: negocio } = await supabase.from('negocios').select('*').eq('id', negocioId).limit(1);
  console.log('Negocio:', negocio);
  
  // query information_schema if possible (might need postgres role, but sometimes allowed)
  // Or we can just use the PostgREST introspection!
  const res = await fetch(`${supabaseUrl}/rest/v1/`, { headers: { apikey: supabaseKey } });
  const openapi = await res.json();
  console.log('Tables:', Object.keys(openapi.definitions || {}));
}
test();
