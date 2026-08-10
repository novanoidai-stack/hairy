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
  
  const { data: profs } = await supabase.from('profesionales').select('*').eq('negocio_id', negocioId);
  console.log('Profesionales:', profs);
  
  const { data: servs } = await supabase.from('servicios').select('*').eq('negocio_id', negocioId);
  console.log('Servicios:', servs);
  
  const { data: clientes, count } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('negocio_id', negocioId);
  console.log('Clientes count:', count);
  
  // Try checking if horarios table exists
  const { data: horarios, error } = await supabase.from('horarios').select('*').eq('negocio_id', negocioId).limit(2);
  console.log('Horarios:', horarios, error?.message);
}

test();
