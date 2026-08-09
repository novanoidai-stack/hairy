// Tests del motor de comisiones.
// Ejecutar: deno test lib/comisiones/motor.test.js
import { assert, assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularComisiones, comisionPorTramos, comisionPorCategoria, calcularAlquilerSillon } from './motor.js';
import { IVA_PCT, CUOTA_PATRONAL_PCT, SMI } from './parametrosLegales.js';

// --- Parametros legales -----------------------------------------------------

Deno.test('el IVA de peluqueria es el 21 %', () => {
  assertEquals(IVA_PCT, 21);
});

Deno.test('la cuota patronal suma los seis conceptos, no solo contingencias comunes', () => {
  // 23,60 + 5,50 + 1,50 + 0,60 + 0,75 + 0,20 = 32,15
  assertEquals(CUOTA_PATRONAL_PCT, 32.15);
});

Deno.test('el SMI en 12 pagas es coherente con el anual', () => {
  assertAlmostEquals(SMI.mensual12Pagas * 12, SMI.anual, 1);
  assertAlmostEquals(SMI.mensual14Pagas * 14, SMI.anual, 1);
});

// --- El error del IVA -------------------------------------------------------

Deno.test('la comision se calcula sobre la base SIN IVA, no sobre el precio con IVA', () => {
  // 1.210 € facturados con IVA = 1.000 € de base. El 30 % son 300 €, no 363 €.
  const r = calcularComisiones([{ nombre: 'Laura', facturacion: 1210 }], { porcentaje: 30 });
  assertAlmostEquals(r.lineas[0].baseSinIva, 1000, 0.5);
  assertAlmostEquals(r.lineas[0].comision, 300, 0.5);
  assertAlmostEquals(r.lineas[0].iva, 210, 0.5);
});

Deno.test('si la facturacion se introduce ya sin IVA no se le quita dos veces', () => {
  const r = calcularComisiones([{ nombre: 'Laura', facturacion: 1000 }], { porcentaje: 30, ivaIncluido: false });
  assertAlmostEquals(r.lineas[0].baseSinIva, 1000, 0.01);
  assertAlmostEquals(r.lineas[0].comision, 300, 0.01);
});

// --- Propinas ---------------------------------------------------------------

Deno.test('las propinas no comisionan por defecto: son del trabajador', () => {
  const r = calcularComisiones([{ nombre: 'Laura', facturacion: 1210, propinas: 100 }], { porcentaje: 30 });
  assertAlmostEquals(r.lineas[0].comision, 300, 0.5);
  assertEquals(r.lineas[0].propinas, 100);
  // Pero si­ cuentan en lo que se lleva a casa.
  assertAlmostEquals(r.lineas[0].seLlevaEnTotal, 400, 0.5);
});

Deno.test('si el salon las reparte, las propinas si entran en la base', () => {
  const r = calcularComisiones(
    [{ nombre: 'Laura', facturacion: 1210, propinas: 100 }],
    { porcentaje: 30, propinasComisionables: true },
  );
  assertAlmostEquals(r.lineas[0].comision, 330, 0.5); // 30% de 1100
});

// --- Coste de empresa -------------------------------------------------------

Deno.test('el coste de empresa no es el sueldo: lleva la cuota patronal encima', () => {
  const r = calcularComisiones([{ nombre: 'Laura', facturacion: 1210, fijoMensual: 700 }], { porcentaje: 30 });
  const l = r.lineas[0];
  assertAlmostEquals(l.brutoTrabajador, 1000, 0.5); // 700 fijo + 300 comision
  assertAlmostEquals(l.costeEmpresa, 1321.5, 0.5);  // x 1,3215
  assert(l.costeEmpresa > l.brutoTrabajador);
});

