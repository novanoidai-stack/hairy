# Plan maestro de vigilantes — la lista única (29 ago 2026)

> **Qué es esto.** Había dos backlogs vivos a la vez: la *radiografía de fase 2*
> (`2026-08-29-vigilantes-fase2-radiografia.md`, 12 familias de vigilantes
> propios) y una nota suelta de *workflows de GitHub pendientes* (6 workflows).
> Se solapaban, se contradecían en tres puntos y ninguno de los dos sabía lo que
> el otro ya había hecho. Esto los funde en una sola lista, con el estado
> **verificado contra el repo**, no recordado.
>
> **Cómo se leyó cada afirmación.** Todo lo que aquí se da por hecho o por
> pendiente se comprobó ejecutando algo: `git log`, el contenido de
> `.github/workflows/`, `deno.json`, o midiendo el código con el compilador de
> TypeScript. Donde el informe original se equivocaba, se dice y se explica por
> qué — no se borra: saber que una conclusión era falsa vale tanto como la
> conclusión.
>
> Reglas heredadas que gobiernan todo lo de aquí (fase 1, decisión 10 de
> CLAUDE.md): un ancla perdida FALLA · dos niveles (`bloqueante` tumba la CI,
> `aviso` informa) · la deuda heredada nace con línea base congelada y el
> trinquete solo gira hacia abajo · GitHub Actions jamás ve una clave de
> Supabase · no se estrena un vigilante sin línea base medida y sin haber
> descartado un falso positivo a conciencia.

---

## 1. Veredicto sobre la nota de "workflows pendientes"

Sus seis puntos, evaluados uno a uno. **Dos ya estaban hechos, uno hay que
rechazarlo, y tres siguen siendo buenos** — uno de ellos por una razón distinta
de la que decía.

| # | Lo que proponía | Veredicto | Por qué |
|---|---|---|---|
| 1 | Ejecutar `vigilancia_bd()` programado | **VÁLIDO — el de más valor** | Confirmado: `bd.mjs` no está en `ESTATICOS` de `index.mjs` y ningún workflow lo llama. La capa 2 del diseño solo corre si alguien la invoca a mano. |
| 2 | Barrido de secretos (`gitleaks`) | **VÁLIDO, pero no por lo que decía** | Decía que "la norma está escrita y no la hace cumplir nada". **Falso desde `c7b3d58f`**: el vigilante `claves` corre en cada PR y cubre el árbol actual. Lo que NO cubre —y ahí sí hace falta— es el **historial de git**. |
| 3 | Verificación posterior al despliegue | **VÁLIDO, y descubre algo peor** | El `grep` del bundle ya lo hace `claves.mjs`… pero en CI **nunca se ejecuta de verdad**. Ver §2, es el hallazgo más incómodo de esta revisión. |
| 4 | Guardia de migraciones | **VÁLIDO** | Nada compara `supabase/migrations/` con el historial remoto. "El historial remoto manda" es la norma y no la vigila nadie. |
| 5 | Presupuesto de bundle | **YA HECHO** | `scripts/vigilantes/peso-bundle.mjs` + `peso-baseline.json` (8,20 MB / entry 1,05 MB), corriendo en el job `e2e` de `ci.yml`. Es la familia 1b, cerrada. |
| 6 | Dependabot agrupado y semanal | **RECHAZADO tal cual** | Es verdad que no hay `.github/dependabot.yml`. Pero **Renovate sí está** (`.github/renovate.json`, agrupando expo y supabase) y hace exactamente eso. Montar los dos = dos PRs por cada actualización. Ver §4 para lo que sí queda. |

Sus dos apuntes finales, ambos **verificados y válidos**:

- `deno task check:edges` cubre **3 edge functions de 43** (`vigilar-agenda`,
  `agenda-optimizador`, `agenda-asistente`). Ampliarlo es barato.
- El canario **reinstala Chromium entero cada hora**, 24 veces al día: no hay
  ni un `actions/cache` en los tres workflows.

---

## 2. El hallazgo de esta revisión: el vigilante de claves está ciego en CI

