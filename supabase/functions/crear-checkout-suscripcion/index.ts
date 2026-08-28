// P0-001 · Alta de la suscripcion de Mecha (el salon empieza a pagar).
//
// CUENTA: SIEMPRE la de PLATAFORMA (STRIPE_SECRET_KEY). Mecha es BYOP mono-cuenta y
// cada salon tiene su propia clave Stripe en Vault para cobrar a SUS clientas; esa
// clave no pinta nada aqui. NO usar stripeParaNegocio() en este archivo.
//
// QUE SE VENDE (reestructura del 7 ago 2026): el software (Esencial 39 / Estudio 59,
// mismas funciones, solo cambia el precio) y, aparte y opcional, el addon de IA
// "Recepcionistas" (whatsapp 19 / voz 29 / completa 39). Van como DOS LINEAS de la
// MISMA suscripcion: una sola factura, un solo cargo y una sola baja.
//
// TRIAL: el mes gratis es SIN TARJETA y no crea nada en Stripe mientras dura; vive
// en profiles.trial_ends_at. Cuando el salon convierte, esta funcion le pasa a
// Stripe trial_end = esa misma fecha, asi que deja la tarjeta hoy y no se le cobra
// hasta que la prueba caduca. Contratar antes de tiempo no le cuesta dias.

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { clavePublicable, claveServicio } from '../shared/claveServicio.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(SUPABASE_URL, claveServicio());

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });

// Los price_... de prueba y los de produccion son distintos: cada entorno pone los suyos.
const PRECIOS: Record<string, string> = {
  esencial: Deno.env.get('STRIPE_PRICE_ESENCIAL') ?? '',
  estudio: Deno.env.get('STRIPE_PRICE_ESTUDIO') ?? '',
};
// El addon de IA. 'ninguna' no tiene precio: es no llevar la segunda linea.
const PRECIOS_IA: Record<string, string> = {
  whatsapp: Deno.env.get('STRIPE_PRICE_IA_WHATSAPP') ?? '',
  voz: Deno.env.get('STRIPE_PRICE_IA_VOZ') ?? '',
  completa: Deno.env.get('STRIPE_PRICE_IA_COMPLETA') ?? '',
};
// Tasa de IVA 21% creada a mano en Stripe (decision: sin Stripe Tax, solo España).
const TAX_RATE_IVA = Deno.env.get('STRIPE_TAX_RATE_IVA') ?? '';
const APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://www.mechaa.es').replace(/\/$/, '');

// Estados en los que NO tiene sentido abrir otro checkout.
const YA_TIENE_ACCESO = new Set(['activa', 'pago_pendiente']);

