# Diseño — Tips en pantallas de carga

> Fecha: 2026-07-03 · Autor: Carlos + Claude · Estado: diseño aprobado, pendiente de plan de implementación.
> Idea surgida durante el brainstorm del onboarding cinematográfico con IA — iniciativa **independiente**
> de ese spec (que vive aparte en `docs/superpowers/specs/`, mismo día). No toca `web/mecha-cinema.html`.

## 1. Objetivo

Aprovechar los momentos de espera del producto (loaders de la app de gestión, login, arranque de la
demo pública) para mostrar un consejo real de uso de Mecha en vez de un spinner mudo. Sirve dos
propósitos a la vez: que el usuario descubra funciones que no sabía que existían, y que un prospecto
viendo la demo perciba más profundidad de producto mientras espera.

## 2. Inventario previo (para no duplicar)

Loaders existentes en el repo, verificados por lectura de código:

| Superficie | Archivo | Mecanismo actual |
|---|---|---|
| App de gestión (6 pantallas) | `components/ui/DesignComponents.tsx` → `PageLoader` | Spinner SVG + `message` configurable. Usado en `clientes.web.tsx`, `resenas.web.tsx`, `resena/[slug].web.tsx`, `inventario.web.tsx`, `configuracion.web.tsx`, `components/config/MiPerfilProfesional.tsx` |
| App de gestión (RN puro) | `components/ui/DesignComponents.tsx` → `Loading` | `ActivityIndicator` sin texto |
| Login | `web/acceso.html` (~línea 531) | Copia manual en HTML/CSS/JS del mismo spinner visual de `PageLoader` (no comparte componente, es otra base de código) |
| Demo pública | `web/demo.html` (~línea 726) | Mensaje fijo "Cargando el software para que lo recorras por dentro…" mientras carga el iframe |
| Landing | `web/index.html` (~línea 876) | "Cargando valoraciones..." embebido en una sección, bajo impacto |
| Aviso de conexión | `components/ui/OfflineBanner.tsx` | Banner fijo de una línea arriba, solo aviso, no rota contenido |
| Agenda (refresco inline) | `components/agenda/AgendaCalendar.tsx` | `ActivityIndicator` inline corto, no es una pantalla de carga completa |
| Onboarding cinematográfico IA | `web/mecha-cinema.html` | Prototipo GSAP de otra iniciativa (spec aparte, mismo día) |

No existe ningún sistema de tips previo que reutilizar o migrar.

## 3. Decisiones de producto (fijadas por Carlos, 3 jul)

- **Alcance**: `PageLoader` (app de gestión) + `acceso.html` (login) + `demo.html` (arranque demo) +
  comportamiento de "loader atascado" como proxy del caso offline. Fuera de alcance: `Loading` (RN
  puro, sin sitio para texto), `AgendaCalendar` inline, `index.html`, `mecha-cinema.html` y el propio
  `OfflineBanner` (no cambia).
- **Contenido**: consejos reales de funciones ya shippeadas (verificado contra
  `informes/MEGA_INFORME_MECHA.md` y sus adendas), sin cifras ni afirmaciones de mercado — misma
  disciplina que ya aplica la landing (`informes/MEGA_INFORME_MECHA.md` §9.1). Tono: útil para quien ya
  usa el software, y que además luzca bien ante un prospecto viendo la demo.
- **Contextualidad**: pool genérico único — un tip aleatorio, no mapeado a la pantalla que carga.
- **Rotación**: un tip fijo por carga (se elige al montar, no rota con temporizador). Evita mostrar el
  mismo tip dos veces seguidas.
- **Caso offline**: el `OfflineBanner` no cambia. Si un loader lleva **más de 7s** montado sin resolver
  (muy por encima del ~1s habitual), sustituye el tip por un aviso de conexión.

## 4. Contenido de los tips (copy definitivo, 19 tips)

Fuente de verdad del contenido: `lib/loadingTips.ts` (ver §5). Lista inicial:

1. Desde la ficha de una cita puedes cobrar al momento con el botón "Cobrar": queda registrado en Caja sin pasos extra.
2. La Lista de espera te deja ofrecer un hueco liberado al siguiente candidato sin llamar uno a uno.
3. Cada profesional tiene su propio panel en "Mi jornada": horas trabajadas, cobrado y comisión, sin ver la caja del salón entero.
4. El portal de reserva genera un QR: pégalo en el mostrador y las clientas reservan solas desde el móvil.
5. Puedes bloquear a un cliente conflictivo con un toque desde su ficha — no podrá volver a reservar online.
6. Las etiquetas de cliente (VIP, alérgica...) se ven de un vistazo en la agenda, sin abrir la ficha.
7. Los presupuestos se envían con un enlace de pago: el cliente los acepta y paga sin salir del correo.
8. En Informes puedes comparar lo estimado con lo realmente cobrado, para ver si hay hueco entre lo previsto y la caja.
9. La ficha de color guarda las fases activa y de reposo del tinte, para no perder ningún detalle técnico entre visitas.
10. Puedes crear recompensas — descuento, producto o servicio — que canjeas cuando el cliente llega al número de visitas que marques.
11. Puedes cerrar el salón un día concreto desde Agenda sin tocar los horarios generales del equipo.
12. La Bandeja de mensajes reúne las conversaciones de cada cliente junto a su presupuesto o cita.
13. El arqueo de caja del día se calcula solo: efectivo, datáfono y propinas, listo para cuadrar al cerrar.
14. Cada reseña que deja un cliente aparece automáticamente en su portal público, sin copiarla a mano.
15. Los niveles de fidelización (Nuevo, Habitual, VIP...) se calculan solos según las visitas o el gasto de cada cliente.
16. El checklist "Pon en marcha tu salón" te guía paso a paso hasta tener todo listo para tu primer cliente real.
17. Desde Equipo puedes vincular la cuenta de acceso de cada profesional a su ficha, para que gestione su propia jornada.
18. La agenda evita solapes automáticamente, incluso en servicios con fases de tinte encadenadas entre profesionales.
19. Puedes generar todas las liquidaciones de comisiones del mes con un solo botón, sin calcular nada a mano.

