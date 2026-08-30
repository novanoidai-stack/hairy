// Puente a public.vigilancia_bd_profunda(): los 10 vectores críticos de salud
// y seguridad profunda de PostgreSQL.
//
// VECTORES VIGILADOS (Milestone 2 - Requirement R2):
//   1. Claves foráneas sin índice en columnas hijas (pg_constraint vs pg_index).
//   2. Contención de locks y transacciones bloqueadas (>5s en pg_stat_activity).
//   3. Tuplas muertas e hinchazón de tablas (bloat: n_dead_tup > 1000 y ratio > 20%).
//   4. Riesgo de desborde de secuencias numéricas (consumo >75% aviso, >90% bloqueante).
//   5. Cobertura 100% RLS en esquema public y search_path fijado en SECURITY DEFINER.
//   6. Saturación del pool de conexiones activas vs max_connections (>75% / >90%).
//   7. Estado de jobs en pg_cron (cron.job_run_details con estado 'failed').
//   8. Privacidad de buckets de Storage (cliente-fotos public=false, RLS en storage.objects).
//   9. Continuidad criptográfica SHA-256 de VeriFactu (hash_anterior = lag(hash) y correlatividad).
//  10. Detección de registros huérfanos relacionales (citas, cobros, fases, bonos).

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

export const VECTORES_PROFUNDOS = [
  { id: 1, nombre: 'fk-sin-indice', ambito: 'rendimiento', desc: 'Claves foráneas sin índice' },
  { id: 2, nombre: 'lock-contencion', ambito: 'rendimiento', desc: 'Contención de locks >5s' },
  { id: 3, nombre: 'bloat-tabla', ambito: 'rendimiento', desc: 'Tuplas muertas y bloat >20%' },
  { id: 4, nombre: 'secuencia-desborde', ambito: 'base-de-datos', desc: 'Desborde de secuencias numéricas' },
  { id: 5, nombre: 'rls-y-definers', ambito: 'seguridad', desc: '100% RLS en public y search_path en definers' },
  { id: 6, nombre: 'conexiones-saturacion', ambito: 'rendimiento', desc: 'Saturación del pool de conexiones' },
  { id: 7, nombre: 'cron-fallido', ambito: 'vigilancia', desc: 'Fallos en jobs de pg_cron' },
  { id: 8, nombre: 'storage-privacidad', ambito: 'seguridad', desc: 'Privacidad de buckets y RLS de storage' },
  { id: 9, nombre: 'verifactu-cadena', ambito: 'fiscal', desc: 'Continuidad SHA-256 y numeración VeriFactu' },
  { id: 10, nombre: 'registros-huerfanos', ambito: 'coherencia', desc: 'Integridad referencial y huérfanos' },
];

/**
 * Evalúa claves foráneas sin índice en columnas hijas.
 */
export function analizarFksSinIndice(fks = [], indices = []) {
  const hallazgos = [];
  for (const fk of fks) {
    const { tabla, nombre, columnas } = fk;
    const cubierto = indices.some((idx) => {
      if (idx.tabla !== tabla) return false;
      if (!Array.isArray(idx.columnas) || idx.columnas.length < columnas.length) return false;
      return columnas.every((col, i) => idx.columnas[i] === col);
    });

    if (!cubierto) {
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/fk-sin-indice:${tabla}.${nombre}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Clave foránea sin índice: ${tabla}.${nombre}`,
          detalle: `La clave foránea "${nombre}" en ${tabla} no tiene índice en las columnas hijas (${columnas.join(', ')}).`,
          fichero: 'base de datos',
        }),
      );
    }
  }
  return hallazgos;
}

/**
 * Evalúa contención de locks en pg_stat_activity (>5s).
 */
export function analizarContencionLocks(actividades = [], umbralSegundos = 5) {
  const hallazgos = [];
  for (const act of actividades) {
    if (act.wait_event_type === 'Lock' && (act.espera_segundos ?? 0) > umbralSegundos) {
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/lock-contencion:${act.pid}`,
          nivel: 'bloqueante',
          ambito: 'rendimiento',
          titulo: `Contención de lock >${umbralSegundos}s en PID ${act.pid}`,
          detalle: `Proceso PID ${act.pid} (${act.usename || 'anon'}) esperando lock (${act.wait_event || 'Lock'}) durante ${act.espera_segundos}s. Query: ${(act.query || '').slice(0, 140)}`,
          fichero: 'base de datos',
        }),
      );
    }
  }
  return hallazgos;
}

