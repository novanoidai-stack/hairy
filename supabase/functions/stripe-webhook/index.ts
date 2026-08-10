import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// S5 (mono-cuenta): cada salon apunta su webhook Stripe a .../stripe-webhook?negocio=<negocio_id>.
// La firma se verifica con el signing secret de ESE salon (Vault); sin ?negocio se usa el de
// plataforma. El resto (dedup + conciliacion) es identico. La verificacion de firma no usa la API
// key, solo el signing secret, asi que la instancia stripe puede seguir con la clave de plataforma.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const PLATFORM_WHSEC = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

// Precios de la suscripcion de Mecha, en la cuenta de PLATAFORMA. Van por secret y
// no hardcodeados a proposito: los price_... de prueba y los de produccion son
// distintos, asi que cada entorno pone los suyos.
const PRECIO_ESENCIAL = Deno.env.get('STRIPE_PRICE_ESENCIAL') ?? '';
const PRECIO_ESTUDIO = Deno.env.get('STRIPE_PRICE_ESTUDIO') ?? '';

// El addon de IA "Recepcionistas" es la SEGUNDA linea de la misma suscripcion
// (reestructura del 7 ago 2026), asi que hay que mirar todos los items, no solo el
// primero: el orden en el que Stripe los devuelve no esta garantizado.
const PRECIO_IA: Record<string, string> = {
  whatsapp: Deno.env.get('STRIPE_PRICE_IA_WHATSAPP') ?? '',
  voz: Deno.env.get('STRIPE_PRICE_IA_VOZ') ?? '',
  completa: Deno.env.get('STRIPE_PRICE_IA_COMPLETA') ?? '',
};
const IA_CONFIGURADA = Object.values(PRECIO_IA).some(Boolean);

// Lee las lineas de la suscripcion y devuelve que software y que addon se estan
// cobrando. null = "no se ha reconocido, no toques ese campo": mas vale dejar el
// valor viejo que borrar un plan que el salon si esta pagando.
function contratadoEn(sub: Stripe.Subscription): { plan: string | null; iaNivel: string | null } {
  let plan: string | null = null;
  let iaNivel: string | null = null;

  for (const item of sub.items?.data ?? []) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    if (priceId === PRECIO_ESENCIAL) plan = 'esencial';
    else if (priceId === PRECIO_ESTUDIO) plan = 'estudio';
    else if (priceId === PRECIO_IA.whatsapp) iaNivel = 'whatsapp';
    else if (priceId === PRECIO_IA.voz) iaNivel = 'voz';
    else if (priceId === PRECIO_IA.completa) iaNivel = 'completa';
    else console.error('price_id desconocido en la suscripcion, se ignora:', priceId);
  }

  if (!plan) console.error('suscripcion sin linea de software reconocida:', sub.id);
  // Sin linea de IA el addon esta quitado, y hay que escribirlo: es como se ve que
  // alguien lo ha desactivado. Pero solo si los precios estan configurados; si no,
  // la ausencia no significa nada y borrariamos un addon que si se cobra.
  if (!iaNivel && IA_CONFIGURADA) iaNivel = 'ninguna';

  return { plan, iaNivel };
}

// Estado de Stripe -> estado de acceso nuestro. 'prueba' no aparece: el mes gratis
// es sin tarjeta y no crea nada en Stripe, lo lleva trial_ends_at en la BD.
const ESTADO_SUSCRIPCION: Record<string, string> = {
  trialing: 'activa',
  active: 'activa',
  incomplete: 'pago_pendiente',
  past_due: 'pago_pendiente',
  unpaid: 'impagada',
  canceled: 'cancelada',
  incomplete_expired: 'cancelada',
  paused: 'pausada',
};

