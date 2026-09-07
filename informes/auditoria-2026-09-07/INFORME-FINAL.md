# Auditoría integral de Mecha

Fecha de cierre: 8 de septiembre de 2026. La auditoría cubre landing, captación,
portal público, agenda, caja, equipo, IA, edge functions, RLS, migraciones, CI/CD,
dependencias y continuidad.

## Veredicto

Mecha tiene una base técnica bastante sólida y una batería de vigilancia poco habitual,
pero todavía no debe darse por lista para producción. Hay varios bloqueantes financieros y
de seguridad en los flujos de pago/reserva, incoherencias comerciales visibles y una
continuidad de datos sin acreditar. La app y los tests locales pasan porque muchos de estos
fallos están en los límites entre componentes o en el estado desplegado, que los tests
unitarios no cubren.

## Evidencia ejecutada

- `npx tsc --noEmit`: limpio.
- Tests Deno: 490 pasados, 0 fallos.
- `npm run test:componentes`: 6 pasados, 0 fallos.
- `npm run vigilar:rapido`: 0 bloqueantes, 294 avisos, 33 vigilantes.
- `npm run vigilar:bd`: 0 bloqueantes, 319 avisos, 43 vigilantes.
- Export web: correcto.
- Canario de producción del 7 de septiembre: correcto.
- CI del mismo commit: falló; Seguridad/Zizmor también falló. El log de CI muestra que
  los 490 tests y los 26 tests de IA terminaron bien; el fallo ocurre después y debe
  aislarse antes de aceptar el verde del pipeline.
- Producción consultada en lectura: 130 tablas, 554 funciones, 286 políticas y 377
  migraciones. Advisors: 215 funciones `security definer` ejecutables por `anon`, 267 por
  `authenticated`, 16 grupos de políticas permisivas múltiples; son indicadores que deben
  interpretarse junto con los guards internos, no un fallo automático.
- Backups de Supabase: `backups: []`, `pitr_enabled: false`. Esto contradice la expectativa
  operativa escrita en el proyecto y deja la recuperación ante desastre sin prueba.

## Bloqueantes y riesgos P0/P1

### P0 — Revocar el token de Management API expuesto

El token personal entregado en la conversación debe revocarse en Supabase Account → Access
Tokens y sustituirse por uno nuevo almacenado únicamente en `.env` o Vault. No aparece en el
repo después del barrido, pero sí quedó en el historial local de la sesión y en los registros
del agente. El token abre la cuenta de la organización, no solo una consulta de base de datos.

### P1 — Webhook de Stripe puede confirmar estado sin completar la conciliación

En [stripe-webhook/index.ts](../../supabase/functions/stripe-webhook/index.ts:157) se ignoran
los errores de `pagos.update`, `registrar_cobro_online` y la actualización de la cita. El
handler responde `200` al final ([línea 264](../../supabase/functions/stripe-webhook/index.ts:264)).
Si Stripe recibe el evento, la primera escritura falla y el evento ya quedó deduplicado, el
reintento puede considerarse duplicado aunque el cobro no se haya registrado en caja. La
reproducción offline de esta auditoría cubre el caso de fallo de conciliación, fallo de la
deduplicación y evento antiguo.

La comprobación de tenant solo se hace si llega `?negocio=`. Un evento firmado con un `pago_id`
de otro salón puede alcanzar la actualización si esa ruta no incluye el negocio. Hay que
atar el pago al `account`/conexión de Stripe y al `negocio_id` almacenado, comprobar importes
y hacer que cualquier fallo de conciliación devuelva un 5xx para que Stripe reintente.

### P1 — Señal duplicable después de pagar

La función desplegada `requerir_senal_cita` solo busca un pago de tipo `senal` en estado
`pendiente` y, si no lo encuentra, inserta otro (`bd-requerir_senal_cita-*.sql:45-53`). No
comprueba de forma equivalente que la cita ya tenga la señal pagada, esté cancelada o haya
pasado. Reabrir un enlace válido puede crear otra señal pendiente y volver a cobrarla.
Debe existir una única fila idempotente por cita/tipo y la transición pagada debe bloquear
la creación de otra.

