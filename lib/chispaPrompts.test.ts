// Tests puros de buildPromptPagina (deno test). Rework KISS: prompt de IA por pagina.
// Ejecutar: deno test lib/chispaPrompts.test.ts
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPromptPagina } from './chispaPrompts.ts';

Deno.test('buildPromptPagina incluye pagina, objetivo y accion esperada', () => {
  const p = buildPromptPagina({ pagina: 'clientes', objetivo: 'detecta fuga', accionEsperada: 'recuperar' });
  assert(p.includes('clientes'));
  assert(p.includes('detecta fuga'));
  assert(p.toLowerCase().includes('recuperar'));
});

Deno.test('buildPromptPagina siempre recuerda el contrato Titular -> Visual', () => {
  const p = buildPromptPagina({ pagina: 'informes', objetivo: 'resume la semana' });
  assert(p.toUpperCase().includes('TITULAR'));
  assert(p.toLowerCase().includes('bloque visual'));
});

Deno.test('buildPromptPagina sin accion esperada no inventa una accion', () => {
  const p = buildPromptPagina({ pagina: 'informes', objetivo: 'resume la semana' });
  assert(!p.toLowerCase().includes('accion de 1 clic'));
});
