# Vender el plan de software y el addon de IA en Stripe

**Fecha:** 8 ago 2026 · **Autor:** Alexandro (pagos) · **Estado:** diseño aprobado, sin implementar

## Por qué

Carlos rehízo el pricing el 7-8 de agosto (commits `7c62cd48`, `7e227231`, `9cdf68d5`). El modelo
publicado hoy en `web/index.html`, en el prompt de `chispa-landing` y en `lib/planes.ts` es:

| Concepto | Precio (sin IVA) |
|---|---|
| Software **Esencial** | 39 €/mes |
| Software **Estudio** | 59 €/mes |
| Addon **Recepcionistas** — solo WhatsApp | +19 €/mes |
| Addon **Recepcionistas** — solo voz | +29 €/mes |
| Addon **Recepcionistas** — completo | +39 €/mes |

Esencial y Estudio dan **el mismo software**: la diferencia de precio no gatea ninguna función
(así está documentado en `Hairy/CLAUDE.md` y en `lib/planes.ts`). Lo que sí gatea es `ia_nivel`,
ortogonal al plan.

El cobro de la suscripción (`crear-checkout-suscripcion` v2, `stripe-webhook` v24) se construyó
**antes** de esa reestructura y solo sabe vender un plan de software. Nada de lo que hay hoy puede
cobrar el addon, y la RPC que sella el resultado ni siquiera acepta `ia_nivel`.

## Qué es esto y qué no

Esto es la suscripción que **Mecha cobra al salón**. Va siempre por la cuenta Stripe de
PLATAFORMA (`STRIPE_SECRET_KEY`). No confundir con los cobros del salón a sus clientas, que van
por la clave del salón en Vault (`stripeParaNegocio()`). Ese código no se toca aquí.

## Decisiones tomadas

1. **El cobro se difiere al final de la prueba.** El salón deja la tarjeta cuando quiera durante el
   mes gratis y no se le cobra hasta que caduca.
2. **Solo ciclo mensual.** El anual se valorará después del lanzamiento; añadirlo ahora duplica el
   catálogo y complica cambios de plan y bajas justo antes de abrir.
3. **Una sola suscripción con dos líneas**, no dos suscripciones.
4. **El addon se puede activar y quitar solo**, sin escribir a soporte. La landing ya lo promete.

## Diseño

### 1. Catálogo en Stripe (manual, cuenta de plataforma)

Tres productos, cinco precios recurrentes mensuales en EUR:

- **Mecha Esencial** → 39,00 €/mes
- **Mecha Estudio** → 59,00 €/mes
- **Recepcionistas IA** → tres precios: 19,00 € (WhatsApp), 29,00 € (voz), 39,00 € (completa)

Productos separados para el software porque la factura tiene que decir "Mecha Estudio", no un
nombre genérico. Los tres niveles de IA cuelgan de un único producto: "Recepcionistas IA" describe
bien los tres, y cambiar de nivel es entonces cambiar de precio dentro del mismo producto.

Además: tasa de IVA del 21% creada a mano (decisión previa: sin Stripe Tax, solo España).

Secrets a poner en Supabase:

| Secret | Contenido |
|---|---|
| `STRIPE_PRICE_ESENCIAL` | `price_...` de 39 € |
| `STRIPE_PRICE_ESTUDIO` | `price_...` de 59 € |
| `STRIPE_PRICE_IA_WHATSAPP` | `price_...` de 19 € |
| `STRIPE_PRICE_IA_VOZ` | `price_...` de 29 € |
| `STRIPE_PRICE_IA_COMPLETA` | `price_...` de 39 € |
| `STRIPE_TAX_RATE_IVA` | `txr_...` del 21% |

Los `price_` de test y los de producción son distintos: cada entorno pone los suyos. Por eso van
por secret y no hardcodeados.

### 2. Checkout: `crear-checkout-suscripcion`

Acepta en el body `{ plan, ia_nivel }` en vez de solo `{ plan }`.

