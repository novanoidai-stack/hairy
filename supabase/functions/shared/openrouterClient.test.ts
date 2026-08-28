// Tests de la capa de IA compartida.
//   deno task test:ia
//
// Cubren justo lo que la arquitectura anterior no cubria y por eso se rompio en
// silencio: que la cascada respete las capacidades reales, que no se envien
// parametros que el modelo no soporta, y que un fallo se note en vez de taparse.

import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { CATALOGO, calcularCoste, construirCadena, modeloPorId } from './modelos.ts';
import { ErrorIA, extraerJson, llamarIA, parteArchivo, parteImagen } from './openrouterClient.ts';
import { comprobarCupo } from './cupo.ts';

// ─── Cupo ──────────────────────────────────────────────────────────────────

Deno.test('cupo: deniega cuando la RPC dice false', async () => {
  const r = await comprobarCupo({ rpc: () => Promise.resolve({ data: false, error: null }) }, 'f', 10);
  assertEquals(r, { permitido: false, sinComprobar: false });
});

Deno.test('cupo: permite cuando la RPC dice true', async () => {
  const r = await comprobarCupo({ rpc: () => Promise.resolve({ data: true, error: null }) }, 'f', 10);
  assertEquals(r, { permitido: true, sinComprobar: false });
});

Deno.test('cupo: si la RPC no existe deja pasar pero lo marca como no comprobado', async () => {
  const r = await comprobarCupo(
    { rpc: () => Promise.resolve({ data: null, error: { message: 'function does not exist' } }) },
    'f',
    10,
  );
  assertEquals(r, { permitido: true, sinComprobar: true });
});

Deno.test('cupo: una excepcion no tumba la funcion', async () => {
  const r = await comprobarCupo({ rpc: () => { throw new Error('red caida'); } }, 'f', 10);
  assertEquals(r.permitido, true);
  assertEquals(r.sinComprobar, true);
});

// ─── Catalogo ──────────────────────────────────────────────────────────────

