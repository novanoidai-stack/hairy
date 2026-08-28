# Vigilantes fase 2 — La radiografía completa del software

> **Qué es esto:** backlog de diseño para la siguiente hornada de vigilantes. No está
> ejecutado: es el inventario de TODO lo que se acordó el 29 ago 2026 tras el estreno
> (canario verde, 17/17 pantallas, 2 regresiones cazadas el primer día). Cada sección
> trae el diseño suficiente para ejecutarla en otra sesión sin volver a pensarla.
>
> **Reglas que gobiernan todo lo de aquí** (heredadas de la fase 1, ver
> `docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md` y decisión 10 de
> CLAUDE.md):
>
> 1. **Un ancla perdida FALLA.** Un vigilante ciego es peor que no tenerlo.
> 2. **Dos niveles:** `bloqueante` (un usuario real ve algo falso/roto/lento-inusable)
>    tumba la CI; `aviso` solo informa. La deuda heredada nace en `aviso` con línea
>    base congelada — el trinquete solo gira hacia abajo.
> 3. **Todo aterriza en la pestaña Salud**, mismo formato de hallazgo, mismo ciclo de
>    vida (nuevo/en revisión/resuelto/ignorado, herencia de estado).
> 4. **GitHub Actions jamás ve una clave de Supabase.**
> 5. Un flaky no es una regresión: verde / inestable / roto, siempre tres estados.
> 6. **No se estrena un vigilante sin línea base medida** — si no, la CI nace roja y
>    alguien acaba quitando el linter.

---

## Prioridades acordadas

| # | Familia | Valor | Coste | Prioridad |
|---|---|---|---|---|
| 1 | Rendimiento de pantallas (FPS, long tasks, presupuesto de red) | Alto | Medio | **P0** |
| 2 | Botones que fallan en silencio (rejections ignoradas, toast de error) | Alto | Bajo | **P0** |
| 3 | Cuellos de botella de BD (pg_stat_statements) | Alto | Bajo | **P0** |
| 4 | Coherencia de datos (sumas, conteos, invariantes de negocio) | Alto | Medio | **P1** |
| 5 | Bugs visuales (diff de capturas, overflow, responsive, contraste) | Medio | Medio | **P1** |
| 6 | Radiografía de arquitectura (grafo pantallas→RPC→tablas) | Alto | Medio | **P1** |
| 7 | Legalidad (RGPD, privacidad, consentimientos WhatsApp) | Alto | Bajo | **P1** |
| 8 | Links/SEO/JSON-LD de la landing y el marketplace | Medio | Bajo | **P2** |
| 9 | Tecnologías (deps obsoletas/vulnerables, audit) | Medio | Bajo | **P2** |
| 10 | Presupuesto de peso del bundle JS | Medio | Bajo | **P2** |
| 11 | **Atribución: QUÉ push rompió/ensució QUÉ (antes vs después)** | Muy alto | Medio | **P0** |
| 12 | **Radar de GitHub: revisor IA + CodeQL + Renovate** (instalar, no construir) | Alto | Muy bajo | **P0** |

Orden de ejecución recomendado: **12 primero (son instalaciones de minutos, no
proyectos)**, luego 1→2→3→**11** (una misma sesión: la 11 es la que convierte las
mediciones de 1–3 en "este commit lo hizo"), luego 4+7 (ambas son invariantes de
texto/BD), luego 6, y el resto.

---

## 1. Rendimiento de pantallas — P0

**Qué duele hoy:** nadie sabe si la agenda sigue fluida. El 7 MB de bundle ya se
cacheó (decisión 7), pero el render —cuánto tarda en pintar, si hay jank al hacer
scroll, si una pantalla dispara 200 peticiones— es invisible.

### 1a. Presupuesto de rendimiento por pantalla (extensión del smoke)

El spec de `tests/smoke/` ya carga cada pantalla; se le añade medición, no un test
nuevo. Por pantalla se mide con `page.evaluate` + eventos de Playwright:

