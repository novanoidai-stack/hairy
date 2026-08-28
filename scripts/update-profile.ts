import { createClient } from '@supabase/supabase-js';

// OJO: este script es del proyecto de novanoidai.com, NO del de Mecha. Variable
// distinta a proposito para no apuntar la clave de un proyecto al otro.
//
// La service_role se salta TODAS las RLS: es la llave maestra del proyecto, no
// una credencial mas. Nunca se escribe en el codigo -- vive en .env, que esta
// en .gitignore. Ver .env.example.
process.loadEnvFile?.();
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY_NOVANOIDAI;
if (!claveServicio) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY_NOVANOIDAI. Ponla en .env (ver .env.example).');
  process.exit(1);
}

const supabase = createClient(
  'https://aujlzfmrtafbmmjybjxz.supabase.co',
  claveServicio,
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
