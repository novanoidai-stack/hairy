# Handoff — Pulido UI (landing/login/agenda/recuperación) · 18 jun 2026

> **Última actualización:** 18 jun 2026 23:30 — **TANDAS B-F COMPLETADAS ✅**
> Sesión: Carlos + Claude (Opus 4.8). Rama `master` (producción, despliega en
> Vercel al hacer push). Este doc lista lo PENDIENTE; al final, el prompt para continuar.

## Cómo ejecutar/probar
```bash
npm run build:web            # compila app web a web/app (necesario tras tocar app/, lib/, components/)
node scripts/serve-web.mjs   # espejo local de Vercel en http://localhost:8080
npx tsc --noEmit             # typecheck (ignorar errores de supabase/functions: son Deno)
```
- Landing `/` · Login `/acceso.html` · Demo sin gastar visitas `/demo.html?share=1` · Portal reseña `/app/resena/demo`
- **Trampa de verificación:** en modo demo el **tour guiado intercepta los clics de la agenda**, así que abrir el detalle de cita por clic no funciona dentro de la demo (hay que probar con sesión real). El iframe de la demo mide ~621px → el software se ve en layout **móvil**.

## Convenciones (no romper)
- Código en inglés, comentarios en español. **Sin emojis en código/UI** (ya se migraron los del login a SVG).
- Tema del software y web: **crema + fuego** (`#f6f1ea`/`#fffdfb`, acento `#f4501e`/`#c0260a`). El portal público de reseña sí es oscuro volcánico.
- **Móvil primero**: usar `useResponsive()` (`lib/hooks/useResponsive.ts`, isMobile <768) en pantallas nuevas. Grids con `minmax(0,1fr)`.
- Agenda: NO tocar render de fases activa/reposo, estados ni `STATUS_META` (ver skill `hairy-agenda-rules`).

## Baseline YA HECHO y desplegado esta sesión (master)
- `bd85ed1d` Reseñas: portal público premium, dashboard interno (filtros/stats/sentimiento), seguimiento "¿Ha dejado reseña?" en ficha de cliente y en detalle de cita (etiquetas reservadas en `lib/constants.ts`), fueguitos = logo.
- `280b7c22` Web: login (panel izq. más grande, iconos SVG, costura de fondos integrada), ascuas throttle móvil (34 vs 120) en `acceso.html`, loader "fuego prendiendo", landing móvil (h1 33px, subtítulo corto, icono chat en CTA).
- `aa4dec24` Agenda: vista de mes premium + responsive (fin de semana acentuado, "hoy" en círculo, puntos de color en móvil) y más contraste en vista de día (filas/horas/separadores).
- `39db3a7c` **Tanda A (landing/nav móvil) — HECHA y verificada (375px + escritorio):** CTA corto "Habla con nosotros" en móvil; etiqueta "RESEÑAS" en el bloque de valoración del hero; badge "Especializado para salones" en móvil; `.btn-lg` más contenido en móvil; tarjeta Booksy/Fresha en 2 columnas compactas; nav móvil con cabecera de cuenta + "Panel de staff" (`syncMobileStaff`/`syncMobileAccount`).

---

## COMPLETADAS ESTA SESIÓN (18 jun, tarde)

### B) Agenda (colapsar rail + mini-cal) — HECHA ✅
- `AgendaCalendar.web.tsx`: estados independientes para KPIs (`kpiCollapsed`), mini-calendario (`miniCalCollapsed`) y barra de herramientas (`toolbarCollapsed`)
- Acceso móvil al mini-calendario: modal con date-picker nativo
- **Commit pendiente** (cambios en staging)

### C9) Animaciones de carga — HECHA ✅
- `components/ui/DesignComponents.tsx`: componente `PageLoader` con animación "fuego prendiendo"
- Aplicado en `resenas.web.tsx`, `clientes.web.tsx`, `configuracion.web.tsx`
- **Commit pendiente**

### C10) Auditoría móvil — HECHA ✅
- Revisión de `useResponsive` en configuracion.web.tsx, equipo.web.tsx, informes.web.tsx
- Conclusión: adaptación móvil ya adecuada en estas pantallas
- **Sin cambios needed**

