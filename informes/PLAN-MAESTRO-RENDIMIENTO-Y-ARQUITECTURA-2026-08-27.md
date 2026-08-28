# PLAN MAESTRO — Rendimiento y arquitectura de la agenda

**Fecha:** 27 ago 2026
**Origen:** respuesta crítica a `INFORME_ESTRATEGICO_STACK_Y_ARQUITECTURA_2026.md` (20:24),
reconciliado con `INFORME_DEFINITIVO_STACK_2026-08-27.md` (18:15) y con el estado real del repo.
**Objetivo:** que la app haga **lo mismo que hoy, igual de bien, pero más rápida** — y que no
haya un solo momento del camino en el que un salón real se quede sin poder agendar o cobrar.

---

## 0. Verificación del informe: qué acierta y qué no

Todo lo de esta tabla está comprobado hoy contra el repo, no aceptado por confianza.

| Afirmación del informe | Veredicto | Dato real |
|---|---|---|
| `AgendaCalendar.web.tsx` = 25.684 líneas | ✅ **Cierto** | 25.688 hoy (creció 4) |
| Mantener Supabase, no migrar a VPS | ✅ **Correcto** | Bien argumentado, sin matices que añadir |
| Vercel para estático + VPS para n8n/workers | ✅ **Correcto** | Es la estrategia sensata |
| Deduplicador manual por 61 peticiones | ✅ **Cierto** | `fetchSinRepetir` en `lib/supabase.ts`; el "61" está documentado en el propio código |
| Prop drilling masivo | ✅ **Cierto y peor** | `DayTimelineProfessionalColumn` recibe **47 props** |
| "40+ useState y useEffect" | ❌ **Muy corto** | **207 `useState`**, 53 `useEffect`, 56 `useMemo`, 49 `useRef` |
| Fase 1: "corregir el error de tipado `gridRect`" | ❌ **Obsoleto** | Ya corregido en `5a9c761a4`. `tsc --noEmit` pasa limpio |
| Código de ejemplo `useAgendaData` | ❌ **Inventado** | `citas` **no tiene** `fecha` ni `hora_inicio`. Tiene `inicio`, `fin`, `fin_activa`, `fin_espera` |
| `staleTime: 60_000` en citas | ❌ **Peligroso** | Agenda compartida en vivo + realtime ya existente → ventana de 60 s = **doble reserva** |
| Orquestador "< 120 líneas" | ❌ **Irreal** | Toca **21 tablas** y **8 RPCs**. Objetivo sano: 300–500 |

**Conclusión sobre el informe:** el diagnóstico estratégico (infraestructura) es sólido y hay que
hacerle caso. El diagnóstico del frontend es correcto en la dirección pero **blando en los números
y ficticio en el código**. Su plan se autodenomina "Zero-Breaking" y no incluye ni una sola prueba
nueva: eso no es zero-breaking, es zero-red.

### Lo que el informe no vio (y cambia el plan)

1. **La red de seguridad de la agenda son 3 tests E2E.** Para 25.688 líneas con arrastre, fases
   químicas, cadenas multiprofesional y 8 modales. Este es **el riesgo número uno**, por delante
   de la arquitectura.
2. **Playwright no está en CI.** La poca red que hay ni siquiera se ejecuta al hacer push.
3. **React Compiler ya está en `node_modules`** (v1.0.0, React 19.2.3, Expo 56 soporta
   `experiments.reactCompiler`). Ataca justo el síntoma "re-renders en cascada" **sin tocar código**.
   El informe no lo menciona.
4. **El realtime ya existe y está bien hecho** (`lib/agenda/citasRealtime.ts` + `useCitasRealtime`,
   con reglas de mezcla testeadas). La caché nueva debe **alimentarse del realtime**, no competir
   con él a base de `staleTime`.
5. **`fetchSinRepetir` solapa con TanStack Query.** Hay que decidir conscientemente cómo conviven,
   o habrá dos cachés mintiendo a destiempo.
6. **Renumera fases ya hechas.** `fase-0` y `fase-1` están commiteadas (CI, tipos generados,
   `supabaseTipado`, secretos fuera). Este plan continúa esa numeración, no la reinicia.

---

## 1. Principio rector

> **Ningún cambio de rendimiento puede cambiar el comportamiento. Ningún cambio de comportamiento
> puede colarse sin una prueba que lo hubiera cazado.**

De ahí salen tres reglas que gobiernan todo el plan:

- **R1 — Medir antes y después.** "Rendimiento superior" sin número base es infalsificable.
  Cada fase de rendimiento declara su métrica y su umbral de aceptación.
