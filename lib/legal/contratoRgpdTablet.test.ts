import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { registrarConsentimientoRgpd, type ConsentimientoRgpdEntrada } from './contratoRgpdTablet.ts';

Deno.test('consentimiento RGPD con firma valida genera hash SHA-256 inmutable', async () => {
  const c: ConsentimientoRgpdEntrada = {
    clienteId: 'c-100',
    clienteNombre: 'Laura Gómez',
    clienteDniNie: '12345678Z',
    aceptaTratamientoDatos: true,
    aceptaComunicacionesWhatsapp: true,
    aceptaUsoImagenRrss: false,
    rawBase64Firma: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAYAAAB1ovlvAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA_SURBVHhe7cExAQAAAMKg9U9tCF8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4A1uAAAH24vU4AAAAAElFTkSuQmCC',
  };

  const res = await registrarConsentimientoRgpd(c);
  assertEquals(res.esValidoLegalmente, true);
  assertEquals(res.hashDocumento.length, 64);
  assertEquals(res.errores.length, 0);
});

Deno.test('rechazo de tratamiento de datos o ausencia de firma invalida el registro', async () => {
  const c: ConsentimientoRgpdEntrada = {
    clienteId: 'c-101',
    clienteNombre: 'Pedro',
    clienteDniNie: '87654321X',
    aceptaTratamientoDatos: false, // Invalido
    aceptaComunicacionesWhatsapp: false,
    aceptaUsoImagenRrss: false,
    rawBase64Firma: '', // Invalido
  };

  const res = await registrarConsentimientoRgpd(c);
  assertEquals(res.esValidoLegalmente, false);
  assertEquals(res.errores.length, 2);
});