Merece sección propia porque contradice la regla número uno del proyecto
—*un vigilante ciego es peor que no tenerlo*— y llevaba así desde que se montó.

`claves.mjs` tiene cuatro comprobaciones. La cuarta, la que más duele si falta,
mira el **bundle construido** en `web/app/`: Metro incrusta los `EXPO_PUBLIC_*`
como literal y cachea esa transformación por fichero, así que el código fuente
puede estar limpio y el bundle salir con la clave vieja. Ya pasó una vez.

El problema está en cómo se reparten los jobs de `ci.yml`:

- El job **`check`** ejecuta `node scripts/vigilantes/index.mjs` — pero **no
  compila la web**.
- El job **`e2e`** ejecuta `npm run build:web` — pero **no ejecuta los
  vigilantes**.

Y el recorrido del bundle empieza así:

```js
function* ficherosDelBundle(rel, restantes = { n: 4000 }) {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) return;   // <- en CI siempre entra por aquí
```

`web/app/` está en `.gitignore`, así que en el checkout limpio del job `check`
no existe: el generador devuelve cero ficheros, el bucle no itera y la
comprobación **pasa en verde sin haber mirado nada**. No hay error, no hay
aviso, no hay rastro en el log. Es el modo exacto de pudrirse que la regla del
ancla perdida existe para impedir, y se coló porque el ancla que faltaba no era
un regex sino un **directorio**.

**Arreglo (dos partes, ninguna opcional):**

1. Que el chequeo del bundle **distinga "no aplica" de "no he mirado"**: si la
   variable de entorno dice que este job debía tener bundle (o si existe
   `web/app` pero vacío), la ausencia es un **hallazgo bloqueante**, no un
   silencio. En local sin compilar, sigue siendo un no-aplica legítimo.
2. Ejecutar el vigilante de claves **también en el job `e2e`, después de
   `build:web`**, que es el único sitio de la CI donde el bundle existe.

**La lección, que es más general que este fallo:** cuando un vigilante depende
de un artefacto que puede no estar, tiene que decir *"no he podido mirar"* en
voz alta. `existsSync(...) return` es la forma más silenciosa de mentir.

---

## 3. Orden de ejecución acordado

Une las familias de la radiografía con los workflows que sobreviven. El criterio
es el mismo de la fase 1: **primero lo que habría cazado un fallo real que ya
ocurrió**.

| Orden | Trabajo | De dónde sale | Estado |
|---|---|---|---|
| ✅ | Radar de GitHub (Semgrep, zizmor, CodeQL, Renovate, CodeRabbit) | radiografía 12 | **hecho** |
| ✅ | Rendimiento de pantallas + peso del bundle | radiografía 1, 1b, 1c / nota 5 | **hecho** |
| ✅ | Vigilante de claves (código y bundle) | decisión 9 / nota 2 | **hecho, pero ciego en CI** — §2 |
| **A** | **Botones que fallan en silencio** | radiografía 2 | **esta sesión** |
| **B** | Arreglar la ceguera del vigilante de claves + caché de Playwright | §2 y nota final | **esta sesión** |
| ✅ C | `vigilancia_bd()` programado cada 6 h | nota 1 | **hecho** — §8 |
| ✅ D | Cuellos de botella de BD (`pg_stat_statements`) | radiografía 3 | **hecho** — §8, umbrales medidos |
| ✅ F | Guardia de migraciones | nota 4 | **hecho** — §8, encontró 2 al estrenarse |
| E | Atribución: qué push rompió qué | radiografía 11 | siguiente |
| G | Barrido del **historial** de git | nota 2 reformulada | luego |
| H | Coherencia de datos + legalidad | radiografía 4, 7 | luego |
| I | Bugs visuales, arquitectura, SEO, dependencias | radiografía 5, 6, 8, 9 | luego |

---

## 4. Lo que cambia respecto a los dos backlogs originales

### 4.1 Renovate se queda solo; Dependabot solo como alertas

