// Tests puros del candidato de upsell determinista (Sesion 6, deno test).
// Ejecutar: deno test lib/upsellCandidato.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { elegirCandidatoUpsell, type ProductoUpsellCandidato } from './upsellCandidato.ts';

const PRODUCTOS: ProductoUpsellCandidato[] = [
  { id: '1', nombre: 'Mascarilla Nutritiva', precio_cents: 1800, categoria: 'tratamiento' },
  { id: '2', nombre: 'Champu Protector Color', precio_cents: 1500, categoria: 'color' },
  { id: '3', nombre: 'Serum Anti-Frizz', precio_cents: 1200, categoria: 'shampoo' },
  { id: '4', nombre: 'Aceite Reparador', precio_cents: 2000, categoria: 'tratamiento' },
];

Deno.test('servicio de color sugiere producto de categoria color', () => {
  const c = elegirCandidatoUpsell('Balayage completo', PRODUCTOS);
  assertEquals(c?.id, '2');
});

Deno.test('servicio de tratamiento elige alfabeticamente el primero de su categoria', () => {
  const c = elegirCandidatoUpsell('Tratamiento de keratina', PRODUCTOS);
  assertEquals(c?.id, '4'); // 'Aceite...' antes que 'Mascarilla...'
});

Deno.test('servicio de corte sugiere categoria shampoo', () => {
  const c = elegirCandidatoUpsell('Corte de puntas', PRODUCTOS);
  assertEquals(c?.id, '3');
});

Deno.test('servicio sin palabra clave reconocida no sugiere nada', () => {
  const c = elegirCandidatoUpsell('Manicura express', PRODUCTOS);
  assertEquals(c, null);
});

Deno.test('categoria reconocida pero sin productos disponibles no sugiere nada', () => {
  const c = elegirCandidatoUpsell('Corte de puntas', [PRODUCTOS[0], PRODUCTOS[1]]);
  assertEquals(c, null);
});

Deno.test('sin nombre de servicio o sin catalogo no sugiere nada', () => {
  assertEquals(elegirCandidatoUpsell(null, PRODUCTOS), null);
  assertEquals(elegirCandidatoUpsell(undefined, PRODUCTOS), null);
  assertEquals(elegirCandidatoUpsell('Balayage', []), null);
});