/**
 * Evalúa tuplas muertas e hinchazón de tablas (bloat: >1000 tuplas y >20%).
 */
export function analizarBloatTuplasMuertas(tablas = [], umbralTuplas = 1000, umbralRatio = 0.20) {
  const hallazgos = [];
  for (const t of tablas) {
    const total = (t.n_live_tup ?? 0) + (t.n_dead_tup ?? 0) + 1;
    const ratio = (t.n_dead_tup ?? 0) / total;
    if ((t.n_dead_tup ?? 0) > umbralTuplas && ratio > umbralRatio) {
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/bloat-tabla:${t.relname}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Hinchazón de tuplas muertas en ${t.relname} (${t.n_dead_tup} tuplas)`,
          detalle: `La tabla ${t.relname} tiene ${t.n_dead_tup} tuplas muertas (${(ratio * 100).toFixed(1)}% del total). Último autovacuum: ${t.last_autovacuum || 'nunca'}.`,
          fichero: 'base de datos',
        }),
      );
    }
  }
  return hallazgos;
}

/**
 * Evalúa riesgo de desborde de secuencias numéricas.
 */
export function analizarDesbordeSecuencias(secuencias = [], avisoRatio = 0.75, bloqRatio = 0.90) {
  const hallazgos = [];
  for (const s of secuencias) {
    const rango = (s.max_value ?? 0) - (s.min_value ?? 0);
    if (rango <= 0 || s.last_value == null) continue;
    const consumo = (s.last_value - s.min_value) / rango;
    if (consumo > avisoRatio) {
      const esBloqueante = consumo > bloqRatio;
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/secuencia-desborde:${s.sequencename}`,
          nivel: esBloqueante ? 'bloqueante' : 'aviso',
          ambito: 'base-de-datos',
          titulo: `Secuencia ${s.sequencename} al ${(consumo * 100).toFixed(1)}% de capacidad`,
          detalle: `La secuencia ${s.sequencename} ha alcanzado el valor ${s.last_value} de un máximo de ${s.max_value}.`,
          fichero: 'base de datos',
        }),
      );
    }
  }
  return hallazgos;
}

/**
 * Evalúa 100% de cobertura RLS en tablas públicas y search_path en SECURITY DEFINER.
 */
export function analizarCoberturaRlsYDefiners(tablas = [], funciones = []) {
  const hallazgos = [];
  for (const t of tablas) {
    if (t.schemaname === 'public' && t.relkind === 'r' && !t.relrowsecurity) {
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/tabla-sin-rls:${t.relname}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `La tabla pública "${t.relname}" NO tiene RLS activa`,
          detalle: `Toda tabla en el esquema public debe tener Row Level Security activado. Activar con: ALTER TABLE public.${t.relname} ENABLE ROW LEVEL SECURITY;`,
          fichero: 'base de datos',
        }),
      );
    }
  }

  for (const fn of funciones) {
    if (fn.schemaname === 'public' && fn.prosecdef) {
      const tieneSearchPath =
        Array.isArray(fn.proconfig) && fn.proconfig.some((c) => /^search_path=/i.test(c));
      if (!tieneSearchPath) {
        hallazgos.push(
          hallazgo({
            clave: `bd-profunda/definer-sin-search-path:${fn.proname}`,
            nivel: 'bloqueante',
            ambito: 'seguridad',
            titulo: `Función SECURITY DEFINER public.${fn.proname}() sin search_path fijado`,
            detalle: `La función ${fn.proname} corre como definer sin fijar search_path seguro. Corregir con: ALTER FUNCTION public.${fn.proname} SET search_path = public;`,
            fichero: 'base de datos',
          }),
        );
      }
    }
  }
  return hallazgos;
}