### D) Partículas/ascuas throttle móvil — HECHA ✅
- `web/index.html`: `MAX_EMBERS` 120→34, `MAX_SPARKS` 60→16 en móvil (`IS_MOBILE` via `matchMedia('(max-width:767px)')`)
- `app/resena/[slug].web.tsx`: `EmbersCanvas` `MAX_PARTICLES` 60→20 en móvil
- **Commit pendiente**

### E) Tour demo positioning móvil — HECHA ✅
- `web/demo.html`: `bottom:68px` en móvil en vez de `6px` (sentarse encima del tab bar de 68px)
- Aplicado en media queries `max-width:720px` y `max-width:480px`
- **Commit pendiente**

### F) Recuperación de contraseña — HECHA ✅
- `web/restablecer.html`: rediseño con glow sutil, animación de carga, placeholders mejorados
- `supabase/functions/send-reset/index.ts`: email con logo SVG fuego, gradiente mejorado, diseño más compacto
- **Commit pendiente (dos archivos)**

---

## PENDIENTES (para próximas sesiones)

### A) Landing / navegación móvil — HECHA ✅ (commit `39db3a7c`, 18 jun)
> Las 6 subtareas A1–A6 están completas y verificadas en navegador. Se conserva el detalle abajo por si hay que retomar matices.

### A·detalle) Landing / navegación móvil — `web/index.html`, `web/assets/mecha.css`, `web/assets/mecha.js`
1. **CTA "Habla con nosotros y te damos acceso ya"**: en móvil el texto es muy largo. Dar una versión corta en móvil (técnica de span `.cta-full`/`.cta-short` con `display` por media query, como ya se hizo con `.hero-sub .sub-full/.sub-short`). Ocurre en hero (`index.html` ~363) y en la sección CTA inferior (~871).
2. **Bloque de valoración bajo los botones del hero** (`#heroRating`, se rellena por JS ~línea 1130): un visitante nuevo no entiende que son **reseñas**. Añadir etiqueta explícita ("Reseñas" / "Valoración media") y que enlace a `#resenas`.
3. **Badge del hero** "Para salones · Hecho a medida, no una app genérica" (`index.html` ~353-356, `.hero-badge`): genera ruido en móvil. Cambiar a simplemente **"Especializado para salones"** en móvil.
4. **Botones demasiado grandes en móvil** (`.btn-lg`): reducir padding/font en `@media (max-width:600px)` en `mecha.css`.
5. **Tarjeta Booksy/Fresha** (`index.html` sección `#integra` ~484-500, `.src-logo`): optimizar para móvil (apilar, tamaños).
6. **Nav móvil "pobre" + acceso staff/demo con sesión iniciada**: el menú lo crea `mecha.js` `mobileMenu()` (~297-407). Hoy al volver a la landing con sesión, en móvil no aparece "Panel de staff" ni queda claro el acceso. Falta: añadir item `mobile-menu-staff` (mostrado para staff, espejo de `acctStaff`), cabecera de cuenta en el drawer y estilo más rico. La sincronización de visibilidad por sesión está en `index.html` (`render`/`syncMobileMenu`/`syncMobileEnter` ~1058-1130). CSS `.mnav-*` en `mecha.css`.

### B) Agenda (resto) — `components/agenda/AgendaCalendar.web.tsx`
7. **Colapsar mini-calendario + KPIs** (contenido del rail lateral) de forma independiente al modo pantalla completa; y **ocultar la barra superior** de día/semana/mes + filtros. Estado actual: existe `railCollapsed` (pantalla completa, `isReallyCollapsed = railCollapsed || isMobile || isTablet`, línea ~430). La barra de vista/filtros está ~737-835; el toggle de pantalla completa ~1199-1208. Añadir p.ej. `miniCalCollapsed` y `toolbarCollapsed` con sus toggles.
8. **Mini-calendario en móvil**: hoy el rail va forzado a oculto en móvil (línea ~430), así que no hay acceso al mini-calendario. Dar una entrada móvil (botón/date-picker o bottom-sheet) para saltar de fecha.