- **Tiempos:** navigation→ancla visible (ya se mide de facto en el timeout), y
  `performance.now()` al aparecer el ancla.
- **Long tasks:** `PerformanceObserver` con `entryTypes: ['longtask']` → número y
  ms totales de tareas >50 ms. Es el "FPS bajo" medible sin instrumentar la app.
- **Jank real de scroll:** `requestAnimationFrame` sampling durante un scroll
  programado de la lista principal → FPS medio y peor segundo. Umbral holgado
  (p. ej. alertar si FPS medio < 40 en desktop).
- **Contador de peticiones:** nº de llamadas a Supabase por pantalla (contar las
  que van a `/rest/v1/` + `/rpc/`). Es el **detector de N+1**: la línea base dice
  cuántas hace hoy cada pantalla; si alguien añade 30, el vigilante avisa aunque
  la pantalla "funcione".

**Línea base congelada** (`rendimiento-baseline.json`, mismo patrón que
`knip-baseline.json`): `{ pantalla: { long_tasks_ms, fps_medio, peticiones } }`.
Solo grita si **empeora**. Nivel: `aviso` salvo degeneración extrema
(pantalla en blanco >10 s → `bloqueante`).

### 1b. Vigilante de presupuesto del bundle — P2

`scripts/vigilantes/peso-bundle.mjs`: tras `npm run build:web`, tamaño de
`web/app/_expo/static/js/web/entry-*.js` y del total. Línea base congelada; aviso
si sube >5 %. Caza el día que alguien importe una librería de gráficos entera.

### 1c. Canario de timings en producción

El canario ya corre cada hora; mismo spec, mismas métricas, contra mechaa.es.
Detecta "Vercel sirve algo distinto", CDN frío, Supabase lento (p95 de las
peticiones REST). Sin código nuevo: la 1a ya lo trae si se miden también los
timings de `response`.

---

## 11. Atribución: qué push rompió qué (antes vs después) — P0

**Qué duele hoy:** cuando algo degenera (una pantalla tarda más, salen 40 peticiones
nuevas, sube el código muerto), la pregunta que importa no es "está mal" sino
**"¿desde qué commit?"** Sin atribución, la salida es siempre "refactorizar todo";
con atribución, es "revertir/ajustar 50 líneas de un commit concreto".

**La base ya existe:** `vigilancia_ejecuciones` guarda `commit_sha`, `rama` y los
contadores de cada corrida, y el canario corre cada hora. Solo falta el comparador.

### 11a. El comparador (una RPC, un paso de CI)

`staff_vigilancia_comparar(p_sha, p_sha_base)` (o su gemelo en el runner local):

- Dos corridas → un delta legible: métricas por pantalla (tiempos, peticiones,
  long tasks, hallazgos nuevos/resueltos), peso del bundle, contadores de código
  muerto, nº de RPC del mapa de arquitectura.
- La CI lo llama solito al final: compara contra **la última corrida `ok` del padre
  del merge** (`git merge-base`, no "la última corrida a secas" — si la rama estaba
  rota, comparar contra la última verde, si no, el delta culpa al commit equivocado).
- Salida: comentario en el PR con "±" por métrica (igual que los checks de tamaño
  de bundle de Vercel) **y** hallazgo `aviso` si alguna métrica degenera por encima
  de su umbral — con los DOS shas en el título: `rendimiento: caja +2,1 s y +38
  peticiones (abc1234 → def5678)`.
- Regla de herpes cero: si la métrica **mejora**, no se emite hallazgo; se actualiza
  la línea base. El trinquete solo gira hacia abajo.

### 11b. Bisect automático (para cuando ya se sabe que algo degeneró)

Workflow `radiografia-bisect.yml`, disparado a mano desde el panel/Actions con
"métrica" y "rango de commits":

