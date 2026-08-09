// Motor de cálculo de comisiones. Fuente única de verdad.
//
// Lo usan dos consumidores muy distintos y por eso está en JavaScript puro:
//   1. La app (informes → simulador de comisiones), vía el bundle de Expo.
//   2. La landing pública /calculadora-comisiones, que es HTML estático y carga
//      este mismo fichero con <script type="module">.
// Si la lógica estuviera duplicada, la calculadora del marketing y la del
// producto acabarían dando números distintos. Eso es peor que no tenerla.
//
// Reglas que no se negocian, y el motivo:
//   - La comisión se calcula sobre la BASE SIN IVA. El IVA es de Hacienda.
//   - Las propinas NO son base comisionable: son íntegras del trabajador.
//   - El coste de empresa no es el sueldo: es el sueldo más la cuota patronal.

import {
  IVA_PCT,
  CUOTA_PATRONAL_PCT,
  SMI,
  PROPINAS_COMISIONABLES_POR_DEFECTO,
  AVISO_SUELO_SALARIAL,
} from './parametrosLegales.js';

/**
 * @typedef {'plano'|'tramos'|'categoria'} ModeloComision
 */

/**
 * Un tramo de facturación con su porcentaje.
 * @typedef {Object} Tramo
 * @property {number} desde       Euros de base sin IVA en los que empieza (incluido).
 * @property {number|null} hasta  Dónde acaba, o null para "de aquí en adelante".
 * @property {number} porcentaje
 */

/**
 * Lo que ha hecho un profesional en el periodo.
 * @typedef {Object} LineaEntrada
 * @property {string} nombre
 * @property {number} facturacion            Servicios facturados (sin propinas).
 * @property {number} [fijoMensual]          Salario fijo, si lo hay.
 * @property {number} [propinas]             Propinas recibidas. No comisionan.
 * @property {number} [porcentaje]           Sobrescribe el % global (modelo plano).
 * @property {Record<string, number>} [porCategoria]  Facturación por categoría.
 */

/**
 * @typedef {Object} ConfigComision
 * @property {ModeloComision} [modelo]
 * @property {number} [porcentaje]                     Para el modelo plano.
 * @property {Tramo[]} [tramos]                        Para el modelo por tramos.
 * @property {boolean} [tramosProgresivos]             Por defecto true (cada tramo a su tipo).
 * @property {Record<string, number>} [porcentajePorCategoria]
 * @property {number} [porcentajeCategoriaPorDefecto]  Para categorías sin % propio.
 * @property {boolean} [ivaIncluido]                   Si la facturación introducida lleva IVA. Por defecto true.
 * @property {number} [ivaPct]
 * @property {boolean} [propinasComisionables]
 * @property {boolean} [calcularCosteEmpresa]          Por defecto true.
 * @property {number} [cuotaPatronalPct]
 * @property {number} [salarioMinimoMensual]           Suelo con el que comparar.
 * @property {number} [gastosFijosSalon]               Alquiler, luz, productos... para el margen real.
 */

/**
 * @typedef {Object} LineaResultado
 * @property {string} nombre
 * @property {number} facturacion
 * @property {number} baseSinIva
 * @property {number} iva
 * @property {number} baseComisionable
 * @property {number} comision
 * @property {number} porcentajeEfectivo
 * @property {number} fijo
 * @property {number} propinas
 * @property {number} brutoTrabajador   Fijo + comisión (las propinas van aparte).
 * @property {number} costeEmpresa      Bruto + cuota patronal.
 * @property {number} seLlevaEnTotal    Lo que se lleva a casa contando propinas.
 * @property {string[]} avisos
 */

const redondea = (n) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const noNegativo = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Comisión por tramos.
 *
 * Progresivo (por defecto): cada porción de la facturación se paga a su tipo,
 * igual que el IRPF. Es lo justo y lo que la gente espera cuando dice "de 0 a
 * 2.000 el 25 % y de ahí para arriba el 35 %".
 *
 * No progresivo: toda la base se paga al tipo del tramo donde cae. Existe en el
 * mundo real, pero crea un salto brutal al cruzar el umbral.
 *
 * @param {number} base
 * @param {Tramo[]} tramos
 * @param {boolean} [progresivo]
 * @returns {{ comision: number, detalle: {desde:number, hasta:number|null, porcentaje:number, porcion:number, importe:number}[] }}
 */