Deno.test('se puede desactivar el coste de empresa (autonomos, simulaciones rapidas)', () => {
  const r = calcularComisiones([{ nombre: 'L', facturacion: 1210 }], { porcentaje: 30, calcularCosteEmpresa: false });
  assertEquals(r.lineas[0].costeEmpresa, r.lineas[0].brutoTrabajador);
});

// --- Suelo salarial ---------------------------------------------------------

Deno.test('avisa cuando el resultado deja al profesional por debajo del minimo', () => {
  const r = calcularComisiones([{ nombre: 'Ana', facturacion: 1210 }], { porcentaje: 30 });
  // 300 € brutos esta muy por debajo del SMI mensual.
  assert(r.lineas[0].avisos.some((a) => a.includes('salario mínimo')), JSON.stringify(r.lineas[0].avisos));
});

Deno.test('no avisa del suelo cuando el bruto lo supera', () => {
  const r = calcularComisiones([{ nombre: 'Ana', facturacion: 6050, fijoMensual: 1500 }], { porcentaje: 30 });
  assert(!r.lineas[0].avisos.some((a) => a.includes('salario mínimo')));
});

Deno.test('un profesional sin facturacion ni fijo no dispara el aviso de suelo', () => {
  const r = calcularComisiones([{ nombre: 'Nuevo', facturacion: 0 }], { porcentaje: 30 });
  assertEquals(r.lineas[0].avisos.length, 0);
});

// --- Tramos -----------------------------------------------------------------

Deno.test('los tramos son progresivos: cada porcion a su tipo', () => {
  const tramos = [
    { desde: 0, hasta: 2000, porcentaje: 25 },
    { desde: 2000, hasta: null, porcentaje: 35 },
  ];
  // 3.000 € -> 2.000 al 25 % (500) + 1.000 al 35 % (350) = 850
  assertAlmostEquals(comisionPorTramos(3000, tramos).comision, 850, 0.01);
});

Deno.test('en modo no progresivo toda la base va al tipo del tramo donde cae', () => {
  const tramos = [
    { desde: 0, hasta: 2000, porcentaje: 25 },
    { desde: 2000, hasta: null, porcentaje: 35 },
  ];
  assertAlmostEquals(comisionPorTramos(3000, tramos, false).comision, 1050, 0.01); // 35% de 3000
});

Deno.test('los tramos se ordenan aunque lleguen desordenados', () => {
  const tramos = [
    { desde: 2000, hasta: null, porcentaje: 35 },
    { desde: 0, hasta: 2000, porcentaje: 25 },
  ];
  assertAlmostEquals(comisionPorTramos(3000, tramos).comision, 850, 0.01);
});

Deno.test('base por debajo del primer tramo, o sin tramos, da cero sin reventar', () => {
  assertEquals(comisionPorTramos(0, [{ desde: 0, hasta: null, porcentaje: 30 }]).comision, 0);
  assertEquals(comisionPorTramos(1000, []).comision, 0);
  assertEquals(comisionPorTramos(1000, undefined).comision, 0);
});

Deno.test('el detalle por tramos cuadra con el total', () => {
  const tramos = [
    { desde: 0, hasta: 1000, porcentaje: 20 },
    { desde: 1000, hasta: 2000, porcentaje: 30 },
    { desde: 2000, hasta: null, porcentaje: 40 },
  ];
  const r = comisionPorTramos(2500, tramos);
  const suma = r.detalle.reduce((s, d) => s + d.importe, 0);
  assertAlmostEquals(suma, r.comision, 0.02);
  assertEquals(r.detalle.length, 3);
});

Deno.test('avisa si el primer tramo no empieza en cero (facturacion que no comisiona)', () => {
  const r = calcularComisiones([{ nombre: 'L', facturacion: 1210 }], {
    modelo: 'tramos',
    tramos: [{ desde: 500, hasta: null, porcentaje: 30 }],
  });
  assert(r.avisos.some((a) => a.texto.includes('no genera comisión')), JSON.stringify(r.avisos));
});