1. GitHub tiene **`gh api ... /actions` y `git bisect run`** de serie: el workflow
   hace checkout binario entre dos shas, corre SOLO la pieza que importa (p. ej. el
   smoke de una pantalla con mediciones, ~40 s por punto) y `git bisect run` devuelve
   el primer commit malo.
2. Publica el resultado como hallazgo `atribucion/bisect-<metrica>` con el sha
   culpable, su autor y su diff enlazado.
3. Coste: ~8 corridas × 40 s para un mes de commits. Nada.

### 11c. Foto de "antes" obligatoria en cada push

Para que 11a compare de verdad, la CI mide en CADA push a master (ya lo hace) y el
canario cada hora en producción (ya lo hace). Lo único que se añade:

- Un paso en la CI que, antes de publicar, **recupere la corrida del padre** y
  adjunte el delta al informe (`informe.delta = { base_sha, diferencias }`).
- El panel pinta la línea temporal por commit: eje X = tiempo, eje Y = métrica,
  punto por push. Una degeneración se ve como un escalón, y el escalón tiene un
  sha clavado encima.

### 11d. Qué NO es esto

No es "vigilar al vigilante": eso ya lo hace la fase 1 (ancla perdida = fallo).
Esto es **memoria comparativa**: convertir las corridas sueltas en una serie
temporal por commit, para que la pregunta "¿desde cuándo pasa esto?" tenga respuesta
de un clic en lugar de una tarde de arqueología git.

---

## 12. Radar de GitHub — instalar, no construir — P0

**Qué es esto:** herramientas que ya existen en GitHub y se activan en minutos. No
son vigilantes nuestros: los mantenemos con las reglas del repo y ellos revisan solos.
Los tres son complementarios entre sí Y con los vigilantes: el revisor IA lee el
diff, CodeQL mira patrones de seguridad internos, Renovate las dependencias; los
vigilantes propios siguen siendo los únicos que entienden de invariantes Mecha
(precios en 3 sitios, multi-tenant, la regla del parámetro).

### 12a. Revisor de código con IA en cada PR

- **Qué hace:** en cada PR, lee el diff y comenta (bugs, riesgos, incoherencias con
  el resto del fichero). Con instrucciones de repo (ver abajo) también puede
  comprobar las normas de CLAUDE.md.
- **Opciones** (elegir UNA; todas con plan gratis o barato):
  - **GitHub Copilot Code Review** — botón en Settings → Copilot → Code review; si
    ya hay suscripción Copilot, no cuesta nada extra. La opción por defecto.
  - **CodeRabbit** (`coderabbit.ai`) — el más hablador; plan público gratis, gratis
    total en repos open source; comenta con resumen + acciones sugeridas.
  - **Claude Code GitHub Action** (`claude-code-action` de Anthropic) — comenta con
    `@claude` en el PR; requiere API key de Anthropic.
- **Instrucciones de repo:** crear `.github/copilot-instructions.md` (o el
  equivalente de la herramienta elegida) con lo que el revisor TIENE que mirar en
  Este repo, en este orden:
  1. ¿Lleva `negocio_id` toda consulta y toda política? (multi-tenant)
  2. ¿Alguna clave en el código? (regla 1 y 9 de CLAUDE.md — prohibido)
  3. ¿Este cambio toca algo que vive en varios sitios (precios, referidos,
     tipos de solicitud)? Si sí, ¿están TODOS?
  4. ¿Handlers de clic con async sin await/catch? (familia 2b)
  5. ¿RPC nueva `security definer`? Entonces tiene que llevar guard dentro.
- **Nivel:** SIEMPRE aviso, nunca bloquea. La IA no tumba una CI; los vigilantes
  deterministas sí. Si un comentario humano decide, se marca el PR.

### 12b. CodeQL (análisis de seguridad de GitHub)

- **Qué hace:** análisis estático de seguridad real (inyecciones, XSS, rutas
  peligrosas) sobre TypeScript/JavaScript. Gratis en repos públicos.
