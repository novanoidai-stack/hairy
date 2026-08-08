// Crea en Stripe el catalogo de la suscripcion de Mecha: los 3 productos, los 5
// precios y la tasa de IVA. Idempotente: se puede ejecutar las veces que haga
// falta, reutiliza lo que ya exista y solo crea lo que falte.
//
// LO EJECUTA UNA PERSONA, no un agente: la clave secreta se lee del entorno y
// nunca se escribe en disco ni se pasa por argumento (quedaria en el historial).
//
//   Test:        STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-catalogo-suscripcion.mjs
//   Produccion:  STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-catalogo-suscripcion.mjs
//
// En PowerShell:
//   $env:STRIPE_SECRET_KEY='sk_test_...'; node scripts/stripe-catalogo-suscripcion.mjs
//
// Al terminar imprime los identificadores listos para pegar como secrets de
// Supabase. Los de test y los de produccion son DISTINTOS: hay que ejecutarlo una
// vez por entorno y guardar cada tanda en su sitio.
//
// Sin dependencias a proposito: el repo no tiene el SDK de Stripe instalado y esto
// no merece añadirlo.

const CLAVE = process.env.STRIPE_SECRET_KEY;
if (!CLAVE) {
  console.error('Falta STRIPE_SECRET_KEY en el entorno. Ver la cabecera de este archivo.');
  process.exit(1);
}
const ENTORNO = CLAVE.startsWith('sk_live_') ? 'PRODUCCION' : 'test';

// El catalogo, tal y como se anuncia en la seccion #precios de web/index.html y en
// lib/planes.ts. Si cambian los precios, cambian los tres sitios.
const SOFTWARE = [
  { id: 'esencial', nombre: 'Mecha Esencial', cents: 3900, secret: 'STRIPE_PRICE_ESENCIAL' },
  { id: 'estudio', nombre: 'Mecha Estudio', cents: 5900, secret: 'STRIPE_PRICE_ESTUDIO' },
];
// Los tres niveles cuelgan de UN producto: en la factura "Recepcionistas IA" vale
// para los tres, y asi cambiar de nivel es cambiar de precio dentro del mismo.
const ADDON_PRODUCTO = { id: 'ia', nombre: 'Recepcionistas IA' };
const ADDON = [
  { id: 'ia_whatsapp', apodo: 'WhatsApp', cents: 1900, secret: 'STRIPE_PRICE_IA_WHATSAPP' },
  { id: 'ia_voz', apodo: 'Voz', cents: 2900, secret: 'STRIPE_PRICE_IA_VOZ' },
  { id: 'ia_completa', apodo: 'WhatsApp + voz', cents: 3900, secret: 'STRIPE_PRICE_IA_COMPLETA' },
];

async function stripe(metodo, ruta, datos) {
  const res = await fetch(`https://api.stripe.com/v1${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${CLAVE}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: datos ? new URLSearchParams(datos).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${metodo} ${ruta}: ${json.error?.message ?? res.status}`);
  return json;
}

// Los productos se reconocen por metadata.mecha_id, no por el nombre: el nombre es
// texto comercial y puede cambiar sin que eso signifique que sea otro producto.
async function productoDe(mechaId, nombre) {
  const busca = await stripe('GET', `/products/search?query=${encodeURIComponent(`metadata['mecha_id']:'${mechaId}'`)}`);
  if (busca.data?.length) return { id: busca.data[0].id, creado: false };
  const nuevo = await stripe('POST', '/products', {
    name: nombre,
    'metadata[mecha_id]': mechaId,
  });
  return { id: nuevo.id, creado: true };
}

// Los precios en Stripe son inmutables, asi que la idempotencia va por lookup_key:
// si ya existe uno con esa clave se reutiliza y no se crea un duplicado.
async function precioDe(lookupKey, productId, cents, apodo) {
  const busca = await stripe('GET', `/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`);
  if (busca.data?.length) return { id: busca.data[0].id, creado: false };
  const nuevo = await stripe('POST', '/prices', {
    product: productId,
    unit_amount: String(cents),
    currency: 'eur',
    'recurring[interval]': 'month',
    lookup_key: lookupKey,
    ...(apodo ? { nickname: apodo } : {}),
  });
  return { id: nuevo.id, creado: true };
}

// El IVA no lo calcula Stripe Tax: es una tasa fija del 21%, solo España.
async function tasaIva() {
  const lista = await stripe('GET', '/tax_rates?active=true&limit=100');
  const ya = lista.data?.find((t) => t.metadata?.mecha_id === 'iva_21');
  if (ya) return { id: ya.id, creado: false };
  const nueva = await stripe('POST', '/tax_rates', {
    display_name: 'IVA',
    description: 'IVA 21% (España)',
    percentage: '21',
    inclusive: 'false',
    country: 'ES',
    'metadata[mecha_id]': 'iva_21',
  });
  return { id: nueva.id, creado: true };
}

const marca = (r) => (r.creado ? 'creado' : 'ya existia');

async function main() {
  console.log(`Catalogo de la suscripcion de Mecha — entorno ${ENTORNO}\n`);
  const secrets = [];

  for (const p of SOFTWARE) {
    const prod = await productoDe(p.id, p.nombre);
    const precio = await precioDe(`mecha_${p.id}_mes`, prod.id, p.cents, p.nombre);
    console.log(`${p.nombre.padEnd(22)} ${(p.cents / 100).toFixed(2)} €/mes  producto ${marca(prod)}, precio ${marca(precio)}`);
    secrets.push([p.secret, precio.id]);
  }

  const prodIa = await productoDe(ADDON_PRODUCTO.id, ADDON_PRODUCTO.nombre);
  for (const a of ADDON) {
    const precio = await precioDe(`mecha_${a.id}_mes`, prodIa.id, a.cents, a.apodo);
    console.log(`${`Recepcionistas · ${a.apodo}`.padEnd(22)} ${(a.cents / 100).toFixed(2)} €/mes  producto ${marca(prodIa)}, precio ${marca(precio)}`);
    secrets.push([a.secret, precio.id]);
  }

  const iva = await tasaIva();
  console.log(`${'IVA 21%'.padEnd(22)}              tasa ${marca(iva)}`);
  secrets.push(['STRIPE_TAX_RATE_IVA', iva.id]);

  console.log('\nSecrets para Supabase (Edge Functions > Secrets):\n');
  for (const [k, v] of secrets) console.log(`${k}=${v}`);
  console.log('\nFalta a mano en el dashboard, esto no lo hace el script:');
  console.log('  - Activar el portal de cliente (sin eso portal-suscripcion devuelve 502).');
  console.log('  - Suscribir el webhook a customer.subscription.*, invoice.paid e invoice.payment_failed.');
}

main().catch((e) => {
  console.error('\nHa fallado:', e.message);
  process.exit(1);
});
