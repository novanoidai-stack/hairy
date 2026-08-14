# Traspaso a Alexandro — ciclo de confirmación de citas (WhatsApp)

**Fecha:** 14 ago 2026 · **De:** Carlos · **Estado:** pendiente de tu lado

## Qué ha cambiado

Desde ahora **toda cita nace en `pendiente`** (antes el cliente escribía
`confirmada` al crearla). Confirmar pasa a ser un paso explícito, no el punto de
partida. El `default` de la columna en BD ya era `pendiente`; era la app la que
lo pisaba.

## Qué se queda inerte por eso (lo importante)

El estado `confirmada` es hoy la llave de tres cosas, así que con el nuevo
default dejan de dispararse solas. **Ninguna da error: simplemente no salta.**

1. **`notificaciones_pendientes()`** — el motor de envíos.
   - `confirmacion` → `where c.estado = 'confirmada' and c.confirmacion_enviada = false`
   - `recordatorio` → `where c.estado = 'confirmada' and c.recordatorio_enviado = false`
   - (la señal sí funciona: va con `estado = 'pendiente' and deposito_requerido`)
   - Resultado: una cita nueva **no recibe ni confirmación ni recordatorio**.

2. **`citas_riesgo_no_show(desde, hasta)`**
   - `where c.estado = 'confirmada' and coalesce(c.confirmada_cliente,false) = false`
   - Resultado: el riesgo de no-show **no ve** las citas nuevas.

3. **`esSinConfirmar48h`** (`lib/citasMetrics.ts`, front) — exige `esConfirmada(c)`.
   - Alimenta la campana de avisos, el banner de agenda y la página de Citas.
   - Esto es frontend y lo toco yo, pero **no lo muevo hasta que cierres el
     flujo**, para no llenar la app de avisos de citas que ni siquiera han
     recibido mensaje.

## Y el hueco de fondo

**No existe ningún camino por el que la clienta confirme desde WhatsApp.** El
mensaje de confirmación es informativo ("tu cita está confirmada"), no hay bucle
de respuesta. La única función que pone `confirmada_cliente = true` es
`confirmar_cita_oferta(p_cita_id, p_telefono)`, y solo aplica a ofertas de lista
de espera (`where es_oferta_espera = true`). Para una cita normal, nada.

## El flujo que queremos

Con señal:

```
cita creada -> pendiente
  -> se envía enlace de pago de la señal
  -> sigue PENDIENTE hasta que paga
  -> paga -> CONFIRMADA
```

Sin señal (el salón no la usa o no la exige a esa clienta):

```
cita creada -> pendiente
  -> se envía mensaje de confirmación por WhatsApp
  -> la clienta responde confirmando -> CONFIRMADA
  -> si no responde -> cuenta como riesgo de no-show
```

## Qué hace falta

1. **`notificaciones_pendientes`**: que `confirmacion` y `recordatorio` salgan
   también con `estado = 'pendiente'`, **excluyendo** las que están esperando
   señal (`deposito_requerido = true and deposito_pagado = false`), que ya tienen
   su propio mensaje y no deben recibir dos.

2. **RPC de confirmación entrante** (no existe): algo tipo
   `confirmar_cita_cliente(p_cita_id, p_telefono)` que valide el teléfono contra
   `clientes.telefono` (con `normalizar_telefono`, como hace
   `confirmar_cita_oferta`) y ponga `estado = 'confirmada'`,
   `confirmada_cliente = true`, `confirmada_at = now()`.
   Ojo con el grant: desde el round 4 las funciones nuevas no nacen ejecutables
   por `anon`, hay que dárselo explícitamente en la migración si la llama el
   portal; si la llama n8n con `service_role`, no hace falta.

3. **Workflow n8n**: interpretar la respuesta de la clienta ("sí", "ok",
   "confirmo"...) y llamar a esa RPC. Es la pieza que hoy no está.

4. **Riesgo de no-show**: decidir si `citas_riesgo_no_show` pasa a incluir
   `pendiente` (una cita sin confirmar a 24h vista es justamente el caso de
   riesgo) o si se prefiere una señal aparte.

## Detalles que te ahorran tiempo

- Estados válidos (CHECK de `citas`): `pendiente`, `confirmada`, `completada`,
  `cancelada`, `no_presentada`. No hay `finalizada` en BD aunque aparezca suelto
  en algún filtro del front.
- Campos relevantes: `confirmada_cliente`, `confirmada_at`,
  `confirmacion_enviada`, `recordatorio_enviado`, `senal_enviada`,
  `deposito_requerido`, `deposito_pagado`, `es_oferta_espera`.
- `resolverSenalStaff` (`lib/senalStaff.ts`) es quien crea la cita con
  `estado: 'pendiente' + deposito_requerido` cuando el salón exige señal. Es
  decir: **`pendiente` ya significa dos cosas** (esperando señal / esperando
  confirmación) y se distinguen por `deposito_requerido`. Si te resulta
  ambiguo, dilo y lo separamos en dos estados.
- El cron de expiración (`expirar_citas_sin_senal`) libera el hueco si no se
  paga la señal en 15 min: eso no cambia.

## Mientras tanto

En la agenda las citas sin confirmar salen en **ámbar** y las confirmadas en
verde, así que el salón puede confirmarlas a mano desde la ficha. Es un apaño
manual hasta que enganches el bucle de WhatsApp.
