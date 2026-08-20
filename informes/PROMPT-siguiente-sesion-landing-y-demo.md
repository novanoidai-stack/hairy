# Prompt para la siguiente sesión — intro cinemática + landing móvil

> Copia y pega el bloque de abajo en una sesión nueva de Claude Code en este repo.
> Escrito el 20 ago 2026, tras el commit `448e7c79c`.

---

## PROMPT (copiar desde aquí)

Actúas como **diseñador de producto senior**, no como programador que además maqueta. Tu
listón es el de un estudio que cobra por esto: jerarquía tipográfica deliberada, ritmo
vertical, densidad de información, motion con intención. Si algo te sale "correcto pero
genérico", no vale — rehazlo.

Trabajo en el repo Hairy (producto **Mecha**, SaaS para peluquerías). Lee `CLAUDE.md` antes
de nada. Hay dos encargos y quiero que **empieces por el 2**, que es el gordo.

### PASO 0 OBLIGATORIO — cargar el criterio de diseño antes de tocar un pixel

No empieces a editar sin esto. Invoca estas skills, que están instaladas y verificadas:

| Skill | Para qué |
|---|---|
| `hairy-design-router` | Arranca por aquí: te dice qué más cargar según la tarea. |
| `hairy-design-system` | **Obligatoria.** Fuente de verdad: tokens, tipografía, motion, inventario de componentes, patrón `.web.tsx`, reglas anti-deriva. |
| `hairy-ui-craft` | **Obligatoria para este encargo.** Cómo pasar de "diseño genérico de IA" a nivel mercado: sourcing de referencias reales, craft de animación, micro-interacciones, checklist de calidad. |
| `frontend-design` | Interfaces distintivas, específicamente pensada para evitar la estética genérica de IA. |
| `ui-ux-pro-max` | 50+ estilos, 161 paletas, 57 emparejamientos de fuentes, 99 guías de UX. Úsala para fundamentar decisiones de color/tipografía en vez de improvisarlas. |

**Además, busca e instala una skill sobre animación web de Emil Kowalski** (autor de Sonner
y Vaul; su trabajo de referencia es *animations.dev*). **Aviso: a día de hoy NO está
instalada** — lo comprobé en las skills del repo, en `~/.claude/skills/` y en los
marketplaces registrados (`claude-plugins-official` y `ui-ux-pro-max-skill`). Búscala con
`ToolSearch` / el marketplace de plugins; si no existe, dilo claramente y no la inventes:
tira de `hairy-ui-craft` para el craft de motion. No finjas haberla usado.

Usa las skills **de verdad**: si `ui-ux-pro-max` te da una escala tipográfica o una regla de
contraste, aplícala y cítala en tu explicación. No las invoques para dejar constancia.

### Encargo 2 (PRIORITARIO) — rehacer la landing en móvil

**El problema, en palabras del dueño:** *"hay demasiado scroll porque los elementos se
apilan todos en vertical, es difícil de leer las comparaciones, parece una columna. Quiero
más horizontalidad y cosas pequeñas. Mejorarla exponencialmente pero sin scroll lateral,
obvio. Y que la cronología de lo que se cuenta en la landing esté bien de verdad."*

**Estado medido hoy (`web/index.html`):**

| Ancho | Altura total |
|---|---|
| 1271px escritorio | 11.390px |
| 826px tablet | 11.862px |
| 443px móvil | **17.394px** (18,6 pantallas) |

El móvil pide **6.000px más de scroll que el escritorio para el mismo contenido**. Ese es el
número a batir. **Objetivo: bajar de 17.394 a ~12.000px sin quitar información y sin
introducir scroll lateral.**

Dónde está el margen:

| Sección | Alto móvil | Pantallas |
|---|---|---|
| `#gestion` | 2.147px | 2,2 |
| `#precios` | 2.091px | 2,2 |
| `#contacto` | 2.082px | 2,1 |
| `#comparativa` | 1.686px | 1,8 |
| `#equipo` | 1.652px | 1,7 |
| `#todo` | 1.623px | 1,7 |

**Ya hecho, no lo repitas:**
- `.grid2` ya no colapsa hasta 760px (antes en 980, se comía la tablet entera).
- Tap targets: de 20 elementos <40px a 5 en móvil, regla extendida a tablet con `pointer:coarse`.
- `#contacto` reestructurado a 3 vías, sin duplicados.
- CTAs unificados a 3 acciones: `Empezar 30 días gratis`, `Ver demo completa`, `Acceder`.

**Las cuatro líneas de trabajo:**

1. **Horizontalidad sin scroll lateral.** Pares de datos en 2 columnas en vez de apilados;
   métricas y features en rejillas 2x2; carruseles con *scroll-snap* horizontal SOLO donde
   aporte, con el overflow contenido en su contenedor y jamás en el `body`.
