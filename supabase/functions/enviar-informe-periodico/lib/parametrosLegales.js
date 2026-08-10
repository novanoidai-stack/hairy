// Parámetros legales del cálculo de comisiones, TODOS en un solo sitio.
//
// Por qué están aquí y no repartidos por el código: son cifras que cambian cada
// enero y que pueden acabar en una nómina. Juntas, fechadas y con su fuente, un
// asesor puede revisarlas sin leer la lógica, y actualizarlas es cambiar un
// número en un fichero.
//
// AVISO: esto es un cálculo orientativo, no asesoramiento fiscal ni laboral.
//
// JavaScript puro (no TypeScript) a propósito: este mismo fichero lo importa la
// app (a través del bundle de Expo) y lo carga la landing pública estática con
// <script type="module">. Una sola fuente de verdad para los dos.

/** Fecha a la que están comprobadas estas cifras. Si lees esto un año después, revísalas. */
export const VIGENCIA = '2026';

/**
 * IVA de peluquería, barbería y estética.
 *
 * Es el tipo general del 21 % desde 2012 (subió desde el 8 %). El sector pide la
 * bajada al 10 % desde entonces y no se ha aprobado.
 *
 * IMPORTANTE: la comisión se calcula SIEMPRE sobre la base sin IVA. El IVA no es
 * dinero del salón, es de Hacienda. Calcular el 30 % sobre el precio con IVA es
 * el error más común del sector y significa regalar dinero.
 */
export const IVA_PCT = 21;

/**
 * Salario mínimo interprofesional 2026.
 * Real Decreto 126/2026, de 18 de febrero (BOE-A-2026-3815): 1.221 € brutos
 * mensuales en 14 pagas, 17.094 € anuales.
 */
export const SMI = {
  anio: 2026,
  mensual14Pagas: 1221,
  anual: 17094,
  /** El equivalente en 12 pagas, que es como se suele razonar un sueldo mensual. */
  mensual12Pagas: 1424.5,
  norma: 'Real Decreto 126/2026 (BOE-A-2026-3815)',
};

/**
 * Cotización a cargo de la EMPRESA, en % sobre la base, para un contrato
 * indefinido. Orden PJC/297/2026, de 30 de marzo (efectos desde 1-1-2026).
 *
 * El error habitual es mirar solo contingencias comunes y olvidar MEI, FOGASA y
 * formación. Por eso va desglosado: para que se vea de dónde sale el total.
 */
export const COTIZACION_EMPRESA = {
  contingenciasComunes: 23.6,
  desempleoIndefinido: 5.5,
  /** Los contratos de duración determinada cotizan más por desempleo. */
  desempleoTemporal: 6.7,
  fogasa: 0.2,
  formacionProfesional: 0.6,
  /** Mecanismo de Equidad Intergeneracional. */
  mei: 0.75,
  /**
   * Accidentes de trabajo y enfermedades profesionales. Va por actividad (CNAE).
   * Desde 1-1-2026 se aplica la CNAE-2025: el antiguo 9602 se desdobló, y
   * "9621 Peluquerías y barberías" queda en 1,50 % (0,80 IT + 0,70 IMS).
   * Real Decreto-ley 16/2025, disposición final primera (tarifa de la DA 61ª LGSS).
   */
  accidentesPeluqueria: 1.5,
  norma: 'Orden PJC/297/2026 + RDL 16/2025 (tarifa AT/EP, CNAE-2025 9621)',
};

/**
 * Total de cuota patronal para una peluquería con contrato indefinido.
 * ~32 %: por cada 1.000 € de sueldo bruto, la empresa paga unos 1.320 €.
 */
export const CUOTA_PATRONAL_PCT = Number(
  (
    COTIZACION_EMPRESA.contingenciasComunes +
    COTIZACION_EMPRESA.desempleoIndefinido +
    COTIZACION_EMPRESA.fogasa +
    COTIZACION_EMPRESA.formacionProfesional +
    COTIZACION_EMPRESA.mei +
    COTIZACION_EMPRESA.accidentesPeluqueria
  ).toFixed(2),
);

/** Desglose listo para pintar, para que el número no parezca sacado de la manga. */
export const DESGLOSE_CUOTA_PATRONAL = [
  { concepto: 'Contingencias comunes', pct: COTIZACION_EMPRESA.contingenciasComunes },
  { concepto: 'Desempleo (indefinido)', pct: COTIZACION_EMPRESA.desempleoIndefinido },
  { concepto: 'Accidentes y enfermedad profesional (peluquería)', pct: COTIZACION_EMPRESA.accidentesPeluqueria },
  { concepto: 'Formación profesional', pct: COTIZACION_EMPRESA.formacionProfesional },
  { concepto: 'MEI', pct: COTIZACION_EMPRESA.mei },
  { concepto: 'FOGASA', pct: COTIZACION_EMPRESA.fogasa },
];

/**
 * Alquiler de sillón: el profesional no es empleado, es autónomo y factura.
 * Cambia el cálculo por completo (no hay comisión ni cuota patronal: hay una
 * factura con IVA).
 *
 * Sobre la retención de IRPF: el 15 % (7 % los tres primeros años de alta) es lo
 * habitual en actividades PROFESIONALES, pero la peluquería suele encuadrarse
 * como actividad empresarial (sección 1ª del IAE) y entonces NO se practica
 * retención en factura. Por eso el valor por defecto es 0 y se deja configurable
 * con el aviso correspondiente: aquí no hay una respuesta única.
 */
export const ALQUILER_SILLON = {
  ivaPct: IVA_PCT,
  retencionIrpfPorDefecto: 0,
  retencionProfesionalGeneral: 15,
  retencionProfesionalNuevo: 7,
  nota: 'En peluquería el epígrafe suele ser empresarial (sección 1ª del IAE) y entonces no se retiene en factura. Confírmalo con tu asesor antes de aplicar retención.',
};

/**
 * Propinas: son íntegras del trabajador, no facturación del salón, y por tanto no
 * forman parte de la base comisionable. Tributan como rendimiento del trabajo del
 * empleado.
 */
export const PROPINAS_COMISIONABLES_POR_DEFECTO = false;

/** Aviso legal que debe ir visible en cualquier pantalla que use este cálculo. */
export const AVISO_LEGAL =
  'Cálculo orientativo con los parámetros vigentes en ' + VIGENCIA + '. No es ' +
  'asesoramiento fiscal ni laboral. Los mínimos de tu convenio provincial de ' +
  'peluquería y estética pueden ser superiores al SMI, y la cuota de accidentes ' +
  'depende de tu actividad concreta. Contrástalo con tu asesor antes de aplicarlo ' +
  'a una nómina.';

/**
 * La comisión es un COMPLEMENTO del salario, no lo sustituye. Este texto es el
 * que se muestra cuando el resultado deja al profesional por debajo del mínimo.
 */
export const AVISO_SUELO_SALARIAL =
  'Este resultado deja al profesional por debajo del salario mínimo. La comisión ' +
  'es un complemento y no puede sustituir al salario base: hay que garantizar el ' +
  'mínimo de tu convenio (que suele ser superior al SMI) con independencia de lo ' +
  'que salga por comisión.';
