import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';


const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'carlitosocanamartinez@gmail.com',
    password: 'minicharlie2007',
  });

  if (error) {
    console.error('Error logging in:', error);
    return;
  }
  
  console.log('Logged in user:', data.user.id);
  
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, negocio_id')
    .eq('id', data.user.id)
    .single();
    
  if (profileError) {
    console.error('Error fetching profile:', profileError);
    return;
  }
  
  console.log('Profile:', profile);
  
  // Test if we can fetch profesionales
  const { data: profesionales } = await supabase
    .from('profesionales')
    .select('*')
    .eq('negocio_id', profile.negocio_id);
    
  console.log('Profesionales count:', profesionales?.length);
}

test();
