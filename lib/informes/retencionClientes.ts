// Retención y fidelización de clientes: las cuentas que dicen si un salón está
// mejorando de verdad.
//
// Por qué existe: informes medía la retención con "días medios entre visitas
// dentro del periodo elegido". Con el filtro en "semana" ese número era ruido
// (no caben dos visitas del mismo cliente en siete días) y, sobre todo, no
// respondía a la pregunta que importa: ¿cuántos clientes consigo fidelizar y esa
// base crece o se encoge?
//
// Todo se calcula sobre el HISTÓRICO (13 meses), no sobre el periodo del filtro.
// Módulo puro y sin dependencias: `deno test lib/informes/retencionClientes.test.ts`.

import { mediana as medianaDe, media as mediaDe } from './lecturaSerie.ts';
import type { PuntoSerie } from './lecturaSerie.ts';

/** Una visita ya cumplida. El histórico se pide con estas cuatro cosas y nada más. */
export interface VisitaHistorica {
  clienteId: string;
  fecha: Date;
  servicioId?: string | null;
}

/**
 * Cuántos días sin volver damos por "todavía es cliente". 90 días cubre hasta el
 * ciclo más lento del sector (un color cada dos meses y medio con retraso).
 */
export const VENTANA_ACTIVO_DIAS = 90;

/** Visitas mínimas para considerar que un cliente está fidelizado, no de paso. */
export const MIN_VISITAS_FIDELIZADO = 2;

/** Visitas a partir de las cuales el cliente ya es del salón. */
export const MIN_VISITAS_FIEL = 3;

const DIA_MS = 86400000;

// --- Utilidades de calendario (sin date-fns, que este módulo es puro) --------

export function inicioMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function finMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function sumarMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
}

/** Clave de mes comparable y ordenable. */
export function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Agrupa las visitas por cliente y las deja ordenadas de más antigua a más nueva. */
export function visitasPorCliente(visitas: VisitaHistorica[]): Map<string, VisitaHistorica[]> {
  const porCliente = new Map<string, VisitaHistorica[]>();
  for (const v of visitas) {
    if (!v.clienteId) continue;
    const lista = porCliente.get(v.clienteId);
    if (lista) lista.push(v);
    else porCliente.set(v.clienteId, [v]);
  }
  for (const lista of porCliente.values()) {
    lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }
  return porCliente;
}

// ---------------------------------------------------------------------------
// B1. Base fidelizada mes a mes
// ---------------------------------------------------------------------------

/**
 * Serie mensual de la base fidelizada: al cierre de cada mes, cuántos clientes
 * habían venido ya al menos `minVisitas` veces Y seguían vivos (última visita
 * dentro de la ventana de actividad).
 *
 * Es la curva que mide si el salón mejora: los clientes que consigue retener, no
 * los que entran por la puerta una vez.
 */
export function serieBaseFidelizada(
  visitas: VisitaHistorica[],
  opts: { meses: number; hasta: Date; ventanaActivaDias?: number; minVisitas?: number },
): PuntoSerie[] {
  const { meses, hasta } = opts;
  const ventana = opts.ventanaActivaDias ?? VENTANA_ACTIVO_DIAS;
  const minVisitas = opts.minVisitas ?? MIN_VISITAS_FIDELIZADO;
  if (meses <= 0) return [];

  const porCliente = visitasPorCliente(visitas);
  const serie: PuntoSerie[] = [];

  for (let k = meses - 1; k >= 0; k--) {
    const mes = sumarMeses(inicioMes(hasta), -k);
    const cierre = finMes(mes);
    let cuenta = 0;

    for (const lista of porCliente.values()) {
      // Solo lo que ya había pasado al cerrar ese mes: la serie no puede usar
      // información del futuro o los meses antiguos saldrían inflados.
      let hechas = 0;
      let ultima = 0;
      for (const v of lista) {
        const t = v.fecha.getTime();
        if (t > cierre.getTime()) break; // la lista viene ordenada
        hechas++;
        ultima = t;
      }
      if (hechas < minVisitas) continue;
      if ((cierre.getTime() - ultima) / DIA_MS > ventana) continue;
      cuenta++;
    }

    serie.push({ fecha: mes, valor: cuenta });
  }

  return serie;
}

// ---------------------------------------------------------------------------
// B2. Embudo: de dónde sale esa base
// ---------------------------------------------------------------------------

export interface EmbudoFidelizacion {
  /** Clientes cuya PRIMERA visita de la historia cae en el periodo. */
  nuevos: number;
  /** De esos, cuántos han vuelto alguna segunda vez (en cualquier momento). */
  volvieron: number;
  /** De esos, cuántos han llegado a 3 visitas o más. */
  fieles: number;
  /** % de nuevos que vuelven. La conversión que de verdad manda. */
  pctVuelven: number;
  /** % de nuevos que acaban siendo fieles. */
  pctFieles: number;
}

