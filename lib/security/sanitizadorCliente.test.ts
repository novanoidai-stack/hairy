import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sanitizarYValidarCliente, type FormularioClienteEntrada } from './sanitizadorCliente.ts';

Deno.test('escapa inyecciones HTML/script en nombre y notas de cliente', () => {
  const f: FormularioClienteEntrada = {
    nombre: '<script>alert("xss")</script>María',
    telefono: '612345678',
    notasMedicasAlergias: 'Alergia a <b>PPD</b> & parabenos',
  };
  const res = sanitizarYValidarCliente(f);
  assertEquals(res.esValido, true);
  assertEquals(res.nombreSanitizado.includes('<script>'), false);
  assertEquals(res.nombreSanitizado.includes('&lt;script&gt;'), true);
  assertEquals(res.notasSanitizadas.includes('&lt;b&gt;'), true);
  assertEquals(res.telefonoValidoE164, '+34612345678');
});

Deno.test('telefono invalido reporta error de formato WhatsApp E.164', () => {
  const f: FormularioClienteEntrada = {
    nombre: 'Ana',
    telefono: '123', // Invalido
  };
  const res = sanitizarYValidarCliente(f);
  assertEquals(res.esValido, false);
  assertEquals(res.errores.length, 1);
});
