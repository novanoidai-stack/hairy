#!/usr/bin/env node
// Check what's already applied in Supabase
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

// Get DB password from env or prompt
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD in .env');
  process.exit(1);
}

const client = new Client({
  connectionString: 'postgresql://postgres.vtrggiogjrhqtwbhbgia:[SUPABASE_DB_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require'.replace('[SUPABASE_DB_PASSWORD]', password),
});

async function checkState() {
  try {
    await client.connect();
    console.log('✓ Connected to Supabase PostgreSQL\n');

    // Check categorias_servicio table
    const { rows: tables } = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('categorias_servicio', 'servicios')
      ORDER BY table_name, ordinal_position
    `);

    console.log('Current schema state:');
    console.log('=======================');
    let currentTable = '';
    for (const row of tables) {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n${currentTable}:`);
      }
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    }

    // Check if categoria_id FK exists on servicios
    const { rows: constraints } = await client.query(`
      SELECT
        conname AS constraint_name,
        conrelid::regclass AS table_name,
        pg_get_constraintdef(c.oid) AS constraint_def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid::regclass::text IN ('categorias_servicio', 'servicios')
      ORDER BY conrelid::regclass::text, conname;
    `);

    if (constraints.length > 0) {
      console.log('\nConstraints:');
      for (const c of constraints) {
        console.log(`  - ${c.constraint_name}: ${c.constraint_def}`);
      }
    }

    // Check RPCs
    const { rows: rpcs } = await client.query(`
      SELECT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      AND p.proname IN ('portal_info', 'cita_publica')
    `);

    if (rpcs.length > 0) {
      console.log('\nRPCs found (portal_info, cita_publica exist)');
    }

    console.log('\n✓ Check complete');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkState();
