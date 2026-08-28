import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';
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
