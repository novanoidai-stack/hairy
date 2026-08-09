import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validarParametrosRPC, type ParametroRPC } from './validadorRPC.ts';

Deno.test('parametros limpios son seguros', () => {
  const params: ParametroRPC[] = [
    { nombre: 'salon_id', valor: 'abc-123' },
    { nombre: 'limit', valor: 50 },
  ];
  const res = validarParametrosRPC('get_citas_hoy', params);
  assertEquals(res.esSeguro, true);
  assertEquals(res.alertas.length, 0);
});

Deno.test('inyeccion SQL en un parametro es bloqueada y genera alerta', () => {
  const params: ParametroRPC[] = [
    { nombre: 'salon_id', valor: "'; DROP TABLE citas; --" },
  ];
  const res = validarParametrosRPC('get_citas_hoy', params);
  assertEquals(res.esSeguro, false);
  assertEquals(res.parametrosBloqueados.includes('salon_id'), true);
  assertEquals(res.alertas[0].includes('SQL_INJECTION'), true);
});

Deno.test('parametro limit superior a 1000 es bloqueado por rango', () => {
  const params: ParametroRPC[] = [
    { nombre: 'limit', valor: 99999 },
  ];
  const res = validarParametrosRPC('get_clientes', params);
  assertEquals(res.esSeguro, false);
  assertEquals(res.alertas[0].includes('RANGE'), true);
});