- **R2 — Red antes que refactor.** No se extrae ni una línea de la agenda hasta que haya pruebas
  que fallen si el comportamiento cambia.
- **R3 — Separar "mover" de "mejorar".** Un PR o mueve código sin tocar lógica, o cambia lógica.
  Nunca las dos cosas. Es lo único que hace revisable un refactor de este tamaño.

---

## 2. Invariantes que NO se pueden romper

Esto es lo que hace a Mecha distinta de un calendario cualquiera. Si un refactor rompe algo de
aquí, el refactor está mal aunque vaya más rápido:

- **Fases activa / reposo / transición.** `fin_activa` y `fin_espera` no son adorno: sobre el
  reposo de una clienta se encaja otra cita. Una mutación que mueva `inicio` sin recalcular las
  fases destruye el diferencial nº1.
- **Tiempos muertos productivos.** Solape activa-contra-activa = prohibido. Activa sobre reposo
  ajeno = permitido. La regla vive en `lib/utils/appointment.ts` y `lib/recursos.ts`, y está
  replicada en SQL. No se reimplementa.
- **Cadenas multiprofesional** (`grupo_id`, `orden_en_grupo`): una cita-clienta repartida entre
  columnas sigue siendo una unidad.
- **Duración por profesional**: sale de `duraciones_profesional` /
  `professional_service_overrides`, no del catálogo.
- **Multi-tenant**: `negocio_id` en toda consulta. Una `queryKey` sin `negocio_id` es un incidente
  de seguridad, no un bug de caché.
- **Estados de cita** y sus colores (`STATUS_META`).
- **Realtime**: la agenda es compartida. Dos personas del salón mirando el mismo día ven lo mismo.

---

## 3. El plan, por fases

Cada fase tiene **puerta de salida**: si no se cumple, no se pasa a la siguiente.

---

### FASE 2 — Red de seguridad y línea base *(prerrequisito absoluto)*

Nada de esta fase cambia el producto. Es la que hace seguras las demás.

**2.1 Playwright en CI.** ✅ **HECHO (27 ago).**
Job `e2e` en `.github/workflows/ci.yml`, dependiente de `check`. Compila la web (`web/app` está
en `.gitignore`: sin build, `/app` da 404) y corre la suite. **37 specs públicos en verde.**

Dos cosas que hubo que resolver antes:
- **Credenciales en claro.** `tests/auth.setup.ts` llevaba versionados el correo y la contraseña
  PERSONALES de Carlos. Ahora salen de `E2E_EMAIL` / `E2E_PASSWORD` (`.env` en local vía
  `process.loadEnvFile`, secrets en CI) y hay `.env.example`. ⚠️ **La contraseña sigue en el
  historial de git: hay que rotarla.** Sacarla del código no la borra del pasado.
- **Proyecto `publico` sin dependencia de `setup`.** Así la CI es útil desde el minuto uno aunque
  el repositorio todavía no tenga los secrets: corre landing, marketplace, portal y la agenda
  sobre la demo. Los autenticados se ejecutan solo si hay credenciales.

**2.2 Tests de caracterización de la agenda.** 🟡 **PRIMERA TANDA HECHA (27 ago).**
`tests/agenda-demo.spec.ts`, **5 pruebas nuevas, verdes en 3 pasadas seguidas** (de 3 a 8 en total
para la agenda; el objetivo sigue siendo ~25–30). Van contra la **demo**, que entra sola con la
cuenta pública: **no necesitan credenciales y bloquean cada PR**.

Cubierto ya: toda cita declara estado · existen citas con fase de reposo (el diferencial) ·
los descansos no se pintan como citas · pasear por las tres vistas no pierde citas ·
**arrastrar no remonta ninguna tarjeta** (congela la línea base de §2.bis).

Para escribirlas hizo falta añadir 4 atributos `data-mecha-*` a la raíz de la tarjeta de cita:
son aditivos, no entran en ninguna decisión de render, y **sobrevivirán a la extracción** — que es
justo lo que hace que estas pruebas sigan valiendo durante la Fase 5.

**Segunda tanda ✅ (27 ago).** El spec sube a **8 pruebas** (7 verdes + 1 que se salta), y se
añade una suite Deno nueva. Cubierto además: **línea AHORA** (con el reloj congelado a las 12:00,
porque el indicador solo se pinta dentro del horario del salón y si no la prueba pasaría por la
mañana y fallaría por la noche) · **abrir el detalle no vacía la agenda** · **solape activa-activa
vs encaje en reposo** (8 tests Deno, ver abajo).