Deno.test('catalogo: ningun id duplicado', () => {
  const ids = CATALOGO.map((m) => m.id);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test('catalogo: todo modelo activo acepta texto y declara precio', () => {
  for (const m of CATALOGO.filter((x) => x.activo)) {
    assert(m.entrada.includes('texto'), `${m.id} no acepta texto`);
    assert(m.precioIn > 0 && m.precioOut > 0, `${m.id} sin precio`);
  }
});

// ─── Cascada por capacidades ───────────────────────────────────────────────

Deno.test('cadena: con PDF solo entran modelos que aceptan archivos', () => {
  const cadena = construirCadena({ modalidades: ['archivo'] });
  assert(cadena.length > 0, 'deberia haber modelos con soporte de archivo');
  for (const id of cadena) {
    assert(modeloPorId(id)!.entrada.includes('archivo'), `${id} no acepta archivos`);
  }
  // qwen3.7-flash es el mas barato pero NO lee archivos: no puede colarse.
  assert(!cadena.includes('qwen/qwen3.7-flash'));
});

Deno.test('cadena: con tools solo entran modelos con tool calling', () => {
  const cadena = construirCadena({ tools: true });
  for (const id of cadena) assert(modeloPorId(id)!.tools, `${id} no soporta tools`);
});

Deno.test('cadena: nunca incluye modelos inactivos (rutas batch, historicos)', () => {
  const cadena = construirCadena({});
  assert(!cadena.some((id) => id.includes(':batch')));
  assert(!cadena.includes('openai/gpt-4o'));
});

Deno.test('cadena: el primer fallback es de OTRO proveedor', () => {
  const cadena = construirCadena({});
  assert(cadena.length >= 2);
  const p0 = modeloPorId(cadena[0])!.proveedor;
  const p1 = modeloPorId(cadena[1])!.proveedor;
  assert(p0 !== p1, `los dos primeros son de ${p0}: una caida del proveedor los tumba juntos`);
});

Deno.test('cadena: perfil economico ordena por precio ascendente', () => {
  const cadena = construirCadena({ perfil: 'economico' });
  const precios = cadena.map((id) => {
    const m = modeloPorId(id)!;
    return m.precioIn + m.precioOut;
  });
  assertEquals(precios, [...precios].sort((a, b) => a - b));
});

Deno.test('cadena: requisito imposible devuelve lista vacia, no un modelo cualquiera', () => {
  assertEquals(construirCadena({ contextoMinimo: 99_000_000 }), []);
});

// ─── Coste ─────────────────────────────────────────────────────────────────

Deno.test('coste: usa el precio real del modelo', () => {
  // gemini-3.7-flash: 0.75 in / 3.75 out por 1M
  const coste = calcularCoste('google/gemini-3.7-flash', 1_000_000, 1_000_000);
  assertEquals(Number(coste.toFixed(4)), 4.5);
});

Deno.test('coste: modelo desconocido estima ALTO, nunca cero', () => {
  const coste = calcularCoste('marca/inventada', 1_000_000, 1_000_000);
  assert(coste >= 5, 'un modelo sin tarifa no puede parecer gratis en el panel');
});

// ─── Extraccion de JSON ────────────────────────────────────────────────────

Deno.test('extraerJson: acepta json pelado, vallado y con preambulo', () => {
  assertEquals(extraerJson('{"a":1}'), { a: 1 });
  assertEquals(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(extraerJson('Claro, aqui lo tienes:\n{"a":1}\nUn saludo'), { a: 1 });
  assertEquals(extraerJson('[{"a":1}]'), [{ a: 1 }]);
});

Deno.test('extraerJson: basura lanza en vez de devolver un objeto vacio', () => {
  let lanzo = false;
  try { extraerJson('no hay json aqui'); } catch { lanzo = true; }
  assert(lanzo);
});

// ─── Partes multimodales ───────────────────────────────────────────────────

Deno.test('parteArchivo: un PDF va como file, no como texto ni image_url', () => {
  const parte = parteArchivo('agenda.pdf', 'QkFTRTY0', 'application/pdf');
  assertEquals(parte.type, 'file');
  assertEquals(parte.file!.filename, 'agenda.pdf');
  assertStringIncludes(parte.file!.file_data, 'data:application/pdf;base64,');
});

Deno.test('parteImagen: monta la data url y respeta una ya montada', () => {
  assertStringIncludes(parteImagen('QUJD', 'image/png').image_url!.url, 'data:image/png;base64,QUJD');
  assertEquals(parteImagen('data:image/webp;base64,XX').image_url!.url, 'data:image/webp;base64,XX');
});

// ─── Comportamiento de llamarIA (con fetch simulado) ───────────────────────

function conFetchSimulado(
  manejador: (url: string, init: RequestInit) => Response | Promise<Response>,
  prueba: (cuerpos: Record<string, unknown>[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const cuerpos: Record<string, unknown>[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    cuerpos.push(JSON.parse(String(init.body)));
    return Promise.resolve(manejador(String(url), init));
  }) as typeof fetch;
  return prueba(cuerpos).finally(() => { globalThis.fetch = original; });
}

const respuestaOk = (texto: string, modelo = 'x') =>
  new Response(JSON.stringify({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    model: modelo,
  }), { status: 200 });

Deno.test('llamarIA: sin api key falla explicitamente', async () => {
  await assertRejects(
    () => llamarIA('', { funcion: 't', mensajes: [{ role: 'user', content: 'hola' }] }),
    ErrorIA,
  );
});

Deno.test('llamarIA: entrada gigante se rechaza ANTES de llamar a nadie', async () => {
  let llamadas = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (() => { llamadas++; return Promise.resolve(respuestaOk('x')); }) as typeof fetch;
  try {
    const err = await assertRejects(
      () => llamarIA('k', {
        funcion: 't',
        mensajes: [{ role: 'user', content: 'a'.repeat(100) }],
        topeEntradaChars: 10,
      }),
      ErrorIA,
    );
    assertEquals(err.codigo, 'entrada_demasiado_grande');
    assertEquals(llamadas, 0, 'no debe gastarse una llamada para descubrir que es grande');
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('llamarIA: un 404 salta al siguiente modelo SIN reintentar el mismo', async () => {
  await conFetchSimulado(
    (_url, init) => {
      const modelo = JSON.parse(String(init.body)).model;
      if (modelo === construirCadena({})[0]) {
        return new Response(JSON.stringify({ error: 'No endpoints found' }), { status: 404 });
      }
      return respuestaOk('vale');
    },
    async (cuerpos) => {
      const r = await llamarIA('k', { funcion: 't', mensajes: [{ role: 'user', content: 'hola' }] });
      assertEquals(r.texto, 'vale');
      assertEquals(cuerpos.length, 2, 'un modelo retirado no se reintenta, se sustituye');
      assertEquals(r.modelo, construirCadena({})[1]);
      assertEquals(r.intentosFallidos.length, 1);
    },
  );
});

Deno.test('llamarIA: informa de QUE modelo respondio y de cuanto costo', async () => {
  await conFetchSimulado(() => respuestaOk('hola'), async () => {
    const r = await llamarIA('k', { funcion: 't', mensajes: [{ role: 'user', content: 'hola' }] });
    assertEquals(r.modelo, construirCadena({})[0]);
    assertEquals(r.tokensIn, 100);
    assertEquals(r.tokensOut, 50);
    assert(r.costeUsd > 0);
    assertEquals(r.intentosFallidos.length, 0);
  });
});

Deno.test('llamarIA: no envia temperature a un modelo que no la soporta', async () => {
  await conFetchSimulado(() => respuestaOk('ok'), async (cuerpos) => {
    // gemini-3.7-flash:batch esta en el catalogo con temperatura: false.
    await llamarIA('k', {
      funcion: 't',
      mensajes: [{ role: 'user', content: 'hola' }],
      cadena: ['google/gemini-3.7-flash:batch'],
      temperatura: 0.7,
    });
    assertEquals('temperature' in cuerpos[0], false);
  });
});

Deno.test('llamarIA: envia temperature a un modelo que si la soporta', async () => {
  await conFetchSimulado(() => respuestaOk('ok'), async (cuerpos) => {
    await llamarIA('k', {
      funcion: 't',
      mensajes: [{ role: 'user', content: 'hola' }],
      cadena: ['google/gemini-3.7-flash'],
      temperatura: 0.7,
    });
    assertEquals(cuerpos[0].temperature, 0.7);
  });
});

Deno.test('llamarIA: si todos fallan LANZA, no devuelve una respuesta vacia', async () => {
  await conFetchSimulado(
    () => new Response('boom', { status: 400 }),
    async () => {
      const err = await assertRejects(
        () => llamarIA('k', { funcion: 't', mensajes: [{ role: 'user', content: 'hola' }] }),
        ErrorIA,
      );
      assertEquals(err.codigo, 'todos_fallaron');
    },
  );
});

Deno.test('llamarIA: un 429 se reintenta con el mismo modelo antes de rendirse', async () => {
  let vistas = 0;
  await conFetchSimulado(
    () => {
      vistas++;
      return vistas === 1 ? new Response('slow down', { status: 429 }) : respuestaOk('ya');
    },
    async (cuerpos) => {
      const r = await llamarIA('k', { funcion: 't', mensajes: [{ role: 'user', content: 'hola' }] });
      assertEquals(r.texto, 'ya');
      assertEquals(cuerpos[0].model, cuerpos[1].model, 'un 429 es transitorio: mismo modelo');
    },
  );
});