Renovate ya agrupa expo y supabase y sus PRs pasan la CI completa. Añadir
`dependabot.yml` para *version updates* duplicaría cada PR. Lo que **sí** falta y
Renovate no da es el **aviso de vulnerabilidad** de GitHub: eso son las
*Dependabot alerts*, que no son un fichero del repo sino un interruptor en
Settings → Code security. Es un paso manual de treinta segundos, no un workflow.

### 4.2 El barrido de secretos se reformula: el árbol ya está cubierto, el historial no

El vigilante `claves` cubre el árbol actual en cada PR, y lo hace mejor que
`gitleaks` genérico porque entiende las reglas de esta casa (la publishable no es
un hallazgo; `sb_secret_nueva` de una fixture tampoco). Lo que ninguna
herramienta del repo mira es el **historial**, y ahí sigue la `service_role`
filtrada, en un repositorio que **ha vuelto a ser público**.

Eso cambia la naturaleza del trabajo: no es un vigilante de regresión (nadie va a
"volver a meter" un commit de 2026 en el pasado), es una **limpieza puntual** con
decisión de producto detrás — reescribir el historial rompe todos los forks y
checkouts. La clave ya está desactivada, así que el daño está contenido; lo que
queda es que un barrido del historial documente qué hay exactamente, para poder
decidir con datos. **Es una tarea, no un workflow recurrente.**

### 4.3 La verificación posterior al despliegue se apoya en el canario, no en un workflow nuevo

La nota pedía un workflow que, al mergear a `master`, esperase al deploy de
Vercel y lanzase el smoke sin aguardar hasta una hora al canario. La mitad cara
de eso (esperar al deploy) ya la resuelve otra pieza: el canario existe y sabe
medir producción. Lo que falta es **poder dispararlo**, y `canario.yml` ya tiene
`workflow_dispatch`. Así que el trabajo real es un `workflow_run` que lo invoque
tras un push a master — no un segundo smoke paralelo con su propia línea base.

### 4.4 Ampliar `check:edges` de 3 a 43 no es "barato" sin más

La nota lo daba por trivial y a la vez advertía —con razón— de que hacerlo sin
red da ~29 errores falsos, porque los genéricos del build de npm de
`supabase-js` no son los de `esm.sh`. La conclusión correcta es que **el trabajo
es de CI, no de local**: ampliar la lista y dejar que la ejecute el runner, que
sí tiene red. Y hacerlo por tandas, no las 40 de golpe: cada edge que entra puede
sacar errores de tipos reales que hay que arreglar, y eso es una sesión de
trabajo por tanda, no un cambio de una línea en `deno.json`.

---

## 5. Familia A — botones que fallan en silencio (lo de esta sesión)

Lo que la radiografía pedía en su §2 era esto:

> El smoke pulsa el botón y comprueba que "no explote". Pero un botón cuyo
> handler hace `await algo()` sin catch y se traga el error, o que pinta un toast
> rojo que nadie lee en CI, hoy pasa en verde.

Al medirlo apareció que **el diseño original apuntaba al patrón equivocado**, y
esa corrección es el corazón de la familia.

### 5.1 La corrección: en este repo, tragarse un error casi nunca es un `await` sin `catch`

La radiografía proponía buscar `onClick={() => { algoAsync() }}` sin `await` ni
`catch`, y avisaba de que la variante con `await` "da muchos falsos positivos".
Ambas cosas son ciertas, pero se quedan cortas, porque **las promesas de
`supabase-js` no rechazan**: resuelven con `{ data, error }`. Un `try/catch`
alrededor de una consulta a Supabase no captura *nada* cuando la consulta falla
por RLS, por una restricción o por un 4xx. El error viaja dentro del valor
devuelto, y la única forma de tragárselo es **no mirarlo**.

Medido con el compilador de TypeScript sobre las 315 fuentes de `app/`,
`components/` y `lib/`:

