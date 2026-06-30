import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabaseUrl = envConfig.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc1NzI5NSwiZXhwIjoyMDkyMzMzMjk1fQ.5ejE9ktV7edy2jC4uaDbBvmj34_yPn8wscX6JGDSTZ4';

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
