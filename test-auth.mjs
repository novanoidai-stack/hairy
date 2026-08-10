import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';


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
