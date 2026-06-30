#!/usr/bin/env node
// Apply categorias-servicio.sql migration to Supabase PostgreSQL
import pg from 'pg';
import { readFileSync } from 'fs';
import 'dotenv/config';

const { Client } = pg;
const sql = readFileSync('./migrations/categorias-servicio.sql', 'utf-8');

// Parse connection URL and add sslmode=require
let dbUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (dbUrl && !dbUrl.includes('postgresql://')) {
  // Convert https://project.supabase.co to postgresql://...
  dbUrl = dbUrl.replace('https://', 'postgresql://postgres.:');
}
if (dbUrl && !dbUrl.includes('?sslmode')) {
  dbUrl += '?sslmode=require';
}

// Need the password - extract from anon key or use env
// For Supabase, the password is available in the dashboard
// We'll need to prompt for it or use a service_role_key

const client = new Client({
  connectionString: dbUrl,
  // For Supabase, we need the database password
  // This should be set in SUPABASE_DB_PASSWORD env var
  password: process.env.SUPABASE_DB_PASSWORD,
});

if (!process.env.SUPABASE_DB_PASSWORD) {
  console.error('Missing SUPABASE_DB_PASSWORD in .env');
  console.error('Get it from: https://supabase.com/dashboard/project/vtrggiogjrhqtwbhbgia/settings/database');
  process.exit(1);
}

async function applyMigration() {
  try {
    await client.connect();
    console.log('✓ Connected to Supabase PostgreSQL');

    console.log('Applying categorias-servicio.sql...');

    // Execute the entire SQL file
    await client.query(sql);
    console.log('✓ Migration applied successfully!');

    // Verify the table was created
    const { rows } = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'categorias_servicio'
    `);
    console.log(`✓ Verified: categorias_servicio table exists (${rows[0].count} table)`);

  } catch (error) {
    console.error('Error applying migration:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration().catch(console.error);
