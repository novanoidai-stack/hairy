# Vigilantes — PLAN MAESTRO

> **Qué es esto.** El documento único que gobierna la vigilancia de Mecha. Funde tres
> fuentes y las resuelve donde se contradicen:
>
> 1. `2026-08-28-vigilantes-de-regresion.md` — la fase 1, **ejecutada y en verde**.
> 2. `2026-08-29-vigilantes-fase2-radiografia.md` — el backlog de 12 familias.
>    Familias **12** y **1** hechas; el resto sigue siendo el inventario válido,
>    con las correcciones de §1 de este documento.
> 3. El informe *"Workflows de GitHub pendientes"* (29 ago 2026) — seis piezas de
>    CI/CD que la fase 2 no contemplaba porque miraba al código, no al despliegue.
>
> **Los dos documentos anteriores siguen siendo válidos como detalle de diseño.**
> Este manda sobre ellos en prioridades, en las correcciones de §1 y en todo lo que
> añade de nuevo (§3.5 en adelante).
>
> **Estado:** hecho → fase 1 completa, familias 12, 1 y **2** de la fase 2.
> Siguiente: **M1** (que la capa 2 corra sola). Todo lo demás es backlog.

---

## 0. Resumen ejecutivo: los cinco agujeros

La CI de hoy es sólida: typecheck, lint, cinco suites de tests, esquemas Zod, la
puerta de claves, el catálogo de modelos, tres edge functions tipadas, seis
vigilantes estáticos, el smoke de 17 pantallas con mediciones y un canario horario
contra producción. Y aun así, **la auditoría del 29 de agosto encontró cuatro
problemas críticos y ninguno lo vio esa CI**:

| Lo que se encontró | Por qué la CI no lo vio |
|---|---|
| 29 RPC `definer` abiertas a `anon` | Los grants se crean por migración aplicada en remoto, no por PR |
| `profiles` legible y escribible entre salones | Idem: es una política RLS, no código del repo |
| Un trigger que tumbaba el guardado de horarios | Solo se manifiesta ejecutando SQL contra la BD |
| El cron de la agenda mirando un tenant vacío | Es configuración de `cron.job`, no del repo |

Las cuatro las detecta **hoy** `public.vigilancia_bd()`. Y no la ejecuta nadie de
forma automática: solo `npm run vigilar:bd` en local y el panel de staff cuando
alguien lo abre. Ese es el agujero número uno.

Los cinco agujeros, por tamaño:

1. **La capa 2 no corre sola.** El código que caza lo más caro existe y nadie lo
   llama. (→ §3.2, pieza M1)
2. **Nadie vigila el dinero ni los mensajes.** Que no salga un WhatsApp, que se
   rompa la cadena VeriFactu o que un cobro no cuadre no lo nota ningún test.
   Lo notará un salón que paga. **Está pasando ahora mismo**: n8n lleva desde el
   29 ago a las 11:18 UTC devolviendo 401 y no sale ni un mensaje de ningún salón.
   Un vigilante de esto valía más que todo lo demás junto. (→ §3.5)
3. **El despliegue no se verifica.** El paso que más ha dolido —comprobar el
   *bundle*, no el código— sigue siendo manual y hay que acordarse. (→ §3.4, C3)
4. **Los invariantes repartidos siguen creciendo sin vigilante.** Precios y
   referidos ya lo tienen; planes, estados de cita, tipos de solicitud y los dos
   convenios de `negocio_horarios` no. (→ §3.1)
5. **Nadie mira producción salvo el canario, y el canario solo mira pantallas.**
   `errores_cliente` es el mejor detector de regresiones que tenemos —usuarios
   reales— y no está conectado a la atribución por commit. (→ §3.5, P4)

---

## 1. Evaluación del plan de fase 2: qué se mantiene y qué cambia

Lo que sigue no es una crítica al plan: es lo que se ha aprendido al ejecutarlo y
al mirar el código de verdad. Se anota aquí para no volver a razonarlo.

### 1.1 Lo que se mantiene tal cual (y es lo mejor que tiene)

- **Las seis reglas de gobierno** (ancla perdida = fallo, dos niveles, línea base
  congelada, Actions sin claves, tres estados para los flaky, no estrenar sin
  medir). Son el motivo de que la fase 1 no se haya pudrido. **Gobiernan también
  todo lo nuevo de este documento.** Se repiten en §5.
- **La separación Salud ≠ Errores.** No mezclar "lo cazamos antes" con "se rompió
  en casa de un cliente".
- **Las familias 3 (cuellos de BD), 4 (coherencia de datos), 6 (cartógrafo) y 11
  (atribución)** están bien diseñadas y se ejecutan como están escritas.
- **La familia 12** ya está hecha y no hay nada que revisar.