Deno.test('avisa de los huecos entre tramos', () => {
  const r = calcularComisiones([{ nombre: 'L', facturacion: 1210 }], {
    modelo: 'tramos',
    tramos: [
      { desde: 0, hasta: 1000, porcentaje: 20 },
      { desde: 1500, hasta: null, porcentaje: 30 },
    ],
  });
  assert(r.avisos.some((a) => a.texto.includes('hueco')), JSON.stringify(r.avisos));
});

Deno.test('avisa si se pide tramos y no hay ninguno definido', () => {
  const r = calcularComisiones([{ nombre: 'L', facturacion: 1210 }], { modelo: 'tramos', tramos: [] });
  assertEquals(r.lineas[0].comision, 0);
  assert(r.avisos.some((a) => a.texto.includes('ningún tramo')));
});

// --- Por categoria ----------------------------------------------------------

Deno.test('cada categoria comisiona a su porcentaje', () => {
  const r = comisionPorCategoria({ color: 1000, corte: 500 }, { color: 35, corte: 20 });
  assertAlmostEquals(r.comision, 350 + 100, 0.01);
});

Deno.test('una categoria sin porcentaje propio usa el de por defecto', () => {
  const r = comisionPorCategoria({ color: 1000, otros: 500 }, { color: 35 }, 10);
  assertAlmostEquals(r.comision, 350 + 50, 0.01);
});

Deno.test('el modelo por categoria quita el IVA a cada categoria', () => {
  const r = calcularComisiones(
    [{ nombre: 'L', facturacion: 1210, porCategoria: { color: 1210 } }],
    { modelo: 'categoria', porcentajePorCategoria: { color: 30 } },
  );
  assertAlmostEquals(r.lineas[0].comision, 300, 0.5);
});

Deno.test('avisa si el desglose por categorias no cuadra con la facturacion total', () => {
  const r = calcularComisiones(
    [{ nombre: 'L', facturacion: 1210, porCategoria: { color: 600 } }],
    { modelo: 'categoria', porcentajePorCategoria: { color: 30 } },
  );
  assert(r.lineas[0].avisos.some((a) => a.includes('Revisa el reparto')), JSON.stringify(r.lineas[0].avisos));
});

Deno.test('sin categorias cae al porcentaje general en vez de dar cero', () => {
  const r = calcularComisiones([{ nombre: 'L', facturacion: 1210 }], { modelo: 'categoria', porcentaje: 30 });
  assertAlmostEquals(r.lineas[0].comision, 300, 0.5);
  assert(r.lineas[0].avisos.some((a) => a.includes('porcentaje general')));
});

// --- Porcentaje por persona -------------------------------------------------

Deno.test('el porcentaje de la persona manda sobre el global', () => {
  const r = calcularComisiones(
    [{ nombre: 'Junior', facturacion: 1210, porcentaje: 20 }, { nombre: 'Senior', facturacion: 1210 }],
    { porcentaje: 30 },
  );
  assertAlmostEquals(r.lineas[0].comision, 200, 0.5);
  assertAlmostEquals(r.lineas[1].comision, 300, 0.5);
});

Deno.test('avisa de un porcentaje absurdamente alto', () => {
  const r = calcularComisiones([{ nombre: 'L', facturacion: 1210 }], { porcentaje: 80 });
  assert(r.lineas[0].avisos.some((a) => a.includes('altísimo')));
});

// --- Totales y margen -------------------------------------------------------

Deno.test('los totales suman las lineas', () => {
  const r = calcularComisiones(
    [{ nombre: 'A', facturacion: 1210 }, { nombre: 'B', facturacion: 2420 }],
    { porcentaje: 30 },
  );
  assertAlmostEquals(r.totales.baseSinIva, 3000, 1);
  assertAlmostEquals(r.totales.comisiones, 900, 1);
});