export function comisionPorTramos(base, tramos, progresivo = true) {
  const b = noNegativo(base);
  const orden = [...(tramos || [])]
    .filter((t) => t && Number.isFinite(t.porcentaje))
    .sort((a, b2) => (a.desde || 0) - (b2.desde || 0));

  if (orden.length === 0 || b === 0) return { comision: 0, detalle: [] };

  if (!progresivo) {
    // El tramo donde cae la base: el último cuyo `desde` no la supera.
    let elegido = orden[0];
    for (const t of orden) if (b >= (t.desde || 0)) elegido = t;
    const importe = redondea((b * elegido.porcentaje) / 100);
    return {
      comision: importe,
      detalle: [{ desde: elegido.desde || 0, hasta: elegido.hasta ?? null, porcentaje: elegido.porcentaje, porcion: b, importe }],
    };
  }

  const detalle = [];
  let total = 0;
  for (const t of orden) {
    const desde = noNegativo(t.desde);
    if (b <= desde) break;
    const hasta = t.hasta === null || t.hasta === undefined ? Infinity : t.hasta;
    const porcion = Math.min(b, hasta) - desde;
    if (porcion <= 0) continue;
    const importe = (porcion * t.porcentaje) / 100;
    total += importe;
    detalle.push({
      desde,
      hasta: t.hasta ?? null,
      porcentaje: t.porcentaje,
      porcion: redondea(porcion),
      importe: redondea(importe),
    });
  }
  return { comision: redondea(total), detalle };
}

/**
 * Comisión con un porcentaje distinto por categoría de servicio (corte, color,
 * tratamiento...). Un color deja mucho más margen que un corte, y muchos salones
 * pagan distinto por eso.
 *
 * @param {Record<string, number>} porCategoria  Categoría -> base sin IVA.
 * @param {Record<string, number>} porcentajes   Categoría -> %.
 * @param {number} porDefecto
 */
export function comisionPorCategoria(porCategoria, porcentajes, porDefecto = 0) {
  let total = 0;
  const detalle = [];
  for (const [categoria, base] of Object.entries(porCategoria || {})) {
    const b = noNegativo(base);
    if (b === 0) continue;
    const pct = Number.isFinite(porcentajes?.[categoria]) ? porcentajes[categoria] : porDefecto;
    const importe = (b * pct) / 100;
    total += importe;
    detalle.push({ categoria, base: redondea(b), porcentaje: pct, importe: redondea(importe) });
  }
  return { comision: redondea(total), detalle };
}

/**
 * Cálculo completo: por profesional y en total, con el margen del salón.
 *
 * @param {LineaEntrada[]} lineas
 * @param {ConfigComision} [config]
 */
