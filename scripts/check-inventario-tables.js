/**
 * Script para verificar si las tablas de inventario existen en Supabase
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTables() {
  console.log('🔍 Verificando tablas de inventario en Supabase...\n');

  const tables = ['productos', 'inventario', 'movimientos_inventario'];

  for (const table of tables) {
    try {
      // Intentar hacer una consulta simple a la tabla
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        if (error.code === '42P01') {
          console.log(`❌ ${table}: NO EXISTE`);
        } else {
          console.log(`⚠️  ${table}: Error (${error.code}) - ${error.message}`);
        }
      } else {
        console.log(`✅ ${table}: EXISTE`);
      }
    } catch (err) {
      console.log(`❌ ${table}: Error al verificar - ${err.message}`);
    }
  }

  console.log('\n---');
  console.log('Si las tablas no existen, aplica las migraciones desde:');
  console.log('1. migrations/inventario-v0.sql');
  console.log('2. migrations/inventario-rpcs.sql');
  console.log('\nUsa el Dashboard de Supabase → SQL Editor para ejecutar el SQL');
}

checkTables().catch(console.error);
