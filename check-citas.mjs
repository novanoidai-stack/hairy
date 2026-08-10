import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'carlitosocanamartinez@gmail.com',
    password: 'minicharlie2007',
  });
  const negocioId = 'nose_03801';

  // Get total count
  const { count } = await supabase.from('citas').select('*', { count: 'exact', head: true }).eq('negocio_id', negocioId);
  console.log(`Total citas for negocio: ${count}`);

  // Fetch some citas to see their dates
  const { data: citas } = await supabase.from('citas')
    .select('id, inicio, fin, estado')
    .eq('negocio_id', negocioId)
    .order('inicio', { ascending: true })
    .limit(10);
  
  console.log('First 10 citas:', citas);
  
  const { data: lastCitas } = await supabase.from('citas')
    .select('id, inicio, fin, estado')
    .eq('negocio_id', negocioId)
    .order('inicio', { ascending: false })
    .limit(10);
    
  console.log('Last 10 citas:', lastCitas);
}

run();
