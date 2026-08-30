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
// 1. METADATOS Y REGISTRO DEL VIGILANTE
// ============================================================================

test('el vigilante bd-profunda se declara con nombre, ámbito y necesitaRed', () => {
  assert.equal(vigilante.nombre, 'bd-profunda');
  assert.equal(vigilante.ambito, 'base-de-datos');
  assert.equal(vigilante.necesitaRed, true);
  assert.equal(typeof vigilante.ejecutar, 'function');
});

test('los 10 vectores críticos están formalmente inventariados', () => {
  assert.equal(VECTORES_PROFUNDOS.length, 10);
  const ids = VECTORES_PROFUNDOS.map((v) => v.id);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// ============================================================================
// 2. VECTOR 1: CLAVES FORÁNEAS SIN ÍNDICE
// ============================================================================

test('Vector 1: detecta claves foráneas sin índice en columnas hijas', () => {
  const fks = [
    { tabla: 'citas', nombre: 'citas_cliente_id_fkey', columnas: ['cliente_id'] },
    { tabla: 'cobros', nombre: 'cobros_cita_id_fkey', columnas: ['cita_id'] },
  ];
  const indices = [
    { tabla: 'citas', nombre: 'citas_cliente_idx', columnas: ['cliente_id'] },
    // cobros no tiene índice en cita_id
  ];

  const hallazgos = analizarFksSinIndice(fks, indices);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/fk-sin-indice:cobros.cobros_cita_id_fkey');
  assert.equal(hallazgos[0].nivel, 'aviso');
  assert.equal(hallazgos[0].ambito, 'rendimiento');
});

test('Vector 1: acepta índices compuestos cuando las columnas hijas son el prefijo', () => {
  const fks = [
    { tabla: 'cobros', nombre: 'cobros_negocio_cliente_fk', columnas: ['negocio_id', 'cliente_id'] },
  ];
  const indicesBuenos = [
    { tabla: 'cobros', nombre: 'cobros_neg_cli_fecha_idx', columnas: ['negocio_id', 'cliente_id', 'created_at'] },
  ];
  const indicesMalos = [
    { tabla: 'cobros', nombre: 'cobros_cli_neg_idx', columnas: ['cliente_id', 'negocio_id'] }, // orden inverso
  ];

  assert.equal(analizarFksSinIndice(fks, indicesBuenos).length, 0);
  assert.equal(analizarFksSinIndice(fks, indicesMalos).length, 1);
});

// ============================================================================
// 3. VECTOR 2: CONTENCIÓN DE LOCKS Y DEADLOCKS (>5s)
// ============================================================================

test('Vector 2: detecta transacciones bloqueadas por locks >5s como bloqueante', () => {
  const actividades = [
    { pid: 101, wait_event_type: 'Lock', wait_event: 'relation', espera_segundos: 6.2, usename: 'postgres', query: 'UPDATE citas...' },
    { pid: 102, wait_event_type: 'Lock', wait_event: 'tuple', espera_segundos: 2.1, usename: 'postgres', query: 'SELECT...' },
    { pid: 103, wait_event_type: 'IO', wait_event: 'DataFileRead', espera_segundos: 8.0, usename: 'postgres', query: 'SELECT...' },
  ];

  const hallazgos = analizarContencionLocks(actividades, 5);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/lock-contencion:101');
  assert.equal(hallazgos[0].nivel, 'bloqueante');
  assert.equal(hallazgos[0].ambito, 'rendimiento');
});

// ============================================================================
// 4. VECTOR 3: TUPLAS MUERTAS E HINCHAZÓN DE TABLAS (BLOAT)
// ============================================================================

test('Vector 3: detecta tablas con >1000 tuplas muertas y >20% bloat', () => {
  const tablas = [
    { relname: 'citas', n_live_tup: 2000, n_dead_tup: 1200, last_autovacuum: '2026-08-29' }, // 1200 / 3201 = 37.4% (>20% y >1000)
    { relname: 'clientes', n_live_tup: 5000, n_dead_tup: 400, last_autovacuum: '2026-08-30' }, // <=1000
    { relname: 'eventos_negocio', n_live_tup: 100000, n_dead_tup: 1500, last_autovacuum: '2026-08-30' }, // 1.5% (<=20%)
  ];

  const hallazgos = analizarBloatTuplasMuertas(tablas, 1000, 0.20);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/bloat-tabla:citas');
  assert.equal(hallazgos[0].nivel, 'aviso');
  assert.equal(hallazgos[0].ambito, 'rendimiento');
});

// ============================================================================
// 5. VECTOR 4: RIESGO DE DESBORDE DE SECUENCIAS NUMÉRICAS
// ============================================================================

test('Vector 4: alerta en aviso (>75%) y bloqueante (>90%) en secuencias agotadas', () => {
  const secuencias = [
    { sequencename: 'tickets_seq', min_value: 1, max_value: 1000, last_value: 800 }, // 80% -> aviso
    { sequencename: 'facturas_seq', min_value: 1, max_value: 1000, last_value: 950 }, // 95% -> bloqueante
    { sequencename: 'citas_seq', min_value: 1, max_value: 1000000, last_value: 2000 }, // 0.2% -> ok
  ];

  const hallazgos = analizarDesbordeSecuencias(secuencias, 0.75, 0.90);
  assert.equal(hallazgos.length, 2);

  const aviso = hallazgos.find((h) => h.clave === 'bd-profunda/secuencia-desborde:tickets_seq');
  const bloq = hallazgos.find((h) => h.clave === 'bd-profunda/secuencia-desborde:facturas_seq');

  assert.ok(aviso && aviso.nivel === 'aviso');
  assert.ok(bloq && bloq.nivel === 'bloqueante');
});

// ============================================================================
// 6. VECTOR 5: COBERTURA 100% RLS EN PUBLIC Y DEFINER SEARCH_PATH
// ============================================================================

test('Vector 5: bloquea tablas en public sin RLS y definers sin search_path', () => {
  const tablas = [
    { schemaname: 'public', relname: 'citas', relkind: 'r', relrowsecurity: true },
    { schemaname: 'public', relname: 'nueva_tabla_olvidada', relkind: 'r', relrowsecurity: false },
  ];
  const funciones = [
    { schemaname: 'public', proname: 'segura_fn', prosecdef: true, proconfig: ['search_path=public'] },
    { schemaname: 'public', proname: 'peligrosa_fn', prosecdef: true, proconfig: null },
  ];

  const hallazgos = analizarCoberturaRlsYDefiners(tablas, funciones);
  assert.equal(hallazgos.length, 2);

  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/tabla-sin-rls:nueva_tabla_olvidada'));
  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/definer-sin-search-path:peligrosa_fn'));
  assert.ok(hallazgos.every((h) => h.nivel === 'bloqueante'));
  assert.ok(hallazgos.every((h) => h.ambito === 'seguridad'));
});

// ============================================================================
// 7. VECTOR 6: SATURACIÓN DEL POOL DE CONEXIONES
// ============================================================================

test('Vector 6: evalúa saturación del pool con umbrales 75% aviso y 90% bloqueante', () => {
  assert.equal(analizarPoolConexiones(50, 100).length, 0); // 50% -> ok

  const aviso = analizarPoolConexiones(80, 100); // 80% -> aviso
  assert.equal(aviso.length, 1);
  assert.equal(aviso[0].nivel, 'aviso');

  const bloq = analizarPoolConexiones(95, 100); // 95% -> bloqueante
  assert.equal(bloq.length, 1);
  assert.equal(bloq[0].nivel, 'bloqueante');
});

// ============================================================================
// 8. VECTOR 7: ESTADO DE CRONS (pg_cron)
// ============================================================================

test('Vector 7: detecta cron jobs activos cuya última ejecución falló', () => {
  const jobs = [
    { jobname: 'vigilar-agenda', active: true, ultimo_estado: 'succeeded', end_time: '2026-08-30T10:00:00Z', return_message: null },
    { jobname: 'limpiar-temporales', active: true, ultimo_estado: 'failed', end_time: '2026-08-30T11:00:00Z', return_message: 'connection timeout' },
    { jobname: 'job-inactivo', active: false, ultimo_estado: 'failed', end_time: '2026-08-28T00:00:00Z', return_message: 'error' },
  ];

  const hallazgos = analizarEstadoCrons(jobs);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].clave, 'bd-profunda/cron-fallido:limpiar-temporales');
  assert.equal(hallazgos[0].nivel, 'bloqueante');
  assert.equal(hallazgos[0].ambito, 'vigilancia');
});

