import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluarInsigniaCliente, type DatosHistorialFidelidad } from './insigniasCliente.ts';

Deno.test('cliente con 16 visitas califica como Platino VIP con +3 prioridad en lista de espera', () => {
  const d: DatosHistorialFidelidad = {
    clienteId: 'c-vip',
    totalVisitas: 16,
    gastoTotalEuros: 950,
    totalNoShows: 0,
  };

  const res = evaluarInsigniaCliente(d);
  assertEquals(res.nivel, 'platino_vip');
  assertEquals(res.prioridadListaEsperaBonus, 3);
  assertEquals(res.requiereAnticipoSeguro, false);
  assertEquals(res.beneficiosTexto.includes('Platino VIP'), true);
});

Deno.test('cliente con 2 no-shows exige anticipo seguro aun con nivel Oro', () => {
  const d: DatosHistorialFidelidad = {
    clienteId: 'c-noshow',
    totalVisitas: 10,
    gastoTotalEuros: 500,
    totalNoShows: 2,
  };

  const res = evaluarInsigniaCliente(d);
  assertEquals(res.nivel, 'oro');
  assertEquals(res.requiereAnticipoSeguro, true);
});
