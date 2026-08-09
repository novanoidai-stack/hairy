import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluarSeguridadFormula, type FormulaColor } from './colorAlergias.ts';

Deno.test('formula estandar sin alertas es apta', () => {
  const f: FormulaColor = {
    clienteId: 'c1',
    fecha: '2026-08-09',
    profesionalId: 'p1',
    marcaProducto: 'L’Oréal Majirel',
    tono: '6.1 Castaño Claro Ceniza',
    volumenesOxigenada: 20,
    tiempoExposicionMin: 35,
    sensibilidadCueroCabelludo: false,
  };
  const diag = evaluarSeguridadFormula(f);
  assertEquals(diag.apto, true);
  assertEquals(diag.alertas.length, 0);
  assertEquals(diag.requierePruebaAlergia, false);
});

Deno.test('alergias declaradas activan requierePruebaAlergia', () => {
  const f: FormulaColor = {
    clienteId: 'c2',
    fecha: '2026-08-09',
    profesionalId: 'p1',
    marcaProducto: 'Wella Koleston',
    tono: '5.0',
    volumenesOxigenada: 20,
    tiempoExposicionMin: 30,
    sensibilidadCueroCabelludo: false,
    alergiasRegistradas: ['PPD (Parafenilendiamina)'],
  };
  const diag = evaluarSeguridadFormula(f);
  assertEquals(diag.apto, false);
  assertEquals(diag.requierePruebaAlergia, true);
});

Deno.test('sensibilidad + 30 vol genera alerta de reduccion', () => {
  const f: FormulaColor = {
    clienteId: 'c3',
    fecha: '2026-08-09',
    profesionalId: 'p2',
    marcaProducto: 'Schwarzkopf Igora',
    tono: '9.1 Rubio Muy Claro',
    volumenesOxigenada: 30,
    tiempoExposicionMin: 40,
    sensibilidadCueroCabelludo: true,
  };
  const diag = evaluarSeguridadFormula(f);
  assertEquals(diag.apto, false);
  assertEquals(diag.alertas.length, 1);
});

Deno.test('exposicion mayor a 45 min genera alerta de tiempo', () => {
  const f: FormulaColor = {
    clienteId: 'c4',
    fecha: '2026-08-09',
    profesionalId: 'p1',
    marcaProducto: 'Redken Shades EQ',
    tono: '8.3',
    volumenesOxigenada: 20,
    tiempoExposicionMin: 60,
    sensibilidadCueroCabelludo: false,
  };
  const diag = evaluarSeguridadFormula(f);
  assertEquals(diag.apto, false);
  assertEquals(diag.alertas.length, 1);
});
