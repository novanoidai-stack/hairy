// Test unitario para chispa-dudas-demo
// Ejecutar con: deno test --no-config supabase/functions/chispa-dudas-demo/chispa_dudas.test.ts

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  parseContacto,
  formatMarkdownHtml,
  emailHtml,
  emailLeadHtml,
  esOrigenPermitido,
  handler,
} from './index.ts';

Deno.test('parseContacto: detecta y valida emails correctamente', () => {
  // En campo contacto
  const res1 = parseContacto('test@mechaa.es');
  assertEquals(res1.valido, true);
  assertEquals(res1.tipo, 'email');
  assertEquals(res1.email, 'test@mechaa.es');
  assertEquals(res1.telefono, null);

  // En campo email explicito
  const res2 = parseContacto(undefined, 'peluqueria@salon.com');
  assertEquals(res2.valido, true);
  assertEquals(res2.tipo, 'email');
  assertEquals(res2.email, 'peluqueria@salon.com');

  // Con mayusculas y espacios
  const res3 = parseContacto('  Admin@SalonVip.ES  ');
  assertEquals(res3.valido, true);
  assertEquals(res3.email, 'admin@salonvip.es');
});

Deno.test('parseContacto: detecta y normaliza telefonos y WhatsApp de 9 a 15 digitos', () => {
  // Telefono espanol estandar en campo contacto
  const res1 = parseContacto('690792975');
  assertEquals(res1.valido, true);
  assertEquals(res1.tipo, 'telefono');
  assertEquals(res1.telefono, '690792975');
  assertEquals(res1.email, null);

  // Con prefijo internacional y espacios
  const res2 = parseContacto('+34 690 79 29 75');
  assertEquals(res2.valido, true);
  assertEquals(res2.tipo, 'telefono');
  assertEquals(res2.telefono, '+34690792975');

  // Con guiones y parentesis en campo telefono
  const res3 = parseContacto(undefined, undefined, '(+34) 912-345-678');
  assertEquals(res3.valido, true);
  assertEquals(res3.tipo, 'telefono');
  assertEquals(res3.telefono, '+34912345678');

  // Numero internacional
  const res4 = parseContacto('+1 415 555 2671');
  assertEquals(res4.valido, true);
  assertEquals(res4.telefono, '+14155552671');
});

Deno.test('parseContacto: permite contact vacio sin error (tipo none)', () => {
  const res1 = parseContacto();
  assertEquals(res1.valido, true);
  assertEquals(res1.tipo, 'none');
  assertEquals(res1.email, null);
  assertEquals(res1.telefono, null);

  const res2 = parseContacto('   ', '', '');
  assertEquals(res2.valido, true);
  assertEquals(res2.tipo, 'none');
});

Deno.test('parseContacto: rechaza formatos invalidos', () => {
  // Email invalido
  const res1 = parseContacto('bad_email_at_test.com');
  assertEquals(res1.valido, false);
  assertEquals(res1.tipo, 'invalid');

  // Email mal formado
  const res2 = parseContacto('usuario@');
  assertEquals(res2.valido, false);
  assertEquals(res2.tipo, 'invalid');

  // Telefono demasiado corto (< 9 digitos)
  const res3 = parseContacto('12345');
  assertEquals(res3.valido, false);
  assertEquals(res3.tipo, 'invalid');

  // Telefono con letras
  const res4 = parseContacto('+34 690 abc 123');
  assertEquals(res4.valido, false);
  assertEquals(res4.tipo, 'invalid');

  // Telefono demasiado largo (> 15 digitos)
  const res5 = parseContacto('12345678901234567890');
  assertEquals(res5.valido, false);
  assertEquals(res5.tipo, 'invalid');
});

Deno.test('parseContacto: soporta email y telefono simultaneos', () => {
  const res = parseContacto(undefined, 'contacto@salon.es', '+34 690 79 29 75');
  assertEquals(res.valido, true);
  assertEquals(res.tipo, 'ambos');
  assertEquals(res.email, 'contacto@salon.es');
  assertEquals(res.telefono, '+34690792975');
});

Deno.test('formatMarkdownHtml: parsea negritas, enlaces, listas y escapa XSS', () => {
  const md = `Hola **amigo**!
- Punto 1: información clave
- Punto 2: enlace [Mecha Software](https://www.mechaa.es)
<script>alert("hack")</script>`;

  const html = formatMarkdownHtml(md);

  // Escapa script injection
  assertStringIncludes(html, '&lt;script&gt;');
  // Negrita convertida a b con estilo
  assertStringIncludes(html, '<b style="color:#ffffff">amigo</b>');
  // Enlace convertido a a con target _blank y rel noopener
  assertStringIncludes(html, '<a href="https://www.mechaa.es" style="color:#f4501e;text-decoration:underline" target="_blank" rel="noopener">Mecha Software</a>');
  // Viñetas formateadas
  assertStringIncludes(html, '&bull;</span>Punto 1: información clave');
});