// ============================================================================
// 9. VECTOR 8: PRIVACIDAD DE BUCKETS Y STORAGE RLS
// ============================================================================

test('Vector 8: detecta buckets sensibles públicos y storage.objects sin RLS', () => {
  const buckets = [
    { id: 'logos-publicos', public: true }, // legítimo público
    { id: 'cliente-fotos', public: true }, // sensible PÚBLICO (fallo)
    { id: 'contratos-firmados', public: false }, // sensible privado (ok)
  ];

  const hallazgos = analizarPrivacidadBuckets(buckets, false); // storageObjectsRls = false
  assert.equal(hallazgos.length, 2);

  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/bucket-publico:cliente-fotos'));
  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/storage-objects-sin-rls'));
  assert.ok(hallazgos.every((h) => h.nivel === 'bloqueante'));
});

// ============================================================================
// 10. VECTOR 9: CONTINUIDAD CRIPTOGRÁFICA SHA-256 DE VERIFACTU
// ============================================================================

test('Vector 9: valida cadena criptográfica intacta y salta ante rupturas de hash o número', () => {
  const cadenaIntacta = [
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 1, hash: 'HASH1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 2, hash: 'HASH2', hash_anterior: 'HASH1', formato_huella: 'aeat_v1' },
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 3, hash: 'HASH3', hash_anterior: 'HASH2', formato_huella: 'aeat_v1' },
  ];
  assert.equal(analizarContinuidadVeriFactu(cadenaIntacta).length, 0);

  const saltoNumerico = [
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 1, hash: 'HASH1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 3, hash: 'HASH3', hash_anterior: 'HASH1', formato_huella: 'aeat_v1' }, // falta el 2
  ];
  const hNum = analizarContinuidadVeriFactu(saltoNumerico);
  assert.equal(hNum.length, 1);
  assert.match(hNum[0].detalle, /Salto en la numeración correlativa/);

  const hashAlterado = [
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 1, hash: 'HASH1', hash_anterior: null, formato_huella: 'aeat_v1' },
    { negocio_id: 'salon1', nif_emisor: 'B12345678', serie: 'A', numero: 2, hash: 'HASH2', hash_anterior: 'HASH_CORRUPTO', formato_huella: 'aeat_v1' },
  ];
  const hHash = analizarContinuidadVeriFactu(hashAlterado);
  assert.equal(hHash.length, 1);
  assert.match(hHash[0].detalle, /Discrepancia en huella criptográfica/);
});