- `line_items`: el precio del plan, y **si `ia_nivel !== 'ninguna'`**, también el precio del addon.
  Los dos con la tasa de IVA.
- `subscription_data.trial_end`: el `trial_ends_at` del perfil, en segundos, **solo si es futuro**.
  Si la prueba ya venció o no existe, no se manda y se cobra en el acto. Stripe no exige un mínimo
  de antelación (el único límite es un máximo de 2 años), así que contratar el último día funciona.
- `payment_method_collection: 'always'`: es el valor por defecto, pero se pone explícito porque es
  el que sostiene todo el diseño. Con `if_required` Stripe no pediría tarjeta al ser 0 € el importe
  de hoy y llegaríamos al final de la prueba sin forma de cobrar.
- **No** se usa `trial_settings.end_behavior.missing_payment_method`: solo aplica cuando el método
  de pago puede faltar, y aquí siempre se recoge. Sería código muerto.
- `subscription_data.metadata`: `profile_id`, `negocio_id`, `plan`, `ia_nivel`.

Sigue siendo **owner-only** y sigue rechazando con 409 a quien ya tiene suscripción viva: cambiar
de plan o de addon no se hace abriendo otro checkout.

### 3. Cambiar el addon después: edge nueva `cambiar-addon-ia`

Owner-only, sobre una suscripción ya existente. Recibe `{ ia_nivel }` y:

- **De `ninguna` a algo**: añade un item con el precio correspondiente.
- **De algo a otro nivel**: cambia el precio de ese item.
- **De algo a `ninguna`**: borra el item.

Con `proration_behavior: 'create_prorations'`, para que el cambio a mitad de ciclo se ajuste en la
siguiente factura en lugar de generar un cobro suelto.

Caso a respetar: si la suscripción está en `trialing`, el prorrateo no debe adelantar ningún cobro.
Stripe no prorratea dentro de un trial, así que el comportamiento correcto sale solo, pero hay que
verificarlo en test antes de darlo por bueno.

No se toca `profiles.ia_nivel` desde esta función: lo escribe el webhook cuando Stripe confirma.
Una sola fuente de verdad, y así un fallo a medias no deja la BD diciendo que hay IA contratada
cuando Stripe no la está cobrando.

### 4. Portal de cliente

Sigue existiendo `portal-suscripcion` para tarjeta, facturas, datos fiscales y baja. El cambio de
addon **no** pasa por ahí (el portal no gestiona bien una línea opcional). El cambio de plan de
software sí puede configurarse en el portal.

### 5. Webhook: leer las dos líneas

`planDePrecio(priceId)` se sustituye por una función que recorre `sub.items.data` y devuelve el par
`{ plan, ia_nivel }`:

- Un item cuyo price coincide con Esencial o Estudio → ese plan.
- Un item cuyo price coincide con uno de los tres de IA → ese `ia_nivel`.
- Ningún item de IA → `ia_nivel = 'ninguna'`.
- Price desconocido → se registra en log y **no se toca nada** de lo que no se haya reconocido.

En `customer.subscription.deleted` (o estado `canceled`), plan `free` y `ia_nivel` `ninguna`.

### 6. Migración: `aplicar_suscripcion_stripe` acepta `ia_nivel`

Parámetro nuevo `p_ia_nivel text default null`, validado contra
`('ninguna','whatsapp','voz','completa')`, aplicado con el mismo patrón `coalesce` que el resto.
Sigue siendo solo `service_role` y sigue poniendo `mecha.identity_ctx` (el trigger
`guard_profile_identity_columns` congela `ia_nivel` igual que `plan`).

Ojo al crear la función nueva: la firma cambia, así que hay que hacer `drop function` de la vieja
o quedarán las dos sobrecargadas y el webhook podría resolver a la que no toca.

Después de aplicarla, propagar al equipo con `sincronizar_plan_negocio`, que ya arrastra `ia_nivel`.

### 7. `lib/planes.ts`

