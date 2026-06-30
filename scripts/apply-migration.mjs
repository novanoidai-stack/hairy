#!/usr/bin/env node
// Apply categorias-servicio.sql migration to remote Supabase
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { URL } from 'node:url';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = readFileSync('./migrations/categorias-servicio.sql', 'utf-8');

console.log('Applying categorias-servicio.sql migration...');

// Split by semicolon and execute each statement
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

for (const stmt of statements) {
  if (stmt.includes('select') || stmt.includes('SELECT')) {
    console.log('Skipping SELECT:', stmt.substring(0, 50) + '...');
    continue;
  }
  console.log('Executing:', stmt.substring(0, 60) + '...');
  const { error } = await supabase.rpc('exec_sql', { sql: stmt });
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✓ OK');
  }
}

console.log('Migration applied!');