| Patrón | Casos | Qué le pasa a un salón real |
|---|---:|---|
| `error` descartado en el destructuring, en una **escritura** (`insert`/`update`/`delete`/`upsert`/`rpc`) | **7** | Cree que ha guardado y no ha guardado |
| `error` descartado en el destructuring, en una **lectura** (`select`) | 123 | Ve una pantalla vacía o un total a 0 € y lo cree |
| `error` descartado en `auth`/`storage`/`functions` | 17 | La foto no sube, la sesión no cambia, sin aviso |
| `error` capturado y **nunca leído** en su ámbito | **0** | — (ver 5.3) |
| `catch` vacío **sin motivo escrito** | 11 | Se traga lo que sea |
| `catch` que solo hace `console.*` | 15 | La consola de CI lo ve; la peluquera no |
| `.catch(() => {})` **sin motivo escrito** | 12 | Igual, en promesas sueltas |
| Handler que llama a una función `async` local sin `await`/`catch` | 13 | El clic no hace nada y no lo dice |

**El `await` sin `catch` no está en la tabla**, porque en este repo casi nunca es
el fallo. Los 147 casos de arriba sí lo son, y ninguno lo habría encontrado el
detector que proponía el plan.

### 5.2 El falso positivo que obligó a cambiar el diseño

De los 7 de escritura, dos son ejemplos perfectos y **opuestos**:

**Positivo de libro** — `components/agenda/modals/NewCitaModal.web.tsx:1343`.
Inserta una serie entera de citas periódicas y descarta el error. Si la inserción
falla, `serieInsertadas` es `null`, los dos `if (serieInsertadas)` siguientes se
saltan en silencio… y tres líneas después:

```js
const creadas = 1 + filasSerie.length;
alert(`Serie creada: ${creadas} de ${repetirVeces} citas.`);
```

La pantalla **afirma que ha creado 8 citas cuando no ha creado ninguna**. No es
que falle en silencio: es que miente. En el vocabulario de este proyecto, "un
usuario real ve algo falso" es la definición de `bloqueante`.

**Falso positivo deliberado** — `lib/auth.ts:118`:

```js
const { data } = await supabase.rpc('is_staff');
return data === true;
```

Aquí descartar el error es **lo correcto**: si la RPC falla, `data` es `null`,
`null === true` es `false`, y la función responde "no eres staff". Falla cerrado,
que es exactamente lo que debe hacer un chequeo de permisos. Denunciarlo sería
empujar hacia un cambio peor.

Distinguir ambos por AST no se puede: los dos son `const { data } = await`. Lo
que los distingue es que **uno tiene una razón y el otro un olvido**.

### 5.3 La regla que sale de ahí: tragarse un error es legítimo si está escrito por qué

El detector exime cualquier caso que lleve **un comentario explicando el motivo**
—en la línea, en la de arriba o dentro del bloque—. No es una concesión: es la
regla que el propio repo ya practica sin haberla escrito. De los 76 `catch`
vacíos, **65 ya llevan su motivo**:

```js
catch { /* la lista es secundaria */ }
catch { /* las fotos son opcionales en el PDF */ }
catch { /* localStorage no disponible */ }
```

Y los 11 que no lo llevan son, uno por uno, los sospechosos. La proporción 6:1 no
es casualidad: es que la casa ya sabe distinguir, solo que nadie lo estaba
contando. El vigilante no inventa una norma, **hace cumplir la que ya había**.

Que un comentario baste para eximir puede sonar débil, y no lo es: escribir el
motivo es un acto consciente que queda en el diff y que alguien puede discutir en
la revisión. Es la misma filosofía que `// nosemgrep` con su explicación al lado
(precedente del 3DES de Redsys), o que `--aprobar` para bajar una línea base.

El caso de `is_staff` se cierra, entonces, escribiendo lo que ya era verdad:

```js
// Sin permiso o sin red, data es null y esto responde "no eres staff":
// fallar cerrado es lo correcto en un chequeo de permisos.
const { data } = await supabase.rpc('is_staff');
```

### 5.4 El detector con línea base a cero: el que más vale mañana