### 1.2 Correcciones, con la evidencia

**a) La 2a se apoya en selectores que no existen.** El plan propone detectar
toasts con `.toast`, `[role="alert"]` o "clase de error conocida". Medido en el
repo: **cero** `role="alert"` y **cero** `testID` en `app/` y `components/`. El
único toast del producto es un `<div>` con estilos en línea dentro de
`AgendaCalendar.web.tsx`, y es **verde** (confirmaciones, no errores). Un
vigilante montado sobre esos selectores nacería ciego, que es justo lo que
prohíbe la regla 1.

La redacción correcta de la 2a, con anclas que sí existen:

- **`unhandledrejection` en todos los documentos** (init script, como
  `observarLongTasks`), porque la app corre dentro de un iframe y porque
  `page.on('pageerror')` no caza promesas rechazadas.
- **Diálogos nativos.** Hay **124** `alert(...)`/`confirm(...)` en `app/` y
  `components/`. Playwright los descarta solo, así que hoy un
  `alert('No se pudo eliminar…')` tras un clic es literalmente invisible en CI.
  Se capturan con `page.on('dialog')`.
- **Texto de error nuevo en pantalla**, contra el catálogo de frases que produce
  `lib/errores.ts` — que es el embudo real: **127 llamadas** a `mensajeDeError()`.
  El ancla es ese fichero; si las frases desaparecen de allí, el detector falla
  por ciego en vez de pasar en verde.

**b) La 2b exime un caso que no es seguro y no exime el que sí lo es.** El plan
dice de flagear la llamada async «sin `await` ni `.catch` ni envolvente
try/catch dentro del handler». Un `try/catch` alrededor de una llamada **no
esperada** no captura su rechazo: la promesa se rechaza después, fuera del bloque.
Eximir por ahí deja pasar el bug entero.

Lo que sí es seguro —y es el patrón idiomático de este repo— es que la función
llamada **se guarde a sí misma**: `const guardar = async () => { try { … } catch
(e) { setError(mensajeDeError(e)) } }` invocada como `onClick={() => guardar()}`.
Ahí el fuego-y-olvido es correcto y flagearlo sería ruido sobre **808** handlers.

Regla corregida: se señala el fuego-y-olvido **solo cuando la función llamada
puede rechazar** (tiene `await` o `throw` fuera de un `try` con `catch`). Reduce
falsos positivos respecto al plan, nunca los aumenta, y la exención es demostrable.

**c) La 5a (diff de capturas) está mal priorizada.** Es la pieza más cara de
mantener y la de peor relación señal/ruido en un producto cuyas pantallas pintan
datos vivos de la demo (fechas, horas, importes que cambian solos). Propuesta:

- **5b y 5c primero** (overflow, elemento fuera del viewport, contraste,
  responsive a 390 px): deterministas, sin dependencias nuevas, sin fichero de
  referencia que aprobar.
- **5a solo para `web/*.html`** (landing, marketplace, legales), que es contenido
  estático y donde una captura de referencia significa algo. Para la app, no.

**d) Falta la capa de CI/CD y falta la de negocio.** El plan es
código-y-pantalla-céntrico. Los fallos que más cuestan en Mecha son de **datos y
de operación**: dinero que no cuadra, una cadena fiscal rota, mensajes que no
salen, un tenant que ve a otro. Se añaden como §3.4 y §3.5.

**e) La 11b (bisect) puede esperar.** El delta por push (11a) da el 80 % del valor
con una décima parte del trabajo. El bisect se monta cuando haya una serie
temporal que valga la pena bisecar.

### 1.3 Sobre el informe de workflows pendientes

Los seis puntos se aceptan, con dos matices:

- **El punto 6 (Dependabot) ya está resuelto**, y mejor: hay **Renovate**
  (`.github/renovate.json`, agrupando expo y supabase) más **CodeRabbit**
  (`.coderabbit.yaml`). El informe no lo recogía porque es de la misma tarde que
  la familia 12. No hace falta `dependabot.yml`: tener los dos es ruido duplicado.
- **El punto 1 tiene una trampa que hay que resolver en el diseño, no en la
  implementación.** «Un job que invoque `vigilancia_bd()` con `VIGILANCIA_TOKEN`»
  choca de frente con la regla 4 si se hace por lo obvio (meter la
  `service_role` en los secrets de Actions). La salida correcta está en §3.2/M1:
  **una edge function que ejecute la función y publique ella misma**; Actions solo
  la dispara con el token de vigilancia, que no sirve para nada más.

---

## 2. Las cinco capas

La fase 1 definió tres. Hacen falta dos más para cubrir lo que se escapa.

