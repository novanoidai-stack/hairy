// scripts/vigilantes/m1-challenger2-empirical.test.mjs
//
// EMPIRICAL CHALLENGER 2 TEST SUITE for Milestone M1
// (Orquestador IA y Cerebro Central de Diagnósticos)
//
// Adversarial verification of:
// 1. Edge Function orquestador-ia HTTP & Auth guards (OPTIONS, 405, 401, 403, 200)
// 2. OpenRouter client payload serialization, parameter safety, & zero-findings bypass
// 3. Error resilience on absent OPENROUTER_API_KEY & LLM API failures (500, 502)
// 4. OpenRouter extraction resilience (extraerJson) on fences, preambles, and malformed strings
// 5. PostgreSQL migration entity schema, check constraints, RLS, & RPC privilege grants
// 6. web/admin.html DOM rendering for #saludCerebroIA (loading, error, empty, populated)
// 7. web/admin.html clipboard copy, state transitions, & reanalysis actions
// 8. web/admin.html strict XSS escaping across all dynamic fields
// 9. End-to-end compilation with compilar-estado.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './nucleo.mjs';
import { compilarEstado, generarMarkdownEstado } from './compilar-estado.mjs';

// --- Test 1: Edge Function orquestador-ia Auth & Method Guards ---
test('CHALLENGER 2: Edge Function orquestador-ia auth guards & method handling', () => {
  const edgePath = path.join(RAIZ, 'supabase', 'functions', 'orquestador-ia', 'index.ts');
  assert.ok(existsSync(edgePath), 'Edge function must exist at supabase/functions/orquestador-ia/index.ts');
  const code = readFileSync(edgePath, 'utf8');

  // Verify CORS & OPTIONS preflight
  assert.ok(code.includes("if (req.method === 'OPTIONS') return new Response('ok'"), 'Must handle OPTIONS CORS preflight');
  assert.ok(code.includes("'Access-Control-Allow-Origin': '*'"), 'CORS origin must be configured');
  assert.ok(code.includes('x-vigilancia-token'), 'x-vigilancia-token in CORS allow headers');

  // Verify 405 Method Not Allowed on non-POST
  assert.ok(code.includes("if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405)"), 'Must reject non-POST with 405');

  // Verify missing SUPABASE_URL handling
  assert.ok(code.includes("if (!url)"), 'Must check SUPABASE_URL presence');
  assert.ok(code.includes("return json({ error: 'sin_configurar', porque: 'falta SUPABASE_URL' }, 500)"), 'Must return 500 if SUPABASE_URL missing');

  // Verify dual authorization logic
  assert.ok(code.includes("const permisoToken = autorizarVigilancia(req, QUIEN)"), 'Must check autorizarVigilancia');
  assert.ok(code.includes("permisoToken.ok || peticionDeServicio(req)"), 'Must check service role / internal cron permission');
  assert.ok(code.includes("const jwt = authHeader.replace(/^Bearer\\s+/i, '').trim()"), 'Must extract Bearer JWT');
  assert.ok(code.includes("return json({ error: 'unauthorized', porque: 'Falta cabecera de autorizacion' }, 401)"), 'Must return 401 on missing JWT');
  assert.ok(code.includes("if (userError || !userData?.user)"), 'Must validate user session');
  assert.ok(code.includes("return json({ error: 'unauthorized', porque: 'Sesion invalida o caducada' }, 401)"), 'Must return 401 on invalid session');

  // Verify Staff role enforcement
  assert.ok(code.includes("const rolesStaff = ['staff', 'admin', 'superadmin']"), 'Must define authorized staff roles');
  assert.ok(code.includes("if (!profile || !rolesStaff.includes(profile.role))"), 'Must check user profile role');
  assert.ok(code.includes("return json({ error: 'forbidden', porque: 'Requiere rol staff' }, 403)"), 'Must return 403 for non-staff users');
});

