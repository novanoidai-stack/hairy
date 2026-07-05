// Test de la regla dura de salud (Sesion 2). Ejecutar con:
//   deno test supabase/functions/agenda-asistente/whitelist.test.ts
//
// Objetivo: que FALLE si un campo de salud/no permitido llega al payload del LLM.

import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  assertSinCamposProhibidos,
  CLIENTE_CAMPOS_IA,
  proyectarClienteIA,
} from './whitelist.ts';

// Fila realista tal cual sale de `clientes` (con campos de salud presentes).
const filaClienteConSalud = {
  id: 'c-1',
  nombre: 'Ana Perez',
  telefono: '600111222',
  total_visitas: 12,
  ultima_visita: '2026-06-30',
  primera_visita: '2024-01-10',
  ticket_medio: 34.5,
  frecuencia_dias: 28,
  // --- campos que NUNCA pueden salir a la IA ---
  alergias: 'Alergia a la parafenilendiamina (PPD)',
  sensibilidades_cuero: 'Cuero cabelludo sensible, picores con amoniaco',
  notas: 'Tratamiento dermatologico en curso',
  email: 'ana@example.com',
  perfil_riesgo: 'alto',
  bloqueo_motivo: 'impago',
};

Deno.test('proyectarClienteIA deja pasar SOLO la lista blanca', () => {
  const out = proyectarClienteIA(filaClienteConSalud);
  assertEquals(Object.keys(out).sort(), [...CLIENTE_CAMPOS_IA].sort());
  // Ningun campo de salud sobrevive a la proyeccion.
  assertEquals('alergias' in out, false);
  assertEquals('sensibilidades_cuero' in out, false);
  assertEquals('notas' in out, false);
  assertEquals('email' in out, false);
  assertEquals(out.nombre, 'Ana Perez');
  assertEquals(out.ticket_medio, 34.5);
});

Deno.test('la fila proyectada pasa la asercion sin lanzar', () => {
  const out = proyectarClienteIA(filaClienteConSalud);
  assertSinCamposProhibidos({ clientes: [out] }); // no lanza
});

Deno.test('assertSinCamposProhibidos FALLA si aparece un campo de salud', () => {
  // Regresion simulada: alguien mete alergias en un resultado de tool.
  assertThrows(
    () => assertSinCamposProhibidos({ cliente: { nombre: 'Ana', alergias: 'PPD' } }),
    Error,
    'FUGA DE DATOS DE SALUD',
  );
});

Deno.test('assertSinCamposProhibidos detecta el campo anidado en arrays', () => {
  assertThrows(
    () => assertSinCamposProhibidos({ resultados: [{ ok: true }, { notas: 'x' }] }),
    Error,
    'notas',
  );
  assertThrows(
    () => assertSinCamposProhibidos([{ sensibilidades_cuero: 'x' }]),
    Error,
    'sensibilidades_cuero',
  );
});

Deno.test('assertSinCamposProhibidos es case-insensitive en la clave', () => {
  assertThrows(
    () => assertSinCamposProhibidos({ ficha: { Alergias: 'PPD' } }),
    Error,
    'FUGA DE DATOS DE SALUD',
  );
});

Deno.test('un payload operativo normal NO lanza', () => {
  const payloadLLM = {
    clientes: [proyectarClienteIA(filaClienteConSalud)],
    citas: [{ id: 'x', inicio: '2026-07-05T10:00', estado: 'confirmada', cliente_id: 'c-1' }],
    servicios: [{ id: 's1', nombre: 'Corte', precio: 15 }],
  };
  assertSinCamposProhibidos(payloadLLM);
});