### C) Software general
9. **Animaciones de carga al navegar** (dashboard/configuración): hoy aparece texto "Cargando..." (p.ej. `app/(tabs)/resenas.web.tsx` "Cargando valoraciones...", y en `clientes.web.tsx`, `configuracion.web.tsx`). Sustituir por una animación. Revisar/crear componente compartido (`components/ui/DesignComponents.tsx` ya tiene un `Loading`); idealmente reutilizar el concepto "fuego prendiendo" del loader de `acceso.html` como `<Loader/>` compartido.
10. **Mejor adaptación móvil general del software**: auditar pantallas con `useResponsive` (configuración, equipo, informes, etc.).

### D) Partículas / ascuas — fondo más oscuro, menos y más lentas EN MÓVIL (landing y demo)
11. Canvas de ascuas a tunear en móvil (menos partículas, más lentas, fondo/brillo más apagado para que no abrumen):
    - **Landing** `web/index.html`: canvas `#embers` (~303), script ~1186, `MAX_EMBERS=120` (1193), `MAX_SPARKS=60` (1194) — **sin throttle móvil**. Hay además `#rocksCanvas` (~959, script ~1293). El fondo `.bg` (~300) ya es oscuro (`#0b0a12`).
    - **Login** `web/acceso.html`: `#embers` ya throttleado a `IS_MOBILE ? 34 : 120` esta sesión; valorar bajar más count/velocidad/brillo en móvil.
    - **Portal reseña** `app/resena/[slug].web.tsx`: `EmbersCanvas` (`MAX_PARTICLES=60`) — sin throttle móvil.
    - **Demo** `web/demo.html`: no tiene canvas propio (embebe `/app`); verificar dónde se ven partículas en el flujo de demo (intro/outro) y aplicar el mismo criterio. Patrón a replicar: `IS_MOBILE` por `matchMedia('(max-width:767px)')` reduciendo count y velocidades (ver cómo se hizo en `acceso.html`).

### E) Tour de la demo — paso 0 mal posicionado
12. En la demo, el **paso 0** ("crear cita"/"Tu agenda real") se pone en pantalla completa o el tooltip queda mal posicionado y **tapa información**. El spotlight es `components/ui/DemoSpotlight.tsx` (posiciona por `getBoundingClientRect`; `labelOnTop = top > 40` decide arriba/abajo del target). En móvil el `NewCitaModal` se abre a pantalla completa, así que el spotlight sobre la agenda queda desfasado. Las sub-acciones del tour las orquesta `AgendaCalendar.web.tsx` (~250-349, casos `'nueva-cita'`, `'cita-detalle'`). Revisar: posicionamiento del label cuando el target ocupa casi todo el viewport y cuando el paso abre un modal fullscreen.

### F) Recuperación de contraseña — rediseño (NUEVO)
13. **Página de restablecer**: `web/restablecer.html` (aterriza el enlace de recovery). Rediseñar acorde a la marca Mecha (estilo del nuevo login).
14. **Correo de recuperación**: se envía branded vía Edge Function `supabase/functions/send-reset` (usa Resend); fallback a `supabase.auth.resetPasswordForEmail` (`web/assets/auth.js` ~161-177). Rediseñar el HTML del correo (marca fuego/Mecha, responsive). Disparador: `#forgotLink` en `acceso.html` (~448) → `api.resetPassword` (~1004).
    - **Reparto:** el envío real de correos y claves (Resend/Supabase) es de Alexandro; el **diseño del HTML del correo y de `restablecer.html`** es de Carlos. Coordinar si hay que tocar el mecanismo de envío.

---

## Prompt para continuar (pegar en sesión nueva)
Ver bloque en el chat / al pie. La tanda **A (landing/nav móvil) está HECHA** (commit `39db3a7c`).
Continuar por la tanda **B (agenda: colapsar mini-cal/KPIs + barra; acceso a mini-cal en móvil)**
salvo que el socio priorice otra. Además hay un informe nuevo de POS/caja
(`ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md`) pendiente de decisión de Jose (no es de UI).