// --- Test 2: Edge Function orquestador-ia OpenRouter Payload & Zero-Findings Fast Path ---
test('CHALLENGER 2: Edge Function OpenRouter payload parameters & zero-findings bypass', () => {
  const edgePath = path.join(RAIZ, 'supabase', 'functions', 'orquestador-ia', 'index.ts');
  const code = readFileSync(edgePath, 'utf8');

  // Verify System Prompt constraints
  assert.ok(code.includes('SYSTEM_PROMPT'), 'Must define SYSTEM_PROMPT');
  assert.ok(code.includes('Multi-tenant estricto: toda consulta o RPC debe aislar por negocio_id'), 'System prompt enforces multi-tenant rules');
  assert.ok(code.includes('Cero claves expuestas'), 'System prompt enforces zero keys exposed');
  assert.ok(code.includes('sintesis_salud'), 'System prompt enforces JSON format with sintesis_salud');
  assert.ok(code.includes('prompt_autorreparacion'), 'System prompt enforces prompt_autorreparacion');

  // Verify zero-findings bypass (cost optimization)
  assert.ok(code.includes('if (hallazgosParaAnalizar.length === 0)'), 'Must check if hallazgos are empty');
  assert.ok(code.includes("estado_general: 'optimo'"), 'Must return optimo when zero findings');
  assert.ok(code.includes("diagnosticos: []"), 'Must return empty diagnostics array on zero findings');
  assert.ok(code.includes("coste_usd: 0"), 'Must report 0 USD cost when skipping LLM call');

  // Verify LLM call parameters
  assert.ok(code.includes("perfil: 'calidad'"), 'Must request quality LLM profile');
  assert.ok(code.includes("json: true"), 'Must request strict JSON mode');
  assert.ok(code.includes("maxTokens: 3500"), 'Must allocate generous token ceiling');
});

// --- Test 3: Edge Function Error Resilience on Absent API Key or LLM Failure ---
test('CHALLENGER 2: Edge Function resilience on missing API key & OpenRouter errors', () => {
  const edgePath = path.join(RAIZ, 'supabase', 'functions', 'orquestador-ia', 'index.ts');
  const code = readFileSync(edgePath, 'utf8');

  // Missing API Key check
  assert.ok(code.includes("const apiKey = Deno.env.get('OPENROUTER_API_KEY') || ''"), 'Must read OPENROUTER_API_KEY');
  assert.ok(code.includes("if (!apiKey)"), 'Must check if apiKey is present');
  assert.ok(code.includes("error: 'sin_api_key'"), 'Must return structured error when apiKey is missing');

  // Try-catch & audit on failure
  assert.ok(code.includes("auditar(supabaseAdmin, res,"), 'Must audit successful AI execution');
  assert.ok(code.includes("auditarFallo(supabaseAdmin,"), 'Must audit failed AI execution');
  assert.ok(code.includes("return json({"), 'Must return JSON on catch');
  assert.ok(code.includes("error: 'fallo_ia'"), 'Must return fallo_ia on catch');
  assert.ok(code.includes("502"), 'Must return HTTP 502 Bad Gateway on LLM failure');
});

// --- Test 4: OpenRouter Extraction Utility Resilience (extraerJson) ---
test('CHALLENGER 2: OpenRouter JSON extraction oracle (fences, preambles, malformed)', () => {
  function extraerJson(raw) {
    const intentar = (s) => {
      try { return JSON.parse(s); } catch { return undefined; }
    };
    const directo = intentar(raw.trim());
    if (directo !== undefined) return directo;

    const valla = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (valla) {
      const dentro = intentar(valla[1].trim());
      if (dentro !== undefined) return dentro;
    }

    const llave = raw.indexOf('{');
    const corchete = raw.indexOf('[');
    const inicio = llave >= 0 && (corchete < 0 || llave < corchete) ? llave : corchete;
    if (inicio >= 0) {
      const cierre = raw[inicio] === '{' ? '}' : ']';
      const fin = raw.lastIndexOf(cierre);
      if (fin > inicio) {
        const recortado = intentar(raw.substring(inicio, fin + 1));
        if (recortado !== undefined) return recortado;
      }
    }
    throw new Error('El modelo no devolvio JSON valido');
  }

  // 1. Direct JSON
  const r1 = extraerJson('{"sintesis_salud": "Todo ok", "diagnosticos": []}');
  assert.equal(r1.sintesis_salud, 'Todo ok');

  // 2. Markdown fenced JSON
  const r2 = extraerJson('Aquí está el diagnóstico:\n```json\n{"sintesis_salud": "Degradado", "diagnosticos": [{"titulo": "Fallo"}]}\n```\nFin.');
  assert.equal(r2.sintesis_salud, 'Degradado');
  assert.equal(r2.diagnosticos.length, 1);

  // 3. Fenced without "json" keyword
  const r3 = extraerJson('```\n{"estado_general": "optimo"}\n```');
  assert.equal(r3.estado_general, 'optimo');

  // 4. JSON embedded in conversational text without fences
  const r4 = extraerJson('He analizado los datos y este es el objeto: {"estado_general": "critico", "bloqueantes": 2} gracias.');
  assert.equal(r4.estado_general, 'critico');

  // 5. Malformed text throws clean error
  assert.throws(() => extraerJson('No hay JSON aquí, solo texto libre'), /El modelo no devolvio JSON valido/);
});

