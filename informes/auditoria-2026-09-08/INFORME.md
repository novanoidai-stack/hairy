# Auditoría integral de Mecha — 8 de septiembre de 2026

Segunda pasada sobre la auditoría del 7 de sep (`informes/auditoria-2026-09-07/`).
Esta vez el foco ha sido verificar **qué quedó realmente cerrado** de aquella lista y
**qué estado tiene producción en vivo** (funciones desplegadas, migraciones aplicadas,
edges, backups), no solo el código del repo. El repo estaba en `e22d72e12`
("fix: cerrar hallazgos críticos de producción", anoche 01:05 CEST).

## Veredicto

El commit de anoche cerró bien la mayoría de P1 del código (webhook, CSP, captación,
coherencia comercial, importe corregido en el POS). Pero quedan **tres P0 reales**, dos
de ellos por **desfase entre lo desplegado y la base de datos**:

1. La funcionalidad de **tarjeta regalo está desplegada en la UI sin backend alguno**:
   ni las tablas ni las dos RPCs existen en producción ni en migración alguna.
2. La migración `20260907224902` está **commiteada pero sin aplicar** a la BD, así que
   la señal duplicable y el captcha opcional siguen vivos en producción.
3. Un **token personal de la Management API (`sbp_...`) se pegó en el chat** (segunda
   vez en dos días): hay que revocarlo.

## Evidencia ejecutada

- `npm run vigilar:rapido`: **1 bloqueante**, 294 avisos, 33 vigilantes.
- `npm run vigilar`: **1 bloqueante**, 295 avisos, 34 vigilantes.
- `npm run vigilar:bd`: **1 bloqueante**, 310 avisos, 43 vigilantes.
- `npx tsc --noEmit`: limpio.
- `npm run test:componentes`: 6/6 pasados.
- CI de `e22d72e12` (run 34168837819): en ejecución al cerrar este informe; Seguridad,
  Vigilancia-BD y CodeQL del mismo push ya en verde.
- Producción consultada en lectura vía Management API (evidencia en esta carpeta:
  `migraciones-sep.json`, `funciones-clave.json`, `captcha-esquema.json`,
  `regalo-y-pago-total.json`, `backups.json`).
- Prueba funcional en vivo del asistente de la landing (`chispa-landing`): responde con
  los precios y funciones exactas de planes — el incidente "qwen vacío" del 7 sep está
  resuelto.

## P0 — cerrar antes de dar producción por lista

### P0-1. Tarjeta regalo: UI en producción, backend inexistente

Verificado en vivo contra producción:

- `public.tarjetas_regalo` y `public.tarjetas_regalo_movimientos` **no existen**
  (error 42P01 al consultarlas).
- `aplicar_tarjeta_regalo_a_cobro` **no existe**; `vender_tarjeta_regalo` **no existe**,
  y **ninguna migración del repo las crea** (la única referencia a las tablas es la
  migración `20260907224902`, que las *usa* pero no las *crea*).

Mientras tanto, ya en `master` (Vercel despliega desde `master`):

- `components/pos/CobroSheet.tsx:146` consulta `.from('tarjetas_regalo')` y la sección
  "Tarjeta Regalo" (línea ~903) es visible para cualquier salón, sin gate de plan ni
  config.
- `components/pos/VentaTarjetaRegaloModal.tsx:70` llama `rpc('vender_tarjeta_regalo', ...)`
  (se abre desde Caja, `caja.web.tsx:2962`).

Efecto hoy: buscar un código da error de base de datos a cualquiera que lo pruebe; y si
algún día existiera la tabla, el flujo tiene el orden peligroso de `crear_cobro_walkin` →
`aplicarTarjetaRegalo` (CobroSheet.tsx:588-600): el cobro se crea ANTES de descontar
saldo, y si la RPC falla el usuario ve error con el cobro ya escrito → reintento = doble
cobro.

**Arreglo:** una migración que cree las dos tablas (con `negocio_id`, RLS por tenant,
índices por `codigo` y por `negocio_id`), las RPCs `vender_tarjeta_regalo` y
`aplicar_tarjeta_regalo_a_cobro` (esta última ya está bien escrita en
`20260907224902:159-198`, incluida la atadura `exige_mi_negocio` y la idempotencia por
cobro), y solo entonces desbloquear la UI (hasta entonces, ocultar la sección y el modal
detrás de una bandera). La `vender` tiene que crear tarjeta + movimiento de carga + cobro
del importe en una sola transacción.