// Cupon de referidos por porcentaje, con id determinista (`mecha_ref_20`): se
// intenta leer y solo se crea si no estaba. Hay uno por valor porque el
// `percent_off` de un cupon de Stripe es inmutable.
// OJO: hay una copia de esto en `sincronizar-descuento-referidos`, que es quien
// mantiene el descuento al dia despues de contratar. Si cambia el criterio del
// cupon, cambian las dos.
async function cuponDe(pct: number): Promise<string> {
  const id = `mecha_ref_${pct}`;
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    await stripe.coupons.create({
      id,
      percent_off: pct,
      duration: 'forever',
      name: `Referidos -${pct}%`,
      metadata: { mecha_ref: '1' },
    });
  }
  return id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1) Quien llama: tiene que ser el propietario de un negocio.
  const authHeader = req.headers.get('Authorization') || '';
  const caller = createClient(SUPABASE_URL, clavePublicable(), {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerAuth } = await caller.auth.getUser();
  const user = callerAuth?.user;
  if (!user) return json({ error: 'not_authenticated' }, 401);

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, email, role, negocio_id, nombre_negocio, stripe_customer_id, suscripcion_estado, trial_ends_at, descuento_pct')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) return json({ error: 'profile_not_found' }, 404);
  // SOLO el propietario, no admin. El plan del salon se lee de la fila del owner
  // (plan_del_negocio) y el equipo lo hereda de ahi: una suscripcion sellada en la
  // fila de un admin dejaria al salon entero sin plan, y la sincronizacion
  // posterior le pisaria el plan recien pagado con el viejo del owner.
  if (perfil.role !== 'owner') return json({ error: 'not_authorized' }, 403);
  if (!perfil.negocio_id) return json({ error: 'no_negocio' }, 400);
  if (YA_TIENE_ACCESO.has(perfil.suscripcion_estado ?? '')) {
    // Cambiar de plan o de tarjeta se hace desde el portal de cliente, y el addon
    // desde cambiar-addon-ia. Abrir otro checkout crearia una segunda suscripcion.
    return json({ error: 'ya_suscrito', estado: perfil.suscripcion_estado }, 409);
  }

  // 2) Plan y addon pedidos.
  let body: { plan?: string; ia_nivel?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const plan = String(body.plan ?? '').toLowerCase();
  const priceId = PRECIOS[plan];
  if (!priceId) {
    // Falta el secret o el plan no existe: mejor fallar claro que cobrar mal.
    console.error('plan sin precio configurado:', plan);
    return json({ error: 'plan_no_disponible', plan }, 400);
  }

  const iaNivel = String(body.ia_nivel ?? 'ninguna').toLowerCase();
  if (iaNivel !== 'ninguna' && !(iaNivel in PRECIOS_IA)) {
    return json({ error: 'ia_nivel_no_valido', ia_nivel: iaNivel }, 400);
  }
  const priceIdIa = iaNivel === 'ninguna' ? '' : PRECIOS_IA[iaNivel];
  if (iaNivel !== 'ninguna' && !priceIdIa) {
    // El nivel existe pero su secret no esta puesto: no se vende el software a
    // secas por su cuenta, porque el salon creeria que ha contratado la IA.
    console.error('addon de IA sin precio configurado:', iaNivel);
    return json({ error: 'addon_no_disponible', ia_nivel: iaNivel }, 400);
  }

  try {
    // 3) Customer de plataforma. Se reutiliza si ya existe para no duplicar clientes
    //    cuando alguien abandona el checkout y vuelve a intentarlo.
    let customerId = perfil.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: perfil.email ?? user.email ?? undefined,
        name: perfil.nombre_negocio ?? undefined,
        metadata: { profile_id: perfil.id, negocio_id: perfil.negocio_id },
      });
      customerId = customer.id;
      // Se guarda ya: si el salon abandona el checkout, el customer no se pierde.
      await admin.rpc('aplicar_suscripcion_stripe', {
        p_stripe_customer_id: customerId,
        p_profile_id: perfil.id,
      });
    }

    // 4) Lineas: el software siempre, el addon solo si lo ha pedido.
    const conIva = TAX_RATE_IVA ? { tax_rates: [TAX_RATE_IVA] } : {};
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1, ...conIva },
    ];
    if (priceIdIa) lineItems.push({ price: priceIdIa, quantity: 1, ...conIva });

    // 5) El mes gratis que ya corre en la BD se traslada a Stripe. Solo si queda
    //    futuro: si la prueba ya vencio se cobra hoy, que es lo correcto. Stripe no
    //    exige antelacion minima, asi que contratar el ultimo dia tambien vale.
    const finPrueba = perfil.trial_ends_at ? Math.floor(new Date(perfil.trial_ends_at).getTime() / 1000) : 0;
    const ahora = Math.floor(Date.now() / 1000);
    const trial = finPrueba > ahora ? { trial_end: finPrueba } : {};

    // 5.b) Descuento de referidos. Se aplica ya en el checkout para que el salon
    //      lo VEA al pagar, no solo en la factura siguiente. A partir de aqui lo
    //      mantiene al dia el cron `mecha_descuento_referidos`, porque el
    //      porcentaje cambia cuando otro salon de su red empieza o deja de pagar.
    const pctReferidos = Math.round(Number(perfil.descuento_pct ?? 0));
    const descuento = pctReferidos > 0
      ? { discounts: [{ coupon: await cuponDe(pctReferidos) }] }
      : {};

    // 6) Checkout. El profile_id viaja tambien en subscription_data para que los
    //    eventos customer.subscription.* lo lleven encima y el webhook no dependa
    //    de haber guardado antes el customer.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      locale: 'es',
      line_items: lineItems,
      // Es el valor por defecto, pero se deja explicito porque sostiene el diseño:
      // con 'if_required' Stripe no pediria tarjeta al ser 0 € el importe de hoy y
      // llegariamos al final de la prueba sin nada con que cobrar.
      payment_method_collection: 'always',
      ...descuento,
      subscription_data: {
        ...trial,
        metadata: { profile_id: perfil.id, negocio_id: perfil.negocio_id, plan, ia_nivel: iaNivel },
      },
      metadata: { profile_id: perfil.id, negocio_id: perfil.negocio_id, plan, ia_nivel: iaNivel },
      client_reference_id: perfil.id,
      // La pantalla es (tabs)/configuracion, no "ajustes": mandar a una ruta que no
      // existe justo despues de pagar seria el peor 404 posible.
      success_url: `${APP_URL}/app/configuracion?suscripcion=ok`,
      cancel_url: `${APP_URL}/app/configuracion?suscripcion=cancelado`,
      // Datos fiscales del salon: hacen falta para la factura que emite Mecha.
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      // Al reutilizar un customer existente, Stripe exige permiso explicito para
      // actualizar sus datos cuando el checkout recoge direccion / ID fiscal.
      customer_update: { name: 'auto', address: 'auto' },
    });

    if (!TAX_RATE_IVA) {
      console.error('STRIPE_TAX_RATE_IVA sin configurar: la suscripcion se cobrara SIN IVA');
    }

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error('checkout suscripcion fallo:', (e as Error)?.message ?? e);
    return json({ error: 'stripe_error' }, 502);
  }
});