`error` **capturado y nunca leído** da **0** hoy. Es decir: cuando este código
recoge el error, siempre lo mira. Ese detector no encuentra deuda — encuentra la
primera regresión que se cometa, desde el día uno, sin ruido de fondo. Los
vigilantes que nacen en cero son los más valiosos que hay: el trinquete empieza
apretado.

### 5.5 Reparto entre las dos piezas

- **2b, estático** (`scripts/vigilantes/errores-tragados.mjs`): las ocho clases
  de arriba, línea base congelada **por fichero y por clase** —así mover deuda de
  un fichero a otro no la esconde— y nivel `aviso`, salvo que un fichero suba de
  golpe. Corre en cada PR, sin red, en menos de un segundo.
- **2a, dinámico** (`tests/smoke/silencios.ts`): lo que solo se ve ejecutando.
  Hoy el smoke escucha `pageerror`, que **no caza las promesas rechazadas**;
  se añade `unhandledrejection`. Y se detectan los **toasts de error visibles**
  tras pulsar cada botón: si aparece uno que no estaba, se apunta con la etiqueta
  del botón, para saber *cuál* degeneró y no solo *que* algo degeneró.

Lo que **no** hace ninguna de las dos: decir si el botón hace lo correcto. Eso
son los specs dedicados. Esto es la red de abajo.

---

## 6. Lo que queda pendiente, con su porqué (para no volver a razonarlo)

### C. `vigilancia_bd()` programado — el de más valor de todo lo pendiente

La auditoría del 29 ago encontró cuatro cosas críticas —29 RPC definer abiertas a
`anon`, `profiles` legible entre salones, un trigger que tumbaba el guardado de
horarios, un cron mirando un tenant vacío— y **la CI no vio ninguna**, porque las
cuatro viven donde no mira: dentro de Postgres y en la configuración de
producción. `vigilancia_bd()` las detecta hoy (comprobaciones 2, 7, 8, 9, 10 y
11) y no la ejecuta nadie automáticamente.

Workflow cada 6 h que la invoque, publique en Salud y **falle si hay algún
`bloqueante`**. La autorización va con `VIGILANCIA_TOKEN` como el recolector
—regla 4: Actions nunca ve una clave de Supabase—, lo que implica **una RPC
puente que el token pueda llamar**, no la clave de servicio en un secret.

### D. Cuellos de botella de BD

`pg_stat_statements`: top por `total_exec_time`, seq scans que crecen, esperas en
lock. Dato de partida ya medido: **la agenda hace ~65–70 peticiones a Supabase
por carga** — primer sospechoso de N+1. El precedente de que esto importa es real:
`is_staff()` volátil provocó 24 M de seq scans sobre `staff`.

### E. Atribución (qué push rompió qué)

La base ya existe: `vigilancia_ejecuciones` guarda `commit_sha` y `rama`. Falta
el comparador y que compare contra **la última corrida verde del padre del
merge** (`git merge-base`), no contra "la última a secas" — si la rama venía
rota, el delta culpa al commit equivocado.

### F. Guardia de migraciones

Comparar `supabase/migrations/` con el historial remoto y avisar de ficheros sin
aplicar, salvo los marcados explícitamente como *aplicar después de desplegar*.

### G. Barrido del historial de git

Puntual, no recurrente. Ver §4.2: es un inventario para decidir con datos, con
una decisión de producto detrás (reescribir el historial rompe forks).

### Mejoras baratas que no son familias

- **Caché de Chromium en el canario** (`actions/cache` sobre
  `~/.cache/ms-playwright`): se paga sola en un día. Va en esta sesión.
- **Disparar el canario tras un deploy a master** con `workflow_run` — §4.3.
- **Ampliar `check:edges` por tandas** — §4.4.
- **Activar las alertas de Dependabot** (interruptor, no fichero) — §4.1.

---

## 7. Definición de "hecho" para esta sesión

1. `npm run vigilar` incluye `errores-tragados`, con línea base congelada y
   medida, y con un falso positivo (`is_staff`) descartado a conciencia y
   documentado.
