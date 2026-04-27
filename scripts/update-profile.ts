import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://aujlzfmrtafbmmjybjxz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1amx6Zm1ydGFmYm1tanlianh6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI5NDU3NywiZXhwIjoyMDg3ODcwNTc3fQ.zS5vCJeXDTlfdafNYZ6ct4pbE6Bk7QNyOym79jTzL60'
);

async function updateProfile() {
  // Primero obtener el perfil actual para ver qué columnas existen
  const { data: current } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'alexandruiscru07@gmail.com')
    .single();

  console.log('Perfil actual:', current);

  // Ahora actualizar solo negocio_id (el campo que sabemos que existe)
  const { data, error } = await supabase
    .from('profiles')
    .update({
      negocio_id: 'prueba_46980'
    })
    .eq('email', 'alexandruiscru07@gmail.com');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Perfil actualizado:', data);
  }
}

updateProfile();