- **Instalación:** Settings → Code security → Code scanning → **Default setup**,
  lenguajes JavaScript/TypeScript. GitHub crea el workflow solo.
- **Nivel:** los hallazgos altos en PR **bloquean** (así viene de serie y es lo
  correcto); los demás van a la pestaña Security del repo.
- Nota: el repo fue público con una service_role filtrada — el historial es lo que
  es, pero el código NUEVO no tiene excusa: esto lo revisa en cada PR gratis.

### 12c. Renovate (dependencias al día, en PRs)

- **Qué hace:** abre PRs automáticas cuando hay versiones nuevas (incluye major,
  con release notes), las agrupa, y las PRs de Renovate pasan la CI normal — o sea
  que los vigilantes y el smoke prueban cada actualización ANTES de mergear.
- Preferir **Renovate** sobre Dependabot: agrupa mejor (una PR "minor Updates" por
  semana en vez de 15 sueltas) y tiene `renovate.json` versionable.
- **Instalación:** Marketplace de GitHub → **Renovate** (app de Mend) → autorizar
  el repo. Luego commit de `.github/renovate.json`:
  ```json
  {
    "$schema": "https://docs.renovatebot.com/renovate-schema.json",
    "extends": ["config:recommended", "schedule:weekly"],
    "rangeStrategy": "bump",
    "packageRules": [
      { "description": "Expo/React Native van de la mano: agruparlas",
        "matchPackagePatterns": ["expo", "react-native"],
        "groupName": "expo" },
      { "description": "Supabase: probar siempre junto (cliente + edges)",
        "matchPackagePatterns": ["supabase", "@supabase"],
        "groupName": "supabase" }
    ]
  }
  ```
- **Nivel:** aviso. Una PR de Renovate se mergea solo si la CI (vigilantes + smoke
  incluidos) va verde — que es exactamente para lo que hemos construido todo esto.

### 12d. Extras del mismo estilo (evaluar después de las tres de arriba)

- **Zizmor** — audita los propios workflows de GitHub (inyección en `${{ }}`,
  permisos demasiado anchos). Barato y meta: vigila a los vigilantes de CI.
- **Overlap de la familia 9:** `npm audit` + `npm outdated` en CI (familia 9) y
  Renovate (12c) se complementan: audit caza vulnerabilidades AYER, Renovate
  evita que la deuda llegue a existir.

---

## 2. Botones que fallan en silencio — P0

**Qué duele hoy:** el smoke pulsa el botón y comprueba que "no explote". Pero un
botón cuyo handler hace `await algo()` sin catch y se traga el error, o que pinta
un toast rojo que nadie lee en CI, hoy pasa en verde.

### 2a. Ampliar el manoseo del smoke (coste casi cero)

En `manosearBotones`, tras cada clic, además de "no queda en blanco":

- Capturar **`unhandledrejection`** del documento (hoy solo escuchamos `pageerror`,
  que no caza las promesas rechazadas).
- Detectar **toasts/avisos de error** visibles: selectores habituales del design
  system (`.toast`, `[role="alert"]`, clase de error conocida). Si aparece tras un
  clic y NO aparecía antes, es un hallazgo `pantallas/boton-errore-<nombre>-<etiqueta>`.
- Nivel: `aviso` (puede ser flujo legítimo en la demo, p. ej. validar un formulario
  vacío) — pero con la etiqueta del botón en el título, para que se vea cuál degenera.

### 2b. Vigilante estático de errores tragados

`scripts/vigilantes/errores-tragados.mjs` (AST con `ts-morph` o parseo con
`typescript` que ya está en el repo):

- `onClick={() => { algoAsync() }}` — llamada async **sin** `await` ni `.catch` ni
  envolvente try/catch dentro del handler. Es el patrón exacto del error silencioso.