// Desde la API 2025+ (dahlia) invoice.subscription es null; la suscripcion vive en
// invoice.parent.subscription_details.subscription. Se admiten ambas ubicaciones.
function subDeInvoice(inv: Stripe.Invoice): string | null {
  const i = inv as unknown as {
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  };
  const directo = typeof i.subscription === 'string' ? i.subscription : i.subscription?.id;
  const viaParent = i.parent?.subscription_details?.subscription;
  const parentId = typeof viaParent === 'string' ? viaParent : viaParent?.id;
  return directo ?? parentId ?? null;
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  // Signing secret del salon segun ?negocio, o el de plataforma.
  const negocio = new URL(req.url).searchParams.get('negocio');
  let whSecret = PLATFORM_WHSEC;
  if (negocio) {
    try {
      const { data } = await supabase.rpc('pasarela_stripe_webhook_secret', { p_negocio_id: negocio });
      if (typeof data === 'string' && data.length > 5) whSecret = data;
    } catch { /* fallback plataforma */ }
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? '', whSecret);
  } catch (e) {
    // El destino de "cuentas conectadas" (S5 Connect) es un webhook aparte y firma con OTRO
    // secreto. En la URL de plataforma (sin ?negocio) reintentamos con el, asi un mismo
    // endpoint sirve para los eventos de NUESTRA cuenta Y los de las cuentas conectadas.
    const connectSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT') ?? '';
    if (!negocio && connectSecret) {
      try {
        event = await stripe.webhooks.constructEventAsync(body, sig ?? '', connectSecret);
      } catch {
        return new Response('Bad signature (connect)', { status: 400 });
      }
    } else {
      return new Response('Bad signature: ' + String((e as Error)?.message ?? e), { status: 400 });
    }
  }

  // Eventos de la SUSCRIPCION DE MECHA (cuenta de plataforma). No llevan ?negocio.
  const esSuscripcion = event.type.startsWith('customer.subscription.') ||
                        event.type.startsWith('invoice.');

  const eventTimestamp = event.created;
  const now = Math.floor(Date.now() / 1000);
  // La ventana de 5 min es anti-replay para los cobros del salon. NO se aplica al
  // ciclo de vida de la suscripcion: Stripe reintenta durante horas y un
  // invoice.payment_failed reintentado a los 10 minutos se perderia para siempre
  // (cada reintento volveria a fallar por antiguo). Ahi la proteccion real es la
  // tabla de deduplicacion por event_id, que sigue aplicandose igual.
  if (!esSuscripcion && now - eventTimestamp > 300) {
    return new Response('Stale event - replay detected', { status: 400 });
  }

  const { error: dupErr } = await supabase
    .from('stripe_webhook_eventos')
    .insert({ event_id: event.id, tipo: event.type });
  if (dupErr) return new Response('ok (dup)', { status: 200 });

  const piOf = (v: unknown): string | null =>
    typeof v === 'string' ? v : ((v as { id?: string })?.id ?? null);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const pagoId = (session.metadata?.pago_id as string) ?? (session.client_reference_id ?? '');
    const pi = piOf(session.payment_intent);
    if (pagoId) {
      if (session.metadata?.fianza_modo === 'hold') {
        await supabase.rpc('registrar_hold_colocado', { p_pago_id: pagoId, p_payment_intent: pi });
      } else {
        const { data: pago } = await supabase.from('pagos').select('cita_id, tipo, metadata').eq('id', pagoId).single();
        const mergedMeta = { ...((pago?.metadata as Record<string, unknown>) ?? {}), ...(pi ? { payment_intent: pi } : {}) };
        await supabase.from('pagos').update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: 'tarjeta', metadata: mergedMeta }).eq('id', pagoId);
        if (pago?.tipo === 'total') {
          const metodo = (pago.metadata?.metodo as string) ?? 'online';
          await supabase.rpc('registrar_cobro_online', { p_pago_id: pagoId, p_metodo: metodo });
        } else if (pago?.cita_id) {
          await supabase.from('citas').update({ deposito_pagado: true, estado: 'confirmada' }).eq('id', pago.cita_id);
        }
      }
    }
  } else if (event.type === 'payment_intent.amount_capturable_updated') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const pagoId = pi.metadata?.pago_id as string | undefined;
    if (pagoId) await supabase.rpc('registrar_hold_colocado', { p_pago_id: pagoId, p_payment_intent: pi.id });
  } else if (event.type === 'payment_intent.succeeded') {
    // S7.2 (Tap to Pay): el cobro por Terminal no pasa por checkout.session; se concilia aqui.
    // Solo actuamos sobre PaymentIntents de Terminal (canal='terminal') para no colisionar con los
    // de Checkout (ya conciliados en checkout.session.completed). Registrado como DATAFONO.
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.canal === 'terminal') {
      const pagoId = pi.metadata?.pago_id as string | undefined;
      if (pagoId) {
        const { data: pago } = await supabase.from('pagos').select('estado, metadata').eq('id', pagoId).maybeSingle();
        if (pago && pago.estado !== 'pagado') {
          const merged = { ...((pago.metadata as Record<string, unknown>) ?? {}), payment_intent: pi.id };
          await supabase.from('pagos').update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: 'datafono', metadata: merged }).eq('id', pagoId);
          await supabase.rpc('registrar_cobro_online', { p_pago_id: pagoId, p_metodo: 'datafono' });
        }
      }
    }
  } else if (event.type === 'payment_intent.canceled') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const pagoId = pi.metadata?.pago_id as string | undefined;
    if (pagoId) {
      await supabase.rpc('registrar_liberacion_hold', { p_pago_id: pagoId });
    } else {
      const { data: pago } = await supabase.from('pagos')
        .select('id').eq('metadata->>payment_intent', pi.id).eq('estado', 'retenido').maybeSingle();
      if (pago?.id) await supabase.rpc('registrar_liberacion_hold', { p_pago_id: pago.id });
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const pi = piOf(charge.payment_intent);
    const refundId = charge.refunds?.data?.[0]?.id ?? charge.id;
    if (pi) {
      await supabase.rpc('registrar_reembolso', {
        p_payment_intent: pi, p_importe_cents: charge.amount_refunded, p_refund_id: refundId,
      });
    }
  } else if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.id) {
      await supabase.from('pagos').update({ estado: 'cancelado' })
        .eq('pasarela_ref', session.id).eq('estado', 'pendiente');
    }
  } else if (event.type.startsWith('customer.subscription.')) {
    // --- Suscripcion de Mecha al salon (P0-003) ---
    const sub = event.data.object as Stripe.Subscription;
    const estado = ESTADO_SUSCRIPCION[sub.status] ?? 'pago_pendiente';
    const { plan, iaNivel } = contratadoEn(sub);
    // Al darse de baja se pierde todo: el software y el addon. Se escribe explicito
    // en vez de dejar el plan viejo, que es lo que apagaria de verdad el producto.
    const baja = estado === 'cancelada';
    // Desde la API 2025+ (dahlia) current_period_end vive en la LINEA, no en la
    // suscripcion. Se admiten ambos y se protege de undefined: un new Date(NaN)
    // reventaba el handler y, con el dedup ya escrito, el evento se perdia.
    const subP = sub as unknown as { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } };
    const finTs = subP.current_period_end ?? subP.items?.data?.[0]?.current_period_end ?? null;
    await supabase.rpc('aplicar_suscripcion_stripe', {
      p_stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      p_stripe_subscription_id: sub.id,
      p_estado: estado,
      p_periodo_fin: finTs ? new Date(finTs * 1000).toISOString() : null,
      p_plan: baja ? 'free' : plan,
      p_profile_id: (sub.metadata?.profile_id as string) ?? null,
      p_ia_nivel: baja ? 'ninguna' : iaNivel,
    });
  } else if (event.type === 'invoice.paid') {
    const inv = event.data.object as Stripe.Invoice;
    const invSub = subDeInvoice(inv);
    if (invSub) {
      await supabase.rpc('aplicar_suscripcion_stripe', {
        p_stripe_customer_id: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
        p_stripe_subscription_id: invSub,
        p_estado: 'activa',
        p_periodo_fin: inv.lines?.data?.[0]?.period?.end
          ? new Date(inv.lines.data[0].period.end * 1000).toISOString()
          : null,
      });
    }
  } else if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as Stripe.Invoice;
    if (subDeInvoice(inv)) {
      // No se corta el acceso aqui: se marca y se deja que periodo_fin haga de
      // margen. Stripe reintenta varios dias antes de dar la suscripcion por
      // impagada, y ahi llegara customer.subscription.updated con unpaid.
      await supabase.rpc('aplicar_suscripcion_stripe', {
        p_stripe_customer_id: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
        p_estado: 'pago_pendiente',
      });
    }
  } else {
    console.log('evento no manejado:', event.type);
  }
  return new Response('ok', { status: 200 });
});