Deno.test('emailHtml: genera HTML responsivo y seguro', () => {
  const duda = '¿Cómo funcionan los **tiempos de reposo**?';
  const reply = 'En Mecha los reposos permiten atender a otro cliente mientras actúa el color.\n- **Paso 1**: Crear cita\n- **Paso 2**: Asignar tiempo activo y de reposo';

  const html = emailHtml(duda, reply);

  assertStringIncludes(html, 'Mecha');
  assertStringIncludes(html, 'Respuesta de Chispa');
  assertStringIncludes(html, 'tiempos de reposo');
  assertStringIncludes(html, 'Asignar tiempo activo');
  assertStringIncludes(html, '+34 690 79 29 75');
});

Deno.test('emailLeadHtml: formatea lead de WhatsApp para el equipo', () => {
  const duda = '¿Cuánto cuesta el plan para 3 empleados?';
  const reply = 'El plan Salón cuesta 49 €/mes e incluye hasta 5 empleados y todas las funciones.';
  const tel = '+34 690 79 29 75';

  const html = emailLeadHtml(duda, reply, tel);

  assertStringIncludes(html, 'Nuevo Lead · Demo Interactiva');
  assertStringIncludes(html, '+34 690 79 29 75');
  assertStringIncludes(html, 'wa.me/34690792975');
  assertStringIncludes(html, 'El plan Salón cuesta');
});

Deno.test('esOrigenPermitido: valida origenes CORS oficiales y locales', () => {
  assertEquals(esOrigenPermitido('https://www.mechaa.es'), true);
  assertEquals(esOrigenPermitido('https://mechaa.es'), true);
  assertEquals(esOrigenPermitido('https://hairy-two.vercel.app'), true);
  assertEquals(esOrigenPermitido('https://www.novanoidai.com'), true);
  assertEquals(esOrigenPermitido('http://localhost:3000'), true);
  assertEquals(esOrigenPermitido('http://127.0.0.1:8080'), true);
  assertEquals(esOrigenPermitido('https://malicious-site.com'), false);
});

Deno.test('handler: maneja OPTIONS y metodos no permitidos', async () => {
  const optReq = new Request('http://localhost/functions/v1/chispa-dudas-demo', {
    method: 'OPTIONS',
    headers: { 'Origin': 'https://www.mechaa.es' },
  });
  const optRes = await handler(optReq);
  assertEquals(optRes.status, 200);

  const getReq = new Request('http://localhost/functions/v1/chispa-dudas-demo', {
    method: 'GET',
    headers: { 'Origin': 'https://www.mechaa.es' },
  });
  const getRes = await handler(getReq);
  assertEquals(getRes.status, 405);
  const getBody = await getRes.json();
  assertEquals(getBody.error, 'method_not_allowed');
});

Deno.test('handler: valida errores de payload (bad_json, missing_duda, bad_contact)', async () => {
  // Bad JSON
  const badJsonReq = new Request('http://localhost/functions/v1/chispa-dudas-demo', {
    method: 'POST',
    body: '{ invalid_json',
  });
  const badJsonRes = await handler(badJsonReq);
  assertEquals(badJsonRes.status, 400);
  const badJsonBody = await badJsonRes.json();
  assertEquals(badJsonBody.error, 'bad_json');

  // Missing duda
  const missingDudaReq = new Request('http://localhost/functions/v1/chispa-dudas-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duda: ' ' }),
  });
  const missingDudaRes = await handler(missingDudaReq);
  assertEquals(missingDudaRes.status, 400);
  const missingDudaBody = await missingDudaRes.json();
  assertEquals(missingDudaBody.error, 'missing_duda');

  // Bad contact (invalid phone/email format)
  const badContactReq = new Request('http://localhost/functions/v1/chispa-dudas-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duda: '¿Cómo funciona la agenda?', contacto: 'correo_invalido_sin_arroba' }),
  });
  const badContactRes = await handler(badContactReq);
  assertEquals(badContactRes.status, 400);
  const badContactBody = await badContactRes.json();
  assertEquals(badContactBody.error, 'bad_contact');
});
