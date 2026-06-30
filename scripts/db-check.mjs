import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabaseUrl = envConfig.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('Connecting to Supabase URL:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data: tables, error } = await supabase.rpc('execute_sql', {
    query: "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
  });

  if (error) {
    console.error('Error executing query:', error.message);
    // If execute_sql RPC doesn't exist, we can try to query a table directly
    console.log('Checking tables individually...');
    
    const checkTable = async (name) => {
      const { error: tblErr } = await supabase.from(name).select('*').limit(1);
      if (tblErr) {
        console.log(`Table ${name}: ERROR (${tblErr.message})`);
      } else {
        console.log(`Table ${name}: EXISTS`);
      }
    };

    await checkTable('citas');
    await checkTable('clientes');
    await checkTable('cobros');
    await checkTable('fichajes');
    await checkTable('consentimientos_cliente');
    await checkTable('rate_limit_reset');
  } else {
    console.log('Tables found in database:');
    console.log(tables);
  }
}

check();
