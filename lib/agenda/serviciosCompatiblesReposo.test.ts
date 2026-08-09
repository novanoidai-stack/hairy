import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { filtrarServiciosCompatiblesEnReposo, type EvaluacionReposo, type ServicioCandidato } from './serviciosCompatiblesReposo.ts';

Deno.test('filtra servicios que caben holgadamente en el reposo de 35 minutos', () => {
  const servicios: ServicioCandidato[] = [
    { id: 's1', nombre: 'Corte Exprés', duracionTotalMin: 20, requiereTocadoEstilista: true }, // 20+5 = 25 <= 35 -> OK
    { id: 's2', nombre: 'Manicura Exprés', duracionTotalMin: 25, requiereTocadoEstilista: false }, // 25+5 = 30 <= 35 -> OK
    { id: 's3', nombre: 'Tratamiento Olaplex Completo', duracionTotalMin: 45, requiereTocadoEstilista: true }, // 45+5 = 50 > 35 -> NO
  ];

  const evalReposo: EvaluacionReposo = {
    minutosLibresReposo: 35,
    profesionalDisponible: true,
    serviciosDisponibles: servicios,
  };

  const res = filtrarServiciosCompatiblesEnReposo(evalReposo);
  assertEquals(res.length, 2);
  assertEquals(res.some(s => s.id === 's1'), true);
  assertEquals(res.some(s => s.id === 's2'), true);
  assertEquals(res.some(s => s.id === 's3'), false);
});
