import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularHashVeriFactu, verificarEncadenamientoVeriFactu, type FacturaVeriFactu } from './verifactuHash.ts';

Deno.test('calcula hash SHA-256 inmutable de factura VeriFactu', async () => {
  const f: FacturaVeriFactu = {
    cifEmisor: 'B12345678',
    numeroFactura: 'FAC-2026-0001',
    fechaEmision: '2026-08-09T20:00:00Z',
    totalEuros: 45.50,
    hashAnterior: '0000000000000000000000000000000000000000000000000000000000000000',
  };

  const hash = await calcularHashVeriFactu(f);
  assertEquals(typeof hash, 'string');
  assertEquals(hash.length, 64);

  const valido = await verificarEncadenamientoVeriFactu(f, hash);
  assertEquals(valido, true);
});

Deno.test('detecta alteracion de importe en factura VeriFactu', async () => {
  const f: FacturaVeriFactu = {
    cifEmisor: 'B12345678',
    numeroFactura: 'FAC-2026-0002',
    fechaEmision: '2026-08-09T20:05:00Z',
    totalEuros: 80.00,
    hashAnterior: 'abc123hash',
  };

  const hashOriginal = await calcularHashVeriFactu(f);

  // Alterar importe a 80.01 (fraude)
  const fAlterada = { ...f, totalEuros: 80.01 };
  const valido = await verificarEncadenamientoVeriFactu(fAlterada, hashOriginal);
  assertEquals(valido, false);
});