### P1 — Captcha y límites del portal se pueden eludir por el canal declarado

`crear_cita_publica` lee `captcha_activo`, pero solo consume captcha si el cliente ya envió
un token (`bd-crear_cita_publica-*.sql:19-41`). Además, el límite de 30 reservas por hora se
aplica únicamente cuando `v_canal = 'web'` (`líneas 91-92`); el llamante anónimo puede escoger
`whatsapp`, `agente_voz` o `asistente_ia` en la RPC y saltarse ese límite. La función de grupo
tiene el mismo hueco según la definición desplegada. El servidor debe fijar el canal según
la puerta que llama y aplicar antiabuso por IP/teléfono/negocio a toda entrada pública.

### P1 — Cobro online puede perder el importe corregido y el descuento

La migración admite `p_base_cents`, descuento y propina, pero
[crear-checkout-cobro/index.ts](../../supabase/functions/crear-checkout-cobro/index.ts:106)
solo pasa `p_cita_id` y `p_propina_cents` a `requerir_pago_total_cita`; el camino que llega
desde un enlace de pago no conserva necesariamente el importe corregido por el POS ni el
descuento. El importe mostrado en caja/QR y el importe pedido por Stripe/Redsys pueden
divergir. Hay que pasar el snapshot firmado del importe al crear el pago y recalcularlo en
una única RPC idempotente, sin volver al catálogo si el staff corrigió el precio.

### P1 — Tarjeta regalo no es transaccional

En [CobroSheet.tsx](../../components/pos/CobroSheet.tsx:547) se hacen por separado el `update`
del saldo y el `insert` del movimiento. Ambos resultados se ignoran. Si falla uno, la caja,
el saldo y el libro de movimientos quedan en estados incompatibles; la interfaz puede marcar
el cobro como completado ([líneas 592-606](../../components/pos/CobroSheet.tsx:592)). Debe ser
una RPC transaccional con idempotencia, saldo suficiente y movimiento inseparable.

### P1 — Comprobación de contraseñas filtradas desactivada por CSP

`auth.js` consulta Have I Been Pwned ([línea 269](../../web/assets/auth.js:269)), pero la CSP
de [vercel.json](../../vercel.json:94) no incluye `https://api.pwnedpasswords.com` en
`connect-src`. El `catch` devuelve `false` ([línea 279](../../web/assets/auth.js:279)), de
modo que el usuario puede cambiar a una contraseña filtrada sin recibir aviso. Permitir el
host o mover la comprobación exclusivamente al servidor y hacer que el fallo sea explícito.

### P1 — Captación comercial afirma éxito aunque fallen persistencia y correo

`web/reservar.html` llama a `insertSolicitud` sin esperar ni comprobar resultado (línea 622),
captura el error de `notificar-solicitud` (línea 641) y siempre muestra “te hemos enviado la
confirmación” (línea 676). La llamada Meet a `novanoidai.com` (línea 610/656) tampoco está
permitida por la CSP. Se puede perder un lead y el usuario puede recibir una confirmación
falsa. El botón debe mostrar estado pendiente/error y la CSP debe autorizar exactamente el
backend que se utilice.

## Incoherencias comerciales y de producto

- La oferta Esencial de 39 € aparece en JSON-LD/FAQ como si incluyera señales, campañas y
  lista de espera ([web/index.html](../../web/index.html:103), [línea 352](../../web/index.html:352)),
  aunque `lib/planes.ts` las reserva a Estudio. El vigilante actual no cubre este texto de
  Esencial porque compara sobre todo la tarjeta de Estudio.
- La landing promete profesionales/accesos ilimitados ([líneas 2378, 2486, 2772]), pero
  `limite_negocio` y `evaluar_alta_de_acceso` tienen un límite operativo por defecto de 15.
  Hay que decidir qué es verdad y hacer coincidir servidor, interfaz, FAQ y JSON-LD.
- Se anuncia “Tap to Pay” ([línea 2784]) y existen piezas de Terminal, pero falta evidencia
  E2E de activación, onboarding, permisos, cobro, reembolso y conciliación por salón.
  Mantenerlo como “en beta” hasta cerrar el recorrido real.