Mensaje de "loader atascado" (no es un tip, sustituye al tip cuando aplica):

> "Esto está tardando más de lo normal — revisa tu conexión a internet."

## 5. Arquitectura de datos (dos fuentes, sin build compartido)

La app Expo y la web estática son bases de código separadas (una compila con `expo export -p web`, la
otra es HTML/JS servido tal cual), así que el contenido se duplica en dos archivos con un comentario
cruzado en cada uno apuntando al otro, para que quien edite uno recuerde el otro:

- **`lib/loadingTips.ts`** (nuevo): `export const LOADING_TIPS: string[]` + `export const LOADER_STUCK_MESSAGE: string` + helper `pickLoadingTip(excludeLast?: string): string`. Consumido por `PageLoader`.
- **`web/assets/loading-tips.js`** (nuevo): mismo array `LOADING_TIPS` y `LOADER_STUCK_MESSAGE` en JS plano (`var`/`const` global o `window.MECHA_LOADING_TIPS`), con la misma función de selección. Consumido por `acceso.html` y `demo.html` (un solo `<script src="assets/loading-tips.js">`, no duplicado entre esos dos HTML).

## 6. `PageLoader` (`components/ui/DesignComponents.tsx`)

- El prop `message` existente **no cambia** — sigue siendo la primera línea (qué está pasando). Los 5
  call sites que ya lo personalizan (`clientes`, `resenas`, `resena/[slug]`, `configuracion`,
  `MiPerfilProfesional`) no requieren ningún cambio.
- Nuevo prop opcional `showTip?: boolean` (default `true`).
- Debajo del `message`, una segunda línea más pequeña (13px vs 14px) y en `tokens.textTertiary` (más
  apagada que `textSecondary`) con el tip elegido al montar (`useMemo` con `pickLoadingTip()`).
- Pasados 7000ms desde el montaje sin desmontarse, un `useEffect` con `setTimeout` cambia esa segunda
  línea al `LOADER_STUCK_MESSAGE`. Se limpia el timeout al desmontar.

## 7. `web/acceso.html` (login)

Sobre el spinner ya existente (línea ~531), añadir un `<p>` con el mismo tratamiento tipográfico que ya
usa esa pantalla para texto secundario. Al mostrar el loader: elegir tip con `pickLoadingTip()` de
`loading-tips.js` y pintarlo; `setTimeout(7000)` que lo sustituye por `LOADER_STUCK_MESSAGE` si el loader
sigue visible.

## 8. `web/demo.html` (arranque de la demo)

El texto fijo actual ("Cargando el software para que lo recorras por dentro…") se mantiene tal cual —
ya cumple una función de expectativa que no debe perderse. Debajo, un tip elegido igual que en los
otros dos sitios, con el mismo `setTimeout(7000)` → `LOADER_STUCK_MESSAGE`.

## 9. Testing

- `npx tsc --noEmit` limpio tras tocar `PageLoader` y `lib/loadingTips.ts`.
- `npm run build:web` limpio.
- Verificación visual en `localhost:8080` (servidor local, `node scripts/serve-web.mjs`): recargar
  `acceso.html`, una pantalla con `PageLoader` (ej. `/app/clientes`) y `/demo.html?share=1` — confirmar
  que el tip aparece, que no se repite el mismo tip dos veces seguidas en recargas consecutivas (dentro
  de lo que da la aleatoriedad), y que el mensaje de "atascado" aparece si se simula una carga larga
  (throttling de red en devtools o `setTimeout` bajado temporalmente a modo de prueba).
- Mobile-first: revisar que la segunda línea no rompe el layout en 375px en los tres sitios
  (`useResponsive` ya cubierto por `PageLoader`; en `acceso.html`/`demo.html` comprobar a mano).

## 10. Fuera de alcance

- Tips contextuales por pantalla (se decidió pool genérico único).
- Rotación con temporizador dentro de una misma carga (se decidió tip fijo por carga).
- Tocar `OfflineBanner`, `Loading` (RN), `AgendaCalendar` inline, `index.html` o `mecha-cinema.html`.
- Paridad nativa (RN puro no tiene sitio para texto secundario en `Loading`; ya es deuda conocida de
  paridad web↔nativo, no se agranda aquí).