> **Nota posterior (ae53eac76):** llegó un commit que, en lugar de ocultar la UI,
> añade un fallback en `aplicarTarjetaRegalo`: si la RPC da PGRST202, vuelve a las DOS
> escrituras separadas (saldo + movimiento), justo el patrón no transaccional que la
> RPC venía a sustituir. Hoy no arregla nada en producción (las tablas tampoco existen:
> el fallback falla igual), y solo cubriría el estado intermedio "tablas sí, RPC no".
> La exposición de la sección y el orden cobro→saldo siguen como P0 hasta que la
> migración complete el backend.

### P0-2. La migración `20260907224902` está commiteada y NO aplicada

Anoche se commiteó (e22d72e12) pero el historial remoto no la registra y las definiciones
desplegadas lo confirman:

- `crear_cita_publica` desplegada **no** fuerza canal `web` para anónimos (acepta
  `p_canal` declarado) y el captcha se consume **solo si el cliente manda token** (no lo
  exige aunque el salón lo tenga activo). La envoltura de la migración corrige ambas.
- `requerir_senal_cita` desplegada **no** tiene el bloqueo `senal_ya_pagada` ni el
  rechazo de citas canceladas/pasadas: reabrir un enlace de señal puede crear otra
  pendiente y cobrarla otra vez (P1 de ayer, sigue vivo).
- `crear_cita_publica_legacy_20260908` no existe → el `rename` no se ejecutó.

Además la migración arrastra el **bloqueante** que tiene la CI en rojo potencial: el
`grant execute ... to anon` de `crear_cita_publica` (línea 75) no lleva el comentario
encima que exige la regla del round 4. El `comment on function` del final no le vale al
vigilante `migraciones.mjs`.

**Arreglo:** añadir el comentario justificativo sobre el grant, completar P0-1 en la
misma tanda, aplicar con `supabase db push` y verificar los tres efectos en vivo
(rename presente, `auth.role()` en el cuerpo, `senal_ya_pagada` en requerir_senal_cita).

### P0-3. Token de la Management API en el chat (segunda vez)

El `sbp_...` pegado hoy en la conversación abre la **cuenta de la organización**, no una
base de datos, y queda en el registro de sesión y en el proveedor del modelo. Ayer la
auditoria ya lo marcó como P0 y hoy ha vuelto a pasar. Esta auditoria solo lo ha usado
como variable de entorno de proceso (nunca en ficheros) y las evidencias en disco están
redactadas. **Revocarlo en Account → Access Tokens** y tratar el Vault como única vía.
Para la BD de lectura que necesita una auditoria, la secret key de `.env` cubre casi
todo; el token de Management solo aporta `/database/query`, advisors y backups.

## P1 — serios, no bloqueantes hoy

1. **`crear_cita_publica_grupo` sigue sin anti-abuso**: sin rate-limit y sin captcha
   (verificado en la desplegada; ninguna migración la dota). La individual y la cadena
   ya los tienen. Un anónimo puede usar la vía de grupo para bombardear reservas.
   La envoltura de P0-2 debería replicarse para el grupo.
2. **Continuidad sin acreditar**: `pitr_enabled: false`, 0 backups diarios (verificado
   hoy en vivo, igual que ayer). Mientras no cambie el plan o se active, la afirmación
   "listo para producción" no puede hacerse. Prueba de restauración mensual: pendiente.