/**
 * Evalúa saturación del pool de conexiones.
 */
export function analizarPoolConexiones(activas, maxConexiones, avisoRatio = 0.75, bloqRatio = 0.90) {
  if (!maxConexiones || maxConexiones <= 0) return [];
  const ratio = activas / maxConexiones;
  if (ratio <= avisoRatio) return [];

  const esBloqueante = ratio > bloqRatio;
  return [
    hallazgo({
      clave: 'bd-profunda/conexiones-saturacion',
      nivel: esBloqueante ? 'bloqueante' : 'aviso',
      ambito: 'rendimiento',
      titulo: `Pool de conexiones al ${(ratio * 100).toFixed(1)}% (${activas}/${maxConexiones})`,
      detalle: `Saturación de conexiones en PostgreSQL (${activas} conexiones de ${maxConexiones} máximas).`,
      fichero: 'base de datos',
    }),
  ];
}

/**
 * Evalúa estado de jobs de pg_cron.
 */
export function analizarEstadoCrons(jobs = []) {
  const hallazgos = [];
  for (const j of jobs) {
    if (j.active && j.ultimo_estado === 'failed') {
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/cron-fallido:${j.jobname}`,
          nivel: 'bloqueante',
          ambito: 'vigilancia',
          titulo: `El cron job "${j.jobname}" ha fallado en su última ejecución`,
          detalle: `Última ejecución en estado "failed" a las ${j.end_time || 'reciente'}. Error: ${j.return_message || 'sin mensaje'}`,
          fichero: 'base de datos',
        }),
      );
    }
  }
  return hallazgos;
}

/**
 * Evalúa privacidad de buckets de Storage y RLS en storage.objects.
 */
export function analizarPrivacidadBuckets(buckets = [], storageObjectsRls = true) {
  const hallazgos = [];
  const sensibles = new Set([
    'cliente-fotos',
    'contratos-firmados',
    'documentos-privados',
    'nominas-empleados',
  ]);

  for (const b of buckets) {
    if (sensibles.has(b.id) && b.public === true) {
      hallazgos.push(
        hallazgo({
          clave: `bd-profunda/bucket-publico:${b.id}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `El bucket sensible "${b.id}" es PÚBLICO y debe ser PRIVADO`,
          detalle: `Los buckets que contienen fotografías o documentos personales deben tener public = false.`,
          fichero: 'base de datos',
        }),
      );
    }
  }

  if (!storageObjectsRls) {
    hallazgos.push(
      hallazgo({
        clave: 'bd-profunda/storage-objects-sin-rls',
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: 'storage.objects no tiene RLS activa',
        detalle: 'La tabla de objetos de Storage debe tener Row Level Security activado.',
        fichero: 'base de datos',
      }),
    );
  }
  return hallazgos;
}

/**
 * Evalúa continuidad criptográfica SHA-256 de VeriFactu y correlatividad numérica.
 */
export function analizarContinuidadVeriFactu(tickets = []) {
  const hallazgos = [];
  // Agrupar por cadena: negocio_id + nif_emisor + serie
  const cadenas = new Map();
  for (const t of tickets) {
    if (t.formato_huella && t.formato_huella !== 'aeat_v1') continue;
    const claveCadena = `${t.negocio_id}::${t.nif_emisor || ''}::${t.serie || ''}`;
    if (!cadenas.has(claveCadena)) cadenas.set(claveCadena, []);
    cadenas.get(claveCadena).push(t);
  }

  for (const [, lista] of cadenas) {
    lista.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
    for (let i = 0; i < lista.length; i++) {
      const actual = lista[i];
      if (i > 0) {
        const previo = lista[i - 1];
        // Correlatividad
        if (actual.numero !== previo.numero + 1) {
          hallazgos.push(
            hallazgo({
              clave: `bd-profunda/verifactu-cadena-rota:${actual.negocio_id}.${actual.serie || 'GEN'}.${actual.numero}`,
              nivel: 'bloqueante',
              ambito: 'fiscal',
              titulo: `Cadena VeriFactu SHA-256 rota en ticket ${actual.serie || ''}-${actual.numero} (Salón: ${actual.negocio_id})`,
              detalle: `Salto en la numeración correlativa: número anterior=${previo.numero}, actual=${actual.numero}`,
              fichero: 'base de datos',
            }),
          );
        }
        // Enlace de huella hash
        if (actual.hash_anterior && actual.hash_anterior !== previo.hash) {
          hallazgos.push(
            hallazgo({
              clave: `bd-profunda/verifactu-cadena-rota:${actual.negocio_id}.${actual.serie || 'GEN'}.${actual.numero}`,
              nivel: 'bloqueante',
              ambito: 'fiscal',
              titulo: `Cadena VeriFactu SHA-256 rota en ticket ${actual.serie || ''}-${actual.numero} (Salón: ${actual.negocio_id})`,
              detalle: `Discrepancia en huella criptográfica SHA-256: hash_anterior en registro=${actual.hash_anterior}, hash calculado de fila previa=${previo.hash}`,
              fichero: 'base de datos',
            }),
          );
        }
      }
    }
  }
  return hallazgos;
}