| Capa | Dónde vive | Qué solo se puede ver ahí | Cuándo corre |
|---|---|---|---|
| **1. Estática** | `scripts/vigilantes/*.mjs` | Invariantes repartidos por varios ficheros | Cada PR (`npm run vigilar`) |
| **2. Base de datos** | `public.vigilancia_bd*()` | RLS, grants, la regla del parámetro, planes de consulta | **Hoy: nadie. Debe: cada 6 h** |
| **3. Navegador** | `tests/smoke/` | Que la pantalla pinte, responda y no mienta | Cada PR + canario horario |
| **4. CI/CD y despliegue** | `.github/workflows/` | Que lo que se publica sea lo que se probó | Push, merge y post-deploy |
| **5. Producción y negocio** | edges + canario + panel | Que el dinero, los mensajes y los datos cuadren de verdad | Continuo |

Las cinco publican en la pestaña **Salud** con el mismo formato de hallazgo y el
mismo ciclo de vida. Sin excepciones: un hallazgo que vive en otro sitio es un
hallazgo que nadie lee.

---

## 3. Catálogo completo

Marcas: **[HECHO]** · **[EN CURSO]** · **[NUEVO]** = no estaba en ningún documento
anterior · sin marca = viene de la fase 2 y sigue pendiente.

### 3.1 Capa 1 — Vigilantes estáticos (`npm run vigilar`)

| Pieza | Qué duele | Nivel |
|---|---|---|
| `precios.mjs` **[HECHO]** | Precios en 3 sitios | bloqueante |
| `referidos.mjs` **[HECHO]** | Porcentajes en 4 sitios | bloqueante |
| `rutas-publicas.mjs` **[HECHO]** | Ruta exenta de guard sin vigilar | bloqueante |
| `cache-app.mjs` **[HECHO]** | Volver a poner `no-store` a `/app/(.*)` | bloqueante |
| `claves.mjs` **[HECHO]** | Una clave en el código o en el bundle | bloqueante |
| `codigo-muerto.mjs` **[HECHO]** | La deuda de knip crece | aviso |
| `peso-bundle.mjs` **[HECHO]** | El bundle engorda >5 % | aviso |
| `errores-tragados.mjs` **[HECHO]** | Botón que traga el error (§1.2b) | aviso, base congelada |
| `panel-ambitos.mjs` **[HECHO]** | Un ámbito nuevo que el panel de Salud no conoce | aviso |
| `edges-autorizadas.mjs` **[HECHO]** | Edge con `verify_jwt = false` y sin puerta propia | bloqueante |
| `migraciones.mjs` **[HECHO]** | Higiene del SQL nuevo (RLS, regla del parámetro, anon) | bloqueante, base congelada |
| `husos.mjs` **[HECHO]** | Horarios de salón en un runtime en UTC | bloqueante |
| `planes.mjs` **[HECHO]** | Lo que incluye cada plan vs. lo que se promete | bloqueante |
| `horarios-convenio.mjs` **[HECHO]** | El 0 = lunes confundido con el 0 = domingo | bloqueante |

**Alcance real de `errores-tragados`, para no darlo por más ancho de lo que es.**
Barre `app/` y `components/`, no `lib/`. Se probó añadiendo `lib/` y da **cero**
hallazgos nuevos: sus reglas están ancladas a *handlers* de UI (`onPress`,
`onClick`) y en `lib/` no hay ninguno. O sea que no es un olvido, pero tampoco
es "cubre todo el código": un error tragado dentro de una función de `lib/` a la
que llama un botón se ve solo si el barrido llega hasta ella (un nivel), que es
lo documentado. Si algún día se quiere cubrir de verdad, hace falta una regla que
no dependa del handler, no añadir la carpeta.

**Lo que enseñó estrenarlos (29 ago 2026).** Los cinco de arriba se escribieron
de una tanda y **tres cazaron algo real el primer día**, que es el argumento a
favor de seguir por aquí:

- `planes.mjs` destapó que cuatro textos decían "Esencial y Estudio dan el mismo
  software" mientras `PLAN_FUNCIONES` gateaba seis funciones — incluido el
  resumen que la app le enseñaba **dentro** a un salón que ya pagaba Esencial.
- `horarios-convenio.mjs` destapó que el seed de la demo copiaba `dia_semana`
  entre las dos tablas sin convertir: la disponibilidad de `/r/demo`, el
  escaparate, iba corrida un día.
- `migraciones.mjs`, validado contra las 263 migraciones del archivo, reconoce
  las **tres** pruebas de tenencia válidas. Sin la tercera (el portal, que deriva
  el negocio del slug y exige un secreto) marcaba toda la familia `cita_publica`,
  que es correcta a propósito.

