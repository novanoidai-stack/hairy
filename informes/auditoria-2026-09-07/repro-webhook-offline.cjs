// Auditoria offline: ejecuta el handler REAL de stripe-webhook con dependencias simuladas.
// No llama a Stripe/Supabase ni usa credenciales. La firma se da por validada para
// comprobar la autorizacion y la conciliacion posteriores a una firma valida.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const code = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup({ failRpc = false, failDedup = false } = {}) {
  const calls = [];
  const seen = new Set();
  let handler;
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      if (name === 'pasarela_stripe_webhook_secret') return { data: 'synthetic-signing-secret', error: null };
      return { data: null, error: failRpc ? { code: 'XX000', message: 'simulated database failure' } : null };
    },
    from(table) {
      let op = 'select', value = null;
      const filters = [];
      const query = {
        insert(v) { op = 'insert'; value = v; return query; },
        select(v) { value = v; return query; },
        update(v) { op = 'update'; value = v; return query; },
        eq(k, v) { filters.push([k, v]); return query; },
        single() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          calls.push({ kind: 'table', table, op, value, filters: [...filters] });
          let result = { data: null, error: null };
          if (table === 'stripe_webhook_eventos' && op === 'insert') {
            if (failDedup) result.error = { code: '08006', message: 'database unavailable' };
            else if (seen.has(value.event_id)) result.error = { code: '23505', message: 'duplicate' };
            else seen.add(value.event_id);
          } else if (table === 'pagos' && op === 'select') {
            result.data = { id: 'payment-salon-b', cita_id: 'appointment-salon-b', negocio_id: 'salon-b', tipo: 'total', importe_cents: 7500, metadata: {} };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  class Stripe {
    constructor() { this.webhooks = { constructEventAsync: async (body) => JSON.parse(body) }; }
  }
  vm.runInNewContext(code, {
    Stripe, createClient: () => supabase, claveServicio: () => 'synthetic-service-key',
    Deno: { env: { get: () => '' }, serve: (fn) => { handler = fn; } },
    URL, Date, Response, console,
  });
  async function invoke(event, negocio = '') {
    return handler(new Request('https://example.invalid/webhook' + (negocio ? '?negocio=' + negocio : ''), {
      method: 'POST', body: JSON.stringify(event), headers: { 'stripe-signature': 'synthetic-validated-signature' },
    }));
  }
  return { calls, invoke };
}

function event(id, created = Math.floor(Date.now() / 1000)) {
  return { id, created, type: 'checkout.session.completed', data: { object: {
    id: 'checkout-salon-a', client_reference_id: 'payment-salon-b', payment_intent: 'intent-salon-a',
    amount_total: 1, currency: 'eur', payment_status: 'unpaid', metadata: { pago_id: 'payment-salon-b' },
  } } };
}

(async () => {
  const lost = setup({ failRpc: true });
  const first = await lost.invoke(event('event-retry'));
  const second = await lost.invoke(event('event-retry'));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(lost.calls.filter(c => c.kind === 'rpc' && c.name === 'registrar_cobro_online').length, 1);
  console.log('CONFIRMADO: error de conciliacion => HTTP 200; reintento => HTTP 200 duplicado; ninguna nueva conciliacion.');

  const unavailable = setup({ failDedup: true });
  const unavailableResponse = await unavailable.invoke(event('event-db-down'));
  assert.equal(unavailableResponse.status, 200);
  assert.equal(unavailable.calls.filter(c => c.kind === 'rpc').length, 0);
  console.log('CONFIRMADO: error 08006 al registrar event_id => HTTP 200 duplicado, sin procesar el pago.');

  const stale = setup();
  const staleResponse = await stale.invoke(event('event-old', Math.floor(Date.now() / 1000) - 301));
  assert.equal(staleResponse.status, 400);
  assert.equal(stale.calls.length, 0);
  console.log('CONFIRMADO: evento de cobro creado hace 301 s => HTTP 400 antes de conciliar, aunque la firma actual sea valida.');

  const foreign = setup();
  const foreignResponse = await foreign.invoke(event('event-foreign'), 'salon-a');
  assert.equal(foreignResponse.status, 200);
  const writes = foreign.calls.filter(c => c.kind === 'table' && c.table === 'pagos' && c.op === 'update');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value.estado, 'pagado');
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].filters)), [['id', 'payment-salon-b']]);
  console.log('CONFIRMADO: firma del salon A + metadata del pago B => actualiza B como pagado; sin comprobar tenant, importe ni payment_status.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