Deno.test('el margen del salon descuenta el coste de empresa y los gastos fijos', () => {
  const r = calcularComisiones([{ nombre: 'A', facturacion: 12100 }], {
    porcentaje: 30, gastosFijos: 0, gastosFijosSalon: 2000,
  });
  // Base 10.000; comision 3.000; coste empresa 3.000 x 1,3215 = 3.964,50
  // Margen = 10.000 - 3.964,50 - 2.000 = 4.035,50
  assertAlmostEquals(r.totales.margenSalon, 4035.5, 1);
  assertAlmostEquals(r.totales.margenPct, 40.36, 0.1);
});

Deno.test('avisa cuando el salon pierde dinero', () => {
  const r = calcularComisiones([{ nombre: 'A', facturacion: 1210, fijoMensual: 2000 }], { porcentaje: 30 });
  assert(r.avisos.some((a) => a.texto.includes('pierde dinero')), JSON.stringify(r.avisos));
});

Deno.test('cada punto de comision cuesta el 1 % de la base mas su cuota patronal', () => {
  const r = calcularComisiones([{ nombre: 'A', facturacion: 12100 }], { porcentaje: 30 });
  // 1 % de 10.000 = 100, x 1,3215 = 132,15
  assertAlmostEquals(r.totales.costePorPuntoDeComision, 132.15, 0.5);
});

Deno.test('la cuota patronal del total es la diferencia con el bruto', () => {
  const r = calcularComisiones([{ nombre: 'A', facturacion: 12100 }], { porcentaje: 30 });
  assertAlmostEquals(r.totales.cuotaPatronal, r.totales.costeEmpresa - r.totales.brutoTrabajadores, 0.02);
});

Deno.test('sin lineas no revienta ni divide por cero', () => {
  const r = calcularComisiones([], { porcentaje: 30 });
  assertEquals(r.lineas.length, 0);
  assertEquals(r.totales.margenPct, 0);
  assertEquals(r.totales.costePorPuntoDeComision, 0);
});

Deno.test('entradas basura (negativos, undefined, NaN) se tratan como cero', () => {
  const r = calcularComisiones(
    [{ nombre: 'A', facturacion: -500 }, { nombre: 'B', facturacion: NaN }, { nombre: 'C' }],
    { porcentaje: 30 },
  );
  for (const l of r.lineas) {
    assertEquals(l.comision, 0);
    assertEquals(l.baseSinIva, 0);
  }
  assertEquals(r.totales.baseSinIva, 0);
});

// --- Alquiler de sillon -----------------------------------------------------

Deno.test('el alquiler de sillon lleva IVA y, por defecto, ninguna retencion', () => {
  const r = calcularAlquilerSillon({ alquilerMensual: 500 });
  assertAlmostEquals(r.iva, 105, 0.01);
  assertEquals(r.retencion, 0);
  assertAlmostEquals(r.totalFactura, 605, 0.01);
});

Deno.test('si se configura retencion, se descuenta de la factura', () => {
  const r = calcularAlquilerSillon({ alquilerMensual: 500, retencionIrpfPct: 19 });
  assertAlmostEquals(r.retencion, 95, 0.01);
  assertAlmostEquals(r.totalFactura, 510, 0.01);
});

Deno.test('el alquiler se traduce a su equivalente en comision, que es lo comparable', () => {
  // Factura 3.630 con IVA = 3.000 de base. 900 de alquiler = 30 % equivalente.
  const r = calcularAlquilerSillon({ alquilerMensual: 900, facturacionProfesional: 3630 });
  assertAlmostEquals(r.equivalenteEnComisionPct, 30, 0.2);
  assertAlmostEquals(r.quedaAlProfesional, 2100, 1);
});

Deno.test('sin facturacion del profesional no se inventa el equivalente', () => {
  const r = calcularAlquilerSillon({ alquilerMensual: 900 });
  assertEquals(r.equivalenteEnComisionPct, null);
  assertEquals(r.quedaAlProfesional, null);
});