#### Hallazgo de corrección: la quinta copia de la regla de ocupación

Escribiendo estas pruebas apareció un fallo real. El control **principal** del arrastre
(`AgendaCalendar.web.tsx:9758-9773`) es correcto: comprueba las dos fases activas con la regla
canónica. Pero el **repaso final contra datos frescos** —el que corre tras el viaje a la BD para
cazar una cita que haya entrado mientras arrastrabas— estaba **escrito a mano** y no decía lo
mismo. Era la quinta copia del predicado; la memoria del proyecto ya avisaba de que hubo cuatro
divergentes y costaron citas creadas encima de otras.

| Caso | Regla canónica | Copia en línea |
|---|---|---|
| 2ª fase activa de la cita arrastrada (un color) | la comprueba | **no la miraba** |
| Fila con `fin_espera` nulo | ocupa entera | **daba la cola por libre** |

Ambos huecos **verificados ejecutando la implementación antigua**: devolvía "no hay choque" en los
dos. Es una ventana de carrera (solo entre el viaje a la BD y el guardado), pero en una agenda
compartida con portal público y agente de WhatsApp esa ventana existe de verdad.

Arreglado extrayéndolo a `lib/agenda/solapeAlSoltar.ts`, que **delega en `citaSolapaOcupacion`**
como manda la regla de la casa, con **8 tests Deno** (dos de ellos marcados `REGRESION:` son
exactamente los dos casos que se colaban). El cambio hace el guarda más **estricto**, nunca más
permisivo: en un sistema de reservas eso falla del lado seguro.

**Falta por cubrir**: cadena multiprofesional al mover un eslabón · el arrastre revalidando
horario y bloqueos · acciones disponibles por estado.

⚠️ **La demo no tiene cadenas multiprofesional.** Comprobado contra producción: hoy tiene 9 citas,
**las 9 con reposo** pero **0 con `grupo_id`**. Por eso esa prueba se salta siempre. Son dos cosas
distintas que arreglar, y la segunda no es de tests: cubrir la cadena en el spec autenticado, y
**sembrar alguna en la demo** — es el diferencial nº2 del producto y hoy el escaparate comercial
no lo enseña.