2. **Densidad.** El móvil hereda las proporciones del escritorio y ahí está el sangrado:
   padding vertical de sección, altura de titulares, aire entre bloques. Define una escala
   de espaciado propia para móvil, no un `clamp()` a ojo.
3. **La comparativa.** Cada fila apila concepto → ✗ otros → ✓ Mecha. El dueño la señaló como
   especialmente ilegible. Explora ✗/✓ enfrentados en dos columnas, acordeón, o tabla con
   scroll horizontal contenido. Decide con criterio y justifica.
4. **Cronología del relato.** Encargo explícito. Las secciones van numeradas (1, 2, 3, 5…) y
   el orden no acompaña: `#comparativa` es la 5 y aparece después de secciones que deberían
   ir detrás. Reconstruye el arco completo — problema → agitación → solución → prueba →
   objeciones → precio → cierre — propón el orden y **reordena de verdad**, renumerando.

**Restricciones duras:**
- Cero scroll lateral. Verifica `scrollWidth === clientWidth` en TODOS los anchos tras cada cambio.
- Nada de cifras, reseñas ni testimonios inventados (regla 5 de `CLAUDE.md`).
- Los precios viven en TRES sitios que se cambian a la vez: `#precios` de `index.html`, el
  `SYSTEM_PROMPT` de `supabase/functions/chispa-landing/index.ts` y `lib/planes.ts`.

### Cómo ver el móvil de verdad (resuelto, no lo redescubras)

- Arranca el preview `mecha-vercel` (`node scripts/serve-web.mjs`).
- **La ventana de Chrome no baja de ~500px**: `resize_window` responde OK pero `innerWidth`
  se queda clavado. No pierdas tiempo ahí.
- Renderiza la landing **dentro de un iframe** del ancho que quieras, con `javascript_tool`:

  ```js
  document.documentElement.innerHTML =
    '<body style="margin:0;background:#222"><iframe id="m" src="/" width="443" height="950" style="border:0"></iframe></body>';
  ```

  Las media queries evalúan contra el iframe, así que es móvil real. Mides con
  `document.getElementById('m').contentDocument` y llamas a la página con `contentWindow`.
- **Anchos objetivo:** 443px (Poco X7 Pro, el móvil del dueño), 390px (iPhone), 412px
  (Android), 768/834/1024px (tablets), 1280px (referencia escritorio).
- Mide siempre: `document.body.scrollHeight`, desborde con
  `documentElement.scrollWidth > clientWidth`, y altura por sección.

### Encargo 1 — intro cinemática de la demo, nivel premium

Ficheros: `web/demo.html` (embebe `/app?demo=1` en un iframe), el recorrido guiado dentro de
la app, y `web/mecha-cinema.html`, que ya existe.

Se quiere la intro **a un nivel premium superior** y **los pasos de la demo más fluidos**.
Aquí es donde `hairy-ui-craft` y la referencia de animación de Kowalski tienen que notarse:
easing con intención (nada de `linear` ni `ease` por defecto), duraciones escalonadas,
entradas encadenadas, respeto a `prefers-reduced-motion`.

Trampas conocidas, verifícalas antes de dar nada por bueno:
- El panel de navegador integrado **congela `requestAnimationFrame`**: las animaciones y el
  foco del recorrido no se ven ahí. Verifica en Chrome real.
- El foco del recorrido se pinta en píxeles y el autoplay no va a intervalo fijo.
- Los datos de la demo los regenera el cron `resembrar_demo` cada 2h: tocarlos a mano no sirve.
- Tenant `demo_salon_001` con sesión aislada (`storageKey: 'mecha-demo-auth'`). Para probar
  sin gastar visitas: `/demo.html?share=1`.

### Cómo trabajar

- **Enséñame números y capturas reales**, no afirmaciones. Si no puedes verificar algo, dilo
  en vez de darlo por hecho.
- Ve del tirón sin preguntar entre pasos, pero **avisa en cuanto encuentres algo roto de
  producción**: en la sesión anterior salió que el formulario de contacto de la landing
  llevaba desde siempre sin entrar un solo lead (los `value` del desplegable no estaban en
  el CHECK de `solicitudes` y el RPC rechazaba todos los envíos).
- Commit y push a `master` al terminar — `master` despliega a producción en Vercel.
- **Ojo con el árbol de trabajo:** puede haber cambios que no son tuyos (en la sesión
  anterior apareció `components/agenda/AgendaCalendar.web.tsx` modificado por otra sesión).
  Revisa `git status` y no commitees lo que no hayas tocado. Nunca subas
  `playwright/.auth/user.json`, que lleva tokens.

## FIN DEL PROMPT