2. El vigilante tiene tests propios en `vigilar:test`, y uno de ellos comprueba
   que **el ancla perdida falla** — sin eso, el vigilante puede quedarse ciego.
3. El smoke escucha `unhandledrejection` y los toasts de error, y publica en la
   pestaña Salud con la etiqueta del botón culpable.
4. El vigilante de claves deja de estar ciego en CI (§2) y el canario cachea el
   navegador.
5. Las decisiones nuevas quedan en CLAUDE.md, decisión 10, para que la siguiente
   sesión no vuelva a razonarlas.


---

## 8. Lo hecho en la segunda tanda (29 ago 2026): C, D y F

Con acceso de lectura a producción se pudieron cerrar tres puntos más, y —lo que
importa— **calibrarlos contra números reales en vez de contra intuiciones**.

### 8.1 El estado real de la base, por fin mirado

`vigilancia_bd()` llevaba desde el 28 ago sin que la ejecutara nadie. Al correrla:
**0 bloqueantes, 1 aviso** — `pg_net` pierde el 26 % de las llamadas (8 de 31 en
6 h se quedan con `status_code` nulo). Los crons llaman a las edge functions con
`net.http_post`, que no espera respuesta, así que `pg_cron` marca la ejecución
como `succeeded` igual. Nadie lo estaba mirando porque nadie estaba mirando nada.

### 8.2 C — la capa 2 ya corre sola

- `supabase/functions/ejecutar-vigilancia-bd/` dispara `vigilancia_bd()`, publica
  en la pestaña Salud y devuelve el veredicto.
- `.github/workflows/vigilancia-bd.yml`: cada 6 h, en cada push a `master` que
  toque `supabase/`, y a mano. Falla si hay bloqueantes **y también si no puede
  mirar** (secrets ausentes, función sin desplegar): un vigilante que no corre
  tiene que decirlo, no pasar en verde.
- **Actions sigue sin ver una clave de Supabase** (regla 4): solo viaja
  `VIGILANCIA_TOKEN`; la clave de servicio se queda dentro de la edge.
- La puerta del token se extrajo a `shared/tokenVigilancia.ts`, con tests. Estaba
  escrita una vez y se iba a escribir la segunda — un chequeo de autorización
  copiado y pegado es el invariante repartido de manual.
- Origen propio `bd` en vez de reutilizar `ci`: si estas corridas se mezclaran
  con las de los PR, nadie podría contestar *"¿cuándo se vigiló la base por
  última vez?"*, que es el mismo agujero que la detección de canario mudo tapa.

### 8.3 D — los cuellos de botella, medidos

`vigilancia_bd_rendimiento()` (migración `20260829120000`). Umbrales calibrados
contra los 196 min de tiempo acumulado de BD, no inventados:

| Regla | Umbral | Hallazgos hoy |
|---|---|---|
| Se come la base | > 10 % del tiempo total | 1 |
| Lenta por llamada | media > 200 ms y > 100 llamadas | 3 |
| Se lee entera | `seq_tup_read` > 50 M y > 500 filas | 2 |
| Locks esperando | > 0 | 0 |

**Lo que encontró de verdad:**

- **`notificaciones_pendientes` se lleva el 15,4 % de todo el tiempo de la base**
  (52 594 llamadas, 34 ms de media, pico de 3,6 s). Es el cron-pull de n8n cada
  2 min, y es con diferencia el mayor consumidor. Como CLAUDE.md explica, no es
  una cola: **calcula en vivo** desde las banderas de `citas`. Ese cálculo es lo
  que cuesta.
- **`clientes_en_riesgo_fuga`: 122 311 llamadas.** Y `hallazgos_del_negocio`,
  122 828. Dos RPC llamadas ~122 k veces cada una — huelen a "se llama en cada
  carga de pantalla".
- **`SELECT name FROM pg_timezone_names`: 500 ms de media, 1 206 veces, 603 s.**
  Es una trampa clásica de Postgres (lee la base de zonas horaria entera).
- **`citas` lleva 476 M de filas leídas en recorridos secuenciales**, 2 363 por
  recorrido sobre una tabla de 2 001 filas: se lee entera cada vez.

