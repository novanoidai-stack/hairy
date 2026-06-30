import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabaseUrl = envConfig.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc1NzI5NSwiZXhwIjoyMDkyMzMzMjk1fQ.5ejE9ktV7edy2jC4uaDbBvmj34_yPn8wscX6JGDSTZ4';

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
