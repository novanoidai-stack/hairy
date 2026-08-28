import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabaseUrl = envConfig.EXPO_PUBLIC_SUPABASE_URL;

// La service_role se salta TODAS las RLS: es la llave maestra del proyecto, no
// una credencial mas. Nunca se escribe en el codigo -- vive en .env, que esta
// en .gitignore. Ver .env.example.
const supabaseServiceKey =
  envConfig.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY. Ponla en .env (ver .env.example).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testColumn(colName) {
  const { error } = await supabase.from('consentimientos_cliente').select(colName).limit(1);
  if (error && error.message.includes('does not exist')) {
    console.log(`Column ${colName}: DOES NOT EXIST`);
  } else if (error) {
    console.log(`Column ${colName}: EXISTS (returned error: ${error.message})`);
  } else {
    console.log(`Column ${colName}: EXISTS`);
  }
}

async function run() {
  const cols = [
    'id', 'negocio_id', 'cliente_id', 'tipo', 'aceptado', 
    'revocado', 'metodo_obtencion', 'fecha', 'firma_svg', 
    'ip_registro', 'user_agent', 'created_at'
  ];
  for (const col of cols) {
    await testColumn(col);
  }
}

run();