Y una regla de método que conviene no olvidar: **cada uno de los cinco tuvo al
menos un falso positivo antes de valer**, y en los tres casos el falso positivo
enseñó algo del diseño real que el plan no sabía (el `&&` de `agenda-optimizador`,
la defensa por revocación, el `lib/` propio de una edge que se llama igual que uno
de la raíz). Estrenar un vigilante sin mirar uno a uno sus primeros hallazgos es
como no tenerlo.

**Nuevos de este plan, aún pendientes:**

- **`solicitudes.mjs`** [NUEVO] — el `tipo` de solicitud vive en el CHECK de la
  tabla **y** en `crear_solicitud_publica`. Añadir uno y olvidar el otro rompe el
  contacto comercial en silencio: el formulario da error y nadie se entera de que
  ha dejado de entrar trabajo. **bloqueante.** (La capa 2 ya lo mira con la BD
  delante; falta la mitad estática, que lo caza en el PR.)
- **`migraciones.mjs` — la segunda mitad**, aún pendiente:
  **Deriva con el remoto**: ficheros en `supabase/migrations/` que el historial
  remoto no tiene, salvo los marcados explícitamente como *aplicar después de
  desplegar*. **aviso** (el historial remoto manda, pero un fichero olvidado a
  las dos semanas no lo recuerda nadie). Necesita red, así que va con la capa 2.
- **`legal.mjs`** (familia 7a) — enlace a privacidad desde el pie y desde todo
  formulario; banner de consentimiento si se carga GA o Vercel Insights; fecha
  visible en los textos legales. **aviso**, salvo el consentimiento: **bloqueante**.
- **`web-publico.mjs`** (familia 8) — links internos rotos, JSON-LD válido y
  cuadrando con `lib/planes.ts`, `noindex` accidentales, `robots.txt`.
- **`mapa.mjs`** (familia 6a) — el cartógrafo. Además de lo que dice la fase 2,
  emite `mapa.json` versionado para que el diff del PR enseñe qué se ha tocado.
- **`textos-ui.mjs`** [NUEVO] — convención de la casa: sin emojis en código ni en
  UI, sin `TODO`/`FIXME`/`lorem` en texto visible, sin cadenas en inglés en
  pantallas de usuario. **aviso.**

### 3.2 Capa 2 — Base de datos

