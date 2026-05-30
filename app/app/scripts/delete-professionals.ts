import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://aujlzfmrtafbmmjybjxz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1amx6Zm1ydGFmYm1tanlianh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ1NzcsImV4cCI6MjA4Nzg3MDU3N30.P2KLATSZ6CNB74BsvZo-S5zFVk_Ok0fL_eZn3sTu_po'
);

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
