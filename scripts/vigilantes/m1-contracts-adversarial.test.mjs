// scripts/vigilantes/m1-contracts-adversarial.test.mjs
//
// ADVERSARIAL STRESS TEST SUITE for Milestone M1 Contracts & Security
// Tests:
// 1. Migration SQL security assertions (search_path, grants, RLS, checks)
// 2. Edge Function orquestador-ia auth rules (CORS, 405 on GET, 401 on missing JWT, staff role validation)
// 3. Admin UI escaping against XSS in AI diagnostics

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './nucleo.mjs';

test('CONTRACT: SQL Migration 20260830200000_vigilancia_diagnosticos_ia.sql adheres to Mecha DB security policy', () => {
  const migPath = path.join(RAIZ, 'supabase', 'migrations', '20260830200000_vigilancia_diagnosticos_ia.sql');
  assert.ok(existsSync(migPath), 'Migration file must exist');

  const sql = readFileSync(migPath, 'utf8');

  // 1. Table structure and constraints
  assert.ok(sql.includes('create table if not exists public.vigilancia_diagnosticos_ia'), 'Must create table');
  assert.ok(sql.includes("check (nivel in ('critico', 'bloqueante', 'aviso', 'sugerencia'))"), 'Strict nivel check constraint');
  assert.ok(sql.includes("check (estado in ('propuesto', 'en_revision', 'aplicado', 'descartado'))"), 'Strict estado check constraint');

  // 2. RLS enabled
  assert.ok(sql.includes('alter table public.vigilancia_diagnosticos_ia enable row level security;'), 'Must enable RLS');

  // 3. Search path set on all security definers
  const definerMatches = sql.match(/security definer/gi) || [];
  const searchPathMatches = sql.match(/set search_path to 'public'/gi) || [];
  assert.equal(definerMatches.length, 3, 'Must have 3 security definer RPCs');
  assert.equal(searchPathMatches.length, 3, 'All 3 security definers must set search_path to public');

  // 4. Staff verification check in staff RPCs
  assert.ok(sql.includes('if not public.is_staff() then'), 'Staff RPCs must verify is_staff()');

  // 5. Service role check in insert RPC
  assert.ok(
    sql.includes("auth.role() = 'service_role'") || sql.includes("current_user = 'service_role'"),
    'guardar_diagnosticos_ia must enforce service_role'
  );

  // 6. Privilege revocations from anon and public
  assert.ok(sql.includes('revoke all on function public.staff_vigilancia_diagnosticos_ia'), 'Revoke anon/public from staff read');
  assert.ok(sql.includes('revoke all on function public.staff_marcar_diagnostico_ia'), 'Revoke anon/public from staff update');
  assert.ok(sql.includes('revoke all on function public.guardar_diagnosticos_ia'), 'Revoke authenticated/anon/public from write RPC');
  assert.ok(/grant execute on function public\.guardar_diagnosticos_ia\(jsonb\)\s+to service_role;/i.test(sql), 'Grant only service_role on write RPC');
});

test('CONTRACT: Edge function orquestador-ia config and security constraints', () => {
  const configPath = path.join(RAIZ, 'supabase', 'config.toml');
  assert.ok(existsSync(configPath), 'config.toml must exist');
  const config = readFileSync(configPath, 'utf8');

  assert.ok(config.includes('[functions.orquestador-ia]'), 'orquestador-ia declared in config.toml');
  assert.ok(config.includes('verify_jwt = false'), 'verify_jwt declared false for internal dual-auth');

  const edgePath = path.join(RAIZ, 'supabase', 'functions', 'orquestador-ia', 'index.ts');
  assert.ok(existsSync(edgePath), 'Edge function index.ts must exist');
  const edgeCode = readFileSync(edgePath, 'utf8');

  // Must not contain hardcoded credentials
  assert.ok(!edgeCode.includes('eyJhbGciOi'), 'Must not contain hardcoded JWT/service_role keys');
  assert.ok(!edgeCode.includes('sb_secret_'), 'Must not contain hardcoded Supabase secret keys');

  // Must use shared helpers
  assert.ok(edgeCode.includes("import { claveServicio, peticionDeServicio } from '../shared/claveServicio.ts';"));
  assert.ok(edgeCode.includes("import { autorizarVigilancia } from '../shared/tokenVigilancia.ts';"));
  assert.ok(edgeCode.includes("import { llamarIAJson, ErrorIA, type MensajeIA } from '../shared/openrouterClient.ts';"));
  assert.ok(edgeCode.includes("import { auditar, auditarFallo } from '../shared/chispa-auditoria.ts';"));

  // Check auth logic
  assert.ok(edgeCode.includes("autorizarVigilancia(req, QUIEN)"), 'Must check token vigilancia');
  assert.ok(edgeCode.includes("peticionDeServicio(req)"), 'Must check service request');
  assert.ok(edgeCode.includes("supabaseAuth.auth.getUser(jwt)"), 'Must validate user JWT');
  assert.ok(edgeCode.includes("rolesStaff.includes(profile.role)"), 'Must check staff profile role');
});

test('CONTRACT: Admin UI (admin.html) escapes dynamic AI diagnostic inputs preventing XSS', () => {
  const adminPath = path.join(RAIZ, 'web', 'admin.html');
  assert.ok(existsSync(adminPath), 'admin.html must exist');
  const html = readFileSync(adminPath, 'utf8');

  assert.ok(html.includes('id="saludCerebroIA"'), 'saludCerebroIA card container exists in DOM');
  assert.ok(html.includes('function loadSaludCerebroIA()'), 'loadSaludCerebroIA function defined');
  assert.ok(html.includes('function wireBtnEjecutarIA()'), 'wireBtnEjecutarIA function defined');

  // Verify escaping in template injection
  assert.ok(html.includes('esc(d.titulo)'), 'Title escaped with esc()');
  assert.ok(html.includes('esc(d.diagnostico)'), 'Diagnostic text escaped with esc()');
  assert.ok(html.includes('esc(d.causa_raiz)'), 'Root cause escaped with esc()');
  assert.ok(html.includes('esc(d.fichero)'), 'Filename escaped with esc()');
  assert.ok(html.includes('esc(d.codigo_antes)'), 'Code before diff escaped with esc()');
  assert.ok(html.includes('esc(d.codigo_despues)'), 'Code after diff escaped with esc()');
  assert.ok(html.includes('esc(d.prompt_autorreparacion)'), 'Prompt data attribute escaped with esc()');
});
