import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://aujlzfmrtafbmmjybjxz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1amx6Zm1ydGFmYm1tanlianh6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI5NDU3NywiZXhwIjoyMDg3ODcwNTc3fQ.zS5vCJeXDTlfdafNYZ6ct4pbE6Bk7QNyOym79jTzL60'
);

const sql = `
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS apellido text,
ADD COLUMN IF NOT EXISTS nombre_negocio text,
ADD COLUMN IF NOT EXISTS codigo_postal text;
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  console.log('✓ Migración ejecutada correctamente');
} catch (e) {
  console.error('Excepción:', e.message);
  process.exit(1);
}