**M1. Que la capa 2 corra sola** [NUEVO, informe #1] — **la pieza de mayor
retorno de todo este documento.**

Diseño, resolviendo la tensión con la regla 4:

- Edge function **`ejecutar-vigilancia-bd`**, con `verify_jwt = false` y su
  `peticionDeServicio(req)` propio (regla 9), autorizada con `VIGILANCIA_TOKEN`.
- Llama a `vigilancia_bd()` **con su propia clave de servicio**, leída del Vault.
  Actions nunca ve una clave de Supabase: solo dispara con un token que sirve
  únicamente para esto.
- Publica el informe en `vigilancia_*` ella misma y devuelve el resumen.
- Workflow **`vigilancia-bd.yml`**, `schedule` cada 6 h + `workflow_dispatch`,
  que la invoca y **falla si viene algún `bloqueante`**.

Habría cazado los cuatro críticos de §0.

**M2. `vigilancia_bd_rendimiento()`** (familia 3a) — `pg_stat_statements` (top 20
por `total_exec_time`, p95 > 300 ms), seq scans que crecen con muchas tuplas
leídas —el historial de `is_staff()` volátil dio 24 M de esos—, esperas en lock, y
**delta contra la corrida anterior** para ver tendencia y no solo la foto.

**M3. `vigilancia_bd_coherencia()`** (familia 4a) — sumas y conteos que dos
pantallas calculan por caminos distintos, huérfanos lógicos, estados fuera de
dominio, bonos con más consumido que disponible. `aviso` en demo, `bloqueante` en
producción.

**M4. `vigilancia_bd_fiscal()`** [NUEVO] — **VeriFactu**. La cadena de huellas es
la pieza con consecuencia legal de todo el producto y hoy no la mira nadie
automáticamente: continuidad sin huecos, sin duplicados, cada eslabón encadenando
con el anterior, ningún registro anulado fuera de procedimiento, el worker vivo y
sin cola atascada. Un eslabón roto no es un bug, es un problema con Hacienda.
**bloqueante siempre.**

**M5. `vigilancia_bd_multitenant()`** [NUEVO] — la comprobación que la auditoría
tuvo que hacer a mano: toda tabla con `negocio_id` tiene RLS activa; ninguna
política de escritura permite cruzar de negocio; ninguna función `definer`
concedida a `authenticated` recibe parámetros sin mencionar `auth.uid()`,
`is_staff()`, `my_negocio_id_text()` ni `exige_mi_negocio()` (hoy da 0: hay que
mantenerlo en 0); ninguna RPC nueva concedida a `anon` sin estar en la lista
conocida del portal público. **bloqueante.**

**M6. `vigilancia_bd_crons()`** [NUEVO] — `cron.job` + `cron.job_run_details`: un
cron que no ha corrido en su ventana, uno que falla repetido, uno apuntando a un
tenant vacío (el cuarto crítico de §0), y los 15 de `pg_cron`/`pg_net` con su
última ejecución. **bloqueante** si un cron de dinero o de mensajes está mudo.

**M7. `vigilancia_bd_ia()`** [NUEVO] — `chispa_auditoria`: modelos usados que no
están en `shared/modelos.ts` (o sea, alguien escribió un id a mano), coste por
hora fuera de rango, cupo por usuario que no se está aplicando porque la
migración no está puesta, y cascadas que caen siempre al modelo caro. La versión
anterior del catálogo tenía tres modelos inventados y nadie se enteró.

**M8. `vigilancia_bd_almacenamiento()`** [NUEVO] — el bucket `cliente-fotos`
sigue **privado** y sus políticas siguen siendo por carpeta de negocio. Un bucket
que se vuelve público es una fuga de fotos de clientas con nombre y apellidos.
**bloqueante.**

### 3.3 Capa 3 — Navegador

| Pieza | Estado |
|---|---|
| Smoke de 17 pantallas | **[HECHO]** |
| Mediciones de rendimiento (1a) | **[HECHO]** |
| Canario horario con base propia (1c) | **[HECHO]** |
| Sensores de fallo silencioso (2a, redactada como §1.2a) | **[HECHO]** |
| Checks de layout sin capturas (5b) | pendiente |
| Responsive a 390 px sobre 5 pantallas núcleo (5c) | pendiente |
| Contraste AA / accesibilidad | pendiente |
| Contraste UI ↔ BD (4b) | pendiente |
| Diff de capturas **solo de `web/*.html`** (5a corregida) | pendiente |

**Nuevos:**

- **`tests/smoke/demo-viva.spec.ts`** [NUEVO] — la demo es el escaparate y es
  **compartida**: si alguien la ensucia, el siguiente prospecto ve una agenda
  vacía. Comprobar que el tenant demo tiene citas hoy, clientas, servicios y
  cobros por encima de un mínimo. Que el cron `resembrar_demo` exista no basta:
  hay que mirar el resultado. **bloqueante** (es dinero comercial directo).
- **Recorrido de reserva de punta a punta** [NUEVO] — el portal público es el
  único sitio donde un cliente final toca Mecha sin sesión. Un smoke que reserve
  de verdad contra el tenant demo: elegir servicio, ver disponibilidad, crear la
  cita, comprobar que aparece. Es la ruta que más ingresos toca y hoy solo se
  comprueba que la pantalla pinta.

### 3.4 Capa 4 — CI/CD y despliegue

- **C1. Barrido de secretos** [informe #2] — `gitleaks` bloqueante, más las reglas
  propias que ya tiene `claves.mjs`, más los secretos de terceros que hoy no mira
  nadie: `sk_live_` de Stripe, credenciales SMTP de Hostinger, claves de Retell,
  OpenRouter y Google. La decisión 9 está escrita y no la hace cumplir nada fuera
  de Supabase.
- **C2. Guardia de migraciones** — la mitad estática vive en §3.1
  (`migraciones.mjs`); aquí solo el paso de CI que la corre y comenta en el PR.
- **C3. Verificación posterior al despliegue** [informe #3] — al mergear a
  `master`: esperar al deploy de Vercel, correr el smoke contra producción **ya**
  (sin esperar hasta una hora al canario) y comprobar **el bundle**:

  ```bash
  grep -rl 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' web/app/
  ```

  Tiene que dar 0. Está documentado desde la decisión 9 y sigue dependiendo de que
  alguien se acuerde. Automatizarlo es media hora.
- **C4. Presupuesto de bundle en el PR** [informe #5] — `peso-bundle.mjs` ya mide;
  falta que **comente el tamaño en el PR** comparando contra `master`, como los
  checks de Vercel. Sin el comentario, el aviso se lo lee el log y nadie más.
- **C5. Ampliar `check:edges` de 3 a 45** — es barato y cubre 42 funciones que hoy
  no tipa nadie. **Trampa documentada, no volver a pisarla:** desde un entorno sin
  red no se puede mapear `https://esm.sh/@supabase/supabase-js@2` al paquete de
  `node_modules` para juzgar — los genéricos del build de npm no son los de esm.sh
  y salen ~29 errores falsos. Hay que dejar que lo ejecute la CI, que sí tiene red.
- **C6. Cachear el navegador de Playwright** — el canario reinstala Chromium
  entero **24 veces al día** sin caché. `actions/cache` sobre
  `~/.cache/ms-playwright` se paga solo el primer día.
- **C7. Atribución** (familia 11a + 11c) — el delta contra la última corrida `ok`
  del `merge-base`, comentado en el PR con los dos shas en el título, y la serie
  temporal por commit en el panel. El bisect (11b), después.

### 3.5 Capa 5 — Producción y negocio

**Esta capa no existía en ningún plan anterior y es donde vive el daño real.**

- **P1. Mensajería que no sale** [NUEVO] — el más urgente de todo el documento,
  porque **el fallo está activo**: los tres workflows de n8n usan la
  `service_role` heredada, que está desactivada, y devuelven 401 cada 2 minutos
  desde el 29 ago a las 11:18:17 UTC. Consecuencia: no sale ningún WhatsApp de
  ningún salón (confirmación, recordatorio, reseña, enlace de señal) y los huecos
  de señal impagada no se liberan.

  El vigilante: `notificaciones_pendientes` **no es una cola** —se calcula en vivo
  sobre las banderas de `citas`—, así que la señal correcta no es "hay cosas
  pendientes" sino **"la cifra sube y no baja nunca"**. Si el pendiente crece de
  forma monótona durante más de N ventanas seguidas, el motor de envío está
  muerto. **bloqueante, con aviso fuera del panel** (esto no puede esperar a que
  alguien abra Salud).

  ```sql
  select count(*) from jsonb_array_elements(public.notificaciones_pendientes(500));
  ```

- **P2. Dinero que no cuadra** [NUEVO] — cobros con `stripe_payment_intent` cuyo
  `suscripcion_estado` no corresponde; señales pagadas sin cita asociada; citas
  liberadas por impago con un cobro completado detrás; reembolsos sin evento en
  `eventos_negocio`. Todo lo que en un salón se traduce en "he pagado y no
  aparece". **bloqueante.**
- **P3. Quién paga y quién no** [NUEVO] — `suscripcion_estado` es la única columna
  que dice si un salón paga, la escribe normalmente solo el webhook de Stripe, y
  tiene una puerta manual (`staff_set_cobro_manual`). Vigilar: ningún salón con
  `stripe_subscription_id` marcado a mano; ningún `free` marcado como activo;
  ninguna marca manual sin rastro en `eventos_negocio`; y que el motor de
  referidos siga contando **solo el `owner`** y **solo con `suscripcion_estado`**
  (las dos trampas ya pisadas). **bloqueante.**
- **P4. `errores_cliente` como detector de regresión** [NUEVO] — es el mejor que
  tenemos y no está conectado a nada. Ritmo de errores por hora y por ruta; si
  sube por encima de su línea base **después de un deploy**, hallazgo con el sha
  del deploy encima. Es la familia 11 aplicada a usuarios reales en vez de a
  métricas de laboratorio. Cierra el círculo: Salud dice "lo cazamos antes",
  Errores dice "se rompió en casa de alguien", y esto los une por commit.
- **P5. Retención y RGPD operativo** [NUEVO, extiende 7a] — `errores_cliente` y
  los logs necesitan retención **definida y aplicada**, no solo escrita; el
  derecho de supresión tiene que ser un flujo que funcione (borrar una clienta y
  sus fotos, sus consentimientos y sus mensajes); los encargados del tratamiento
  (OpenRouter, Anthropic, Google, Retell, Stripe, Hostinger) tienen que estar
  listados y con DPA. Checklist trimestral en el propio informe, con fecha, para
  que se vea cuándo caducó.
- **P6. Consentimiento de marketing** (familia 7b) — campaña enviada a clientas
  sin base jurídica registrada: **bloqueante**. Es de las pocas cosas de este
  documento con multa asociada.

---

## 4. Orden de ejecución

El criterio es **daño evitado por hora de trabajo**, no elegancia.

### Ahora (la tanda en curso)

1. ~~**Familia 2** — botones que fallan en silencio (2a redactada como §1.2a + 2b
   con la regla corregida).~~ **HECHA** (29 ago 2026). 18 tests del analizador
   estático + 5 de prueba de vida de los sensores; ambos vistos cazar una
   regresión inyectada. De propina salió `panel-ambitos.mjs`: el ámbito nuevo
   `errores-tragados` no lo conocía el panel de Salud, que es la misma clase de
   deriva silenciosa que estas herramientas existen para cazar (regla 9).
2. ~~**§3.1 nuevos** de la capa 1.~~ **HECHOS los cinco** (29 ago 2026):
   `edges-autorizadas`, `migraciones`, `husos`, `planes` y `horarios-convenio`.
   Se adelantaron a M1 porque no necesitan red ni credenciales — se pueden
   escribir y verificar enteros sin tocar producción — y porque tres de ellos
   cazaron un fallo real el mismo día. Quedan `solicitudes`, `legal`,
   `web-publico`, `mapa` y `textos-ui`.
3. ~~**M1 — que `vigilancia_bd()` corra sola cada 6 h.**~~ **HECHO** (29 ago 2026).
   Edge `ejecutar-vigilancia-bd` + `.github/workflows/vigilancia-bd.yml` (cada
   6 h, cada push a `master` que toque `supabase/`, y a mano). Actions sigue sin
   ver una clave de Supabase: solo viaja `VIGILANCIA_TOKEN` y la de servicio se
   queda dentro de la función. La puerta del token se extrajo a
   `shared/tokenVigilancia.ts` porque ya la necesitaban dos funciones, y un
   chequeo de autorización copiado y pegado es el invariante repartido de manual.
   Origen propio `bd` (no `ci`): mezcladas, nadie podría contestar *cuándo se
   vigiló la base por última vez*.
4. ~~**Capa 2 ampliada: rendimiento y guardia de migraciones.**~~ **HECHO.**
   `vigilancia_bd_rendimiento()` y `migraciones_sin_aplicar()` corrían ya en
   producción **sin que su SQL estuviera en el repo** — deriva del mismo tipo
   que la guardia vigila, pero al revés. Reconstruidas leyendo
   `pg_get_functiondef()` de producción, no de memoria.
5. **P1 — el vigilante de mensajería.** Hay un fallo activo ahora mismo que nadie
   está mirando. **Es lo siguiente.** (El arreglo de n8n es de Alexandro; el
   vigilante es nuestro y evita el próximo.)

### El agujero que encontró esta revisión: el vigilante de claves estaba ciego en CI

Merece quedar escrito porque contradice la regla número uno —*un vigilante ciego
es peor que no tenerlo*— y llevaba así desde que se montó.

`claves.mjs` mira el **bundle construido** en `web/app/`, que es la comprobación
que más duele si falta: Metro incrusta los `EXPO_PUBLIC_*` como literal y cachea
esa transformación por fichero, así que el código puede estar limpio y el bundle
salir con la clave vieja. Ya pasó una vez.

Pero `web/app/` está gitignorado, y los jobs estaban repartidos así:

- `check` ejecuta los vigilantes — y **no compila la web**.
- `e2e` ejecuta `build:web` — y **no ejecutaba los vigilantes**.

El recorrido empezaba con `if (!existsSync(abs)) return;`, así que en el checkout
limpio de `check` devolvía cero ficheros, el bucle no iteraba y la comprobación
**pasaba en verde sin haber mirado nada**. Sin error, sin aviso, sin rastro.

Se coló porque **el ancla que faltaba no era un regex sino un DIRECTORIO**. De
ahí la lección, más general que este fallo: *cuando un vigilante depende de un
artefacto que puede no estar, tiene que decir «no he podido mirar» en voz alta.*
`existsSync(...) return` es la forma más silenciosa de mentir.

Arreglado en dos mitades, ninguna opcional: `VIGILAR_BUNDLE=1` convierte la
ausencia en hallazgo **bloqueante** (sin la variable sigue siendo un no-aplica
legítimo, que es lo correcto en local), y el vigilante de claves se ejecuta
**también en el job `e2e`, después de `build:web`**, que es el único sitio de la
CI donde el bundle existe.

De paso: los tokens personales (`sbp_...`) le pasaban por delante sin verlos. No
abren una base de datos, abren la **cuenta** — el Management API de toda la
organización. Es más grave que una `service_role`, no menos.

### A continuación

6. **C1** (gitleaks sobre el **historial**, §4.2): el árbol actual ya lo cubre
   `claves.mjs` —y mejor que un `gitleaks` genérico, porque entiende que la
   publishable no es un hallazgo—; lo que nadie mira es el **historial de git**,
   donde sigue la `service_role` filtrada, en un repo que **ha vuelto a ser
   público**. La clave está desactivada, así que el daño está contenido: lo que
   queda es un **inventario** para decidir con datos, porque reescribir el
   historial rompe todos los forks y checkouts. Es una tarea puntual con una
   decisión de producto detrás, **no un workflow recurrente**.

   **C3 (verificación post-deploy) queda HECHA** por otro camino, más barato que
   el que proponía la nota: `canario.yml` ya sabía medir producción y ya tenía
   `workflow_dispatch`, así que solo hacía falta **dispararlo** —`workflow_run`
   tras una CI en verde en `master`— en vez de montar un segundo smoke con su
   propia línea base. Con una limitación que va escrita en el propio workflow:
   cuando la CI termina, Vercel puede seguir desplegando, así que esa corrida
   puede medir el deploy anterior. Lo adelanta, no lo sustituye.
7. **Actuar sobre lo que ya midió `vigilancia_bd_rendimiento`.** Medir está
   hecho; arreglar, no. Por orden de tamaño: `notificaciones_pendientes` se
   lleva el **15,4 %** de todo el tiempo de la base (52 665 llamadas — es el
   cron-pull de n8n cada 2 min, y NO es una cola: calcula en vivo);
   `pg_timezone_names` tarda **500 ms** de media y se llama 1 211 veces; y
   `citas` lleva **476 M** de filas leídas en recorridos secuenciales, 2 364 por
   recorrido sobre 2 001 filas. Lo último no duele hoy y crece al cuadrado.
8. **Familia 11a/11c** (C7) — la atribución, que convierte las mediciones de 1–3
   en "este commit lo hizo".
9. **M4 (fiscal) y M5 (multi-tenant)** — las dos con consecuencia legal.

### Después

10. **P2, P3** (dinero), **M6** (crons), **M7** (IA), **M8** (almacenamiento).
11. **§3.1 que quedan**: `solicitudes`, `legal`, `web-publico`, `mapa`, `textos-ui`.
12. **Familias 4 y 7** (coherencia y legalidad), **5b/5c** (layout y responsive),
    **6** (cartógrafo), **8** (web pública), **C4/C6** (presupuesto de bundle
    comentado en el PR; la caché de Playwright y la primera tanda de `check:edges`
    ya están hechas).
13. **P4, P5** y, al final, **5a** (capturas, solo de la web estática) y **11b**
    (bisect).

---

## 5. Las reglas (valen para todo lo de arriba)

1. **Un ancla perdida FALLA.** Un vigilante ciego es peor que no tenerlo: da luz
   verde sin haber mirado. Si un regex deja de casar, eso es un hallazgo
   bloqueante. Si molesta, se arregla el ancla, nunca la comprobación.
2. **Dos niveles.** `bloqueante` = un usuario real vería algo falso, roto o
   inusable, o hay consecuencia legal o de dinero. `aviso` = todo lo demás. La
   deuda heredada nace en `aviso` con línea base congelada.
3. **El trinquete solo gira hacia abajo.** Si una métrica mejora no se emite
   hallazgo: se baja la línea base, y bajarla es un acto consciente cuyo diff se
   ve en el repo.
4. **GitHub Actions jamás ve una clave de Supabase.** Ni para la capa 2. Si hace
   falta ejecutar algo dentro de la BD, lo dispara con `VIGILANCIA_TOKEN` y lo
   ejecuta una edge function que tiene su propia clave.
5. **Un flaky no es una regresión.** Tres estados siempre: verde, inestable, roto.
6. **No se estrena un vigilante sin línea base medida.** Si no, la CI nace roja y
   alguien acaba quitando el linter.
7. **Todo aterriza en la pestaña Salud**, mismo formato, mismo ciclo de vida.
8. **Salud ≠ Errores.** No mezclar nunca.
9. **El invariante nuevo trae su vigilante en el mismo commit.** Los invariantes
   repartidos son la fábrica de regresiones; si se añade uno y el vigilante se
   deja para luego, la próxima deriva vuelve a ser silenciosa.

---

## 6. Definición de hecho

Una pieza está hecha cuando:

1. Corre sola donde tiene que correr (PR, cada 6 h, post-deploy o continuo).
2. Tiene **línea base medida**, no inventada.
3. Se le ha visto cazar algo: una regresión real, o una inyectada a propósito.
4. Se ha descartado **un falso positivo a conciencia** y está escrito por qué.
5. Publica en Salud con clave estable y nivel justificado.
6. Su decisión está resumida en CLAUDE.md (extensión de la decisión 10).
7. Si depende de un ancla, **se ha probado que el ancla perdida hace fallar**.

## 7. Lo que NO hay que hacer

- **No estrenar diez vigilantes de golpe.** Una familia por sesión, verificada
  con una regresión real. La fase 1 salió bien exactamente por esto.
- **No meter dependencias nuevas sin discutir.** Las candidatas aceptadas son
  `pixelmatch` (solo si se hace 5a) y `@axe-core/playwright`. El análisis
  estático usa el `typescript` que ya está en el repo: nada de `ts-morph`.
- **No bloquear por deuda heredada.** Todo lo nuevo nace con base congelada.
- **No convertir un aviso en bloqueante «para que se arregle».** Así es como una
  CI acaba en rojo permanente y alguien quita el paso.
- **No vigilar el nativo.** La web es el producto real; el nativo va detrás.
- **No añadir Dependabot.** Ya está Renovate y duplicarlo es ruido.