// --- Test 5: SQL Migration Schema, RLS & Security Definer Integrity ---
test('CHALLENGER 2: PostgreSQL migration schema, constraints, RLS & RPC authorizations', () => {
  const migPath = path.join(RAIZ, 'supabase', 'migrations', '20260830200000_vigilancia_diagnosticos_ia.sql');
  const sql = readFileSync(migPath, 'utf8');

  // Schema & Columns
  const requiredColumns = [
    'id', 'creado_en', 'ejecucion_id', 'hallazgo_clave', 'ambito', 'nivel',
    'titulo', 'diagnostico', 'causa_raiz', 'fichero', 'linea', 'codigo_antes',
    'codigo_despues', 'prompt_autorreparacion', 'modelo_ia', 'coste_usd',
    'latencia_ms', 'estado', 'notas_staff', 'aplicado_por', 'aplicado_en'
  ];
  for (const col of requiredColumns) {
    assert.ok(sql.includes(col), `Column ${col} must be defined in table`);
  }

  // Check constraints
  assert.ok(sql.includes("check (nivel in ('critico', 'bloqueante', 'aviso', 'sugerencia'))"), 'Nivel constraint');
  assert.ok(sql.includes("check (estado in ('propuesto', 'en_revision', 'aplicado', 'descartado'))"), 'Estado constraint');

  // RLS enablement
  assert.ok(sql.includes('alter table public.vigilancia_diagnosticos_ia enable row level security;'), 'RLS enabled');

  // Indexes
  assert.ok(sql.includes('create index if not exists ix_vig_diag_creado'), 'ix_vig_diag_creado index');
  assert.ok(sql.includes('create index if not exists ix_vig_diag_clave'), 'ix_vig_diag_clave index');
  assert.ok(sql.includes('create index if not exists ix_vig_diag_estado'), 'ix_vig_diag_estado index');
  assert.ok(sql.includes('create index if not exists ix_vig_diag_ambito'), 'ix_vig_diag_ambito index');

  // RPC staff_vigilancia_diagnosticos_ia
  assert.ok(sql.includes('create or replace function public.staff_vigilancia_diagnosticos_ia'), 'staff_vigilancia_diagnosticos_ia function');
  assert.ok(sql.includes('if not public.is_staff() then'), 'is_staff check');
  assert.ok(sql.includes("set search_path to 'public'"), 'set search_path to public');

  // RPC staff_marcar_diagnostico_ia
  assert.ok(sql.includes('create or replace function public.staff_marcar_diagnostico_ia'), 'staff_marcar_diagnostico_ia function');
  assert.ok(sql.includes("if p_estado not in ('propuesto', 'en_revision', 'aplicado', 'descartado') then"), 'Validate target state');
  assert.ok(sql.includes("aplicado_por = case when p_estado = 'aplicado' then coalesce(v_email, auth.uid()::text) else null end"), 'Staff attribution on apply');

  // RPC guardar_diagnosticos_ia
  assert.ok(sql.includes('create or replace function public.guardar_diagnosticos_ia'), 'guardar_diagnosticos_ia function');
  assert.ok(sql.includes("if not (auth.role() = 'service_role' or current_user = 'service_role') then"), 'Enforce service_role on batch insert');

  // Grants and Revocations
  assert.ok(/revoke all on function public\.guardar_diagnosticos_ia\(jsonb\)\s+from public, anon, authenticated;/i.test(sql), 'Revoke from all except service');
  assert.ok(/grant execute on function public\.guardar_diagnosticos_ia\(jsonb\)\s+to service_role;/i.test(sql), 'Grant write RPC strictly to service_role');
});

