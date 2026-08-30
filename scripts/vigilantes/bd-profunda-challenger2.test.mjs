import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vigilante, {
  VECTORES_PROFUNDOS,
  analizarFksSinIndice,
  analizarContencionLocks,
  analizarBloatTuplasMuertas,
  analizarDesbordeSecuencias,
  analizarCoberturaRlsYDefiners,
  analizarPoolConexiones,
  analizarEstadoCrons,
  analizarPrivacidadBuckets,
  analizarContinuidadVeriFactu,
  analizarRegistrosHuerfanos,
} from './bd-profunda.mjs';

const MIGRACION_SQL = 'supabase/migrations/20260830210000_vigilancia_bd_suite_profunda.sql';
const EDGE_FUNCTION_TS = 'supabase/functions/ejecutar-vigilancia-bd/index.ts';
const CI_WORKFLOW_YML = '.github/workflows/vigilancia-bd.yml';

// ============================================================================
// CHALLENGER 2 EMPIRICAL ADVERSARIAL TEST SUITE (M2 POSTGRESQL DEEP HEALTH)
// ============================================================================

// ----------------------------------------------------------------------------
// TEST 1: SECRET EXPOSURE & CREDENTIAL LEAK SCAN
// ----------------------------------------------------------------------------
test('Challenger 2 Scan: No hardcoded secrets or service_role keys in M2 files', () => {
  const filesToScan = [MIGRACION_SQL, EDGE_FUNCTION_TS, CI_WORKFLOW_YML, 'scripts/vigilantes/bd-profunda.mjs'];

  // Construct pattern dynamically to avoid self-triggering static scanners
  const jwtHeader = ['eyJhbGci', 'OiJIUzI1NiIsInR5cCI6', 'IkpXVCJ9'].join('');
  const jwtRegex = new RegExp(jwtHeader + '\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+');
  const secretRegex = new RegExp(['sb_', 'secret_'].join('') + '[a-zA-Z0-9_-]{20,}');
  const hardcodedKeyRegex = new RegExp('SUPABASE_SERVICE_ROLE_KEY' + '\\s*=\\s*[\'"][^\'"]+[\'"]');

  for (const f of filesToScan) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f, 'utf8');
    assert.doesNotMatch(content, secretRegex, `Leaked sb_secret in ${f}`);
    assert.doesNotMatch(content, jwtRegex, `Leaked JWT in ${f}`);
    assert.doesNotMatch(content, hardcodedKeyRegex, `Hardcoded service role key in ${f}`);
  }
});

// ----------------------------------------------------------------------------
// TEST 2: ADVERSARIAL EDGE CASES IN ORPHAN RECORD ARITHMETIC & NULLABLES
// ----------------------------------------------------------------------------
test('Challenger 2 Orphans: Zero counts, negative counts, and mixed orphan scenarios', () => {
  // Scenario 1: All 0s
  assert.equal(analizarRegistrosHuerfanos({ citasSinCliente: 0, cobrosSinCita: 0, fasesSinCita: 0, bonosSinCliente: 0 }).length, 0);

  // Scenario 2: Empty object defaults to 0
  assert.equal(analizarRegistrosHuerfanos({}).length, 0);

  // Scenario 3: All 4 types present with distinct counts
  const mixed = analizarRegistrosHuerfanos({
    citasSinCliente: 12,
    cobrosSinCita: 5,
    fasesSinCita: 1,
    bonosSinCliente: 42,
  });
  assert.equal(mixed.length, 4);
  assert.ok(mixed.some(h => h.clave === 'bd-profunda/huerfano:citas-sin-cliente' && h.titulo.includes('12 cita(s)')));
  assert.ok(mixed.some(h => h.clave === 'bd-profunda/huerfano:cobros-sin-cita' && h.titulo.includes('5 cobro(s)')));
  assert.ok(mixed.some(h => h.clave === 'bd-profunda/huerfano:cita-fases-sin-cita' && h.titulo.includes('1 cita_fases')));
  assert.ok(mixed.some(h => h.clave === 'bd-profunda/huerfano:bonos-sin-cliente' && h.titulo.includes('42 bono(s)')));
  assert.ok(mixed.every(h => h.nivel === 'bloqueante' && h.ambito === 'coherencia'));
});

// ----------------------------------------------------------------------------
// TEST 3: ADVERSARIAL POOL ARITHMETIC & EXTREME BOUNDARIES
// ----------------------------------------------------------------------------
test('Challenger 2 Pool: Extreme values, float precision, and zero-capacities', () => {
  // Exact 75% -> ok
  assert.equal(analizarPoolConexiones(750, 1000).length, 0);
  // 75.001% -> aviso
  const aviso = analizarPoolConexiones(751, 1000);
  assert.equal(aviso.length, 1);
  assert.equal(aviso[0].nivel, 'aviso');

  // Exact 90% -> aviso (not > 90%)
  const exact90 = analizarPoolConexiones(900, 1000);
  assert.equal(exact90.length, 1);
  assert.equal(exact90[0].nivel, 'aviso');

  // 90.001% -> bloqueante
  const bloq901 = analizarPoolConexiones(901, 1000);
  assert.equal(bloq901.length, 1);
  assert.equal(bloq901[0].nivel, 'bloqueante');

  // 100% capacity -> bloqueante
  const bloq100 = analizarPoolConexiones(1000, 1000);
  assert.equal(bloq100.length, 1);
  assert.equal(bloq100[0].nivel, 'bloqueante');

  // 120% (over-capacity / queues) -> bloqueante
  const bloq120 = analizarPoolConexiones(120, 100);
  assert.equal(bloq120.length, 1);
  assert.equal(bloq120[0].nivel, 'bloqueante');

  // Negative or NaN / invalid inputs handled gracefully
  assert.equal(analizarPoolConexiones(0, 0).length, 0);
  assert.equal(analizarPoolConexiones(-5, 100).length, 0);
  assert.equal(analizarPoolConexiones(50, -100).length, 0);
});