⚠️ **Deuda detectada al montar la CI:** `tests/agenda-jornada.spec.ts` ("la rejilla marca la
jornada propia") **falla hoy por datos, no por código**: busca el texto *"Fuera de jornada"* /
*"No trabaja este dia"*, y hoy ningún profesional de `salon_pruebas_mecha` tiene horario distinto
al del salón. Es preexistente (el único cambio en la agenda son 9 líneas de atributos) y es
justamente el antipatrón que estas pruebas evitan: **afirmar sobre datos en vez de sobre
estructura**. O se le siembra un profesional con horario propio de forma fija, o se reescribe
para que compruebe el mecanismo sin depender de la agenda de hoy. Hasta entonces, el job de
autenticados irá en rojo intermitente — por eso los específicos de la demo son los que bloquean.

**Higiene de seguridad, además:** `playwright/.auth/user.json` estaba **versionado con un token de
sesión vivo dentro** (3.928 caracteres: access + refresh). Estaba en `.gitignore`, pero eso no
desversiona lo ya añadido, así que cada ejecución de tests reescribía el fichero y cada commit
habría publicado una sesión nueva. Desversionado (`git rm --cached`), junto con
`playwright-report/` y `test-results/`. Rotar la contraseña invalida también ese refresh token.

Cobertura mínima objetivo, una por invariante del §2:
- reposo se pinta distinto y admite encajar otra cita;
- solape activa-activa se rechaza, activa-sobre-reposo se acepta;
- arrastrar una cita revalida horario y solape, y **conserva las fases**;
- cadena multiprofesional sobrevive a mover un eslabón;
- bloqueos y fuera-de-turno no son dropables;
- cada estado muestra sus acciones;
- realtime: cambio en otra pestaña aparece sin recargar;
- las 3 vistas (día/semana/mes) pintan la misma cita igual.

Donde la lógica se pueda extraer pura, mejor test de Deno que E2E: es 100× más rápido y ya hay
450 pasando con ese patrón.

**2.3 Línea base de rendimiento.** ✅ **MEDIDA el 27 ago 2026** — ver §2.bis.

> **Puerta:** CI en verde con E2E incluidos + tabla de línea base rellenada.
> **Riesgo de producto:** cero (no se toca código de producto).

---

## 2.bis — LÍNEA BASE MEDIDA (27 ago 2026)

Medido en Chrome real (no en el panel integrado, que falsea `requestAnimationFrame`), contra
`node scripts/serve-web.mjs` en `127.0.0.1:8080`, demo compartida (`demo_salon_001`), build recién
generado. **Sin tocar una línea de código de producto.**

| Métrica | Valor medido |
|---|---|
| Peticiones REST al arrancar la app | **25** (38 contando el primer ciclo de sondeo) |
| Consultas distintas a `citas` al arrancar | **5** — distintas entre sí, consumidores distintos |
| Sondeo de `useAvisos` | 13 consultas cada **45 s**; pausa con la pestaña oculta ✅ |
| JS descargado por la app | **5,53 MB** decodificados, 8 chunks |
| Bundle en disco (`web/app/_expo`) | **8,3 MB**; mayor chunk `__common` = **2,9 MB** |
| Nodos DOM de la agenda | 1.023 |
| **Arrastre: 80 movimientos (~8 slots)** | **171 mutaciones, sobre solo 8 nodos distintos** |
| Arrastre: mutaciones del fantasma | 79 de 171 (1 por movimiento, exactamente lo diseñado) |
| Arrastre: re-montajes de componentes | **0** (1.026 nodos antes y después) |
| **Volver a agenda desde clientes** | **+14 peticiones. Cero caché.** |
| Ir a clientes desde agenda | +21 peticiones |
| LCP (`demo.html`, servidor local) | 785 ms |
| CLS (`demo.html`) | **0,17** (malo: el umbral es 0,1) |

### Lo que dicen estos números

**1. La tesis central del informe no se sostiene.** El informe afirma que "un movimiento de ratón
en el drag & drop provoca que React vuelva a evaluar miles de líneas de componentes secundarios".
**Medido: 80 movimientos cruzando 8 slots mutan 8 nodos y no remontan nada.**

El arrastre ya está optimizado a mano, y bien:
- el fantasma se mueve por `transform` sobre una `ref`, con `requestAnimationFrame`, **sin
  `setState`** (hay un comentario en el código diciéndolo explícitamente);
- el `gridRect` se cachea para no forzar un reflujo por frame;
- los callbacks que cruzan la frontera `memo` están estabilizados a propósito (`dtEditCita`,
  `dtCreateSlot`, `dtClienteHistorial`… todos `useCallback`), y los mapas van con `useMemo`.

Alguien ya hizo este trabajo. **Las barreras `memo` aguantan.**

**2. En consecuencia, React Compiler baja de prioridad.** Su ganancia es automatizar la
memoización… que aquí ya está hecha a mano. Sigue mereciendo el spike de un día (quita trabajo
manual futuro y protege de regresiones), pero **no es la palanca de rendimiento** que parecía
antes de medir. No se vende como tal.

**3. El cuello de botella real es la ausencia de caché.** Volver a la agenda desde clientes
dispara **14 peticiones** y repinta desde cero. Eso es exactamente lo que el usuario percibe como
"pantallas en blanco" y lentitud al moverse por la app. **Aquí sí hay una victoria grande y
medible, y es justo lo que TanStack Query resuelve** — la Fase 4 sube a prioridad máxima.

**4. Aparece una palanca que ningún informe mencionó: el peso de arranque.** 5,53 MB de JS, con un
chunk `__common` de 2,9 MB. Es candidato serio y es trabajo independiente del refactor de la
agenda.

**5. CLS de 0,17 en la landing** es barato de arreglar y afecta a SEO y a la primera impresión
comercial.

### Salvedades honestas de esta medición

- **Los FPS no son concluyentes.** Salió ~44, pero con `MutationObserver` y el trazador de
  DevTools enganchados; ese número mide mi instrumentación tanto como la app. Para un dato limpio
  hace falta una traza sin observadores.
- **El cambio de pestaña se simuló** con `pushState` + `popstate`, no pulsando la pestaña real.
  La cifra es direccionalmente sólida (concuerda con que el fetching va en `useEffect` de montaje,
  sin caché), pero conviene confirmarla con un clic real cuando haya E2E.
- **Servidor local, sin latencia de red.** En producción, con la latencia real de Supabase, las
  14 peticiones del cambio de pestaña duelen bastante más que aquí. Es un suelo, no un techo.
- Medido sobre la demo, que tiene un salón de tamaño medio. Un salón grande (más profesionales y
  más citas) tensará más el render.

### Reordenación que provoca la medición

| Fase | Prioridad antes de medir | **Después de medir** |
|---|---|---|
| 2 — Red de seguridad | Alta | **Alta** (sin cambios: sigue siendo el prerrequisito) |
| 3 — React Compiler | Alta ("gran victoria temprana") | **Baja** — el trabajo ya está hecho a mano |
| 4 — Capa de datos / caché | Media | **MÁXIMA** — es la ganancia medida |
| Nuevo: peso de arranque | No contemplado | **Media-alta**, independiente y paralelizable |
| 5 — Descomposición | Media | **Media** — mantenibilidad, no rendimiento |

---

### FASE 3 — Rendimiento sin refactor *(DEGRADADA tras medir — ver §2.bis)*

> ⚠️ **Esta fase se escribió antes de medir y la medición la ha desmentido en parte.** La
> memoización manual ya está hecha y las barreras `memo` aguantan (8 nodos mutados al cruzar 8
> slots). React Compiler ya no es "la gran victoria temprana": es higiene a futuro. **Se mantiene
> el spike de un día, pero se ejecuta DESPUÉS de la Fase 4**, y no se le pide rendimiento.
> La palanca de arranque (5,53 MB de JS) sí sigue viva y sube a media-alta.

Antes de mover 25.688 líneas, agotar lo que se consigue sin moverlas.

**3.1 Spike de React Compiler (time-boxed, 1 día).**
`experiments.reactCompiler: true` en `app.json`. El compilador memoiza automáticamente y ataca de
raíz el síntoma "un movimiento de ratón re-evalúa miles de líneas".

⚠️ **Honestidad sobre esto:** el compilador **descarta** los componentes que no puede probar
seguros. Con 49 `useRef` y manipulación directa del DOM para la física del arrastre, es
perfectamente posible que se salte justo `AgendaCalendar`. Por eso es un *spike con puerta*, no
una promesa:
1. `npx react-compiler-healthcheck` → cuántos componentes compila y cuáles descarta;
2. build web + suite E2E completa en verde;
3. medir contra la línea base.

- **Si mejora y todo pasa en verde** → se queda. Es la mejor relación ganancia/riesgo del plan.
- **Si descarta la agenda o rompe algo** → se revierte (es un flag) y se anota el porqué. Coste
  perdido: un día.

**3.2 Arreglos que señale el profiler.**
Con los datos de 2.3, atacar los puntos calientes concretos. Sospecha principal: el arrastre
haciendo `setState` por cada `mousemove` y arrastrando consigo el árbol entero. La cura es local
(mover la física a refs/transform y publicar estado solo al soltar), **no** requiere reestructurar
nada, y se puede medir.

> **Puerta:** mejora medible contra 2.3, con E2E en verde. Si React Compiler entra, aquí puede
> estar ya la mayor parte del objetivo "60 FPS" conseguida — **antes** de tocar la arquitectura.

---

### FASE 4 — Capa de datos (TanStack Query) *(sin mover ni un componente)*

> ✅ **HECHA (27-28 ago).**
>
> | Transición | Antes | Después |
> |---|---|---|
> | **Volver a la agenda desde clientes** | 14 peticiones | **2–4** |
> | Ir a clientes desde la agenda | 21 peticiones | **2–8** |
>
> Y lo que importa tanto como el número: **al volver, la agenda pinta sus 9 citas** (comprobado en
> la misma medición). Menos peticiones no vale de nada si la pantalla sale vacía.
>
> Lo que queda al volver es lo que *debe* quedar: `conversaciones` (mensajería, no se cachea) y
> `citas` (**nunca se cachean, a propósito**).
>
> #### El arnés de medición estaba mal, y por poco lo doy por bueno
>
> Las primeras cifras las saqué simulando la navegación con `pushState` + `popstate`. Daban
> resultados imposibles de creer —tres rondas seguidas a **0 peticiones**— y eso era la pista: con
> ese truco **las pantallas no se remontaban**, así que no estaba midiendo la navegación sino si
> expo-router se daba por enterado. Rehecho pulsando los enlaces reales del menú
> (`[data-coach="nav-agenda"]` / `nav-clientes`), que es lo que hace una persona. Las cifras de
> arriba son con navegación de verdad, y por eso son más modestas que el "1" que llegué a medir.
>
> **Residuo conocido:** en algunas rondas reaparecen `duraciones_profesional`,
> `professional_service_overrides` y `bloqueos_profesional`. Vienen de `NewCitaModal`, que si monta
> antes de que la agenda le pase el negocio cae en el fallback `"prueba_46980"`
> (`NEGOCIO_ID_FALLBACK`) y construye la clave con OTRO id de salón. No sirve datos ajenos —los
> acota RLS— pero es una clave mal etiquetada y provoca una consulta de más. Conviene quitar ese
> fallback de la ruta de caché.
>
> **Qué se construyó:** `lib/datos/` con `queryClient.ts` (claves y política de frescura),
> `catalogo.ts`, `configuracionSalon.ts`, `clientes.ts`, `negocio.ts` y `cacheado.ts`.
>
> **La decisión de diseño que lo hace funcionar:** las consultas del catálogo usan el
> **superconjunto** de columnas que pedían las distintas pantallas. Si la agenda pide seis columnas
> y clientes tres, son dos entradas de caché distintas y no se comparte nada. Con una consulta
> canónica, quien llega segundo no pide nada.
>
> **Y una trampa esquivada:** las consultas de catálogo **no llevan `.order(...)`**, igual que las
> que sustituyen. La agenda ordena sus columnas con el orden que el salón se haya guardado y, si no
> hay ninguno, se queda con el orden en que llegan las filas: meter un `.order('nombre')` le
> habría reordenado las columnas a todo salón que no las haya ordenado a mano.
>
> **`cacheado.ts` es un puente deliberado, no la meta.** Devuelve la forma `{ data, error }` que ya
> esperaban los `Promise.all` de las pantallas, para no reestructurar 25.000 líneas de agenda ni
> 4.755 de clientes. Cuando esas pantallas se partan (Fase 5) pasarán a `useQuery` de verdad.
>
> #### Lo que hace segura la caché: invalidación automática por tabla
>
> Cachear `negocio_config` 5 minutos habría creado un bug que hoy no existe: **guardar la
> configuración del salón y no verla reflejada**. Y tiene **cuatro `upsert` repartidos** por la app
> (clientes, configuración, presupuestos, onboarding), así que invalidar a mano en cada uno es
> cuestión de tiempo que alguien añada el quinto y se olvide.
>
> Resuelto en un solo sitio: `lib/supabase.ts` avisa desde el propio `fetch` cada vez que se
> escribe en una tabla, y el cliente de Query invalida esa tabla sola. Cubre **también las
> escrituras de pantallas que aún no se han migrado**. Por eso la primera parte de cada clave es el
> **nombre exacto de la tabla**: si la clave dijera `negocio-config` y la tabla es `negocio_config`,
> la invalidación no emparejaría y la pantalla se quedaría con datos viejos sin que nadie se
> enterase.
>
> Es lo que permite cachear también `bloqueos_profesional`, que sí cambia durante la jornada.
> Verificado en vivo: durante una navegación completa solo se registran 3 escrituras, y las tres
> son RPC (invalidan `['rpc']`, que no cachea nada).
>
> **Una trampa que casi cuela:** dejé la misma clave `negocio_config` guardando dos formas
> distintas —`{config: {...}}` en el cargador y el objeto pelado en el otro lector—. Gana quien
> escriba primero y el otro lee mal. Unificado a objeto pelado.

Aquí es donde el informe acierta de fondo, con tres correcciones importantes.

**4.1 Instalación y proveedor.** `@tanstack/react-query` v5 + devtools. `QueryClientProvider` en
`app/_layout.tsx`. Defaults conservadores.

**4.2 Capa por dominio primero, hooks después.**
`lib/datos/citas.ts`, `clientes.ts`, `profesionales.ts`… con las **consultas reales** (`inicio`,
`fin`, `fin_activa`, `fin_espera`, `grupo_id`…), tipadas con `supabaseTipado`. Los hooks
(`useCitas`) envuelven esa capa; no llevan SQL dentro. Sin esto, TanStack Query solo reparte las
mismas consultas duplicadas por más archivos.

**Corrección 1 — `queryKey` con `negocio_id` SIEMPRE.**
`['citas', negocioId, desde, hasta]`. Sin `negocio_id` en la clave, la caché puede servir datos de
otro salón al cambiar de sesión. Es un fallo de aislamiento, no de rendimiento.

**Corrección 2 — el realtime alimenta la caché; nada de `staleTime` en citas.**
El `staleTime: 60_000` del informe, en una agenda que comparten recepción y tres profesionales, es
una receta para doble reserva. Lo correcto: `useCitasRealtime` escribe en la caché con
`queryClient.setQueryData` **reutilizando las reglas de mezcla ya testeadas** de
`lib/agenda/citasRealtime.ts`. `staleTime` largo, solo para tablas de referencia (servicios,
horarios, config) — exactamente las que `fetchSinRepetir` ya trata aparte.

**Corrección 3 — mutaciones que respetan las fases.**
`moverCita` no es un `update` de dos columnas. Debe recalcular `fin`, `fin_activa` y `fin_espera`
con la duración efectiva del profesional destino, y revalidar solape con las reglas del §2.
Optimista sí, pero con rollback y reconciliación contra el realtime.

**4.3 Orden de migración: primero una pantalla que no sea la agenda.**
`clientes.web.tsx` como conejillo de indias. Valida el patrón donde equivocarse es barato.

**4.4 Retirada de `fetchSinRepetir`: al final, no al principio.**
Cubre los ~199 puntos de uso de toda la app. Mientras quede una pantalla sin migrar, se queda.
Convivencia: su TTL de 3 s e invalidación por escritura no contradicen a Query, pero hay que
verificar que una escritura seguida de lectura devuelve lo recién escrito. Test explícito.

> **Puerta:** `clientes` y las lecturas de agenda por Query, E2E en verde, sin regresión de
> rendimiento, y prueba de que escribir→leer no devuelve datos viejos.

---

### FASE 5 — Descomposición del monolito *(mecánica, aburrida, verificable)*

> ✅ **PRIMER CORTE HECHO (28 ago).** `AgendaCalendar.web.tsx`: **25.688 → 17.841 líneas (−31 %)**.
>
> | Sale del monolito | Líneas | A dónde |
> |---|---|---|
> | `DetalleCitaModal` | 6.977 | `components/agenda/modals/DetalleCitaModal.web.tsx` |
> | Átomos e iconos (16) + `norm`, `CATEGORY_ICONS`, `getCategoryIcon` | 977 | `components/agenda/ui/atomos.web.tsx` |
> | Tipos `Cita` y `Profesional` | 35 | `components/agenda/tipos.ts` |
> | Estado visual (vista, profesional filtrado) | 53 | `components/agenda/store/useAgendaStore.ts` |
>
> **El orden importó.** No se pudo empezar por el modal: dependía de 16 átomos y de dos tipos que
> vivían dentro del propio fichero. Primero los átomos, luego los tipos (a un módulo **neutro**,
> porque si el modal importaba los tipos de la agenda y la agenda importaba el modal, se creaba un
> ciclo), y solo entonces el modal.
>
> **El método fue "mover y que TypeScript diga qué falta":** al sacar el bloque, `tsc` cantó 49
> identificadores sin resolver. Cada uno se resolvió con su import real, sin reescribir una línea
> del cuerpo. Dos aparecieron mal en el primer intento (`validarHorarioLaboral` está en
> `lib/horarios`, no en `lib/horariosFranjas`) y los cazó el compilador, no una prueba en
> producción.
>
> **Verificación:** typecheck limpio · 466 unitarios · 39 E2E públicos · 25/26 autenticados (el 1
> que falla es el preexistente de datos) · **la prueba que vigila el arrastre sigue verde** · y
> comprobado en el navegador que la ficha abre completa (cabecera, riel, cobro con métodos,
> acciones) y que la caché aguanta: volver a la agenda son 3-4 peticiones con las 9 citas pintadas.
>
> **Limpieza de lo que quedó a medias:** `useAgendaData.ts` se **borró** (estaba escrito y no lo
> usaba nadie: código muerto), y el store se **podó** de 10 miembros a 2 — los otros ocho eran
> interfaz inventada antes de tener el caso de uso.

Aquí la buena noticia que el informe no da: **el archivo no es un bloque**. Ya son ~35 componentes
conviviendo en un fichero, y los grandes **ya reciben props** (no cierran sobre el ámbito del
padre). Eso convierte la extracción en mudanza, no en cirugía.

| Bloque | Líneas | Orden | Por qué |
|---|---|---|---|
| `DetalleCitaModal` | 6.568 | **1º** | Ya exportado, ya prop-driven. La mudanza más grande y más segura |
| `NewCitaModal` | 4.500 | **2º** | Mismo caso |
| `DayTimeline` + columna + tarjeta | 3.767 | 3º | Ya memoizados; aquí vive la física |
| `WeekView` / `MonthView` / `DayListView` | 1.523 | 4º | Vistas independientes |
| Átomos (`Icon`, `Pill`, `Avatar`, iconos…) | ~1.000 | 5º | Trivial, a `components/agenda/ui/` |
| Cuerpo de `AgendaCalendar` | 6.784 | **último** | Es el trabajo de verdad: 207 `useState` → hooks + Zustand |

Los dos primeros bloques son **11.068 líneas, el 43% del archivo**, y son el trabajo más seguro
que existe aquí. Empezar por ahí da una victoria enorme con riesgo mínimo.

**Método por cada extracción (invariable):**
1. Mover el bloque tal cual a su archivo. **Cero cambios de lógica.**
2. `tsc --noEmit` + `deno task test` + E2E de agenda.
3. Commit propio: `refactor(agenda): extraer X (sin cambio de comportamiento)`.
4. Solo *después*, si hace falta, un commit aparte que sí cambie algo.

**Sobre Zustand:** entra en el último paso y solo para el estado de UI (fecha activa, modal
abierto, cita seleccionada, zoom). **No** para los datos del servidor — de eso se encarga Query.
Meter citas en Zustand sería repetir el problema con otra librería.

**Objetivo realista:** orquestador de 300–500 líneas y ningún archivo de agenda por encima de
~800. El "< 120 líneas" del informe no es alcanzable para algo que coordina 21 tablas.

> **Puerta por extracción:** verde en las tres suites + revisión de que el diff es una mudanza.

---

### FASE 6 — Disciplina (para que no vuelva a pasar)

- **Tope de tamaño en CI**: ningún `.tsx` nuevo por encima de 800 líneas; los titanes existentes
  entran en una lista de excepciones que solo puede **encoger**.
- **Prohibido `supabase.from(` nuevo en `app/` y `components/`**: los datos entran por
  `lib/datos/`. Comprobable con grep en CI.
- Los E2E de agenda son bloqueantes en PRs que toquen agenda.

---

## 4. Pendientes heredados que este plan no cubre

Del informe definitivo de las 18:15, siguen abiertos y no entran aquí:

- **`xlsx` apunta a `https://cdn.sheetjs.com/...tgz`** → un microcorte de SheetJS tumba el build de
  Vercel. Es riesgo de despliegue, barato de cerrar, no depende de nada de este plan.
- **Baseline de migraciones** (`20260630000000_baseline_produccion.sql` está **sin commitear**).
- **Decisión nativo/web**: hoy el `.tsx` nativo es peso muerto. Congelar o invertir; mantener el
  limbo cuesta el doble en cada refactor — incluido este.

---

## 5. Secuencia y reparto

Todo esto es de **Carlos** (frontend, sin dinero, sin mensajería, sin IA, sin OAuth de terceros).

**Secuencia revisada tras la medición del 27 ago:**

```
FASE 2  Red de seguridad     ──► puerta: CI verde con E2E de agenda
        (la medición de 2.3 ya está hecha: §2.bis)

FASE 4  Capa de datos/caché  ──► ADELANTADA. Es la ganancia medida:
        + peso de arranque        volver a agenda = 14 peticiones y 0 caché.
        (paralelizable)           En paralelo: chunk __common de 2,9 MB y CLS 0,17.

FASE 3  React Compiler       ──► RETRASADA. Spike de 1 día, como higiene.
                                  No se le pide rendimiento.

FASE 5  Descomposición       ──► puerta: por extracción, verde en las tres suites.
                                  Es mantenibilidad, no velocidad.

FASE 6  Disciplina           ──► continuo
```

**El orden importa más que la velocidad.** Las fases 2 y 3 son las que hacen que la 4 y la 5 no
puedan romper un salón en producción. Si hay que recortar por tiempo, se recorta la 5 (es
mantenibilidad), nunca la 2.

---

## 6. Respuesta directa a "¿funcionará todo como funcionaba, pero más rápido?"

- **¿Funcionará igual?** Solo si se hace la Fase 2 primero. Con 3 tests E2E, nadie —ni una persona
  ni un modelo— puede garantizar que mover 25.688 líneas no rompe nada. Con 30 tests que congelan
  los invariantes, sí.
- **¿Irá más rápido?** Sí, **pero no por donde decía el informe**. La medición (§2.bis) dice que
  el arrastre ya está fino: cruzar 8 slots muta 8 nodos y no remonta nada. Donde de verdad se gana
  es en la **caché** (volver a la agenda cuesta 14 peticiones y un repintado completo) y en el
  **peso de arranque** (5,53 MB de JS). La Fase 5 no acelera casi nada por sí misma: **es
  mantenibilidad**, y conviene decirlo claro para no venderla como rendimiento.
- **¿Y si no hubiéramos medido?** Habríamos invertido semanas en desmontar la agenda persiguiendo
  un problema de re-renders que **ya estaba resuelto**, y habríamos dejado intacto el que sí duele.
  Es la mejor justificación posible de la Fase 2.
- **¿Hay que cambiar de stack?** No. En eso el informe tiene toda la razón y no hay más que hablar.
