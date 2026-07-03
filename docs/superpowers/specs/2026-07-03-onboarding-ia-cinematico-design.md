# Diseño: Asistente de onboarding cinematográfico con IA (cuentas nuevas)

- Fecha: 2026-07-03
- Autor: Carlos + Claude
- Estado: diseño aprobado por el usuario en brainstorming; pendiente de revisión del spec antes del plan de implementación
- Reparto: decisión explícita del usuario de que esto lo implemente Carlos ahora mismo, aunque la
  regla general del proyecto (`CLAUDE.md`) asigna "todo lo que usa IA" a Alexandro. Se deja constancia
  aquí porque es una excepción puntual, no un cambio de la regla de reparto.
- Relacionado: complementa (no sustituye) el checklist manual existente — ver
  `docs/superpowers/specs/2026-06-26-onboarding-checklist-design.md` y memoria `onboarding-checklist`.

## 1. Problema y objetivo

Hoy, cuando una cuenta nueva recibe su negocio propio, ve un checklist manual en Avisos ("Pon en
marcha tu salón") que le dice qué le falta, pero **tiene que ir paso a paso a cada pantalla y
rellenarlo todo ella misma**. Muchos abandonan a medias.

Objetivo: la primera vez que el propietario entra a su negocio operativo, una **pantalla completa
cinematográfica** con un agente de IA conversacional le va guiando y **crea de verdad** sus
servicios, su equipo, sus horarios y el resto de configuración inicial mientras habla con él en
lenguaje natural — en vez de mandarlo a rellenar formularios. Si abandona a medias o salta pasos,
el checklist manual de Avisos sigue existiendo exactamente igual que hoy y recoge lo que falte.

## 2. Decisiones de diseño (cerradas en brainstorming)

1. **Disparo: automático, una sola vez.** Se lanza la primera vez que un gestor (`owner`/`admin`,
   vía `getUserProfile()`) entra a su negocio propio elegible (no demo, `negocio_id` propio tras
   `staff_grant_full_access`, núcleo del checklist aún incompleto). No se repite solo; si lo cierra
   a medias, en las siguientes visitas ve el panel estático de Avisos como hoy. Reutilizable a mano
   desde Ajustes si quiere terminarlo (mismo mecanismo `?onboarding=1` que ya existe, ver más abajo).
2. **Alcance: todos los temas del checklist**, núcleo y recomendados, en un único recorrido:
   bienvenida → datos del negocio → servicios → equipo → horario del salón → reserva online →
   fotos de servicios → recordatorios WhatsApp. El paso `horarios_profesional` del checklist actual
   **no se pregunta aparte**: el horario del salón se aplica automáticamente como horario de cada
   profesional creado en el asistente (decisión explícita para no preguntar dos veces). Quien quiera
   un horario distinto por persona lo ajusta después en Equipo, igual que hoy.
3. **Multi-alta:** en Servicios y Equipo, tras crear el primero aparece "+ Añadir otro" y
   "Continuar →". No obliga a completar todo el catálogo ahí mismo.
4. **Nivel de IA: agente con acciones reales (function-calling).** El propietario escribe en
   lenguaje natural ("corte de caballero a 15 euros, media hora") y el agente interpreta, ejecuta
   el alta real y lo confirma. No es un formulario con IA de adorno.
5. **Ejecución sin fricción salvo en dos acciones externas:** crear/editar servicios, profesionales,
   horarios y datos del negocio se ejecuta **al instante** (sin botón de confirmar), mostrando el
   resultado creado como protagonista de la pantalla. Las dos excepciones son **invitar a un
   profesional por email** (manda un correo real) y **activar la reserva online** (hace el salón
   públicamente reservable): estas dos piden un toque explícito de confirmación antes de ejecutarse.
6. **Robustez por encima de la sofisticación:** el asistente debe funcionar siempre, consumir poco,
   y no bloquear nunca al propietario si la IA falla (detalle en §6).
7. **Sin cifras de mercado inventadas sin fuente:** el único dato "externo" que sugiere el agente es
   un precio orientativo de servicio, generado por el propio modelo (no hay base de datos real de
   precios), **siempre etiquetado como estimación de la IA**, nunca como dato verificado. El resto
   de "consejos" que dé el agente son o bien cálculos reales sobre los números que el propio
   propietario acaba de introducir (p. ej. margen tras aplicar una comisión), o bien hechos ciertos
   sobre cómo funciona Mecha — nunca estadísticas de mercado inventadas.
8. **Fuera de alcance de este spec** (se abren como iniciativas aparte, ya anotadas):
   - Tips en pantallas de carga de toda la app (landing + software).
   - Icono de ayuda contextual por página + manuales con capturas.
   - Paridad nativa (`.tsx`): este asistente es web-first, como el resto del producto real hoy.

## 3. Diseño visual y de interacción

Pantalla completa que tapa todo el software (overlay `position: fixed`, z-index por encima de todo).
**Nada de hilo de chat que crece hacia abajo.** Cada instante es una única pantalla ("fotograma")
que sustituye a la anterior con una transición suave (fade/slide), como diapositivas — no como una
conversación de mensajes apilados.

- **Estilo:** limpio, con mucho aire, inspirado en la sobriedad de Google/Material en cuanto a
  composición y animación, pero **con los colores y tipografía de marca Mecha** (fondo blanco/crema,
  acento fuego `#f4501e`/`#c0260a`, tipografía Inter para texto e "Bricolage Grotesque" para el
  titular grande, igual que el wordmark del login) — no la paleta neutra de Material. Coherente con
  el resto del software que el propietario va a usar cada día. Sin emojis.
- **Anatomía de cada fotograma:** barra de progreso fina arriba (opcional, discreta) · logo/marca
  Mecha pequeño · titular grande (la pregunta/afirmación del agente, tono editorial, no burbuja de
  chat) · un único bloque de interacción centrado debajo, que cambia de forma según lo que se pide:
  campo de texto libre (con placeholder de ejemplo, p. ej. `"Corte de caballero, 15€, 30 min"`),
  chips de sugerencia rápida, botones de acción, o una zona de subida de foto.
- **El resultado manda:** justo tras crear algo, el fotograma siguiente muestra ese resultado como
  protagonista (tarjeta grande centrada con check, no un texto de confirmación pequeño) antes de
  pasar a la siguiente pregunta.
- **"Saltar este paso"** visible y permanente en cada fotograma (no escondido en un menú).
- Respeta `prefers-reduced-motion`; en móvil, mismo patrón a pantalla completa (mobile-first, regla
  dura del proyecto).

## 4. Arquitectura técnica

Una única Edge Function nueva en Supabase, **proxy sin estado hacia OpenRouter, sin acceso a la
base de datos**:

- `supabase/functions/onboarding-agent/index.ts` — recibe `{ negocioId, mensajes, estadoOnboarding }`
  de un cliente ya autenticado. Verifica por el JWT de la petición que quien llama es owner/admin de
  ese `negocioId` (para que nadie pueda quemar la clave de API llamando a la función sin más).
  Construye el prompt de sistema a partir de `lib/onboarding.ts` (los mismos pasos y copy que ya usa
  el checklist manual) + el estado real ya calculado por `useOnboardingStatus` (así el agente no
  vuelve a preguntar lo que ya está hecho). Pide a OpenRouter una **respuesta estructurada (JSON)**:
  o un mensaje para pintar (`titulo`, `modo_input`: texto/chips/botones/foto, `placeholder_ejemplo`,
  `chips`) o una petición de acción (`crear_servicio`, `crear_profesional`, `invitar_profesional`,
  `fijar_horario_salon`, `activar_reserva`, `activar_notificaciones`, `subir_foto_servicio`, `saltar_paso`).
  Modelo: `gpt-4o-mini` vía OpenRouter (suficiente para interpretar respuestas cortas y rellenar
  campos; más barato y rápido que el `gpt-4o` que usa el agente de WhatsApp, que resuelve un problema
  más abierto).
- **El cliente ejecuta las acciones**, no la Edge Function: el navegador (sesión ya autenticada del
  propio propietario) llama a `supabase-js` directamente contra `servicios`, `profesionales`,
  `horarios_profesional`, `negocio_horarios`, `negocio_config`, `negocio_portal` — las mismas tablas
  que ya escriben hoy Ajustes y Equipo, con el mismo RLS de owner/admin sobre su propio negocio. No
  hacen falta RPCs nuevas ni tocar seguridad de base de datos. La única excepción es invitar por
  email, que reutiliza la Edge Function ya existente `crear-acceso-empleado` (la misma que usa hoy
  el botón "Invitar nueva por email" en Equipo). Tras ejecutar, el resultado se manda de vuelta al
  agente para que continúe la conversación.
- **Clave de OpenRouter:** vive como **secreto de la Edge Function** (`supabase secrets set`),
  nunca en el repo ni expuesta al cliente. Para desarrollo/pruebas se usará la clave que ha
  compartido el usuario en esta sesión; **debe rotarse en el dashboard de OpenRouter antes de
  producción** (queda anotado como pendiente explícito, no se commitea en ningún archivo).

Nuevos ficheros de cliente:

- `lib/onboardingAgent.ts` — construye los mensajes, llama a la Edge Function, interpreta la
  respuesta estructurada y ejecuta las acciones vía `supabase-js` (reutilizando query patterns ya
  existentes en `configuracion.web.tsx`/`equipo.web.tsx`).
- `components/onboarding/OnboardingAgentOverlay.web.tsx` — el overlay a pantalla completa con las
  transiciones entre fotogramas. Web-only (sufijo `.web`, igual que `OnboardingCard`/`OnboardingPanel`).
- Punto de montaje: `app/(tabs)/_layout.tsx`, comprobando elegibilidad + flag de "ya mostrado" al
  montar (ver §5), renderizado por encima de `Sidebar`/`Tabs`/`MobileTabBar`.

## 5. Persistencia y reapertura

Sin migraciones ni backend nuevo para el estado del asistente (mismo criterio que el checklist
manual, §7 de su spec):

- **"Ya se mostró" (una sola vez):** `localStorage`, clave por negocio
  (`mecha-onboarding-agent:<negocio_id>` → `{ shown: true }`). Se marca al abrirse, sin importar
  cuánto se avance. No se vuelve a lanzar solo aunque el núcleo siga incompleto.
- **Progreso real:** no se guarda nada aparte — el estado de "qué falta" siempre se recalcula desde
  los datos reales (`useOnboardingStatus`, igual que hoy). Si cierra el asistente a medias, lo que
  ya creó queda creado; lo que falte lo recoge el checklist manual de Avisos sin cambios.
- **Reapertura manual:** la entrada ya existente en Ajustes ("Abrir guía de puesta en marcha") sigue
  abriendo el panel estático de Avisos, no relanza el asistente cinematográfico (evita que se vuelva
  pesado). Si en el futuro se quiere un botón para "volver a intentarlo con el asistente", es una
  ampliación menor, no parte de este v1.

## 6. Robustez y control de coste

- **Fallback determinista por timeout:** si la Edge Function no responde en ~6s o devuelve error, el
  fotograma actual cae automáticamente a un input simple y predecible para ese campo concreto (p. ej.
  nombre/precio/duración en campos normales) en vez de quedarse cargando. El propietario nunca ve un
  asistente "colgado".
- **"Saltar este paso" siempre disponible**, incluso si la IA está respondiendo con normalidad.
- **Coste acotado:** historial de conversación recortado por turno (no se reenvía la charla completa
  entera cada vez, solo el contexto mínimo necesario), modelo económico (`gpt-4o-mini`), y como el
  disparo es automático-una-sola-vez por negocio, el volumen está naturalmente limitado a altas
  reales nuevas (no repetible por el mismo negocio).
- **Seguridad:** la Edge Function verifica ownership del `negocioId` contra el JWT antes de llamar a
  OpenRouter (evita abuso/consumo de terceros). Sin `exec_sql`, sin políticas `USING (true)` de
  escritura — todas las escrituras las hace el cliente autenticado bajo el RLS que ya existe hoy.

## 7. Fuera de alcance (v1)

- Paridad nativa (`.tsx`); el asistente es web-only.
- Tips en pantallas de carga de toda la app (iniciativa aparte).
- Icono de ayuda contextual por página + manuales con capturas (iniciativa aparte).
- Persistencia multi-dispositivo del flag "ya mostrado" (localStorage basta para v1, igual que el
  checklist manual).
- Botón para "reintentar con el asistente cinematográfico" tras la primera vez (solo queda el panel
  estático de Avisos como reapertura).

## 8. Criterios de aceptación

1. Cuenta gestora con negocio propio recién operativo-elegible: al entrar por primera vez, el
   software queda tapado por el asistente a pantalla completa con la bienvenida animada.
2. El propietario puede crear un servicio escribiendo en lenguaje natural (p. ej. "corte de
   caballero a 15 euros, media hora") y ve el resultado creado como tarjeta protagonista, sin tener
   que tocar ningún botón de "confirmar".
3. Invitar a un profesional por email y activar la reserva online piden un toque explícito de
   confirmación antes de ejecutarse; el resto de acciones no.
4. El horario fijado para el salón queda aplicado automáticamente a cada profesional creado en el
   asistente (el paso "horario por profesional" del checklist queda hecho sin preguntarlo aparte).
5. "Saltar este paso" funciona en todos los pasos y explica dónde configurarlo más tarde.
6. Si se simula un fallo/timeout de la Edge Function, el paso cae a un formulario simple en vez de
   quedarse cargando indefinidamente.
7. Cerrado el asistente a medias (o completo), no se vuelve a lanzar solo en próximas visitas; el
   checklist manual de Avisos refleja correctamente lo que quedó pendiente.
8. En modo demo y para empleados (rol no gestor): el asistente no aparece nunca.
9. La clave de OpenRouter no aparece en ningún archivo del repo ni en el bundle del cliente.

## 9. Cómo probar

- `npm run build:web` y `node scripts/serve-web.mjs`; entrar con una cuenta gestora de negocio
  propio recién dado de alta (no demo). Verificar los puntos 1-8 de §8.
- Simular fallo de red hacia la Edge Function (bloquear la petición en devtools) para comprobar el
  fallback determinista del punto 6.
- Demo (`/demo.html?share=1`): confirmar que el asistente NO aparece.