- `await` dentro de handler sin `try/catch` Y sin función envolvente con catch.
  (Este segundo da muchos falsos positivos: empezar solo con el primero, que es el
  90 % del problema.)
- Línea base congelada (habrá legado); `aviso` si sube. Excluir rutas ya auditadas.

---

## 3. Cuellos de botella de base de datos — P0

**Qué duele hoy:** `vigilancia_bd()` ya vigila *forma* (RPC sin guard, RLS sin
InitPlan). No vigila *realidad*: qué consultas son lentas HOY, con datos de
producción.

### 3a. `vigilancia_bd_rendimiento()` (nueva función, misma migrate)

Con `pg_stat_statements` (comprobar que está habilitada; si no, `create extension`):

- Top 20 por `total_exec_time`: cualquier query > umbral (p. ej. p95 > 300 ms)
  → hallazgo `aviso` con el texto normalizado y el nº de ejecuciones.
- **Seq scans sospechosos:** `pg_stat_user_tables` con `seq_scan` creciendo y muchas
  tuplas leídas → falta índice. (El historial de is_staff() volátil ya dio 24 M de
  esto: es un fallo que aquí ya ocurrió.)
- `pg_stat_activity`: >N sesiones activas raras, esperas en lock.
- Comparativa **desde la última corrida** (delta de contadores): el canario/panel
  puede llamarla cada hora y ver tendencias, no solo instantáneas.

### 3b. Peticiones REST lentas desde el canario

Ya cubierto por 1c: p95 por endpoint REST desde fuera. Dentro (BD) y fuera
(canario) dan la misma verdad desde dos lados.

---

## 4. Coherencia de datos — P1

**Qué duele hoy:** dos pantallas pueden contar lo mismo distinto (Caja dice 340 €,
Informes dice 320 €) y ningún test lo nota porque cada spec mira una pantalla.

### 4a. Invariantes de negocio dentro de la BD

`vigilancia_bd_coherencia()`, comprobaciones SELECT puras sobre el tenant demo
(datos sembrados y estables) y opcionalmente sobre producción en modo solo-lectura:

- Suma de `cobros.completados` del mes = lo que la RPC de caja devuelve.
- Conteo de citas activas del mes = lo que Informes pinta.
- Huérfanos lógicos: cobros sin cita referenciable, citas con servicio/profesional
  inexistente, `citas.estado` fuera de dominio, señales pagadas sin cita asociada.
- `solicitudes.tipo` en el CHECK y en la RPC (ya vigila la fase 1, se mantiene).
- Bono con más consumido que disponible.

Nivel: `aviso` en demo (es atrezzo), `bloqueante` si se activa en producción.

### 4b. Contraste UI ↔ BD en el smoke

Para 2–3 pantallas clave (Caja, Informes, Clientes): el smoke lee el número que
pinta la pantalla y llama a la RPC/aritmética de referencia; deben cuadrar. Es el
único modo de cazar "mismo dato, dos fórmulas". Empezar por Caja del día en la demo.

---

## 5. Bugs visuales — P1

**Qué duele hoy:** nada comprueba que algo se VEA bien. Regresiones de layout
(elemento tapado, columna que se sale, modal sin botón visible) pasan todos los
tests.

### 5a. Diff de capturas por pantalla

- En CI, tras el smoke, captura PNG por pantalla a 2 tamaños (desktop 1440, móvil
  390) con `page.screenshot`.
- Comparación con captura de referencia (guardadas en el repo, `tests/visual/baseline/`):
  % de píxeles distintos (librería `pixelmatch`, dependencia nueva justificada).
- Umbral pequeño (1–2 %): los textos con fechas/horas cambian; ancla y umbral por
  pantalla. Hallazgo `visual/difiere-<pantalla>` nivel `aviso`, con la captura
  adjunta (Storage firmado) para verlo en el panel.