Añadir `IA_PRECIO_EUR: Record<IaNivel, number>` = `{ ninguna: 0, whatsapp: 19, voz: 29, completa: 39 }`.
Hoy esos precios solo existen en la landing y en el prompt de Chispa; la app no tiene de dónde
leerlos, y la sección de Ajustes los necesita para enseñar el total.

### 8. UI de Ajustes (`SeccionSuscripcion.web.tsx`)

- **Arreglar la frase rota**: `EXTRAS_ESTUDIO` quedó vacío tras la reestructura, así que hoy se lee
  "Todo lo de Esencial, mas ." El resumen pasa a describir el software completo, igual en los dos.
- **Contratar**: elegir plan y addon en la misma pantalla, con el total sumado (p. ej. "59 € + 39 €
  = 98 €/mes + IVA") antes de mandar a Stripe.
- **Durante la prueba con tarjeta ya puesta**: el texto dice **"Primer cobro"** y la fecha, no
  "Próxima renovación". Se distingue porque `trial_ends_at` sigue en el futuro.
- **Ya suscrito**: se ve el plan y el addon activos, y el addon se cambia ahí mismo (llamando a
  `cambiar-addon-ia`), sin salir a Stripe.

### 9. Botones de la landing

Los dos "Empezar con 1 mes gratis" abren hoy el mismo modal y la elección de plan se pierde: llegan
dos solicitudes idénticas y quien concede el acceso no sabe a qué precio venía el salón.

Cada botón pasa su plan al modal, de ahí al formulario "quiero el software", y de ahí a
`meta: { origen: 'precios', plan: 'estudio' }` en `solicitudes` y al correo de
`notificar-solicitud`.

No hay checkout desde la landing, y no lo va a haber en esta iteración: las cuentas nuevas nacen en
`demo_salon_001` con plan `free`, y el mes de prueba solo arranca cuando alguien del equipo concede
el acceso completo (`staff_grant_full_access`).

## Qué NO entra

- Pago anual.
- Cambio de plan de software desde nuestra UI (eso lo hace el portal de Stripe).
- Qué hacer ante un impago: hoy el webhook marca `pago_pendiente`/`impagada` y no corta nada,
  con `periodo_fin` de margen. Sigue igual, es decisión aparte.
- Los avisos de fin de prueba (día 7/21/28/30) — es P0-006.

## Riesgos y cómo se comprueban

| Riesgo | Comprobación |
|---|---|
| El trial no coge la fecha y se cobra el día 1 | En test, checkout con `trial_ends_at` futuro: la factura de hoy debe ser 0 € y `current_period_end` = fin de la prueba |
| Se guarda la tarjeta pero al acabar el trial no cobra | Adelantar el reloj de la suscripción en test y comprobar que llega `invoice.paid` |
| El webhook lee mal la línea del addon | Suscripción de test con las dos líneas: `profiles` debe quedar con plan y `ia_nivel` correctos |
| La firma vieja de la RPC sigue viva | `select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'aplicar_suscripcion_stripe'` debe devolver **una** fila |
| El addon no se propaga al equipo | Sin verificar todavía: a día de hoy ningún salón real tiene trabajadores |

## Dependencias externas (no las puede hacer Claude)

Todo lo del dashboard de Stripe es manual y de Alexandro: crear los 3 productos y los 5 precios,
la tasa de IVA, poner los 6 secrets, suscribir los eventos `customer.subscription.*`,
`invoice.paid` e `invoice.payment_failed`, y **activar el portal de cliente** (sin eso
`portal-suscripcion` devuelve 502).

Los productos, los precios y la tasa de IVA se pueden crear con
`scripts/stripe-catalogo-suscripcion.mjs`, que es idempotente y al terminar imprime los secrets
listos para pegar. Lo ejecuta una persona con su propia clave en el entorno:

```
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-catalogo-suscripcion.mjs
```

Hay que ejecutarlo **una vez por entorno**: los `price_` de test y los de producción son
distintos. Lo que el script no hace, porque no tiene API: activar el portal y suscribir los
eventos del webhook.