**Dos decisiones de diseño que no son obvias**, y que están escritas en la
migración para que nadie las deshaga sin querer:

1. **Se mide en proporción, no en totales.** `total_exec_time` es acumulado desde
   el último reset y solo puede crecer: un umbral tipo "más de 300 s" acabaría
   saltando siempre aunque no empeore nada. **Un vigilante montado sobre un
   contador acumulado se pudre solo.**
2. **Para los seq scans lo que importa es `seq_tup_read`, no `seq_scan`.** La
   tabla `servicios` lleva **4 051 129** recorridos secuenciales… y tiene **181
   filas**: para una tabla así Postgres prefiere el scan y hace bien, no falta
   ningún índice. Contar scans denunciaría la tabla equivocada y dejaría pasar
   `citas`, que es la que de verdad no escalará.

### 8.4 F — la guardia de migraciones, y el falso positivo que la salvó

Compara los ficheros de `supabase/migrations/` con el historial remoto. Al
estrenarla dio **dos migraciones "sin aplicar"**… y las dos estaban aplicadas:

- `20260828120000_claves_pg_net_cabecera_apikey` → **5 de los 15 crons ya mandan
  la clave en la cabecera `apikey`**, que era justo lo que introducía.
- `20260828180000_chispa_tts_keepwarm_publishable` → **`chispa_tts_keepwarm` ya
  lleva `sb_publishable_`** y ninguna JWT heredada.

Se habían aplicado por el editor SQL del dashboard, **que no registra la
versión**. La lección: *"la versión no consta"* **no** es *"no se aplicó"*. Van
congeladas en `scripts/vigilantes/migraciones-conocidas.json` **con la prueba de
cada una** — no "seguro que se aplicó", sino qué se miró para saberlo. Sin esa
lista la guardia habría nacido gritando en falso, y una guardia que grita en
falso el primer día acaba apagada.

Dos detalles más: la comparación va por RPC (`migraciones_sin_aplicar`) y no
consultando la tabla, porque **PostgREST no expone el esquema
`supabase_migrations`** (`anon` no tiene ni `USAGE`) y un `.schema(...)` habría
fallado en producción; y los ficheros **sin prefijo de versión** (hay dos) se
denuncian como **punto ciego** en vez de saltárselos callando.

### 8.5 Los `sbp_` tampoco son "solo para mirar"

El vigilante de claves buscaba `eyJ` y `sb_secret_`. Un **token personal de
Supabase** (`sbp_...`) le pasaba por delante sin verlo — y no abre una base de
datos, abre la **cuenta**: el Management API de toda la organización, todos los
proyectos, sus claves y el botón de borrarlos. Es más grave que una
`service_role`, no menos. Ahora lo caza, con su test, y el mensaje recuerda lo
que la gente olvida: **quitarlo del código no lo desactiva; hay que revocarlo**.

### 8.6 APLICADO en producción (29 ago 2026)

Ya no son pasos pendientes: se hicieron y se comprobaron.

| Qué | Estado | Comprobación |
|---|---|---|
| Migración `20260829120000` | **aplicada** | `vigilancia_bd_rendimiento()` y `migraciones_sin_aplicar()` existen; el CHECK de `origen` ya incluye `'bd'` |
| Versión en el historial | **registrada** | `20260829120000` consta en `schema_migrations`, así que la guardia no se denuncia a sí misma |
| `vigilancia_bd_rendimiento()` | **corriendo** | devuelve los 6 avisos de §8.3 |
| `migraciones_sin_aplicar()` | **corriendo** | devuelve lista vacía: todo el repo está aplicado |
| Edge `ejecutar-vigilancia-bd` | **desplegada y ACTIVE**, `verify_jwt=false` | versión 1 |
| Advisors de seguridad | **pasados** (regla 4) | las dos funciones nuevas solo aparecen bajo `authenticated_security_definer_function_executable`, que es la arquitectura documentada; **no** aparecen en la lista de `anon` |