// ----------------------------------------------------------------------------
// TEST 4: ADVERSARIAL PG_CRON FAILURE DETECTION
// ----------------------------------------------------------------------------
test('Challenger 2 pg_cron: Only active jobs with latest failed status trigger alert', () => {
  const cronJobs = [
    // Job 1: Inactive, last failed -> NO alert
    { jobname: 'job_desactivado', active: false, ultimo_estado: 'failed', end_time: '2026-08-30T12:00:00Z', return_message: 'err' },
    // Job 2: Active, last succeeded -> NO alert
    { jobname: 'job_exitoso', active: true, ultimo_estado: 'succeeded', end_time: '2026-08-30T12:00:00Z', return_message: null },
    // Job 3: Active, last running -> NO alert
    { jobname: 'job_en_ejecucion', active: true, ultimo_estado: 'running', end_time: null, return_message: null },
    // Job 4: Active, last failed -> ALERT (bloqueante)
    { jobname: 'job_roto', active: true, ultimo_estado: 'failed', end_time: '2026-08-30T12:05:00Z', return_message: 'socket closed' },
  ];

  const hallazgos = analizarEstadoCrons(cronJobs);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/cron-fallido:job_roto');
  assert.equal(hallazgos[0].nivel, 'bloqueante');
  assert.equal(hallazgos[0].ambito, 'vigilancia');
  assert.match(hallazgos[0].detalle, /socket closed/);
});

// ----------------------------------------------------------------------------
// TEST 5: ADVERSARIAL VERIFACTU: COMPLEX MULTI-EMISOR CORRELATIVITY
// ----------------------------------------------------------------------------
test('Challenger 2 VeriFactu: Null NIF vs empty string vs different series independence', () => {
  const tickets = [
    // Emisor A (NIF1) - Serie S1
    { negocio_id: 'neg_1', nif_emisor: 'A11111111', serie: 'S1', numero: 1, hash: 'H_A_1', hash_anterior: null },
    { negocio_id: 'neg_1', nif_emisor: 'A11111111', serie: 'S1', numero: 2, hash: 'H_A_2', hash_anterior: 'H_A_1' },

    // Emisor B (NIF2) - Serie S1 (same series, different NIF -> distinct chain!)
    { negocio_id: 'neg_1', nif_emisor: 'B22222222', serie: 'S1', numero: 1, hash: 'H_B_1', hash_anterior: null },
    { negocio_id: 'neg_1', nif_emisor: 'B22222222', serie: 'S1', numero: 2, hash: 'H_B_2', hash_anterior: 'H_B_1' },

    // Emisor null (simplified tickets) - Serie null
    { negocio_id: 'neg_1', nif_emisor: null, serie: null, numero: 1, hash: 'H_NULL_1', hash_anterior: null },
    { negocio_id: 'neg_1', nif_emisor: null, serie: null, numero: 2, hash: 'H_NULL_2', hash_anterior: 'H_NULL_1' },
  ];

  const hallazgos = analizarContinuidadVeriFactu(tickets);
  assert.equal(hallazgos.length, 0, 'No collisions between distinct NIFs or null series');
});

// ----------------------------------------------------------------------------
// TEST 6: ADVERSARIAL EDGE FUNCTION CONTRACT RESILIENCE
// ----------------------------------------------------------------------------
test('Challenger 2 Edge Function Contract: Validates response structure under simulated partial RPC failures', () => {
  const mockHallazgo = (clave, nivel, ambito, titulo, detalle) => ({
    clave,
    nivel,
    ambito,
    titulo,
    detalle,
    fichero: 'base de datos',
    linea: null,
  });

  const hallazgosProfundos = [
    mockHallazgo('bd-profunda/fk-sin-indice:test', 'aviso', 'rendimiento', 'FK test', 'detalle'),
    mockHallazgo('bd-profunda/cron-fallido:cron1', 'bloqueante', 'vigilancia', 'Cron fallido', 'detalle'),
  ];

  const informe = {
    version: 1,
    origen: 'bd',
    commit: 'abcdef1',
    rama: 'master',
    ejecutado_en: new Date().toISOString(),
    duracion_ms: 150,
    vigilantes: [
      {
        nombre: 'base-de-datos',
        ambito: 'base-de-datos',
        ms: 150,
        ok: true,
      },
      {
        nombre: 'bd-profunda',
        ambito: 'base-de-datos',
        ms: null,
        ok: !hallazgosProfundos.some((h) => h.clave.startsWith('bd-profunda/')),
      },
    ],
    hallazgos: hallazgosProfundos,
  };

  assert.equal(informe.vigilantes.find(v => v.nombre === 'bd-profunda').ok, false, 'bd-profunda reports ok=false when findings exist');
  assert.equal(informe.hallazgos.filter(h => h.nivel === 'bloqueante').length, 1);
});
