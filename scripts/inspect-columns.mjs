import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabaseUrl = envConfig.EXPO_PUBLIC_SUPABASE_URL;

// La service_role se salta TODAS las RLS: es la llave maestra del proyecto, no
// una credencial mas. Nunca se escribe en el codigo -- vive en .env, que esta
// en .gitignore. Ver .env.example.
// Se prefiere la secret key nueva (`sb_secret_...`): la heredada
// SUPABASE_SERVICE_ROLE_KEY esta DESACTIVADA desde el 29 ago 2026 y devuelve 401.
const supabaseServiceKey =
  envConfig.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  envConfig.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('Falta SUPABASE_SECRET_KEY. Ponla en .env (ver .env.example).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect(tableName) {
  console.log(`\n--- Inspecting columns of table: ${tableName} ---`);
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  if (error) {
    console.error(`Error querying ${tableName}:`, error.message);
  } else if (data && data.length > 0) {
    console.log(Object.keys(data[0]));
  } else {
    // If no rows, we can still check the column keys if we try to insert a dummy row or fetch schema.
    // Let's print that it exists but is empty.
    console.log('Table exists but is empty. Trying to find columns by other means...');
    // We can do a mock insert with empty object to see what columns error out or we can just fetch from api.
    console.log('No rows present.');
  }
}

async function run() {
  await inspect('citas');
  await inspect('clientes');
  await inspect('cobros');
  await inspect('fichajes');
  await inspect('consentimientos_cliente');
}

run();