3. **Dependencias**: `npm audit` da 6 high + 1 moderate (`@expo/metro`, `metro`,
   `metro-config`, `metro-transform-worker`, `browserslist`, `image-size`,
   `@xmldom/xmldom`) — todas de toolchain de build. Ya hay un commit en
   `origin/master` con los bumps de parche de Expo SDK 56 ("chore: actualizar Expo y
   dependencias seguras", 01:15 CEST): su CI corría al cerrar este informe. **El árbol
   local sigue en `e22d72e12` con esos mismos cambios como modificaciones sin
   commitear** — hacer `pull` antes de seguir trabajando aquí para no duplicarlos.
   Tras actualizar, re-verificar `npm audit`, `npx tsc --noEmit`, tests y build.
4. **CI**: la run de `e22d72e12` pasó "Typecheck + Tests + Verificaciones" (su E2E se
   canceló por el push posterior, comportamiento normal); la run de las dependencias
   estaba en ejecución al cerrar. Confirmar su verde antes de dar el punto por cerrado.

## P2 — a agenda

1. **Propina en el enlace público vs importe corregido**: `requerir_pago_total_cita`
   desplegada recalcula la base **desde catálogo** cuando no llega `p_base_cents`
   (verificado en la definición), y `crear-checkout-cobro` solo pasa `p_cita_id` y
   `p_propina_cents`. Si el POS corrigió el precio, creó el pago con base corregida, y
   el cliente añade propina en `/app/pagar/[token]`, el total se recalcula desde
   catálogo y la corrección se pierde (el camino sin propina reutiliza el pago
   pendiente existente y sí la conserva). Arreglo pequeño: que la edge pase la base del
   pago pendiente existente, o que la RPC prefiera la base ya almacenada.
2. `web/index_v5.html` sigue publicable (anoche se le editó el texto, pero el patrón
   repetido es mantener una copia muerta). Borrarla, como se hizo con `demo_v2.html`
   y las tres `diseno-*.html`.
3. Los cinco `Modal` sin `onRequestClose` de `clientes.tsx`/`equipo.tsx`: anoche se
   tocaron esos ficheros; confirmar que los avisos del vigilante bajan en la próxima
   corrida (en la mía seguían saliendo).

## Corregido desde ayer y verificado hoy

- **Webhook de Stripe**: chequeo de tenant por pago y por URL. Bien.

  > **CORRECCIÓN (8 sep, posterior a este informe).** Este punto decía además que
  > los `throw` estaban bien porque "→ 500, Stripe reintenta, dedup intacto". Era
  > falso, y "dedup intacto" era literalmente el fallo: la fila de deduplicación se
  > escribe ANTES de conciliar, así que el reintento chocaba con ella, recibía
  > `23505` y se le contestaba `ok (dup)` con un **200**. Stripe daba el evento por
  > entregado y el cobro no se conciliaba nunca — para señales, cobros totales, Tap
  > to Pay, reembolsos, holds y las suscripciones de Mecha.
  >
  > El razonamiento llegó hasta "Stripe reintenta" y paró ahí, sin seguir el hilo
  > hasta lo que le pasa **al** reintento. Tres revisiones seguidas lo dieron por
  > bueno. La versión rota llegó a estar desplegada en producción (v36, 7 sep 23:04
  > UTC / 8 sep 01:04 CEST).
  >
  > Corregido: el proceso va en un `try` y el `catch` libera la fila antes de
  > devolver el 500. Se añadieron además el handler de
  > `checkout.session.async_payment_succeeded` (sin él, un pago diferido no se
  > registraba jamás) y **cinco tests** sobre el handler real
  > (`supabase/functions/stripe-webhook/webhook.test.mjs`, en CI): esta función era
  > la única pieza que convierte un cobro real en una fila de caja y no tenía
  > ninguno. Verificados contra el código anterior: fallan 2 de 5.
  >
  > Lección para la próxima auditoría: **"el error ahora se propaga" no es lo mismo
  > que "el error ahora se recupera".** Con idempotencia por adelantado, propagar
  > sin liberar la marca convierte un fallo ruidoso en una pérdida silenciosa.
- **CSP**: `api.pwnedpasswords.com` y `www.novanoidai.com` ya están en `connect-src`
  (la comprobación de contraseñas filtradas y la llamada Meet funcionan).
- **Captación (`reservar.html`)**: `insertSolicitud` se espera y se comprueba; el
  enlace Meet solo se promete si llega; el correo no bloquea.
- **Importe corregido POS→pago**: `p_base_cents` viaja desde CobroSheet y la RPC
  desplegada lo acepta y audita (queda el P2-1 de la propina).
- **Coherencia comercial (e22d72e12)**: JSON-LD y FAQ de Esencial ya no prometen
  señales/campañas/lista de espera; "profesionales ilimitados" → "hasta 15" (cuadra con
  `limite_negocio`); Tap to Pay marcado "en beta".
- **Catálogo IA**: `modelos.ts` + `openrouterClient` corregidos y `chispa-landing`
  responde en vivo con precios exactos (prueba funcional hecha).
- **Asistente IA**: rate-limit por IP activo en la edge (15/h).

## Migraciones del 1 de septiembre: aplicadas, pero "no constan"

Las seis que el vigilante bd-migraciones marca como no aplicadas **sí lo están** — es el
falso positivo conocido del editor SQL del dashboard (registra su propio timestamp;
el remoto tiene `...153828`, `...182749`, `...183305` que no casan con los nombres
locales). Efectos verificados en vivo: las 8 funciones de
`restaurar_cobro_online`/`restaurar_servicios_sugeridos`/`editar_importe_y_addons_en_cobro`/`bono_cobra_addons`
existen, y `service_addons.duracion_min` no tiene ninguna fila distinta de 0.
**Pendiente documental:** darlas de alta en `scripts/vigilantes/migraciones-conocidas.json`
con estas pruebas, para que el ruido no tape la próxima migración de verdad sin aplicar
(como acaba de pasar con la de P0-2, que el vigilante señalaba y era real).

## Lo que ya vigila el sistema y está en verde

Typecheck limpio; tests de componentes 6/6; canario de producción del 7 sep en verde;
los 24 solapes históricos y los 7 cobros descuadrados de la demo siguen congelados y
protegidos contra mutación (correcto: no reabrir). Los ~300 avisos restantes son las
familias conocidas (deuda de tests de vigilantes, knapsack de knip, Modals), sin
 cambios bruscos respecto a ayer.

## Funcionalidad que falta o está a medias (respuesta a "qué podríamos añadir")

De la lista viva del proyecto y de lo visto hoy, ordenado por impacto comercial:

1. **Tarjeta regalo completa** (P0-1): hoy es la única "función vendida que no existe".
   Nota: la landing ya la menciona en la lista de funciones de Estudio
   ("bonos, tarjetas regalo y fidelización") — hasta cerrarla, es un claim vivo.
2. **Matching automático de lista de espera + avisos** (el motor de envío existe; falta
   el SQL de emparejamiento). Es de las que más valor dan al salón con lo ya construido.
3. **Agente de voz Retell/Zadarma** operacionalizado (alta, permisos, fallback, prueba
   de llamada real) — se dejó para el final por decisión del equipo.
4. **Cobro QR en local y recorrido completo Tap to Pay/Terminal** (reembolsos ya
   existen como edge; falta E2E por salón). Mientras, "en beta" es la promesa correcta.
5. **DNS de mecha.app a Vercel + app Meta a producción** (externo, del usuario).
6. **Caja fiscal M-CJ**: seguir fuera de alcance hasta fiscalista (decisión vigente).

Fuera de alcance expreso (no venderlos): contabilidad, marketplace, precios dinámicos,
app nativa del cliente final.

## Plan de acción recomendado (orden)

1. Revocar el token `sbp_` de hoy (y cualquier otro que siga vivo del de ayer).
2. Migración única: comentario del grant + tablas/RPCs de tarjeta regalo + envoltura
   anti-abuso para `crear_cita_publica_grupo`. Aplicar, y verificar los efectos en vivo.
3. Ocultar (bandera) la UI de tarjeta regalo hasta que el punto 2 esté aplicado y
   probado, para que ningún salón vea el error mientras tanto.
4. Arreglar P2-1 (base corregida con propina) y borrar `index_v5.html`.
5. Documentar las seis migraciones del 1 sep en `migraciones-conocidas.json`.
6. Cerrar las dependencias (commit ya en origin/master; verificar CI verde tras ellas).
7. Activar/verificar backups + PITR y ejecutar una restauración de prueba.
8. Smoke público + E2E autenticado tras desplegar, guardando la pareja commit-app /
   commit-base como evidencia.

## Artefactos de esta auditoría

`vigilar.log`, `vigilar-bd.log`, `typecheck.log`, `componentes.log`,
`consultas-remotas.mjs` y los JSON de evidencia (`migraciones-sep`, `funciones-clave`,
`captcha-esquema`, `regalo-y-pago-total`, `backups`). Sin credenciales en disco: el
token fue variable de entorno del proceso y la salida está redactada.