**Un fallo real cazado al aplicar, que merece quedar escrito:** la primera
versión de `vigilancia_bd_rendimiento()` se creó sin protestar y **reventó en la
primera llamada** con `relation "pg_stat_statements" does not exist`. La causa es
que `pg_stat_statements` vive en el esquema `extensions`, no en `public`, y la
función fija `search_path to 'public'` — como debe, siendo `SECURITY DEFINER`.
Pasa desapercibido si se prueba la consulta suelta, porque una sesión normal sí
tiene `extensions` en su `search_path`. Arreglado nombrándola con esquema
(`extensions.pg_stat_statements`), en el repo y en producción.

### 8.7 Lo que NO se puede hacer desde este entorno

No es que falte por decidir: es que **el contenedor no tiene salida a la red**.
El proxy responde 403 a `api.supabase.com`, a `*.supabase.co` y hasta a
`www.mechaa.es`. Todo lo de arriba se hizo por el conector de Supabase, que corre
fuera del contenedor.

Queda pendiente de comprobar **desde fuera**:

1. **Llamar a la edge function por HTTP.** Sus tres piezas están verificadas por
   separado (`vigilancia_bd()`, `migraciones_sin_aplicar()`, el CHECK del origen),
   pero la llamada entera —token, cliente admin, guardado— no se ha ejercitado.
   Se comprueba sola en la primera corrida del workflow.
2. **Ejecutar el workflow.** `vigilancia-bd.yml` solo existe en la rama de
   trabajo, y GitHub únicamente ofrece "Run workflow" para los que están en la
   rama por defecto. **Se probará al mergear a `master`** (y además se dispara
   solo en cada push a master que toque `supabase/`).
3. **Confirmar que `VIGILANCIA_TOKEN` está en el entorno de las edge functions.**
   Casi seguro que sí —`registrar-vigilancia` funciona hoy y los secretos de
   funciones son de proyecto, no de función— pero no se ha visto. Si faltara, la
   función responde `500 sin_configurar` y el workflow lo dice con esas palabras.
4. **`VIGILANCIA_URL` tiene que apuntar a `.../registrar-vigilancia`.**
   `pedir-bd.mjs` deriva la URL hermana sustituyendo ese trozo del final. Si el
   secreto guarda otra cosa, la llamada acabará en un 404 que el script explica.
   Salida limpia: definir `VIGILANCIA_BD_URL` aparte, que ya está soportado.
5. **Los tests de Deno** (`deno task test:claves`, que ahora incluye la puerta del
   token) no se han ejecutado: no hay binario de Deno en el contenedor y el proxy
   bloquea su descarga. Los corre la CI.
6. **El smoke completo con datos reales** tampoco: sin salida a Supabase, las
   pantallas del software se quedan en "Cargando tu salón…".

**Un detalle del despliegue que conviene saber:** la edge se subió por el
conector, y con ella una copia **recortada** de `shared/claveServicio.ts` — solo
las funciones que esta usa. Es funcionalmente equivalente, pero no es idéntica al
fichero del repo. Un `supabase functions deploy ejecutar-vigilancia-bd` desde el
repo la deja igual que el resto; conviene hacerlo la próxima vez que se despliegue
algo, sin prisa.

### 8.8 Nota sobre la consulta canónica de CLAUDE.md

La decisión 4 dice que buscar *funciones `definer` abiertas a `authenticated` con
parámetros que no mencionen `auth.uid()`, `is_staff()`, `my_negocio_id_text()` ni
`exige_mi_negocio()`* "hoy da 0". Ejecutada tal cual **da 49**, y ninguna es un
agujero: la mayoría son las RPC públicas del portal (guardan por `p_slug`, que es
el diseño de la decisión 2), y las demás guardan a través de ayudantes que esa
lista no nombra — `jornada_contexto()` en las de fichaje y `_campana_gestor()` en
las de campañas (comprobado en su código). Si esa consulta se vuelve a usar como
termómetro, hay que añadir esos dos nombres o volverá a asustar sin motivo.
