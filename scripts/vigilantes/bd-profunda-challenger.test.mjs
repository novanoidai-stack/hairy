import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ============================================================================
// ADVERSARIAL CHALLENGE SUITE: POSTGRESQL DEEP HEALTH (MILESTONE M2)
// ============================================================================

// ----------------------------------------------------------------------------
// CHALLENGE 1: VERIFACTU MULTI-TENANT, MULTI-SERIE, AND ADVERSARIAL CHAIN INTEGRITY
// ----------------------------------------------------------------------------

test('Adversarial VeriFactu: Multi-tenant and multi-series isolation without false collisions', () => {
  // Two different salons with identical sequence numbers (both starting from 1)
  // and two different series within the same salon
  const tickets = [
    // Salon 1 - Serie A (valid chain)
    { negocio_id: 'salon_1', nif_emisor: 'B11111111', serie: 'A', numero: 1, hash: 'H_1_A_1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 'salon_1', nif_emisor: 'B11111111', serie: 'A', numero: 2, hash: 'H_1_A_2', hash_anterior: 'H_1_A_1', formato_huella: 'aeat_v1' },
    // Salon 1 - Serie B (valid chain, same numbers as Serie A)
    { negocio_id: 'salon_1', nif_emisor: 'B11111111', serie: 'B', numero: 1, hash: 'H_1_B_1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 'salon_1', nif_emisor: 'B11111111', serie: 'B', numero: 2, hash: 'H_1_B_2', hash_anterior: 'H_1_B_1', formato_huella: 'aeat_v1' },
    // Salon 2 - Serie A (valid chain, same numbers and series as Salon 1)
    { negocio_id: 'salon_2', nif_emisor: 'B22222222', serie: 'A', numero: 1, hash: 'H_2_A_1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 'salon_2', nif_emisor: 'B22222222', serie: 'A', numero: 2, hash: 'H_2_A_2', hash_anterior: 'H_2_A_1', formato_huella: 'aeat_v1' },
  ];

  const hallazgos = analizarContinuidadVeriFactu(tickets);
  assert.equal(hallazgos.length, 0, 'No false cross-tenant or cross-series chain collision findings');
});

test('Adversarial VeriFactu: Out-of-order array input is sorted and verified deterministically', () => {
  // Input fed out-of-order (e.g. async db fetch or unordered insert)
  const ticketsUnordered = [
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'T', numero: 3, hash: 'H3', hash_anterior: 'H2', formato_huella: 'aeat_v1' },
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'T', numero: 1, hash: 'H1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'T', numero: 2, hash: 'H2', hash_anterior: 'H1', formato_huella: 'aeat_v1' },
  ];

  const hallazgos = analizarContinuidadVeriFactu(ticketsUnordered);
  assert.equal(hallazgos.length, 0, 'Sorting handles out-of-order tickets cleanly');
});

test('Adversarial VeriFactu: Numbering gap + Hash mismatch simultaneously on same ticket', () => {
  const corrupted = [
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'T', numero: 1, hash: 'H1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'T', numero: 4, hash: 'H4', hash_anterior: 'H_TAMPERED', formato_huella: 'aeat_v1' },
  ];

  const hallazgos = analizarContinuidadVeriFactu(corrupted);
  assert.ok(hallazgos.length >= 1, 'Catches simultaneous number gap and hash tamper');
  assert.ok(hallazgos.every(h => h.nivel === 'bloqueante'));
  assert.ok(hallazgos.every(h => h.ambito === 'fiscal'));
});

test('Adversarial VeriFactu: Non-aeat_v1 formats are ignored without crashing or false flagging', () => {
  const legacyTickets = [
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'LEGACY', numero: 10, hash: null, hash_anterior: null, formato_huella: 'legacy_v0' },
    { negocio_id: 's1', nif_emisor: 'B1', serie: 'LEGACY', numero: 25, hash: null, hash_anterior: null, formato_huella: 'custom' },
  ];

  const hallazgos = analizarContinuidadVeriFactu(legacyTickets);
  assert.equal(hallazgos.length, 0, 'Legacy formats safely skipped');
});

// ----------------------------------------------------------------------------
// CHALLENGE 2: LOCK CONTENTION BOUNDARY CONDITIONS AND NON-LOCK EVENTS
// ----------------------------------------------------------------------------

test('Adversarial Locks: Exact threshold boundaries (5.0s vs 5.001s)', () => {
  const boundaryActivities = [
    { pid: 201, wait_event_type: 'Lock', espera_segundos: 5.0, query: 'SELECT 1;' }, // exactly 5.0s -> NO alert
    { pid: 202, wait_event_type: 'Lock', espera_segundos: 5.001, query: 'UPDATE citas;' }, // >5.0s -> ALERT
    { pid: 203, wait_event_type: 'Lock', espera_segundos: 4.999, query: 'DELETE FROM cobros;' }, // <5.0s -> NO alert
  ];

  const hallazgos = analizarContencionLocks(boundaryActivities, 5);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/lock-contencion:202');
  assert.equal(hallazgos[0].nivel, 'bloqueante');
});

test('Adversarial Locks: Non-Lock wait events with long durations do not trigger false alerts', () => {
  const nonLockActivities = [
    { pid: 301, wait_event_type: 'Client', wait_event: 'ClientRead', espera_segundos: 3600, query: 'idle' },
    { pid: 302, wait_event_type: 'Activity', wait_event: 'AutoVacuumMain', espera_segundos: 600, query: 'autovacuum' },
    { pid: 303, wait_event_type: 'IO', wait_event: 'DataFileRead', espera_segundos: 12.5, query: 'SELECT count(*) FROM citas;' },
    { pid: 304, wait_event_type: null, wait_event: null, espera_segundos: 50, query: 'SELECT 1;' },
  ];

  const hallazgos = analizarContencionLocks(nonLockActivities, 5);
  assert.equal(hallazgos.length, 0, 'Non-lock events never raise lock contention findings');
});

// ----------------------------------------------------------------------------
// CHALLENGE 3: TABLE BLOAT AND DEAD TUPLE RATIOS
// ----------------------------------------------------------------------------

test('Adversarial Bloat: Strict dual-condition (dead_tup > 1000 AND ratio > 20%)', () => {
  const edgeTables = [
    // Case A: High ratio (80%), but small table with dead_tup = 800 (<=1000) -> NO alert
    { relname: 'pequena_tabla', n_live_tup: 200, n_dead_tup: 800 },
    // Case B: Huge table with dead_tup = 5000 (>1000), but ratio = 5000 / 1000001 = 0.5% (<=20%) -> NO alert
    { relname: 'gran_tabla', n_live_tup: 1000000, n_dead_tup: 5000 },
    // Case C: Exact boundary dead_tup = 1000 (<=1000) and ratio 50% -> NO alert
    { relname: 'limite_tuplas', n_live_tup: 1000, n_dead_tup: 1000 },
    // Case D: Dead_tup = 1001 (>1000) and ratio = 1001 / (3999 + 1001 + 1) = 20.016% (>20%) -> ALERT
    { relname: 'tabla_hinchada_1', n_live_tup: 3999, n_dead_tup: 1001 },
    // Case E: Zero live and zero dead tuples -> NO NaN, NO crash, NO alert
    { relname: 'tabla_vacia', n_live_tup: 0, n_dead_tup: 0 },
  ];

  const hallazgos = analizarBloatTuplasMuertas(edgeTables, 1000, 0.20);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/bloat-tabla:tabla_hinchada_1');
  assert.equal(hallazgos[0].nivel, 'aviso');
});

// ----------------------------------------------------------------------------
// CHALLENGE 4: NUMERIC SEQUENCE OVERFLOW (75% AVISO vs 90% BLOQUEANTE)
// ----------------------------------------------------------------------------

test('Adversarial Sequences: Precise threshold transitions (75% and 90%) and edge specs', () => {
  const sequences = [
    // 75.000% exactly -> NO alert
    { sequencename: 'seq_exact_75', min_value: 0, max_value: 1000, last_value: 750 },
    // 75.100% -> AVISO
    { sequencename: 'seq_aviso_75_1', min_value: 0, max_value: 1000, last_value: 751 },
    // 90.000% exactly -> AVISO (not > 90%)
    { sequencename: 'seq_exact_90', min_value: 0, max_value: 1000, last_value: 900 },
    // 90.100% -> BLOQUEANTE
    { sequencename: 'seq_bloq_90_1', min_value: 0, max_value: 1000, last_value: 901 },
    // 99.900% -> BLOQUEANTE
    { sequencename: 'seq_critica', min_value: 1, max_value: 100000, last_value: 99900 },
    // Non-zero min_value: range [1000 .. 2000], last_value = 1800 (80% consumption) -> AVISO
    { sequencename: 'seq_offset_min', min_value: 1000, max_value: 2000, last_value: 1800 },
    // Degenerate sequence (max <= min or nulls) -> NO crash, NO false alert
    { sequencename: 'seq_invalida', min_value: 100, max_value: 10, last_value: 50 },
    { sequencename: 'seq_null_val', min_value: 1, max_value: 1000, last_value: null },
  ];

  const hallazgos = analizarDesbordeSecuencias(sequences, 0.75, 0.90);
  assert.equal(hallazgos.length, 5, 'Exactly 5 sequences exceed 75% threshold');

  const exact75 = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_exact_75');
  const exact90 = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_exact_90');
  const bloq901 = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_bloq_90_1');
  const aviso751 = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_aviso_75_1');
  const offsetMin = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_offset_min');
  const invalida = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_invalida');
  const nullVal = hallazgos.find(h => h.clave === 'bd-profunda/secuencia-desborde:seq_null_val');

  assert.equal(exact75, undefined, '75.0% exact is not > 75%');
  assert.equal(invalida, undefined, 'Invalid range is ignored');
  assert.equal(nullVal, undefined, 'Null last_value is ignored');
  assert.equal(exact90?.nivel, 'aviso', '90.0% exact is aviso, not bloqueante');
  assert.equal(bloq901?.nivel, 'bloqueante', '90.1% is bloqueante');
  assert.equal(aviso751?.nivel, 'aviso');
  assert.equal(offsetMin?.nivel, 'aviso');
});

// ----------------------------------------------------------------------------
// CHALLENGE 5: COMPOSITE vs SIMPLE FOREIGN KEYS AND INDEX PREFIX COVERAGE
// ----------------------------------------------------------------------------

test('Adversarial FKs: Complex composite FKs and prefix matching rules', () => {
  const fks = [
    // FK 1: Single col (cliente_id) -> covered by composite index where cliente_id is prefix
    { tabla: 'citas', nombre: 'fk_citas_cli', columnas: ['cliente_id'] },
    // FK 2: Composite col [negocio_id, profesional_id, fecha] -> covered by index [negocio_id, profesional_id, fecha, estado]
    { tabla: 'citas', nombre: 'fk_citas_neg_prof_fecha', columnas: ['negocio_id', 'profesional_id', 'fecha'] },
    // FK 3: Composite col [negocio_id, servicio_id] -> NOT covered because index is [servicio_id, negocio_id] (inverted)
    { tabla: 'cita_servicios', nombre: 'fk_serv_neg_inv', columnas: ['negocio_id', 'servicio_id'] },
    // FK 4: Composite col [negocio_id, cliente_id] -> NOT covered because index only covers [negocio_id] (partial)
    { tabla: 'cobros', nombre: 'fk_cobros_neg_cli_partial', columnas: ['negocio_id', 'cliente_id'] },
    // FK 5: Single col [puesto_id] -> NOT covered because index has puesto_id as second column [negocio_id, puesto_id]
    { tabla: 'citas', nombre: 'fk_citas_puesto', columnas: ['puesto_id'] },
  ];

  const indices = [
    { tabla: 'citas', nombre: 'idx_citas_cli_neg', columnas: ['cliente_id', 'negocio_id'] }, // covers FK 1
    { tabla: 'citas', nombre: 'idx_citas_neg_prof_fecha_est', columnas: ['negocio_id', 'profesional_id', 'fecha', 'estado'] }, // covers FK 2
    { tabla: 'cita_servicios', nombre: 'idx_serv_neg_inv', columnas: ['servicio_id', 'negocio_id'] }, // does NOT cover FK 3 (order matters)
    { tabla: 'cobros', nombre: 'idx_cobros_neg_only', columnas: ['negocio_id'] }, // does NOT cover FK 4 (only 1 col)
    { tabla: 'citas', nombre: 'idx_citas_neg_puesto', columnas: ['negocio_id', 'puesto_id'] }, // does NOT cover FK 5 (puesto_id is 2nd)
  ];

  const hallazgos = analizarFksSinIndice(fks, indices);
  assert.equal(hallazgos.length, 3, 'Exactly 3 unindexed/uncovered FKs detected');

  assert.ok(hallazgos.some(h => h.clave === 'bd-profunda/fk-sin-indice:cita_servicios.fk_serv_neg_inv'));
  assert.ok(hallazgos.some(h => h.clave === 'bd-profunda/fk-sin-indice:cobros.fk_cobros_neg_cli_partial'));
  assert.ok(hallazgos.some(h => h.clave === 'bd-profunda/fk-sin-indice:citas.fk_citas_puesto'));
});

// ----------------------------------------------------------------------------
// CHALLENGE 6: RLS AND DEFINER SEARCH_PATH ROBUSTNESS
// ----------------------------------------------------------------------------

test('Adversarial RLS: Catches public tables without RLS and definers without search_path', () => {
  const tables = [
    { schemaname: 'public', relname: 'citas', relkind: 'r', relrowsecurity: true },
    { schemaname: 'public', relname: 'v_citas_resumen', relkind: 'v', relrowsecurity: false }, // Views are relkind 'v', not 'r'
    { schemaname: 'public', relname: 'tabla_olvidada', relkind: 'r', relrowsecurity: false }, // UNPROTECTED table
    { schemaname: 'auth', relname: 'users', relkind: 'r', relrowsecurity: true }, // Not in public
  ];

  const functions = [
    { schemaname: 'public', proname: 'fn_ok', prosecdef: true, proconfig: ['search_path=public'] },
    { schemaname: 'public', proname: 'fn_multi_schema', prosecdef: true, proconfig: ['search_path=public,extensions'] },
    { schemaname: 'public', proname: 'fn_invoker', prosecdef: false, proconfig: null }, // invoker doesn't need prosecdef search_path
    { schemaname: 'public', proname: 'fn_bad_definer', prosecdef: true, proconfig: ['timezone=UTC'] }, // missing search_path!
  ];

  const hallazgos = analizarCoberturaRlsYDefiners(tables, functions);
  assert.equal(hallazgos.length, 2);

  assert.ok(hallazgos.some(h => h.clave === 'bd-profunda/tabla-sin-rls:tabla_olvidada'));
  assert.ok(hallazgos.some(h => h.clave === 'bd-profunda/definer-sin-search-path:fn_bad_definer'));
  assert.ok(hallazgos.every(h => h.nivel === 'bloqueante'));
  assert.ok(hallazgos.every(h => h.ambito === 'seguridad'));
});

// ----------------------------------------------------------------------------
// CHALLENGE 7: STORAGE SENSITIVE BUCKETS AND CONNECTION POOL STRESS
// ----------------------------------------------------------------------------

test('Adversarial Storage & Pool: Sensitive bucket classification and pool ratios', () => {
  const buckets = [
    { id: 'cliente-fotos', public: false }, // ok
    { id: 'contratos-firmados', public: true }, // BAD (sensitive)
    { id: 'nominas-empleados', public: true }, // BAD (sensitive)
    { id: 'documentos-privados', public: false }, // ok
    { id: 'logos-publicos', public: true }, // ok (non-sensitive)
    { id: 'estilos-cabello-catalogo', public: true }, // ok (non-sensitive)
  ];

  const hallazgosStorage = analizarPrivacidadBuckets(buckets, true);
  assert.equal(hallazgosStorage.length, 2);
  assert.ok(hallazgosStorage.some(h => h.clave === 'bd-profunda/bucket-publico:contratos-firmados'));
  assert.ok(hallazgosStorage.some(h => h.clave === 'bd-profunda/bucket-publico:nominas-empleados'));

  // Pool test with 0 or null max_conn
  assert.equal(analizarPoolConexiones(10, 0).length, 0, 'No division by zero on 0 max_conn');
  assert.equal(analizarPoolConexiones(10, null).length, 0, 'No crash on null max_conn');
  assert.equal(analizarPoolConexiones(75, 100).length, 0, '75.0% is not > 75%');
  assert.equal(analizarPoolConexiones(76, 100)[0].nivel, 'aviso', '76% is aviso');
  assert.equal(analizarPoolConexiones(90, 100)[0].nivel, 'aviso', '90.0% is aviso');
  assert.equal(analizarPoolConexiones(91, 100)[0].nivel, 'bloqueante', '91% is bloqueante');
});

// ----------------------------------------------------------------------------
// CHALLENGE 8: SQL MIGRATION SECURITY, PERMISSIONS & DEFENSIVE SQL AUDIT
// ----------------------------------------------------------------------------

test('Adversarial SQL Audit: Strict validation of SQL schema, security definer, and dynamic SQL safety', () => {
  const sql = readFileSync(MIGRACION_SQL, 'utf8');

  // Check that all dynamic queries use to_regclass guards
  const regclassChecks = [
    'to_regclass(\'cron.job\')',
    'to_regclass(\'storage.buckets\')',
    'to_regclass(\'storage.objects\')',
    'to_regclass(\'public.tickets_verifactu\')',
    'to_regclass(\'public.citas\')',
    'to_regclass(\'public.clientes\')',
    'to_regclass(\'public.cobros\')',
    'to_regclass(\'public.cita_servicios\')',
    'to_regclass(\'public.cita_fases\')',
    'to_regclass(\'public.bonos\')',
  ];

  for (const check of regclassChecks) {
    assert.ok(sql.includes(check), `Missing defensive guard: ${check}`);
  }

  // Ensure no unparameterized string concatenations inside dynamic queries that could lead to SQL injection
  assert.ok(!sql.includes('execute $sql$' + ' || '), 'No unsafe dynamic concatenation into execute $sql$');

  // Verify backend pid exclusion in Vector 2
  assert.ok(sql.includes('a.pid <> pg_backend_pid()'), 'Vector 2 must exclude the backend surveillance process itself');

  // Verify VeriFactu partition incorporates multi-tenant and multi-series dimensions
  assert.ok(
    sql.includes('partition by negocio_id, coalesce(nif_emisor, \'\'), serie'),
    'Vector 9 must partition by negocio_id, coalesce(nif_emisor, \'\'), serie'
  );
});