// ============================================================================
// 11. VECTOR 10: DETECCIÓN DE REGISTROS HUÉRFANOS RELACIONALES
// ============================================================================

test('Vector 10: detecta registros huérfanos en tablas clave (citas, cobros, fases, bonos)', () => {
  const datosLimpios = { citasSinCliente: 0, cobrosSinCita: 0, fasesSinCita: 0, bonosSinCliente: 0 };
  assert.equal(analizarRegistrosHuerfanos(datosLimpios).length, 0);

  const datosConHuerfanos = { citasSinCliente: 3, cobrosSinCita: 1, fasesSinCita: 0, bonosSinCliente: 2 };
  const hallazgos = analizarRegistrosHuerfanos(datosConHuerfanos);
  assert.equal(hallazgos.length, 3);

  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/huerfano:citas-sin-cliente'));
  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/huerfano:cobros-sin-cita'));
  assert.ok(hallazgos.some((h) => h.clave === 'bd-profunda/huerfano:bonos-sin-cliente'));
  assert.ok(hallazgos.every((h) => h.nivel === 'bloqueante'));
  assert.ok(hallazgos.every((h) => h.ambito === 'coherencia'));
});

// ============================================================================
// 12. AUDITORÍA DEL FICHERO DE MIGRACIÓN SQL
// ============================================================================

test('la migración SQL de salud profunda cumple con las directrices de seguridad de Mecha', () => {
  const sql = readFileSync(MIGRACION_SQL, 'utf8');

  // Función presente
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.vigilancia_bd_profunda/i);

  // Security Definer y search_path fijado
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public/i);

  // Guarda de autorización interna (is_staff o service_role)
  assert.match(sql, /if\s+not\s*\(\s*public\.is_staff\(\)\s+or\s+auth\.role\(\)\s*=\s*'service_role'\s*\)/i);

  // Revocación estricta y concesión segura
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.vigilancia_bd_profunda\(\)\s+from\s+public,\s*anon/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.vigilancia_bd_profunda\(\)\s+to\s+authenticated,\s*service_role/i);

  // Comentario descriptivo
  assert.match(sql, /comment\s+on\s+function\s+public\.vigilancia_bd_profunda\(\)\s+is/i);

  // Los 10 vectores deben estar presentes en el cuerpo SQL
  assert.match(sql, /VECTOR 1/i, 'falta vector 1 en SQL');
  assert.match(sql, /VECTOR 2/i, 'falta vector 2 en SQL');
  assert.match(sql, /VECTOR 3/i, 'falta vector 3 en SQL');
  assert.match(sql, /VECTOR 4/i, 'falta vector 4 en SQL');
  assert.match(sql, /VECTOR 5/i, 'falta vector 5 en SQL');
  assert.match(sql, /VECTOR 6/i, 'falta vector 6 en SQL');
  assert.match(sql, /VECTOR 7/i, 'falta vector 7 en SQL');
  assert.match(sql, /VECTOR 8/i, 'falta vector 8 en SQL');
  assert.match(sql, /VECTOR 9/i, 'falta vector 9 en SQL');
  assert.match(sql, /VECTOR 10/i, 'falta vector 10 en SQL');
});