- `web/index_v5.html` conserva claims de envío automático a AEAT aunque
  `ENVIO_AEAT_DISPONIBLE=false`. Aunque tenga `noindex`, la carpeta pública lo sirve.

## Bugs y deuda de software

- `clientes.tsx` y `equipo.tsx` tienen cinco `Modal` sin `onRequestClose`/`onDismiss`.
  En Android, Escape o botón atrás el diálogo puede quedar atrapado. Es un aviso del
  vigilante de código, pero es un fallo funcional de accesibilidad de bajo coste.
- El estado de trabajo contiene cambios locales no relacionados con esta auditoría. No se
  deben mezclar con un despliegue hasta revisar el diff y confirmar que las migraciones de
  caja/planes y `stripe-webhook` están desplegadas en el mismo commit.
- Hay seis migraciones del 1 de septiembre que no constan en el historial remoto, y una
  migración aplicada en producción sin fichero en repo según `vigilar:bd`. Puede ser el
  falso positivo conocido del editor SQL, pero cada una necesita una prueba del efecto y una
  entrada documentada en `migraciones-conocidas.json`.
- `npm audit` encuentra 7 vulnerabilidades: 6 altas y 1 moderada, incluidas `metro`,
  `browserslist` e `image-size`, todas con actualización sugerida. No prueba por sí solo una
  explotación en producción, pero bloquea la afirmación de “dependencias listas”.

## Continuidad y operación

El proyecto tiene buenos vigilantes de esquema, RLS, triggers, solapes, caja, claves y
rendimiento. Aun así, el estado real consultado devuelve backups diarios vacíos y PITR
desactivado. Hay que verificar el plan de Supabase, activar la política elegida y ejecutar
una restauración de prueba en un proyecto efímero. El canario verde no cubre recuperación.

Los 24 solapes antiguos y 7 cobros descuadrados de la demo están correctamente congelados
por fecha y protegidos contra mutación antifraude; no los reabriría.

## Funcionalidades que faltan o están incompletas

Estas no son sugerencias genéricas: constan como pendientes en el estado del producto y
afectan a la promesa comercial:

1. Matching automático de lista de espera y avisos; existe el motor de envío, falta el
   emparejamiento SQL fiable.
2. Operacionalización completa del agente de voz Retell/Zadarma: alta de salón, permisos,
   monitorización, fallback y pruebas de llamada real.
3. Cobro QR en el local y recorrido completo de Tap to Pay/Terminal, incluyendo reembolsos,
   chargebacks e idempotencia.
4. DNS de `mecha.app` y paso de la app Meta a producción para clientes reales.
5. Fiscalidad M-CJ y restauración operativa; no deben improvisarse desde la UI.
6. Contabilidad, marketplace, precios dinámicos y app nativa del cliente siguen fuera de
   alcance explícito; no venderlos como disponibles.

## Orden recomendado antes de producción

1. Revocar el token personal expuesto.
2. Corregir idempotencia/tenant/error handling de Stripe y el doble cobro de señales.
3. Corregir captcha/límites públicos y el importe único de cobro online.
4. Hacer tarjeta regalo transaccional y verificar el despliegue de las migraciones de caja.
5. Corregir CSP, confirmaciones falsas de captación y claims de planes/AEAT/ilimitados.
6. Resolver CI/Security en rojo y actualizar dependencias vulnerables.
7. Activar/verificar backups y completar una restauración real.
8. Repetir smoke público y E2E autenticado después de desplegar; guardar el commit de la
   aplicación y el de la base como una pareja verificable.

## Artefactos de esta auditoría

La evidencia detallada queda en esta carpeta: `vigilantes.json`, `vigilantes-bd.json`,
`advisors-security.json`, `advisors-performance.json`, `backups.json`, las definiciones SQL
desplegadas, `repro-software.mjs`, `repro-webhook-offline.cjs`, logs de CI, `npm-audit.json`
y los informes de coherencia anteriores. Las credenciales no se guardan en los artefactos.