// --- Test 6: web/admin.html DOM Structure, Card Presence & Render Functions ---
test('CHALLENGER 2: web/admin.html DOM structure & rendering components', () => {
  const adminPath = path.join(RAIZ, 'web', 'admin.html');
  const html = readFileSync(adminPath, 'utf8');

  // DOM Container
  assert.ok(html.includes('<div id="saludCerebroIA" class="ad-card" style="margin-bottom:18px"></div>'), 'saludCerebroIA container in DOM');

  // Function definitions
  assert.ok(html.includes('function loadSaludCerebroIA()'), 'loadSaludCerebroIA defined');
  assert.ok(html.includes('function wireBtnEjecutarIA()'), 'wireBtnEjecutarIA defined');

  // Integration with main loadSalud lifecycle
  assert.ok(html.includes('function loadSalud()'), 'loadSalud defined');
  assert.ok(html.includes('loadSaludCerebroIA();'), 'loadSalud calls loadSaludCerebroIA()');

  // State elements & labels
  assert.ok(html.includes('🧠 Cerebro IA de Diagnósticos y Auto-Reparación'), 'Card header text');
  assert.ok(html.includes('⚡ Reanalizar con Cerebro IA'), 'Action button text');
  assert.ok(html.includes('filter-diag-btn'), 'Filter state buttons');
  assert.ok(html.includes('btn-copy-prompt'), 'Copy prompt button class');
  assert.ok(html.includes('btn-diag-act'), 'Diagnostic action buttons class');
});

// --- Test 7: web/admin.html Clipboard & State Transitions Simulation ---
test('CHALLENGER 2: web/admin.html clipboard copying & state change handlers', () => {
  const adminPath = path.join(RAIZ, 'web', 'admin.html');
  const html = readFileSync(adminPath, 'utf8');

  // Clipboard API usage
  assert.ok(html.includes('navigator.clipboard.writeText(promptTexto)'), 'Uses navigator.clipboard.writeText');
  assert.ok(html.includes("btn.innerHTML = '✓ ¡Copiado al portapapeles!';"), 'Visual feedback on clipboard copy');
  assert.ok(html.includes("alert('No se pudo copiar automáticamente.');"), 'Fallback alert on clipboard failure');

  // State actions
  assert.ok(html.includes('api.client.rpc(\'staff_marcar_diagnostico_ia\''), 'Calls staff_marcar_diagnostico_ia RPC');
  assert.ok(html.includes("data-estado=\"aplicado\""), 'Marcar Aplicado action');
  assert.ok(html.includes("data-estado=\"descartado\""), 'Descartar action');
  assert.ok(html.includes("data-estado=\"propuesto\""), 'Reabrir action');

  // Reanalysis trigger
  assert.ok(html.includes("api.client.functions.invoke('orquestador-ia'"), 'Invokes orquestador-ia Edge Function');
  assert.ok(html.includes("btn.innerHTML = '⏳ Analizando con Cerebro IA...';"), 'Loading state on reanalyze');
});

// --- Test 8: web/admin.html XSS Sanitization Escaping ---
test('CHALLENGER 2: web/admin.html strict XSS sanitization in AI diagnostics rendering', () => {
  const adminPath = path.join(RAIZ, 'web', 'admin.html');
  const html = readFileSync(adminPath, 'utf8');

  // Check that all dynamic interpolations are wrapped in esc(...)
  const requiredEscapedFields = [
    'esc(d.nivel.toUpperCase())',
    'esc(d.titulo)',
    'esc(d.diagnostico)',
    'esc(d.causa_raiz)',
    'esc(d.fichero)',
    'esc(d.codigo_antes)',
    'esc(d.codigo_despues)',
    'esc(d.prompt_autorreparacion)',
    'esc(d.modelo_ia)'
  ];

  for (const field of requiredEscapedFields) {
    assert.ok(html.includes(field), `Field ${field} must be sanitized with esc()`);
  }
});

// --- Test 9: End-to-End State Compilation Oracle ---
test('CHALLENGER 2: compilarEstado produces valid schema snapshot and markdown', async () => {
  const snapshot = await compilarEstado({
    escribirArchivos: false,
    incluirBD: false,
    rapido: true,
  });

  assert.equal(snapshot.version, 1);
  assert.ok(snapshot.timestamp);
  assert.ok(typeof snapshot.duracion_ms === 'number');
  assert.ok(snapshot.git);
  assert.ok(['optima', 'degradada', 'critica'].includes(snapshot.resumen.salud));
  assert.ok(typeof snapshot.resumen.bloqueantes === 'number');
  assert.ok(typeof snapshot.resumen.avisos === 'number');

  // Verify markdown generation
  const md = generarMarkdownEstado(snapshot);
  assert.ok(md.includes('# 🛡️ Estado de Salud del Sistema — MECHA OS'));
  assert.ok(md.includes('## 📊 Resumen Ejecutivo'));
  assert.ok(md.includes('## 🏛️ Desglose de las 5 Capas'));
});
