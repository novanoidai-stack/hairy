---
name: precios-y-planes
description: Dónde vive cada dato comercial de Mecha (precios de planes, funciones que gatea cada plan, precios del addon IA, referidos, tipos de solicitud) y qué ficheros hay que cambiar A LA VEZ para no dejar invariantes repartidos. Usar SIEMPRE al tocar precios, planes, suscripciones, referidos, el addon de IA, los textos de venta de la landing o los tipos de solicitud. Ya hubo un incidente — cuatro sitios prometían "el mismo software" mientras el código gateaba seis funciones.
---

# Precios, planes y datos comerciales (Mecha)

Los datos comerciales son **invariantes repartidos**: no viven en un sitio, viven en 2-4
sitios que hay que cambiar en el mismo commit. El vigilante correspondiente contrasta las
copias, pero lo correcto es no dejarle trabajo.

## Fuente única de los planes: `lib/planes.ts`

- `PLAN_PRECIO_EUR = { free: 0, esencial: 39, estudio: 59 }` (sin IVA; el 21% lo aplica Stripe).
- `PLAN_FUNCIONES`: lo que gatea cada plan. Esencial (8): agenda, clientes, portal_reserva,
  recordatorios, caja, informes, equipo, verifactu. Estudio añade (6): presupuestos,
  inventario, resenas, senales, campanas, lista_espera. `free` no da nada (sirve para mirar
  la demo; `full` es un valor histórico que se lee como `estudio`).
- Addon IA ortogonal al plan: `IA_PRECIO_EUR = { whatsapp: 19, voz: 29, completa: 39 }` —
  ojo: **completa NO es 19+29**, es 39.
- El estado que dice si un salón paga es `suscripcion_estado` (`activa`), NO el plan
  (un salón en prueba también tiene plan `estudio`). Normalmente lo escribe solo el webhook
  de Stripe; para cobros fuera de Stripe está `staff_set_cobro_manual`.

**Nunca escribas a mano un resumen de lo que incluye un plan**: compónlo de `PLAN_FUNCIONES`
(por eso `SeccionSuscripcion.web.tsx` ya lo compone). Hubo cuatro textos diciendo "los dos
dan el mismo software" mientras `PLAN_FUNCIONES` gateaba seis funciones — y un salón que
pagaba Esencial leía que incluía señales, campañas y lista de espera. Lo vigila
`scripts/vigilantes/planes.mjs`.

## Cambiar un PRECIO (plan o addon IA) = 3 sitios a la vez

1. **`lib/planes.ts`** — `PLAN_PRECIO_EUR` / `IA_PRECIO_EUR` (fuente única).
2. **`web/index.html`** — sección `#precios` (tarjetas), el JSON-LD (`"offers"` con
   lowPrice/highPrice y la oferta IA) y el **FAQPage** (las respuestas recitan las cifras:
   "39 € al mes más IVA", "WhatsApp 19 €... voz 29 €... las dos juntas 39 €").
3. **`SYSTEM_PROMPT` de `supabase/functions/chispa-landing/index.ts`** — el asistente
   comercial recita los precios DE MEMORIA. Si no se actualiza, alucina precios viejos
   con total seguridad. Tiene su propia regla anti-alucinación en el prompt.

Lo contrasta `scripts/vigilantes/precios.mjs` (anclas en las tarjetas y la calculadora).

## Cambiar los REFERIDOS = 4 sitios a la vez

Valores actuales (motor): nivel 1 −10%, nivel 2 −4%, nivel 3 −2%, **tope 30%**; al llegar
al tope, 1 mes gratis por salón de pago adicional; quien entra con tu enlace: −15% de
bienvenida.

1. **`archive/migraciones-legacy/referidos-tope-30-y-meses-gratis.sql`** — la TABLA DE
   PREMIOS, fuente única del motor (`recompute_referral_discount`, `get_my_referrals`...).
   Cambiar el motor exige migración nueva (la del archive es histórica, no se edita).
2. **`web/index.html`** sección `#hermano` (lleva comentario apuntando a la migración).
3. **Modal "Recomendar" de `web/demo.html`** (badge `-30%` y textos del share-modal).
4. **`TabReferidos` en `app/(tabs)/configuracion.web.tsx`** (textos que relatan los porcentajes).

Lo contrasta `scripts/vigilantes/referidos.mjs`. Dos trampas ya pisadas: el motor contaba
solo `plan='full'` (hoy casi nadie lo tiene — cuenta salones QUE PAGAN: plan +
`suscripcion_estado`) y solo cuenta el `owner`, no a todo el equipo.

## Añadir un TIPO de solicitud = 2 sitios a la vez

Lista actual (7): `demo`, `reserva_llamada`, `signup`, `mensaje`, `quiero_software`,
`calculadora`, `addon_ia`.

1. El **CHECK** de la tabla `solicitudes` (`solicitudes_tipo_check`).
2. La validación DENTRO de `crear_solicitud_publica`.

Si se amplía solo uno, la inserción falla con 23514 y **el lead se pierde EN SILENCIO**.
Lo vigila la comprobación 5 de `vigilancia_bd_profunda` (`bd/solicitud-tipo-huerfano:<tipo>`).

## Regla general

Al añadir CUALQUIER invariante comercial nuevo (otro dato que se promete en venta), añade
su vigilante en el mismo commit (ver skill `nuevo-vigilante`) y anota aquí — o en
`CLAUDE.md` — en cuántos sitios vive. "Al añadir uno nuevo, añade su vigilante en el mismo
commit o la próxima deriva será silenciosa otra vez."