- **El update de la referencia es un acto consciente**: `npm run visual:aprobar`
  regenera; el diff del repo muestra qué se aceptó.

### 5b. Checks de layout sin capturas (baratos, deterministas)

En el mismo smoke, por pantalla:

- **Overflow horizontal:** `document.documentElement.scrollWidth > clientWidth` →
  alguien rompió el ancho. `aviso`/`bloqueante` según magnitud.
- **Elemento fuera del viewport** que debería verse (botones del pie del modal).
- **Texto solapado**: intersección de bounding boxes de nodos de texto hermanos
  (heurística, solo casos flagrantes).
- **Contraste AA**: sobre los elementos de texto principales (función local, sin
  axe; o `@axe-core/playwright` si se prefiere audit completo — incluye también
  teclado/foco, que es un plus de accesibilidad real).

### 5c. Responsive básico

El smoke completo solo corre a desktop; una **pieza reducida** (5 pantallas núcleo:
agenda, caja, clientes, portal, configuración) corre también a 390×844 en el mismo
runner: solo carga + ancla + overflow. Es donde vive el 80 % de los bugs de móvil.

---

## 6. Radiografía de arquitectura — P1

**Qué duele hoy:** nadie tiene el mapa. "¿Qué RPCs usa la pantalla Clientes?",
"¿qué tablas toca esta edge function?", "¿hay tablas que NADIE lee?" — hoy se
responde a mano, mal.

### 6a. Vigilante cartógrafo (estático + BD)

`scripts/vigilantes/mapa.mjs`:

- Parsea `app/**/*.tsx` + `lib/**/*.ts`: qué pantallas llaman qué tablas/RPCs
  (búsqueda de `.from('...')` y `.rpc('...')` con línea).
- Parsea `supabase/functions/*/index.ts`: qué RPCs/tablas toca cada edge.
- Cruza con `pg_proc`/`pg_tables` reales:
  - tabla sin ningún lector → candidata a muerte (`aviso`, alimenta knip de BD).
  - RPC que nadie llama (ni app, ni edges, ni pg_cron, ni otras RPCs) → `aviso`.
  - pantalla que llama a una RPC inexistente → **`bloqueante`** (eso es un 404 en
    producción esperando ocurrir).
- Emite `mapa.json` versionado: el panel puede pintar el grafo (capa nueva:
  "Arquitectura") y el diff del mapa en cada PR enseña qué se ha añadido/tocado.

### 6b. Vigilante de invariantes de arquitectura (reglas, no mapa)

Con el mapa de 6a, reglas duras: ninguna pantalla nueva sin ancla de smoke;
ninguna edge nueva fuera de `check:edges`; ningún `.from(` directo en componentes
de UI (solo en `lib/`) si eso es la convención; ninguna tabla nueva sin RLS.

---

## 7. Legalidad — P1

**Qué duele hoy:** los textos legales (privacidad, cookies, bases de consentimiento
WhatsApp) son contenido que deriva como los precios: se cambia una cosa y el texto
legal queda viejo. Nadie lo mira nunca.

### 7a. Vigilante de textos legales (estático)

`scripts/vigilantes/legal.mjs`:

- Landing, portal, demo y app: existe enlace a privacidad desde el pie Y desde
  todo formulario; cookies: si se carga GA/Analytics de Google, **tiene que**
  existir banner/consentimiento (hoy hay una capa: verificar que cubre GA y los
  scripts de Vercel Insights).
- **Versionado y fecha** de los textos: el vigilante exige un `data-version` /
  fecha visible en `privacidad.html`; sin fecha → `aviso` "texto legal sin fecha,
  nadie sabe si está vigente".
- Checklist RGPD en el propio informe (que un humano confirme una vez al trimestre):
  DPA con OpenRouter/Anthropic/Google, encargados listados, derecho de supresión
  operativo (¿hay flujo para borrar un cliente y sus datos?), retención de
  `errores_cliente`/logs definida.