export function calcularComisiones(lineas, config = {}) {
  const modelo = config.modelo || 'plano';
  const ivaPct = Number.isFinite(config.ivaPct) ? config.ivaPct : IVA_PCT;
  const ivaIncluido = config.ivaIncluido !== false;
  const propinasComisionables = config.propinasComisionables ?? PROPINAS_COMISIONABLES_POR_DEFECTO;
  const calcularCoste = config.calcularCosteEmpresa !== false;
  const cuotaPatronalPct = Number.isFinite(config.cuotaPatronalPct) ? config.cuotaPatronalPct : CUOTA_PATRONAL_PCT;
  const suelo = Number.isFinite(config.salarioMinimoMensual) ? config.salarioMinimoMensual : SMI.mensual12Pagas;

  /** @type {{nivel: 'aviso'|'info', texto: string}[]} */
  const avisos = [];

  if (modelo === 'tramos') {
    const t = [...(config.tramos || [])].sort((a, b) => (a.desde || 0) - (b.desde || 0));
    if (t.length === 0) {
      avisos.push({ nivel: 'aviso', texto: 'Has elegido comisión por tramos pero no hay ningún tramo definido: la comisión sale a cero.' });
    } else {
      if (noNegativo(t[0].desde) > 0) {
        avisos.push({ nivel: 'aviso', texto: `El primer tramo empieza en ${t[0].desde} € , así que lo facturado por debajo de esa cifra no genera comisión. Si no es lo que quieres, empieza el primer tramo en 0.` });
      }
      for (let i = 1; i < t.length; i++) {
        const finAnterior = t[i - 1].hasta;
        if (finAnterior !== null && finAnterior !== undefined && noNegativo(t[i].desde) > finAnterior) {
          avisos.push({ nivel: 'aviso', texto: `Hay un hueco entre ${finAnterior} € y ${t[i].desde} €: lo que caiga ahí no comisiona.` });
        }
      }
    }
  }

  /** @type {LineaResultado[]} */
  const resultado = (lineas || []).map((l) => {
    const facturacion = noNegativo(l.facturacion);
    const propinas = noNegativo(l.propinas);
    const fijo = noNegativo(l.fijoMensual);

    // El IVA fuera ANTES de comisionar. Este es el punto que casi todo el mundo
    // se salta y donde se regala dinero de Hacienda.
    const baseSinIva = ivaIncluido ? facturacion / (1 + ivaPct / 100) : facturacion;
    const iva = ivaIncluido ? facturacion - baseSinIva : facturacion * (ivaPct / 100);
    const baseComisionable = baseSinIva + (propinasComisionables ? propinas : 0);

    const avisosLinea = [];
    let comision = 0;

    if (modelo === 'tramos') {
      comision = comisionPorTramos(baseComisionable, config.tramos || [], config.tramosProgresivos !== false).comision;
    } else if (modelo === 'categoria') {
      const cats = l.porCategoria || {};
      const hayCategorias = Object.keys(cats).length > 0;
      if (!hayCategorias) {
        avisosLinea.push('No hay reparto por categorías para esta persona, así que se le aplica el porcentaje general.');
        comision = (baseComisionable * noNegativo(l.porcentaje ?? config.porcentaje)) / 100;
      } else {
        // Las categorías vienen con el importe tal como se factura; hay que
        // quitarles el IVA igual que a la facturación total.
        const catsSinIva = {};
        for (const [k, v] of Object.entries(cats)) {
          catsSinIva[k] = ivaIncluido ? noNegativo(v) / (1 + ivaPct / 100) : noNegativo(v);
        }
        const sumaCats = Object.values(catsSinIva).reduce((a, b) => a + b, 0);
        // Si el desglose no cuadra con el total, se dice en vez de callarlo.
        if (Math.abs(sumaCats - baseSinIva) > Math.max(1, baseSinIva * 0.01)) {
          avisosLinea.push(`El desglose por categorías suma ${redondea(sumaCats)} € y la facturación total ${redondea(baseSinIva)} € (sin IVA). Revisa el reparto.`);
        }
        comision = comisionPorCategoria(
          catsSinIva,
          config.porcentajePorCategoria || {},
          noNegativo(config.porcentajeCategoriaPorDefecto ?? config.porcentaje),
        ).comision;
      }
    } else {
      const pct = noNegativo(l.porcentaje ?? config.porcentaje);
      if (pct > 60) {
        avisosLinea.push(`Un ${pct} % de comisión es altísimo para el sector: comprueba que el salón sigue cubriendo sus gastos.`);
      }
      comision = (baseComisionable * pct) / 100;
    }

    comision = redondea(comision);
    const brutoTrabajador = redondea(fijo + comision);
    const costeEmpresa = calcularCoste
      ? redondea(brutoTrabajador * (1 + cuotaPatronalPct / 100))
      : brutoTrabajador;

    if (suelo > 0 && brutoTrabajador > 0 && brutoTrabajador < suelo) {
      avisosLinea.push(AVISO_SUELO_SALARIAL);
    }

    return {
      nombre: l.nombre,
      facturacion: redondea(facturacion),
      baseSinIva: redondea(baseSinIva),
      iva: redondea(iva),
      baseComisionable: redondea(baseComisionable),
      comision,
      porcentajeEfectivo: baseSinIva > 0 ? redondea((comision / baseSinIva) * 100) : 0,
      fijo: redondea(fijo),
      propinas: redondea(propinas),
      brutoTrabajador,
      costeEmpresa,
      seLlevaEnTotal: redondea(brutoTrabajador + propinas),
      avisos: avisosLinea,
    };
  });

  const suma = (f) => redondea(resultado.reduce((s, l) => s + f(l), 0));
  const baseSinIvaTotal = suma((l) => l.baseSinIva);
  const costeEmpresaTotal = suma((l) => l.costeEmpresa);
  const gastosFijos = noNegativo(config.gastosFijosSalon);
  const margenSalon = redondea(baseSinIvaTotal - costeEmpresaTotal - gastosFijos);

  if (margenSalon < 0) {
    avisos.push({ nivel: 'aviso', texto: 'Con estos números el salón pierde dinero: lo que pagas al equipo (más su cuota patronal) supera lo que factura sin IVA.' });
  }

  return {
    lineas: resultado,
    totales: {
      facturacion: suma((l) => l.facturacion),
      baseSinIva: baseSinIvaTotal,
      iva: suma((l) => l.iva),
      comisiones: suma((l) => l.comision),
      fijos: suma((l) => l.fijo),
      propinas: suma((l) => l.propinas),
      brutoTrabajadores: suma((l) => l.brutoTrabajador),
      costeEmpresa: costeEmpresaTotal,
      /** Lo que la cuota patronal añade por encima del bruto. */
      cuotaPatronal: redondea(costeEmpresaTotal - suma((l) => l.brutoTrabajador)),
      gastosFijos: redondea(gastosFijos),
      margenSalon,
      margenPct: baseSinIvaTotal > 0 ? redondea((margenSalon / baseSinIvaTotal) * 100) : 0,
      /**
       * Lo que cuesta subir la comisión UN punto porcentual, con su cuota
       * patronal incluida. Es la cifra que de verdad quiere saber quien está
       * negociando con su equipo.
       */
      costePorPuntoDeComision: redondea(
        (baseSinIvaTotal / 100) * (calcularCoste ? 1 + cuotaPatronalPct / 100 : 1),
      ),
      cuotaPatronalPct,
      ivaPct,
    },
    avisos,
  };
}

