import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';

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