### 7b. Consentimiento WhatsApp (BD + estático)

- La BD debe registrar base jurídica/consentimiento por cliente para marketing
  (campo existente o por crear): las campañas solo a quienes lo tienen.
- Vigilante: campaña enviada a clientes sin flag → `bloqueante`; texto del portal
  de reserva que ofrezca marketing sin checkbox → `bloqueante`.

---

## 8. Links, SEO y datos estructurados — P2

`scripts/vigilantes/web-publico.mjs` (estático) + canario (real):

- **Links internos rotos:** extraer todos los href de `web/*.html` y comprobar
  contra los ficheros/rewrites existentes (estático) y con HEAD requests contra
  producción (canario). 404 interno → `bloqueante` (ya pasó con `/r/`: el smoke lo
  cazó, esto lo generaliza a TODO el sitio, no solo las 17 pantallas).
- **Sitemap vivo:** cada URL de `sitemap.xml` responde 200 (muestreo: 50 aleatorias
  por corrida del canario).
- **JSON-LD válido:** parsear el de la landing y marketplace; esquema roto o
  precios que no cuadran con `lib/planes.ts` (extensión natural del vigilante de
  precios de la fase 1).
- `robots.txt` y `noindex` accidentales en páginas que deben indexarse.

## 9. Tecnologías — P2

- `npm audit` + `npm outdated` en CI semanal (workflow programado, no en cada PR):
  vulnerabilidad alta → `bloqueante`; versión mayor atrasada → `aviso` con edad.
- Lo mismo para Deno/edge functions y runtime de Vercel.
- Dependencias duplicadas (moment+luxon, dos librerías de fechas...) — knip ya
  ayuda; aquí el matiz es "no añadir la 3ª librería de gráficos".

## 10. Integración en el panel

- Ámbitos nuevos en el filtro de Salud: `rendimiento`, `visual`, `datos`,
  `arquitectura`, `legal`, `web-publico`.
- **Tendencias:** la tabla ya guarda `duracion_ms` y contadores por corrida; añadir
  una gráfica simple (línea de FPS medio, p95, nº de hallazgos abiertos por ámbito)
  — JS plano con `<canvas>` o SVG inline, sin librería nueva.
- Las capturas de los diffs visuales (5a) a un bucket privado de Storage con URL
  firmada en el hallazgo.

---

## Lo que NO hay que hacer (acordado)

- **No estrenar 10 vigilantes de golpe.** La fase 1 salió bien porque cada pieza se
  verificó con una regresión real. Ejecutar por prioridades, una familia por sesión.
- **No meter dependencias nuevas sin discutir** (pixelmatch y axe son las dos
  únicas candidatas; ambas pequeñas y estables).
- **No bloquear por deuda heredada:** todo lo nuevo nace con línea base congelada.
- El nativo sigue sin cubrirse (la web es el producto real; el nativo va detrás).

## Definición de "hecho" para esta fase

1. Radar de GitHub montado (12): revisor IA con instrucciones de repo, CodeQL en
   default setup, Renovate con `renovate.json` agrupando expo y supabase.
2. `npm run vigilar` cubre las familias 1b, 2b, 6, 7a, 8(estático), 9(estático).
2. El smoke mide (1a, 2a, 5b, 5c) y publica sus métricas por pantalla.
3. Cada push lleva su delta "antes vs después" (11a) y el panel pinta la serie
   temporal por commit (11c); el bisect (11b) se dispara a mano y encuentra el
   primer commit malo de una métrica.
4. `vigilancia_bd_*` cubre 3a y 4a; el panel las llama con sesión de staff.
5. Visual diff (5a) con flujo de aprobación consciente.
6. El panel Salud pinta los nuevos ámbitos y las tendencias.
7. Cada vigilante estrenado con: línea base medida, un falso positivo descartado a
   conciencia, y su decisión resumida en CLAUDE.md (extensión de la decisión 10).