/**
 * Modelo de alquiler de sillón: el profesional es autónomo y factura al salón (o
 * el salón le factura el puesto). No hay comisión ni cuota patronal.
 *
 * @param {{ alquilerMensual: number, facturacionProfesional?: number, ivaPct?: number, retencionIrpfPct?: number }} datos
 */
export function calcularAlquilerSillon(datos) {
  const alquiler = noNegativo(datos.alquilerMensual);
  const ivaPct = Number.isFinite(datos.ivaPct) ? datos.ivaPct : IVA_PCT;
  const retencionPct = noNegativo(datos.retencionIrpfPct);
  const iva = redondea((alquiler * ivaPct) / 100);
  const retencion = redondea((alquiler * retencionPct) / 100);
  const facturacionProfesional = noNegativo(datos.facturacionProfesional);
  const baseProfesional = facturacionProfesional / (1 + ivaPct / 100);

  return {
    alquilerBase: redondea(alquiler),
    iva,
    retencion,
    /** Lo que el salón cobra de caja por el puesto. */
    totalFactura: redondea(alquiler + iva - retencion),
    /** Lo que le queda al profesional después de pagar el puesto. */
    quedaAlProfesional: facturacionProfesional > 0 ? redondea(baseProfesional - alquiler) : null,
    /** % de su facturación que se le va en el alquiler: comparable con una comisión. */
    equivalenteEnComisionPct: baseProfesional > 0 ? redondea((alquiler / baseProfesional) * 100) : null,
  };
}
