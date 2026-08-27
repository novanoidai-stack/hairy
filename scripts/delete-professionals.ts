import { createClient } from '@supabase/supabase-js';

// Proyecto secundario de pruebas: configurar por entorno, nunca hardcodeado.
//   SUPABASE_AUX_URL / SUPABASE_AUX_ANON_KEY
const supabaseUrl = process.env.SUPABASE_AUX_URL ?? '';
const supabaseAnonKey = process.env.SUPABASE_AUX_ANON_KEY ?? '';
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Faltan SUPABASE_AUX_URL y SUPABASE_AUX_ANON_KEY en el entorno. Este script apunta al proyecto auxiliar de pruebas.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function deleteProfesionals() {
  try {
    // Get the user's negocio_id
    const { data: user } = await supabase
      .from('usuarios')
      .select('negocio_id')
      .eq('email', 'alexandruiscru07@gmail.com')
      .single();

    if (!user?.negocio_id) {
      console.error('Usuario o negocio_id no encontrado');
      return;
    }

    // Delete all profesionales
    const { data, error, count } = await supabase
      .from('profesionales')
      .delete()
      .eq('negocio_id', user.negocio_id);

    if (error) {
      console.error('Error:', error);
    } else {
      console.log(`✅ ${count} profesionales eliminados`);
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

deleteProfesionals();