/**
 * Evalúa registros huérfanos relacionales.
 */
export function analizarRegistrosHuerfanos(datos = {}) {
  const hallazgos = [];
  const { citasSinCliente = 0, cobrosSinCita = 0, fasesSinCita = 0, bonosSinCliente = 0 } = datos;

  if (citasSinCliente > 0) {
    hallazgos.push(
      hallazgo({
        clave: 'bd-profunda/huerfano:citas-sin-cliente',
        nivel: 'bloqueante',
        ambito: 'coherencia',
        titulo: `${citasSinCliente} cita(s) referencian un cliente inexistente`,
        detalle: 'Existen registros en public.citas cuyo cliente_id no existe en public.clientes.',
        fichero: 'base de datos',
      }),
    );
  }

  if (cobrosSinCita > 0) {
    hallazgos.push(
      hallazgo({
        clave: 'bd-profunda/huerfano:cobros-sin-cita',
        nivel: 'bloqueante',
        ambito: 'coherencia',
        titulo: `${cobrosSinCita} cobro(s) con cita_id inexistente`,
        detalle: 'Existen registros en public.cobros cuyo cita_id no existe en public.citas.',
        fichero: 'base de datos',
      }),
    );
  }

  if (fasesSinCita > 0) {
    hallazgos.push(
      hallazgo({
        clave: 'bd-profunda/huerfano:cita-fases-sin-cita',
        nivel: 'bloqueante',
        ambito: 'coherencia',
        titulo: `${fasesSinCita} cita_fases huérfana(s)`,
        detalle: 'Existen fases en public.cita_fases cuyo cita_id no existe en public.citas.',
        fichero: 'base de datos',
      }),
    );
  }

  if (bonosSinCliente > 0) {
    hallazgos.push(
      hallazgo({
        clave: 'bd-profunda/huerfano:bonos-sin-cliente',
        nivel: 'bloqueante',
        ambito: 'coherencia',
        titulo: `${bonosSinCliente} bono(s) referencian un cliente inexistente`,
        detalle: 'Existen registros en public.bonos cuyo cliente_id no existe en public.clientes.',
        fichero: 'base de datos',
      }),
    );
  }

  return hallazgos;
}

/**
 * Ejecutor que llama a public.vigilancia_bd_profunda() en Supabase.
 */
async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-profunda/sin-credencial',
        'base-de-datos',
        'La vigilancia de salud profunda de PostgreSQL (10 vectores)',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_profunda');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_profunda() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: f.clave,
      nivel: f.nivel,
      ambito: f.ambito ?? 'base-de-datos',
      titulo: f.titulo,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-profunda',
  ambito: 'base-de-datos',
  descripcion:
    'Salud profunda de PostgreSQL: FKs sin índice, locks >5s, bloat, secuencias, RLS 100%, ' +
    'pool conexiones, crons, storage, VeriFactu SHA-256 y registros huérfanos',
  necesitaRed: true,
  ejecutar,
};
