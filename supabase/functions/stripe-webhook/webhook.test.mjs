// Ejecuta el handler REAL de stripe-webhook con las dependencias simuladas.
// No llama a Stripe ni a Supabase y no usa credenciales: la firma se da por validada
// para poder probar lo que pasa DESPUES de una firma buena, que es donde vive el dinero.
//
// El arnes nacio como script de auditoria (informes/auditoria-2026-09-07/repro-webhook-offline.cjs).
// Vive aqui como test porque lo que comprueba es un invariante permanente, no un hallazgo
// de un dia: un informe en una carpeta con fecha no vuelve a correr nunca.
//
// EL INVARIANTE, y por que hace falta vigilarlo:
// la fila de deduplicacion se escribe ANTES de conciliar. Si el proceso falla y esa fila
// se queda puesta, el reintento de Stripe choca con ella, recibe 'ok (dup)' con un 200 y
// el cobro NO se concilia jamas. El 7 sep 2026 se convirtieron las 14 escrituras de la
// funcion en `throw` sin tocar esa fila, y tres revisiones seguidas lo dieron por bueno
// ("dedup intacto. Bien") porque ninguna siguio el hilo hasta el reintento.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(aqui, 'index.ts'), 'utf8');
const codigo = ts.transpileModule(fuente.replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

/** Monta el handler con una BD simulada. `fallaRpc` rompe la conciliacion. */
function montar({ fallaRpc = false, fallaBorradoDedup = false } = {}) {
  const llamadas = [];
  const dedup = new Set(); // hace de tabla stripe_webhook_eventos
  let handler;

  const supabase = {
    rpc: async (name, args) => {
      llamadas.push({ tipo: 'rpc', name, args });
      if (name === 'pasarela_stripe_webhook_secret') return { data: 'secreto-sintetico', error: null };
      return { data: null, error: fallaRpc ? { code: 'XX000', message: 'fallo simulado de BD' } : null };
    },
    from(tabla) {
      let op = 'select';
      let valor = null;
      const filtros = [];
      const q = {
        insert(v) { op = 'insert'; valor = v; return q; },
        select(v) { valor = v; return q; },
        update(v) { op = 'update'; valor = v; return q; },
        delete() { op = 'delete'; return q; },
        eq(k, v) { filtros.push([k, v]); return q; },
        single() { return q; },
        maybeSingle() { return q; },
        then(resolve, reject) {
          llamadas.push({ tipo: 'tabla', tabla, op, valor, filtros: [...filtros] });
          const r = { data: null, error: null };
          if (tabla === 'stripe_webhook_eventos' && op === 'insert') {
            if (dedup.has(valor.event_id)) r.error = { code: '23505', message: 'duplicado' };
            else dedup.add(valor.event_id);
          } else if (tabla === 'stripe_webhook_eventos' && op === 'delete') {
            if (fallaBorradoDedup) r.error = { code: '08006', message: 'BD no disponible' };
            else for (const [k, v] of filtros) if (k === 'event_id') dedup.delete(v);
          } else if (tabla === 'pagos' && op === 'select') {
            r.data = { id: 'pago-1', cita_id: 'cita-1', negocio_id: 'salon-a', tipo: 'total', metadata: {} };
          }
          return Promise.resolve(r).then(resolve, reject);
        },
      };
      return q;
    },
  };

  class Stripe {
    constructor() { this.webhooks = { constructEventAsync: async (body) => JSON.parse(body) }; }
  }

  vm.runInNewContext(codigo, {
    Stripe,
    createClient: () => supabase,
    claveServicio: () => 'clave-sintetica',
    Deno: { env: { get: () => '' }, serve: (fn) => { handler = fn; } },
    URL, Date, Response, console: { log() {}, warn() {}, error() {} },
  });

  // Deno.serve convierte una excepcion que se escapa del handler en un 500. Se emula
  // aqui a proposito: sin esto, un `throw` suelto reventaria el test en vez de
  // producir la respuesta que Stripe ve de verdad, y la prueba mediria otra cosa.
  const invocar = async (evento, negocio = '') => {
    const req = new Request('https://example.invalid/webhook' + (negocio ? '?negocio=' + negocio : ''), {
      method: 'POST',
      body: JSON.stringify(evento),
      headers: { 'stripe-signature': 'firma-sintetica-validada' },
    });
    try {
      return await handler(req);
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }
  };

  const conciliaciones = () =>
    llamadas.filter((c) => c.tipo === 'rpc' && c.name === 'registrar_cobro_online').length;

  return { llamadas, invocar, conciliaciones, dedup };
}

function evento(id, { tipo = 'checkout.session.completed', estadoPago = 'paid' } = {}) {
  return {
    id,
    created: Math.floor(Date.now() / 1000),
    type: tipo,
    data: {
      object: {
        id: 'checkout-1',
        client_reference_id: 'pago-1',
        payment_intent: 'pi-1',
        mode: 'payment',
        payment_status: estadoPago,
        metadata: { pago_id: 'pago-1' },
      },
    },
  };
}

test('un fallo de conciliacion devuelve 500 y LIBERA el dedup, para que el reintento reintente de verdad', async () => {
  const s = montar({ fallaRpc: true });

  const primera = await s.invocar(evento('evt-reintento'));
  assert.equal(primera.status, 500, 'un fallo de conciliacion no puede contestarse con 200');
  assert.equal(s.dedup.has('evt-reintento'), false, 'la fila de dedup tiene que quedar liberada');

  const reintento = await s.invocar(evento('evt-reintento'));
  assert.equal(reintento.status, 500, 'el reintento vuelve a intentarlo (y vuelve a fallar, porque la BD sigue rota)');
  assert.equal(s.conciliaciones(), 2, 'el reintento tiene que INTENTAR conciliar otra vez, no rebotar como duplicado');
});

test('un duplicado de verdad (el primero fue bien) sigue contestando 200 sin volver a cobrar', async () => {
  const s = montar();

  const primera = await s.invocar(evento('evt-ok'));
  assert.equal(primera.status, 200);
  assert.equal(s.conciliaciones(), 1);

  const duplicado = await s.invocar(evento('evt-ok'));
  assert.equal(duplicado.status, 200);
  assert.equal(s.conciliaciones(), 1, 'un evento ya conciliado NO se concilia dos veces');
});

test('si ni siquiera se puede liberar el dedup, contesta 500 (nunca 200) para no dar por bueno lo perdido', async () => {
  const s = montar({ fallaRpc: true, fallaBorradoDedup: true });

  const r = await s.invocar(evento('evt-sin-limpieza'));
  assert.equal(r.status, 500);
  assert.equal(s.dedup.has('evt-sin-limpieza'), true, 'la fila sigue puesta: es el caso que se grita en los logs');
});

test('un pago diferido confirmado (async_payment_succeeded) se concilia', async () => {
  const s = montar();

  const r = await s.invocar(evento('evt-async', { tipo: 'checkout.session.async_payment_succeeded' }));
  assert.equal(r.status, 200);
  assert.equal(s.conciliaciones(), 1, 'sin esta rama el pago diferido no se registraba nunca');
});

test('una sesion cerrada sin pagar no marca el pago como pagado', async () => {
  const s = montar();

  const r = await s.invocar(evento('evt-impagado', { estadoPago: 'unpaid' }));
  assert.equal(r.status, 200);
  const escrituras = s.llamadas.filter((c) => c.tipo === 'tabla' && c.tabla === 'pagos' && c.op === 'update');
  assert.equal(escrituras.length, 0, 'payment_status unpaid no puede escribir estado=pagado');
});