export function embudoFidelizacion(
  visitas: VisitaHistorica[],
  opts: { desde: Date; hasta: Date },
): EmbudoFidelizacion {
  const porCliente = visitasPorCliente(visitas);
  let nuevos = 0, volvieron = 0, fieles = 0;

  for (const lista of porCliente.values()) {
    const primera = lista[0].fecha.getTime();
    if (primera < opts.desde.getTime() || primera > opts.hasta.getTime()) continue;
    nuevos++;
    if (lista.length >= 2) volvieron++;
    if (lista.length >= MIN_VISITAS_FIEL) fieles++;
  }

  return {
    nuevos, volvieron, fieles,
    pctVuelven: nuevos > 0 ? (volvieron / nuevos) * 100 : 0,
    pctFieles: nuevos > 0 ? (fieles / nuevos) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// B3. Cohortes
// ---------------------------------------------------------------------------

export interface Cohorte {
  /** Mes de entrada (primera visita) de este grupo. */
  mes: Date;
  /** Cuántos clientes estrenaron el salón ese mes. */
  tamano: number;
  /**
   * Retención por meses transcurridos. `retencion[0]` es el mes siguiente al de
   * entrada. `null` cuando ese mes todavía no ha llegado: pintar un 0 ahí sería
   * mentir (no es que no volvieran, es que aún no han tenido ocasión).
   */
  retencion: (number | null)[];
}

export interface Cohortes {
  cohortes: Cohorte[];
  /** Cuántas columnas de "meses después" tiene la tabla. */
  offsets: number;
}

/**
 * Tabla de cohortes: de los que entraron en marzo, qué porcentaje seguía
 * viniendo un mes después, dos meses después, etc.
 */
export function cohortesRetencion(
  visitas: VisitaHistorica[],
  opts: { meses: number; hasta: Date; offsets?: number },
): Cohortes {
  const { meses, hasta } = opts;
  const offsets = opts.offsets ?? 6;
  if (meses <= 0) return { cohortes: [], offsets };

  const porCliente = visitasPorCliente(visitas);
  const mesActual = inicioMes(hasta);

  // Cliente -> meses en los que vino (para no recorrer la lista una vez por celda).
  const mesesConVisita = new Map<string, Set<string>>();
  const mesEntrada = new Map<string, Date>();
  for (const [clienteId, lista] of porCliente) {
    mesEntrada.set(clienteId, inicioMes(lista[0].fecha));
    const set = new Set<string>();
    for (const v of lista) set.add(claveMes(v.fecha));
    mesesConVisita.set(clienteId, set);
  }

  const cohortes: Cohorte[] = [];
  for (let k = meses - 1; k >= 0; k--) {
    const mes = sumarMeses(mesActual, -k);
    const clave = claveMes(mes);
    const miembros = [...mesEntrada.entries()]
      .filter(([, entrada]) => claveMes(entrada) === clave)
      .map(([clienteId]) => clienteId);

    const retencion: (number | null)[] = [];
    for (let off = 1; off <= offsets; off++) {
      const mesObjetivo = sumarMeses(mes, off);
      if (mesObjetivo.getTime() > mesActual.getTime()) {
        retencion.push(null);
        continue;
      }
      if (miembros.length === 0) {
        retencion.push(null);
        continue;
      }
      const claveObj = claveMes(mesObjetivo);
      const volvieron = miembros.filter((c) => mesesConVisita.get(c)!.has(claveObj)).length;
      retencion.push((volvieron / miembros.length) * 100);
    }

    cohortes.push({ mes, tamano: miembros.length, retencion });
  }

  return { cohortes, offsets };
}

/**
 * Traduce la tabla de cohortes a una frase. Sin esto, el mapa de calor solo lo
 * entiende quien ya sabía lo que es una cohorte.
 */
export function frasesCohortes(c: Cohortes): string {
  // Se promedian solo las cohortes con datos reales y con gente dentro.
  const conDatos = c.cohortes.filter((x) => x.tamano > 0);
  if (conDatos.length === 0) return 'Todavía no hay clientes nuevos suficientes para medir cohortes.';

  const mediaOffset = (off: number): number | null => {
    const vals = conDatos.map((x) => x.retencion[off]).filter((v): v is number => v !== null);
    return vals.length > 0 ? mediaDe(vals) : null;
  };

  const mes1 = mediaOffset(0);
  const mes6 = mediaOffset(5);
  if (mes1 === null) return 'Las cohortes son demasiado recientes: hace falta al menos un mes cumplido para medir si vuelven.';

  const deCada10 = Math.round((mes1 / 100) * 10);
  let frase = `De cada 10 clientes nuevos, ${deCada10} vuelven al mes siguiente.`;
  if (mes6 !== null) {
    frase += ` Al medio año siguen viniendo ${Math.round((mes6 / 100) * 10)} de cada 10.`;
  }
  frase += mes1 >= 40
    ? ' Es una buena señal: el salón engancha a la primera.'
    : ' Ahí está tu mayor palanca: quien no vuelve el primer mes, casi nunca vuelve.';
  return frase;
}

// ---------------------------------------------------------------------------
// A6. Cada cuánto vuelven
// ---------------------------------------------------------------------------

export interface FrecuenciaGrupo {
  mediaDias: number;
  medianaDias: number;
  /** Número de intervalos medidos, no de clientes. */
  intervalos: number;
}

export interface FrecuenciaRetorno {
  global: FrecuenciaGrupo;
  /** Clientes con 3 visitas o más: los que ya son del salón. */
  fieles: FrecuenciaGrupo;
  /** Clientes con exactamente 2 visitas: han vuelto una vez y no más. */
  ocasionales: FrecuenciaGrupo;
  /** Por servicio, ordenado de ciclo más largo a más corto. Solo con muestra suficiente. */
  porServicio: { servicioId: string; medianaDias: number; intervalos: number }[];
  /**
   * Fichas descartadas por no ser una persona: ver `minDiasCicloCliente`.
   * Se expone para poder decirlo en pantalla en vez de callar un descarte.
   */
  fichasDescartadas: number;
}

/**
 * Por debajo de este ciclo, una ficha no es un cliente: es un cajón.
 *
 * En producción hay fichas con más de 200 visitas completadas y varias el mismo
 * día: son las que se usan para atender sin cita, donde se acumulan las visitas
 * de mucha gente distinta. Si entran en el cálculo, arrastran la mediana del
 * salón a 1 día y el titular ("tus clientes vuelven cada X días") queda
 * inservible.
 */
export const MIN_DIAS_CICLO_CLIENTE = 2;

const GRUPO_VACIO: FrecuenciaGrupo = { mediaDias: 0, medianaDias: 0, intervalos: 0 };

function grupo(gaps: number[]): FrecuenciaGrupo {
  if (gaps.length === 0) return { ...GRUPO_VACIO };
  return { mediaDias: mediaDe(gaps), medianaDias: medianaDe(gaps), intervalos: gaps.length };
}

/**
 * Días entre visitas consecutivas del mismo cliente.
 *
 * Se devuelven media Y mediana porque no dicen lo mismo: un cliente que reaparece
 * tras 400 días sube la media y hace creer que el salón va peor de lo que va. La
 * mediana es el número honesto.
 *
 * `minIntervalosServicio` evita anunciar "los de color vuelven cada 45 días"
 * cuando eso sale de dos intervalos sueltos.
 */
export function frecuenciaRetorno(
  visitas: VisitaHistorica[],
  opts: { minIntervalosServicio?: number; minDiasCicloCliente?: number } = {},
): FrecuenciaRetorno {
  const minIntervalosServicio = opts.minIntervalosServicio ?? 4;
  const minDiasCiclo = opts.minDiasCicloCliente ?? MIN_DIAS_CICLO_CLIENTE;
  const porCliente = visitasPorCliente(visitas);
  let fichasDescartadas = 0;

  const todos: number[] = [];
  const deFieles: number[] = [];
  const deOcasionales: number[] = [];
  const porServicio = new Map<string, number[]>();

  for (const lista of porCliente.values()) {
    if (lista.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < lista.length; i++) {
      const dias = (lista[i].fecha.getTime() - lista[i - 1].fecha.getTime()) / DIA_MS;
      // Dos servicios el mismo día son una visita, no un retorno.
      if (dias < 1) continue;
      gaps.push(dias);
    }
    if (gaps.length === 0) continue;

    // Descarte de las fichas que no son una persona (ver MIN_DIAS_CICLO_CLIENTE).
    if (medianaDe(gaps) < minDiasCiclo) {
      fichasDescartadas++;
      continue;
    }

    todos.push(...gaps);
    if (lista.length >= MIN_VISITAS_FIEL) deFieles.push(...gaps);
    else deOcasionales.push(...gaps);

    // Por servicio: intervalos entre visitas consecutivas EN LAS QUE se hizo ese
    // servicio. Un corte y un color tienen ciclos biológicos distintos y
    // mezclarlos da una media que no sirve para nada.
    const fechasPorServicio = new Map<string, number[]>();
    for (const v of lista) {
      if (!v.servicioId) continue;
      const arr = fechasPorServicio.get(v.servicioId);
      if (arr) arr.push(v.fecha.getTime());
      else fechasPorServicio.set(v.servicioId, [v.fecha.getTime()]);
    }
    for (const [srvId, fechas] of fechasPorServicio) {
      for (let i = 1; i < fechas.length; i++) {
        const dias = (fechas[i] - fechas[i - 1]) / DIA_MS;
        if (dias < 1) continue;
        const arr = porServicio.get(srvId);
        if (arr) arr.push(dias);
        else porServicio.set(srvId, [dias]);
      }
    }
  }

  const servicios = [...porServicio.entries()]
    .filter(([, gaps]) => gaps.length >= minIntervalosServicio)
    .map(([servicioId, gaps]) => ({
      servicioId,
      medianaDias: medianaDe(gaps),
      intervalos: gaps.length,
    }))
    .sort((a, b) => b.medianaDias - a.medianaDias);

  return {
    global: grupo(todos),
    fieles: grupo(deFieles),
    ocasionales: grupo(deOcasionales),
    porServicio: servicios,
    fichasDescartadas,
  };
}

/**
 * Frecuencia de retorno de UN cliente, con la misma definición que usa
 * `clientes.frecuencia_dias` en la base de datos: media de los últimos
 * `maxIntervalos` intervalos entre visitas completadas, y hace falta un mínimo de
 * visitas para que salga un número.
 *
 * Existe porque ese campo lo rellena un job (`procesar_alertas_fuga`) que hoy no
 * está programado, así que en la ficha de cliente casi siempre está a null.
 * Calcularlo aquí hace que el dato se vea desde el primer día, y como sigue la
 * misma definición, cuando el job corra las dos cifras coincidirán.
 *
 * Devuelve null si no hay suficientes visitas, en vez de un cero enganoso.
 */
export function frecuenciaDiasCliente(
  fechas: Date[],
  opts: { maxIntervalos?: number; minVisitas?: number } = {},
): number | null {
  const maxIntervalos = opts.maxIntervalos ?? 6;
  const minVisitas = opts.minVisitas ?? MIN_VISITAS_FIEL;
  if (fechas.length < minVisitas) return null;

  const orden = [...fechas].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < orden.length; i++) {
    const dias = (orden[i].getTime() - orden[i - 1].getTime()) / DIA_MS;
    // Dos servicios el mismo dia son una visita, no un retorno.
    if (dias < 1) continue;
    gaps.push(dias);
  }
  if (gaps.length === 0) return null;

  const ultimos = gaps.slice(-maxIntervalos);
  return Math.round(mediaDe(ultimos));
}

/**
 * Frase de la frecuencia de retorno. Menciona la diferencia entre media y
 * mediana solo cuando es grande, que es cuando hay algo que explicar.
 *
 * `nombreServicio` resuelve el id; si no se pasa, no se habla de servicios.
 */
export function fraseFrecuencia(
  f: FrecuenciaRetorno,
  nombreServicio?: (id: string) => string | undefined,
): string {
  if (f.global.intervalos === 0) {
    return 'Todavía no hay clientes con dos visitas, así que no se puede medir cada cuánto vuelven.';
  }

  const mdn = Math.round(f.global.medianaDias);
  const med = Math.round(f.global.mediaDias);
  const partes: string[] = [];

  // Una diferencia de más del 20% entre media y mediana significa que hay
  // reapariciones tardías tirando de la media.
  if (med > mdn * 1.2) {
    partes.push(`Tus clientes vuelven cada ${mdn} días (la media sale ${med} porque hay reapariciones sueltas que la estiran).`);
  } else {
    partes.push(`Tus clientes vuelven cada ${mdn} días de media.`);
  }

  if (f.fieles.intervalos > 0 && f.ocasionales.intervalos > 0) {
    partes.push(`Los que ya son del salón vuelven cada ${Math.round(f.fieles.medianaDias)}; los que solo han venido dos veces, cada ${Math.round(f.ocasionales.medianaDias)}.`);
  }

  if (nombreServicio && f.porServicio.length >= 2) {
    const lento = f.porServicio[0];
    const rapido = f.porServicio[f.porServicio.length - 1];
    const nLento = nombreServicio(lento.servicioId);
    const nRapido = nombreServicio(rapido.servicioId);
    if (nLento && nRapido && nLento !== nRapido) {
      partes.push(`Por servicio: ${nLento} cada ${Math.round(lento.medianaDias)} días y ${nRapido} cada ${Math.round(rapido.medianaDias)}.`);
    }
  }

  // El umbral de fuga que ya usa el aviso automático es frecuencia x 1,4.
  partes.push(`Con ese ciclo, un cliente que lleve más de ${Math.round(mdn * 1.4)} días sin aparecer ya se está yendo.`);

  return partes.join(' ');
}
