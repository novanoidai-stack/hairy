# 🗺️ ROADMAP MECHA — Evolución (post-MVP)

> **Qué es esto:** la lista viva de lo que queremos construir DESPUÉS de cerrar el MVP.
> Complementa al `MEGA_INFORME_MECHA.md` (§10, que lleva el producto a producción): aquí va
> la evolución y, sobre todo, **la apuesta de escalabilidad** (plataforma autoservicio).
> **Fecha:** 14 jun 2026 · **Recopilado por:** Alexandro (lista + audios).
> **Actualizado:** 17 jun 2026 (estado real tras los commits de Carlos + el trabajo de IA/pagos de Alexandro).
> **Actualizado:** 25 jun 2026 — integrada la **estrategia de pagos** (§4, base de la pasarela) y la
> **arquitectura fiscal/compliance** (§8) de los dos informes de Carlos/Antigravity (`informes/`).
> **Leyenda dueño:** [A]=Alexandro (backend/IA/pagos/integraciones) · [C]=Carlos (frontend/UX/datos) · [A+C]=handoff.
> **Leyenda estado:** 🟢 base hecha · 🟡 empezado · 🔴 sin empezar.

> **🔄 PIVOTE ESTRATÉGICO (14 jun, audio del socio):** el cuello de botella real es **CAPTAR CLIENTES**,
> no la escalabilidad. Hasta tener volumen, **modelo manual/concierge** (como Novanoid): nosotros
> onboardeamos cada cliente a mano — implementamos sus agentes, le damos acceso al software, y el pago
> va por **enlace (WhatsApp o web)**, SIN lanzar app a las stores ni meter pago in-app. La web se orienta
> a **"contáctanos"** (estilo agencia), no a alta self-serve.
> → **El Bloque 0 (plataforma autoservicio) se APARCA** hasta tener muchos clientes. **Prioridad
> near-term: ser "como mínimo Booksy" + captar clientes.** (Pendiente: un informe del socio con "lo que
> falta para ser como Booksy" — integrar cuando se suba al repo.)

---

## 0. ⏸️ APARCADO — Plataforma autoservicio escalable (la gran apuesta, para MÁS ADELANTE)

> **APARCADO el 14 jun** (decisión del socio): NO ahora. Primero captar clientes con modelo
> manual/concierge; retomar cuando haya volumen. Se mantiene como referencia, no como trabajo activo.
>
> El norte (futuro): que un salón se dé de alta y **se autoconfigure todo solo** (portal, integraciones,
> agentes), pagando dentro de la app. Eso convierte Mecha de "software con setup manual" a
> **producto SaaS súper escalable**. Es lo más difícil y lo que más diferencia.

- **0.1 Auto-provisión al registrarse** 🟡 [A+C]
  Al crear cuenta con el nombre del negocio (ya se pide), generar solo: slug + portal de reserva
  + ajustes por defecto. Hoy el portal existe pero el alta full es semi-manual (`staff_grant_full_access`).
  → Objetivo: alta self-serve sin que nosotros toquemos nada.
- **0.2 Auto-integración Booksy/Fresha** 🔴 [A]
  Al activar la integración, **clonar automáticamente un workflow de n8n** (el de "coger los correos
  de Booksy") con nuestras credenciales y dejarlo activo, sin intervención manual.
  ⚠️ **Bloqueante:** hoy la API key de n8n es de **solo lectura** → no se pueden crear workflows por API.
  Hace falta una API key de n8n con permiso de escritura (ver [reference n8n]). Orquestación vía Cloudflare.
- **0.3 Creación self-serve de agentes (voz / WhatsApp / texto)** 🟡 [A]
  Botón en la web "crear agente": el salón describe qué quiere su agente **o** rellena un **cuestionario**
  (¿pide señal? sí/no, tono, servicios, horarios…) y de ahí **se autogenera el prompt** y se crea el agente.
  Usaríamos **nuestras API keys agrupadas** (ElevenLabs / OpenRouter / Anthropic) por defecto.
  🟢 Base ya hecha hoy: las RPCs del agente (identificar/citas/crear/cancelar/modificar/registrar) y los
  2 workflows n8n del agente. Falta: la capa de auto-creación + el generador de prompt + el alta de número.
  → **Decisión abierta:** plataforma de agentes de voz **Retell vs ElevenLabs Conversational AI** (investigar
  a fondo coste/calidad/latencia/funciones). 
- **0.4 Pago dentro de la app (monetización SaaS)** 🔴 [A]
  Método de pago in-app para suscripción/planes → permite lanzar al mercado.
- **Prerrequisitos transversales de este bloque:**
  - API key de n8n con escritura (hoy solo lectura).
  - **Modelo de costes**: si agrupamos nuestras API keys (ElevenLabs/OpenRouter/Anthropic), el consumo lo
    pagamos nosotros → hay que **tarificar y poner límites por plan** o se come el margen.
  - **Aislamiento/seguridad** de credenciales por salón (no mezclar tenants; las RPCs ya van por slug).
  - Orquestación (Cloudflare Workers / n8n) para automatizar el provisioning.

> **Refinamientos (de `informes/INFORME_VIABILIDAD_IA_SELFSERVICE.md`, 14 jun — análisis, no spec del sprint):**
> - **n8n = 1 workflow maestro + enrutamiento dinámico** por número receptor → consulta a la BD de Mecha
>   (prompt/servicios/slug). Es justo lo que ya monté; para escala, resolver el slug por **lookup a BD**
>   (`negocio_por_telefono`) en vez del mapa hardcodeado del Code node.
> - **Agente de voz:** alta por API de Retell (`create-agent`) = viable. **Número +34 = bloqueo regulatorio**
>   (CNMC): no se compra silencioso por API → self-service con **Twilio Regulatory Bundles** (subir DNI/CIF,
>   24-72h) y compra automática al aprobarse. (Hoy el número es de Zadarma, manual.)
> - **WhatsApp a escala:** **Meta Embedded Signup** (registrarnos como BSP), no alta manual. Lo de hoy
>   (Cloud API manual, 1 número) vale para el vertical slice.
> - **Booksy/Fresha:** sin API abierta bidireccional → la vía robusta es **Mecha como agenda principal**;
>   integración real limitada a email/ICS (frágil). Bajar expectativas del "auto-Booksy" del audio.
> - **Unit economics (INNEGOCIABLE):** ~0,53-0,85$/llamada de voz de 5 min → **tarjeta obligatoria antes
>   de activar IA**, **bolsa de minutos por plan** (no ilimitado), **límites anti-DoS** por número/IP.
> - **App stores:** la app móvil se publica como "lectora" (gestión), **sin compras in-app**; el pago y la
>   config de IA van **solo por panel web** (evita el 30% de Apple/Google). → el "pago in-app" (0.4) es **pago web**.

---

## 1. Agenda inteligente (IA operativa) — el diferencial vertical

- **1.1 Calculador de retrasos encadenados** 🟢 **v1 HECHO Y VERIFICADO (26 jun)** [A]
  Motor de cascada (`lib/retrasos.ts`): **calcula el efecto dominó** sobre las siguientes, **absorbe huecos**
  y **corta la cascada** cuando un hueco se come el retraso; modal de **propuesta** (recoloca + avisar);
  dos disparadores cableados ("Marcar retraso +X" por cita y "vengo con X de retraso" por profesional);
  aplicar marca `retraso_aviso_pendiente` y el motor manda `aviso_retraso`. Verificado: motor puro 11/11 +
  cableado backend (`notificaciones_pendientes` emite `retraso` gateado por `notifRetrasoActiva`).
  ⏳ **El aviso E2E** espera la plantilla Meta `aviso_retraso` (externo); la recolocación va sin ella.
  🔜 **Diferido/v2:** disparador de **redimensionar** la cita · **detección automática** (sin pulsar) ·
  cascada **cross-profesional**. NO confundir con el **reordenador** proactivo (1.2), que es otra feature.
- **1.2 IA en la agenda** 🔴 [A+C]
  - Anti-solapamientos (aviso/bloqueo inteligente al colocar citas).
  - **Reordenador** que propone una mejor agenda con **preview** y **explica el porqué**.
  - Solución de **no-shows** (recolocar huecos, sugerir lista de espera, reactivación).
  - **Chatbot** interno de la agenda (preguntar/operar por lenguaje natural).
  🟢 Base: la lógica de solapes (`isTimeSlotOccupied`) y huecos ya existe; aquí va la capa IA encima.

---

## 2. Analítica y negocio

- **2.1 Clientes nuevos / perdidos + estimación de crecimiento** 🔴 [A+C]
  Cálculo automático de altas y bajas (clientes perdidos por inactividad) y **proyección de crecimiento
  mensual/anual**. 🟢 Base: ya hay segmentación (VIP/Habitual/Nuevo/Inactivo) y retención en informes.
- **2.2 Informes formales tipo "modo gestor"** 🔴 [C]
  Informes presentables/exportables al nivel del panel de gestión (no solo en pantalla).
  🟢 Base: informes con KPIs + export CSV/PDF ya existen; aquí va el formato "formal".
- **2.3 Página de "focos" (atribución de reservas)** 🔴 [A+C]
  De dónde entran las reservas: QR, link de Mecha, web, voz, WhatsApp, Booksy, Fresha…
  🟢 Base: el campo `canal` de las citas ya distingue origen (manual/web/whatsapp/instagram/agente_voz/asistente_ia).

---

## 3. Canales y cliente final

- **3.1 Reserva por QR / link de Mecha** 🟢→🟡 [C]
  🟢 El QR del portal y el enlace ya existen (C10). Pendiente: pulir el flujo de entrada y la atribución (2.3).
- **3.2 Atribución de canal en las citas + integraciones entrantes** 🟡 [A]
  Marcar cada cita con su canal (voz, WhatsApp) 🟢 hecho a nivel de datos. **Booksy/Fresha**: importar sus
  reservas a la agenda (el workflow de "correos de Booksy" del bloque 0.2). 🔴 integración real.
- **3.3 Modo cliente invitado** 🔴 [C]
  Permitir reservar/ver sin cuenta (invitado). 🟢 Base: el portal ya es anónimo por slug; aquí va el "modo invitado" dentro de la app.

---

## 4. Pagos — *plan de la pasarela: `informes/ESTRATEGIA_PAGOS_SUPERIORIDAD.md` (Carlos/Antigravity, 25 jun)*

> **La estrategia de pagos es la base sobre la que construiremos toda la pasarela del software.** El doc
> ataca las dos vulnerabilidades de Booksy/Fresha (te obligan a su pasarela ~2.5%+0.20€ + datáfono propietario
> de ~149€) con **4 pilares**. Abajo, cada pilar cruzado con lo que YA está hecho.

- **4.1 Señal del cliente por enlace** 🟢 **HECHO (Fase 1)** [A]
  Enlace de pago de la señal por WhatsApp/web + conciliación. Stripe Checkout + webhook
  `checkout.session.completed` → `deposito_pagado`+`confirmada`; cron de expiración libera el hueco.
  ⚠️ **Divergencia con el doc a saldar al endurecer la pasarela:** el doc pide tabla `cita_pago_enlaces`
  con **tokens opacos** (que el cliente no vea su `cita_id` en la URL de pago) e **idempotencia**
  (`cobros.idempotency_key` para no cobrar dos veces si el webhook se repite). Hoy la URL lleva `cita_id`
  y no hay idempotency key.

- **4.2 Modelo de tasas híbrido + BYOP ("Bring Your Own Processor")** 🔴 [A] — *Pilar 1*
  Dos caminos: **Mecha Pay** (Stripe por defecto, ~1.9%+0.10€, ideal salones pequeños) **o** conectar el
  **TPV propio del salón** (Redsýs/Bizum, con la tasa de su banco ~0.4%) por una **cuota fija mensual (+19/29€)**.
  Es el gancho comercial para salones de volumen ("me ahorro >800€/mes de Fresha por 29€").

- **4.3 Datáfono virtual (sin hardware propietario)** 🔴 [A+C] — *Pilar 2*
  - **Tap to Pay** en el móvil del estilista vía SDK `@stripe/stripe-terminal-react-native` (chip NFC).
  - **QR dinámico de pago en mostrador** (Bizum / Apple / Google Pay) al marcar la cita como cobrada.
  🟢 Base: el cobro en local por QR (P2) ya estaba en el radar (MEGA §8); aquí entra el detalle técnico.

- **4.4 Depósitos dinámicos por perfil de riesgo** 🟡 [A] — *Pilar 3*
  Fianza variable según el CRM: VIP/Habitual = 0% (reserva en 1 clic, sin tarjeta), cliente nuevo = 20%/pre-auth,
  historial de no-show = 50-100%. **Holds (pre-autorizaciones)** en vez de cobro hasta que el cliente asista.
  🟢 Base: el perfil de riesgo y la segmentación ya existen; la señal de hoy es **plana** → falta hacerla dinámica.

- **4.5 Automatización financiera E2E** 🔴 [A+C] — *Pilar 4*
  Propinas (sugeridas al pagar por QR y asignadas al profesional en "Mi Jornada"), **pago familiar/grupal
  dividido**, y fiscalidad **VeriFactu** (hash inmutable correlativo + facturas simplificadas). → liga con **§8 Cumplimiento**.

- **4.6 Pago del salón a Mecha** → **MANUAL** [A]
  Factura/enlace de pago (estilo agencia). **NO pago in-app, NO suscripción automática, NO App Store**
  (decisión del socio 14 jun). La automatización es Fase 4 (aparcada).

> **Ruta de desarrollo del doc:** Fase 1 = enlace + webhook Stripe (🟢 hecho; falta endurecer tokens opacos +
> idempotencia) · Fase 2 = **Bizum directo + conector Redsýs** (🔴, diferenciador en España) · Fase 3 = **SDK
> Stripe Terminal / Tap to Pay** (🔴).

---

## 5. Cuenta y operativa

- **5.1 Opción de cerrar cuenta** 🔴 [A+C]
  Baja de cuenta + borrado/exportación de datos (RGPD "derecho al olvido", que la landing ya promete).
- **5.2 Cerrar salón** 🟢→🟡 [C]
  🟢 Ya existe un botón "Cerrar salón" en la agenda. Pendiente confirmar alcance: ¿cierre temporal
  (vacaciones/festivo) que bloquee reservas online? Revisar qué falta. *(El "?" de la lista era esto.)*
- **5.3 Notificaciones / alertas [mejorar]** 🟡 [A+C]
  Mejorar el sistema de avisos (incluye los de retrasos 1.1). 🟢 Base: UI de config de notificaciones (fase 4) existe;
  falta el **motor de envío real** (email/SMS/WhatsApp) = [A].

---

## 6. Retail y caja

- **6.1 Inventario de productos / stock** 🔴 [A+C]
  Productos, stock, (pedidos a proveedor = [A]). El dossier lo marca como "no aún" → no urgente.
- **6.2 Caja diaria** 🔴 [A]
  Caja del día / cierre. ⚠️ **Cuidado:** la caja fiscal completa (M-CJ: VeriFactu, ticket correlativo)
  **requiere fiscalista** y es un proyecto aparte (MEGA §8 P3). No improvisar "ticket fiscal".

---

## 7. Cómo proceder — programa por fases (ACTUALIZADO 14 jun, pivote del socio)

> **Estrategia:** el problema real es **CAPTAR CLIENTES**, no escalar. Modelo **manual/concierge** (como
> Novanoid): onboardeamos cada cliente a mano. Cada salón = un vertical slice montado por nosotros.
> **Agentes sobre Retell.** **Objetivo near-term: ser "como mínimo Booksy" + traer clientes.**
> El Bloque 0 (autoservicio) **APARCADO** hasta tener volumen. **Sin App Store, sin pago in-app.**
> **Método por tarea:** resolver lo bloqueante → mini-spec corto → construir → verificar con evidencia.

### FASE 1 — Primer salón funcionando y cobrando (= el MODELO de operación)
Camino crítico, manual, para 1 salón. **Así onboardearemos a cada cliente nuevo** (no es solo un piloto):
1. **Motor de mensajería (WhatsApp)** [A] 🟢 **HECHO Y ACTIVO (17 jun)** — workflow n8n `egkPWImnfQR1tRaA`
   (cron-pull cada 2 min): confirmación + recordatorio + petición de reseña; envío real validado E2E (Meta).
   Falta enganchar el aviso de lista de espera (depende del matching, 5.3) y el enlace de señal (con 4.1).
2. **Agente WhatsApp entrante** [A] 🟢 **HECHO (17 jun)** — workflow `gzD0opJCbet1aVx1` (WhatsApp→LLM gpt-4o
   vía OpenRouter + tools=RPCs + memoria + `conversaciones_ia`). Responde, consulta catálogo y reserva. Probado.
3. **Señal del cliente por enlace** [A+C] 🟢 **HECHO (17 jun)** — edge functions `crear-checkout-senal` +
   `stripe-webhook` (validadas); **página de pago `/app/pago/[ref]`** (+ `/app/pago/ok`) que redirige a Stripe;
   el **motor manda `enlace_pago_senal`** por WhatsApp (botón → `/app/pago/{cita_id}`) a las citas pendientes de
   señal; y **cron `Mecha — Expirar señales`** (15 min → libera el hueco). Pendiente fino: badge "señal pagada"
   en la ficha de la cita [C].
4. **Cancelar/modificar desde el portal** [A+C] 🟢 **HECHO (17 jun)** — RPCs (cancelar/modificar) + **página
   `/app/cita/[id]` "gestiona tu cita"** (ver/cambiar/cancelar, gated por teléfono); probada en navegador.
   🟢 Al reagendar **reenvía la confirmación** con la nueva fecha y reprograma el recordatorio (17 jun).
   Pendiente fino: aviso de cancelación (necesita plantilla Meta nueva).
5. **Operacionalizar el agente de voz Retell** [A] 🔴 — APARCADO al final (decisión 17 jun). Número Zadarma ya
   disponible; falta alta del agente Retell + prompt + llamada de prueba. Se hace lo último, tras todo lo demás.
6. **Aviso de lista de espera** (pieza del motor) [A] 🔴 — APARCADO casi al final, antes del agente de voz.
   Matching SQL al liberarse hueco + plantilla Meta `aviso_lista_espera`.
→ **Validación E2E del motor sobre el demo: ✅ (17 jun)** — reserva (crear_cita_publica), confirmación,
   recordatorio, reseña, señal (cola+importe), expiración (libera hueco) y gestión/reagende, todos verificados.
   **Para cerrar Fase 1 con un salón REAL solo falta (externo): DNS de mecha.app + app Meta a producción.**

### FASE 2 — "Como mínimo Booksy" + captación (lo que trae clientes)
- **Paridad Booksy:** cerrar lo que falte para igualar/superar a Booksy. ⏳ **Pendiente el informe del socio
  "qué falta para ser como Booksy" — integrar cuando se suba al repo.** Diferenciadores propios: IA de agenda
  (1.2), retrasos encadenados (1.1), analítica (2.1/2.2/2.3).
- **Captación (modelo agencia):** referidos "invita y gana" multinivel (🟡 ya empezado por Carlos) + web
  orientada a **"contáctanos"** (no a alta self-serve).

### FASE 3 — Operativa y catálogo (al tener varios salones)
Cerrar cuenta (5.1), cerrar salón (5.2), modo invitado (3.3), inventario (6.1), caja diaria (6.2, con fiscalista).

### FASE 4 — ⏸️ APARCADA: plataforma autoservicio (solo cuando haya MUCHOS clientes)
Bloque 0 completo (auto-provisión, Meta Embedded Signup, Twilio bundles, self-serve de agentes, pago in-app,
App Store). **NO ahora.** Todo manual hasta tener volumen; entonces se planifica la automatización.

### Necesito de ti para la Fase 1 (externo)
- ⬜ Apuntar el **DNS de `mecha.app`** a Vercel — **lo único que bloquea** que los enlaces/botones de los
  WhatsApp (gestión de cita, reseña, pago) funcionen de cara al cliente. Hoy solo resuelven en localhost.
- ⬜ Para el agente de **voz**: número **Zadarma** + alta del agente **Retell** apuntando al workflow de funciones.
- ⬜ Pasar la **app Meta a producción** + verificación del negocio (para enviar/recibir con clientes que no sean
  tu número de prueba; en desarrollo solo funciona con números tester).
- ✅ **Ya resuelto:** API key n8n con escritura · cuenta+claves **Stripe** test · **5 plantillas WhatsApp aprobadas**
  · credencial **WhatsApp Cloud** (Phone Number ID + token permanente) · API key **OpenRouter** del agente · salón
  objetivo (`demo` para construir).

---

## 8. Cumplimiento legal y fiscal — *fuente: `informes/ARQUITECTURA_FISCAL_Y_COMPLIANCE_MECHA.md` (25 jun)*

> Reparto **IA-en-código vs gestión manual** de los fundadores. Normativa española: RGPD,
> **Ley Antifraude 11/2021**, **VeriFactu**. Cruza con §4.5 (fiscalidad de pagos) y §6.2 (caja fiscal).

**Implementable por IA (en código):**
- **8.1 Inmutabilidad de cobros (anti-fraude)** 🟢 **HECHO** [A] — triggers que bloquean físicamente `DELETE`
  y el `UPDATE` de campos monetarios en `cobros`/`cobro_lineas`; las correcciones se hacen con un
  **"cobro de rectificación"** (fila nueva con importes negativos), nunca borrando.
  (`migrations/compliance-antifraude-inmutabilidad.sql`, commit `9dc3a778`.)
- **8.2 Encadenamiento de tickets (pre-VeriFactu)** 🔴 [A] — `hash = SHA256(id + fecha + total + hash_anterior)`
  por negocio (`numero_ticket_secuencial`, `hash_registro`, `hash_anterior` + trigger antes de insertar),
  para que no se puedan inyectar cobros falsos en el pasado.
- **8.3 Bitácora de consentimiento RGPD** 🟡 [A+C] — tabla `consentimientos_clientes` (tipo, `firma_svg`, IP,
  user_agent, timestamp) para demostrar cuándo/desde dónde aceptó la clienta (datos de salud, Art. 9 RGPD).
  🟢 Base: ya hay consentimientos; falta el log granular con IP/firma. Cableado de la firma en el portal/ficha = [C].
- **8.4 Fotos privadas de clientas** 🟢 **HECHO** [A] — bucket `cliente-fotos` privado + signed URLs (expiración 15 min).
- **8.5 Aviso de grabación en telefonía/IA** 🔴 [A] — locución de consentimiento antes de conectar la llamada
  a la IA de voz (Retell/Twilio), por la Ley General de Telecomunicaciones.

**Manual (fundadores Carlos/Alexandro/José):** KYC de **Stripe** por salón (DNI/escrituras/certificado bancario) ·
registrar a Mecha como **BSP en Meta** (habilita Embedded Signup de WhatsApp) · **Twilio Regulatory Bundles**
(comprar números +34) · contratar **fiscalista** que valide el POS antes de emitir tickets oficiales (M-CJ) ·
redactar el **DPA** (Data Processing Agreement) en PDF para que el salón lo firme. (Cruza con la Fase 4 aparcada.)

---

## Apéndice — Ya hecho (para no rehacer)

**Carlos (frontend/UX, hasta 17 jun):** portal de reserva premium + QR + fotos de servicio · sistema de reseñas
avanzado (preguntas granulares, análisis IA, dual reviews, pestaña config) · **referidos "invita y gana"
multinivel** (panel staff árbol + anti-fraude) · lista de espera v1 · bloquear clientes, etiquetas,
consentimientos RGPD, tarjeta de fidelización · tendencia en informes · panel admin de staff + gestión de
accesos/roles · agenda (horario partido, media hora) · demo compartida + tour guiado · landing/especificaciones +
login Google + wallpaper/splash · cuenta editable y soporte en config.

**Alexandro (IA/pagos/mensajería, hasta 17 jun):**
- **Base de agentes IA:** RPCs `identificar_cliente`, `citas_de_cliente`, `cancelar/modificar_cita_publica`,
  `crear_cita_publica` con canal, `cita_publica` (getter anónimo), tabla+RPC `conversaciones_ia`.
- **Motor de notificaciones WhatsApp** ACTIVO (workflow n8n): confirmación/recordatorio/reseña, validado E2E.
- **Agente WhatsApp entrante** (n8n + LLM + RPCs): responde, consulta catálogo, reserva.
- **Stripe señal P1** validado: edge functions `crear-checkout-senal` + `stripe-webhook`.
- **Página `/app/cita/[id]` "gestiona tu cita"** (ver/cambiar/cancelar) — probada en navegador.
- Señal: modelo de datos (`pagos`, `requerir_senal_cita`).
- Seguridad endurecida; demo compartida; móvil de landing y software.

**Lo que FALTA de cara a la app (visible para el usuario):** página de pago de señal `/app/pago/...` + badge
"señal pagada" (Fase 1) · IA en la agenda (reordenador con preview, anti-solape inteligente — 1.2; el
chatbot/copiloto y los retrasos encadenados 1.1 YA están) · analítica de crecimiento/focos (2.1-2.3) · cerrar cuenta RGPD (5.1) ·
modo invitado (3.3) · inventario (6.1) · caja diaria (6.2, con fiscalista). Todo lo demás core ya está en la app.

> Mantener vivo: al cerrar un punto, marcar estado o moverlo al apéndice.
