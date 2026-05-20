# Handoff: Hairy — Rediseño completo (web app SaaS para peluquerías)

> ⚠️ **LEE ESTE DOCUMENTO ENTERO ANTES DE EMPEZAR. NO IMPROVISES.**
> Este handoff existe porque intentos anteriores de implementación **se desviaron del diseño**: botones movidos de sitio, decoraciones inventadas, colores cambiados. La instrucción es clara: **reproducir píxel a píxel** lo que está en `source/`. Si una parte del diseño no aparece en este README, **es un fallo del documento — pregunta antes de inventar**.

---

## 0. Reglas de oro (NO NEGOCIABLES)

1. **Cero invención.** No añadas iconos, decoraciones, gradientes, secciones, badges, separadores, ilustraciones ni copy que no esté en los archivos `source/`.
2. **Cero reorganización.** No muevas botones, no cambies el orden de las columnas, no reagrupes secciones. La posición de cada elemento es la del diseño original.
3. **Cero "mejoras".** No simplifiques, no añadas accesibilidad extra, no apliques tu propio criterio de UX. Si crees que algo se puede mejorar, **anótalo y pregunta**, no lo cambies.
4. **Tokens exactos.** Los colores, tamaños, radios, sombras y espaciados están en este README **con valores exactos**. Cópialos tal cual. No conviertas `#0b1220` a "slate-950" si no es exactamente el mismo hex.
5. **Tipografía exacta.** Inter (400/500/600/700/800) + Instrument Serif (logo y títulos hero). Importadas desde Google Fonts. No sustituir.
6. **Idioma: español.** Todo el copy de la UI está en español (incluidos labels, placeholders, días de la semana, meses). No traducir.
7. **Los archivos en `source/` son la fuente de verdad.** Las capturas en `screenshots/` son apoyo visual. Si hay conflicto, gana el código JSX.

---

## 1. Qué es Hairy

Aplicación SaaS de gestión para peluquerías y barberías:
- **4 secciones principales** (web): Agenda, Clientes, Equipo, Configuración
- **App móvil iOS** (React Native + Expo) con las 4 mismas secciones
- **Modal multi-paso** para crear nueva cita

Usuario tipo: dueño/a de salón que gestiona citas, profesionales y catálogo de servicios.

---

## 2. Sobre los archivos del bundle

Los archivos en `source/` son **prototipos en HTML + React (JSX) cargados con Babel standalone en el navegador**. NO son el código de producción. Son **referencias de diseño** — sirven para:
- Ver el resultado visual exacto en el navegador (abre `Hairy Redesign.html` → todas las pantallas; o `Hairy Mobile.html` → vistas móviles).
- Leer el JSX para extraer **valores exactos** (colores, espaciados, fuentes, copy, layouts).

**Tu tarea**: recrear estos diseños en el codebase real (ver §3) usando los patrones de ese codebase, **conservando 100% de la fidelidad visual**, y reemplazando los datos mock (`PROFESIONALES`, `CITAS_HOY`, `CLIENTES`, `SERVICIOS` en `source/screens/shared.jsx`) por consultas reales a la base de datos del usuario.

---

## 3. Stack de destino

El usuario **no tiene stack definido todavía**. Recomendación (elige tú e impleméntalo):

- **Frontend web**: **Next.js 14 (App Router) + TypeScript + Tailwind CSS**.
  - Tailwind config: extiende con los tokens de §5 (no uses los defaults). Define como `bg-bg`, `bg-bgPanel`, `text-text`, `text-textSec`, etc.
  - Componentes con **estilos inline** o **CSS modules** son aceptables si copiar los `style={{...}}` del JSX es más fiel — **prioriza fidelidad sobre elegancia**.
  - Tipografía: `next/font/google` para Inter e Instrument Serif.
- **Mobile**: **React Native + Expo** con `react-native-svg`. Reusa la paleta de §5.
- **Backend / DB**: el usuario menciona que ya hay base de datos. **Pregúntale qué stack** (Supabase, Postgres + Prisma, Firebase, etc.) antes de definir el modelo de datos. **NO inventes un esquema** — usa el que ya exista.

### Modelo de datos esperado (referencia, NO autoritativo — confirmar con el usuario)

A partir de los mocks en `source/screens/shared.jsx`:

```ts
type Profesional = { id: string; nombre: string; rol: string; color: string; activo: boolean; citas: number; exp: string }
type Servicio    = { id: string; nombre: string; precio: number; duracion: number; categoria: 'Corte'|'Color'|'Tratamiento'|'Peinado' }
type Cliente     = { id: string; nombre: string; tel: string; visitas: number; ultimaVisita: string; gastado: number; fav: string; tag: 'VIP'|'Habitual'|'Nuevo' }
type Cita        = { id: string; hora: string; dur: number; cliente: string; servicio: string; prof: string; estado: 'pendiente'|'confirmada'|'completada'|'no_show'|'cancelada'; precio: number }
```

---

## 4. Fidelidad

**HI-FI píxel-perfecto.** Todos los valores de color, fuente, espaciado y radio son finales.

Los datos mostrados (nombres, citas, precios) son ejemplos de seed — **se sustituirán por datos reales del usuario** vía la base de datos. Pero la UI debe verse **idéntica** con los datos reales: misma estructura, mismo número de columnas, mismos breakpoints, misma tipografía, mismos tags.

---

## 5. Design tokens (de `source/screens/shared.jsx` — copia EXACTA)

```js
// Backgrounds
bg:        '#0b1220'   // app background (azul muy oscuro, casi negro)
bgPanel:   '#0f172a'   // sidebar, modales
bgCard:    '#141f33'   // tarjetas, inputs, botones ghost
bgCardHi:  '#1a2540'   // hover de tarjetas

// Borders
border:    'rgba(148,163,184,0.10)'  // borde sutil estándar
borderHi:  'rgba(148,163,184,0.18)'  // borde de modal / dashed

// Text
text:      '#f8fafc'   // texto primario (casi blanco)
textSec:   '#94a3b8'   // secundario (slate-400)
textTer:   '#64748b'   // terciario / labels uppercase (slate-500)

// Brand / primary (índigo)
primary:    '#6366f1'
primaryHi:  '#818cf8'              // hover / pressed estado activo
primarySoft:'rgba(99,102,241,0.14)' // backgrounds de píldoras activas
primaryGlow:'rgba(99,102,241,0.45)' // glow de botones primarios

// Estado / semánticos
success:    '#10b981'                  successSoft: 'rgba(16,185,129,0.14)'
warning:    '#f59e0b'                  warningSoft: 'rgba(245,158,11,0.14)'
danger:     '#ef4444'                  dangerSoft:  'rgba(239,68,68,0.14)'
violet:     '#8b5cf6'                  violetSoft:  'rgba(139,92,246,0.14)'
cyan:       '#06b6d4'                  cyanSoft:    'rgba(6,182,212,0.14)'
rose:       '#ec4899'
```

### Colores asignados a profesionales (no aleatorio — es seed)

| ID | Nombre          | Rol               | Color      |
|----|-----------------|-------------------|------------|
| p1 | Carla Mendoza   | Estilista Senior  | `#6366f1`  |
| p2 | Diego Ramos     | Barbero           | `#10b981`  |
| p3 | Sofía León      | Colorista         | `#f59e0b`  |
| p4 | Marco Torres    | Barbero Junior    | `#06b6d4`  |
| p5 | Lucía Iglesias  | Estilista (inact) | `#ec4899`  |

### Colores asignados a estados de cita

| Estado      | Label       | Color       | Soft (bg)               |
|-------------|-------------|-------------|-------------------------|
| pendiente   | Pendiente   | `#f59e0b`   | `rgba(245,158,11,0.14)` |
| confirmada  | Confirmada  | `#6366f1`   | `rgba(99,102,241,0.14)` |
| completada  | Completada  | `#10b981`   | `rgba(16,185,129,0.14)` |
| no_show     | No-show     | `#ef4444`   | `rgba(239,68,68,0.14)`  |
| cancelada   | Cancelada   | `#94a3b8`   | `rgba(148,163,184,0.14)`|

### Colores de tags de cliente

| Tag       | Color      |
|-----------|------------|
| VIP       | `#f59e0b`  |
| Habitual  | `#6366f1`  |
| Nuevo     | `#10b981`  |
| Inactivo  | `#64748b`  |

---

## 6. Tipografía

```
Familias (Google Fonts):
  - Inter             pesos: 400, 500, 600, 700, 800
  - Instrument Serif  pesos: 400  (regular + italic)

Importación:
  https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap

Uso:
  - Toda la UI:           'Inter', sans-serif
  - Logo "hairy":         'Instrument Serif', serif (22px, color #f8fafc, letterSpacing -0.5)
  - Hero h1 mobile cover: 'Instrument Serif', serif (72px, color #f8fafc, letterSpacing -1.5)
```

### Escala tipográfica usada (extraída del código)

| Uso                           | Size | Weight | Letter-spacing | Color           |
|-------------------------------|------|--------|----------------|-----------------|
| Topbar h1 (Agenda, Clientes…) | 26px | 700    | -0.4           | `#f8fafc`       |
| h2 sección (Jueves 15 oct)    | 22px | 700    | -0.3           | `#f8fafc`       |
| Modal h3                      | 17px | 700    | —              | `#f8fafc`       |
| Stat value grande             | 22px | 700    | -0.3           | `#f8fafc`       |
| Card título profesional       | 15px | 700    | —              | `#f8fafc`       |
| Body / nombre cliente         | 13px | 600    | —              | `#f8fafc`       |
| Body secundario               | 12px | 500    | —              | `#94a3b8`       |
| Sub-label / meta              | 11px | 600    | —              | `#94a3b8`       |
| Label UPPERCASE (sección)     | 10px | 600    | 1.5            | `#64748b`       |
| Tag UPPERCASE (HOY, INGRESOS) | 9–10px| 600   | 1.0–1.2        | `#64748b`       |
| Pill (badges)                 | 11px | 600    | 0.2            | hereda color    |

Las labels en uppercase usan `text-transform: uppercase`. Cuando ves `letterSpacing: 1.5` significa `1.5px` literal en CSS (no `0.094em`).

---

## 7. Espaciado, radios y sombras

```
Radios (border-radius):
  4px     — barras decorativas
  6px     — kbd, tags pequeños
  8px     — botón pequeño / tag rect / input
  10px    — botón estándar / sidebar item / row
  12px    — search bar / phone tab card
  14px    — card estándar (lista, tabla)
  16px    — calendar card / timeline container
  18px    — modal
  38px    — phone frame iOS
  999px   — pills, avatares, toggles, dots

Espaciado interior estándar:
  - Topbar:    padding 20px 32px
  - Cards:     padding 14–18px
  - Modal:     padding 22px
  - Sidebar:   padding 22px
  - Body grid: padding 24px en columnas

Sombras:
  - Botón primario: 0 6px 20px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.18)
  - Card seleccionada: 0 0 0 1px ${color}66, 0 8px 30px ${color}22
  - Modal: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)
  - Avatar / dot brillante: 0 0 0 1px rgba(255,255,255,0.06)
  - "AHORA" line glow: 0 0 12px #ef4444
```

### Layout root desktop
```
Window:        1440 × 900   (NO responsive en este diseño — fixed)
Sidebar:       240px ancho · borderRight 1px · padding 22px
Content:       resto del ancho · scroll vertical interno
Topbar:        altura ~70px · borderBottom 1px · gradient sutil índigo
```

### Layout root mobile (iOS)
```
Phone frame:   360 × 760   border-radius 38px   border 1px borderHi
Status bar:    14px 26px 6px (pill negro central 110×28 simulando Dynamic Island)
Content:       padding-x 20px
TabBar:        absoluta abajo, padding 10px 16px 22px, 4 columnas iguales
FAB:           56×56px, bottom 88px, right 20px, gradient primario
```

---

## 8. Componentes primitivos (definidos en `source/screens/shared.jsx`)

Estos están exportados a `window` y reusados por todas las pantallas. **Reimpleméntalos como componentes React reales** (no globales en window). Mantén la API exacta:

### `<HairyLogo size={28} />`
Logo de marca. Cuadrado redondeado 28×28 con gradient `linear-gradient(135deg,#818cf8 0%,#6366f1 60%,#4f46e5 100%)`, glow `0 6px 18px rgba(99,102,241,0.45)`, highlight radial blanco arriba a la izquierda.
Dentro: SVG de 4 mechones de pelo (path: ver código). Al lado: texto "hairy" en Instrument Serif 22px + tagline "STUDIO · PRO" 9px uppercase letter-spacing 2.

### `<Sidebar active="agenda" />`
Lista vertical fija con: Logo · Search box (⌘K kbd) · sección "PRINCIPAL" · 4 items (Agenda, Clientes, Equipo, Informes) · Configuración · Account card (avatar gradient "RM" + "Rosa Mendoza" + "Salón Bonita · Admin" + chevron).
**Indicador de activo**: barra vertical 3×18px de color `primary` pegada al borde izquierdo (`left:-22px`), background del item `primarySoft`, border `rgba(99,102,241,0.25)`.

### `<Pill color="..." soft="...">{children}</Pill>`
Píldora redonda. `padding: 4px 9px`, `border-radius: 999px`, `font-size: 11px`, `font-weight: 600`. Color del texto = prop, background = `${color}22` (o `soft` si se pasa), border = `${color}33`.

### `<Btn variant="primary|ghost|danger" icon={<svg/>}>...</Btn>`
- **primary**: gradient `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, text white, shadow `0 6px 20px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.18)`.
- **ghost**: bg `#141f33`, text `#f8fafc`, border `rgba(148,163,184,0.10)`.
- **danger**: bg transparent, text `#ef4444`, border `#ef4444 55`.
- Padding: `9px 14px`, radius 10px, font-size 13px, font-weight 600.

### `<Topbar title sub right={<>...</>}>`
Header de cada pantalla. Padding `20px 32px`, borderBottom `1px solid border`, background `linear-gradient(180deg, rgba(99,102,241,0.04), transparent)`. h1 26/700, sub 13/textSec.

### `<Avatar name size={38} />` (en `source/screens/clientes.jsx`)
Círculo con iniciales (primeras 2). **Color hash determinístico**: hash del nombre → hue 0–360, gradient `linear-gradient(135deg, hsl(hue 70% 60%), hsl(hue+30 70% 50%))`. Ratio fuente: `size * 0.36`.

### Iconos (`I.*` en shared.jsx)
SVGs inline de Lucide-style (24×24 stroke 2). Los paths exactos están en el código. **Si vas a usar lucide-react o similar**, asegúrate de que los iconos visualmente coincidan; si no, copia los paths SVG tal cual.

| Key | Uso |
|-----|-----|
| `plus` | Nueva cita / Nuevo X / FAB |
| `search` | Search bars |
| `filter` | Filtros |
| `chevronL/R` | Navegación calendar / sidebar account |
| `more` | Menú contextual (3 dots horizontales) |
| `phone` | Llamar |
| `star` | VIP, favorito |
| `clock` | Duración |
| `euro` | Precio (no usado en final?) |
| `close` | Cerrar modal |
| `edit` | Editar fila |
| `trash` | Eliminar |
| `check` | Confirmación |
| `bell` | Notificaciones |
| `cal` | Calendario / Hoy / Horarios base |

---

## 9. Pantallas — desktop (1440×900)

### 9.1 Agenda (`source/screens/agenda.jsx`)

**Captura**: `screenshots/01-desktop-agenda.png`

**Layout**: Topbar + grid `380px 1fr` (rail izquierdo + timeline derecha).

**Topbar**:
- Title: "Agenda"
- Sub: "Jueves, 15 octubre · 9 citas hoy · 4 confirmadas"
- Right (en orden, NO cambiar): botón notificación (icono bell con dot rojo arriba derecha) → Btn ghost "Hoy" con icono cal → Btn primary "Nueva cita" con icono plus

**Rail izquierdo (380px, padding 24, scroll-y, gap 20)**:
1. **Mini stats** — grid 2×2, gap 10. 4 tarjetas:
   - "HOY" / 9 / "citas" / tono primary
   - "INGRESOS" / 487 € / "estimado día" / tono success
   - "MES" / 187 / "citas / 240" / tono warning + barra progreso 78%
   - "OCUPACIÓN" / 78% / "esta semana" / tono violet + barra progreso 78%
   - Cada tarjeta: dot de color en esquina superior derecha (6×6, glow `0 0 10px tone`).
2. **Mini calendar** — card padding 16. Header: ◀ "Octubre 2026" ▶ (botones 28×28 redondos border-only). Grid 7 cols × N rows. DAY_NAMES: `['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']` (10px/600/textTer). Octubre 2026 empieza en jueves → offset 3 celdas vacías al inicio. **Día 15 es "hoy"** → background gradient `180deg,#7c83ff,#6366f1` + shadow `0 4px 14px rgba(99,102,241,0.5)`. Día seleccionado (no hoy): bg `rgba(99,102,241,0.16)` + border `primary`. Bajo cada día con citas: 1–3 dots según count (counts hardcoded en `agenda.jsx`).
3. **Profesionales filter** — label "PROFESIONALES" (10/600/textTer/uppercase). Lista con "Todos" arriba (avatar gradient con `••` + count 9) + 4 activos. Cada row: 28×28 avatar gradient color del prof, nombre + rol, count badge a la derecha. Selección: bg `rgba(99,102,241,0.10)` + border `rgba(99,102,241,0.25)`.

**Columna derecha (timeline, padding 24, scroll-y)**:
- **Header**: "Jueves, 15 oct" 22/700 + Pill "HOY" primary. Sub "9 citas programadas · 487 € estimados". A la derecha: tabs "Día | Semana | Mes" (active: bg `bgCard`, border `borderHi`).
- **Timeline grid**:
  - Card 16px radius. Header de columnas: `56px (gutter horas)` + 1 columna por profesional activo (4 cols). Cada cabecera: dot color del prof + nombre (primer apellido) + rol pequeño.
  - Body: filas de 64px de alto por hora, de 9:00 a 19:00 (11 horas). Líneas border-top. Filas alternas con bg `rgba(255,255,255,0.012)`.
  - **Citas posicionadas absolute** dentro de la columna del prof: `top = (hh - 9) * 64 + (mm/60) * 64`, `height = (dur/60) * 64 - 3`, left/right 4px. Background `linear-gradient(180deg, ${profColor}28, ${profColor}18)`, border `1px solid ${profColor}55`, **borderLeft 3px solid ${profColor}**, radius 8px, shadow `0 4px 14px ${profColor}22`. Contenido: hora pequeña + dot estado a la derecha + nombre cliente bold + (si height > 38) servicio.
  - **Línea AHORA**: a las 11:20. Línea horizontal `2px dashed #ef4444` cruzando todas las columnas a `top = (11-9)*64 + (20/60)*64 = 149.33px`. Punto rojo 12×12 redondo a la izquierda con glow `0 0 12px #ef4444`. Etiqueta a la derecha del punto: "11:20 AHORA" 9/700/danger sobre fondo `bg` con border danger.

**9 citas seed** (en `CITAS_HOY` shared.jsx):
| Hora | Dur | Cliente | Servicio | Prof | Estado | Precio |
|------|-----|---------|----------|------|--------|--------|
| 09:00| 30  | Roberto Silva | Corte + Barba | p2 | completada | 28 |
| 09:30| 45  | Elena Ruiz | Coloración Completa | p3 | completada | 75 |
| 10:30| 30  | Pablo Castro | Corte Caballero | p2 | confirmada | 18 |
| 10:45| 60  | María Jiménez | Mechas Babylights | p1 | confirmada | 95 |
| 12:00| 30  | Javier Moreno | Corte Caballero | p4 | pendiente | 18 |
| 13:00| 45  | Ana García | Corte Dama | p1 | confirmada | 32 |
| 15:30| 90  | Carmen Vázquez | Tratamiento Keratina | p1 | confirmada | 110 |
| 16:00| 30  | Tomás Herrera | Corte Caballero | p4 | pendiente | 18 |
| 17:00| 60  | Lucía Pérez | Recogido / Evento | p3 | confirmada | 55 |

---

### 9.2 Clientes (`source/screens/clientes.jsx`)

**Captura**: `screenshots/02-desktop-clientes.png`

**Layout**: Topbar + grid `1fr 380px` (lista + panel detalle).

**Topbar**:
- Title: "Clientes"
- Sub: "8 clientes activos · 23 nuevos este mes"
- Right: Btn ghost "Filtros" + Btn primary "Nuevo cliente"

**Columna izquierda (lista, padding 24)**:
1. **Search bar** — full width, padding 11px 14px, bg `bgCard`, border, radius 12. Icon search + placeholder "Buscar por nombre, teléfono o email…" + texto a la derecha "8 resultados".
2. **Tag chips** — fila de 5 chips: `Todos (8)` activo primary · `VIP (3)` warning · `Habituales (14)` primary · `Nuevos (23)` success · `Inactivos (7)` textTer. Padding `7px 12px`, radius 999. Activo: bg `${color}22`, border `${color}55`, color `color`. Counter dentro del chip en bg `${color}44`.
3. **Tabla** — card radius 14. Header de columnas (10/600/textTer/uppercase, bg `rgba(99,102,241,0.04)`):
   - `Cliente | Última visita | Total gastado | Visitas | (acciones)` con grid `2fr 1fr 1fr 0.8fr 32px`.
   - Filas: avatar 38px (color hash) + nombre + Pill (tag) + tel debajo · ultimaVisita · gastado en success · visitas alineado derecha · icon more.
   - Fila seleccionada: bg `rgba(99,102,241,0.08)`. Por defecto `c3` (María Jiménez) seleccionada.

**Columna derecha (detail panel, 380px, padding 24)**:
- Background del panel: `linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)`, borderLeft.
- **Profile head** (centrado): Avatar 72px. Nombre 18/700. Tel 12/textSec. Pill VIP "Cliente desde 2023" con icono star.
- **Quick actions** (grid 3): Reservar (primary, icon cal) · Llamar (ghost, icon phone) · Editar (ghost, icon edit). Cada uno: card 12px padding, columna icono+label, label 11/600.
- **Mini stats** (grid 3): Visitas (primary), Total (success), Ticket medio (warning). MiniStat: card centrado, label 9/uppercase, value 16/700/tone.
- **Sección "Servicio preferido"**: card con nombre fav + "Solicitado 8 veces" + cuadrado naranja con icono star.
- **Sección "Próxima cita"**: card con gradient `rgba(99,102,241,0.12)` + border `rgba(99,102,241,0.30)`. "MAR 22 OCT · 16:30" 12/700/primaryHi + Pill Confirmada. Servicio + prof + dur + precio.
- **Sección "Historial reciente"**: 3 items. Cada item: card 10px padding. Barra vertical 4px success a la izq · servicio + fecha+prof debajo · precio en success a la derecha.

**Helper `<Section title>{children}</Section>`**: title 10/600/textTer/uppercase letter-spacing 1.5, marginBottom 8.

---

### 9.3 Equipo (`source/screens/equipo.jsx`)

**Captura**: `screenshots/03-desktop-equipo.png`

**Layout**: Topbar + grid `1fr 420px`.

**Topbar**:
- Title: "Equipo"
- Sub: "5 profesionales · 4 activos · gestiona disponibilidad y bloqueos"
- Right: Btn ghost "Horarios base" (icon cal) + Btn primary "Añadir profesional"

**Columna izquierda (cards grid 2 cols, padding 24)**:
- 5 tarjetas + 1 dashed "Añadir profesional".
- Cada **card de profesional** (radius 16, padding 18, position relative):
  - **Stripe top**: barra 3px del color del profesional, posición `top:0 left:0 right:0`.
  - **Blob decorativo**: círculo 140×140, posición `top:-40 right:-40`, `radial-gradient(circle, ${color}22, transparent 70%)`.
  - **Header**: avatar 52×52 gradient color, nombre 15/700, rol+exp 12/textSec, botón more 28×28 a la derecha.
  - **Stats** (grid 2): "CITAS / MES" + número 18/700 · "OCUPACIÓN" + porcentaje 18/700 success (o "—" si inactivo).
  - **Bar chart semanal** (height 32, gap 4): 7 columnas L/M/X/J/V/S/D. Cada barra: container 24px alto bg `rgba(148,163,184,0.08)` radius 4. Fill: alturas `[60,80,50,95,70,40,0]` % en color del prof. Letra del día abajo 9/textTer.
  - **Card seleccionada**: border `${color}66` y shadow `0 0 0 1px ${color}66, 0 8px 30px ${color}22`.
- **Card "Añadir profesional"** (dashed): border 1.5px dashed `borderHi`, min-height 200, centrado. Círculo 44×44 primarySoft con icon plus + "Añadir profesional" 13/600 + "Estilista, barbero, colorista…" 11/textTer.

**Columna derecha (panel, 420px, padding 24)**:
- Background: `linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)`, borderLeft.
- **Header del prof seleccionado**: avatar 40×40 squared (radius 10) + nombre + rol + frase "Disponibilidad y bloqueos en el calendario."
- **Sección "Horario base"**: grid 7 cols con días Lun–Dom. Día abierto: bg `rgba(99,102,241,0.10)`, día + horas. Día cerrado (Dom): bg `rgba(148,163,184,0.05)`, "Cerrado".
- **Header "BLOQUEOS PRÓXIMOS"** + botón "Nuevo" (chip primary con icon plus).
- **Lista de bloqueos** (3 items):
  - Vacaciones (warning) · Lun 26 Oct → Dom 01 Nov · 7 días
  - Formación (violet) · Vie 23 Oct · 14:00 - 18:00
  - Descanso (success) · Lun (todas) · Día completo · semanal
  - Cada item: card con barra vertical 4px del color, Pill label + dur, fecha 12/600.
- **Sección "Tipos de bloqueo"**: grid 2 cols, 6 chips: Vacaciones · Formación · Reunión · Baja · Descanso · Otro. Cada uno: cuadrado 10×10 con glow del color + label.

**Profesional seleccionado por defecto**: `p1` (Carla Mendoza).

---

### 9.4 Configuración (`source/screens/config.jsx`)

**Captura**: `screenshots/04-desktop-config.png`

**Layout**: Topbar + grid `220px 1fr` donde la columna derecha es a su vez `1fr 360px`.

**Topbar**:
- Title: "Configuración"
- Sub: "Ajusta tu negocio, servicios y preferencias"
- Right: Btn ghost "Guardar cambios"

**Tabs rail (220px, padding 24px 16px)**:
- 5 tabs verticales: General · **Servicios** (active default) · Horarios · Pagos · Apariencia
- Tab activo: bg `rgba(99,102,241,0.10)`, border `rgba(99,102,241,0.25)`, text primary.

**Columna central (Servicios)**:
- Header: h2 "Servicios del catálogo" 18/700 · "8 servicios activos · agrupados por categoría" · Btn primary "Nuevo servicio".
- Servicios agrupados por categoría (Corte, Color, Tratamiento, Peinado). Cada grupo:
  - Header tipo "CORTE — — — — 3" (label uppercase + línea hr + count).
  - Card con filas. Cada fila grid `1fr 80px 80px 110px 80px`:
    - Nombre + SKU debajo
    - Duración (icon clock + "30 min")
    - Precio en success "18 €"
    - **Toggle** (32×18 píldora) + label "Activo" success
    - Acciones: edit + trash (delete con color danger).

**Columna derecha (settings, 360px, gap 16)**:
1. **Card "Apariencia"** — radio visual con 2 opciones (Oscuro active, Claro). Cada opción: preview 50px alto + label + checkmark si active.
2. **Card "Negocio"** — 4 fields: Nombre / Email / Teléfono / Dirección. Field: label uppercase 10/600 + input bg `#0b1220` border padding 8px 10px.
3. **Card "Notificaciones"** — 4 toggles divididos por borderTop:
   - Recordatorios SMS a clientes (on)
   - Email de confirmación (on)
   - Alertas de no-show (off)
   - Resumen diario por email (on)

---

## 10. Modal "Nueva cita" (`source/screens/modals.jsx`)

**Captura**: `screenshots/05-modal-nueva-cita.png`

**Backdrop**: position absolute inset 0, bg `rgba(11,18,32,0.65)`, `backdrop-filter: blur(8px)`, z-index 100, padding 24, grid placeItems center.

**ModalShell** (`<ModalShell title onClose w={520}>`): box w=580 (este modal), bg `bgPanel`, border `borderHi`, radius 18, padding 22, shadow `0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)`. Header: title 17/700 + botón close 32×32.

**Contenido** (en orden, NO cambiar):

1. **Stepper** (3 pasos: Cliente · Servicio · Hora). Pill por paso (active: bg `rgba(99,102,241,0.18)`, border `rgba(99,102,241,0.4)`) + número en círculo 18px + label. Línea fina entre pasos.
2. **Field "Cliente"** — card primarySoft con avatar + "María Jiménez" + tel + "22 visitas" + Pill VIP warning a la derecha.
3. **Field "Servicio"** — grid 2×2 con primeros 4 servicios. Card seleccionada (índice 1, "Corte + Barba"): bg `rgba(99,102,241,0.12)`, border `rgba(99,102,241,0.4)`. Cada card: nombre + duración (textTer) + precio (success bold).
4. **Field "Profesional"** — chips horizontales con 4 profesionales activos. Primer chip activo con color del prof (`${color}22` bg).
5. **Field "Hora · Jue 22 oct"** — grid 5 cols × 2 rows con horarios. Estados:
   - Normal: bg `bgCard`, border, color `textSec`
   - Ocupado: bg `rgba(239,68,68,0.10)`, border `rgba(239,68,68,0.30)`, color `danger`, **tachado** (`text-decoration: line-through`), opacity 0.6, `cursor: not-allowed`. Posiciones ocupadas: 10:00 y 11:30.
   - Seleccionado (10:30): gradient primary, color blanco.
6. **Total estimado** — banda success: bg `rgba(16,185,129,0.08)`, border `rgba(16,185,129,0.25)`, "Total estimado" + "32 €" 18/700 success.
7. **Footer** — borderTop. A la derecha: Btn ghost "Cancelar" + Btn primary "Reservar cita" con icon check.

---

## 11. Mobile (iOS · React Native) — `source/screens/mobile.jsx`

Tamaño de frame: **360 × 760px**. Border radius 38, ring negro 8px exterior simulando bezel iPhone (`box-shadow: 0 0 0 8px #1a1f2e`), Dynamic Island simulada (pill 110×28 negro absoluto top:6 centrado).

**TabBar** (4 tabs, fija abajo):
- Agenda · Clientes · Equipo · Ajustes
- Tab activa: stroke + label `primaryHi`. Inactiva: `textTer`.

### 11.1 Mobile Agenda (`screenshots/06-mobile-agenda.png`)
- Header: "JUEVES" 11/uppercase + "15 Octubre" 26/700, avatar "RM" 38×38 a la derecha.
- 2 stat tiles: "HOY · 9 citas" / "INGRESOS · 487 €" (success gradient).
- Selector semanal (7 días, día 15 seleccionado con gradient primary).
- Lista "PRÓXIMAS CITAS" — 5 cards, cada una con borderLeft 3px del color del prof.
- **FAB**: 56×56 redondeado bottom 88 right 20, gradient primary, icon plus.

### 11.2 Mobile Clientes (`screenshots/07-mobile-clientes.png`)
- Header: "Clientes" 26/700 + sub "8 activos · 23 nuevos" + botón cuadrado primary 36×36 con icon plus.
- Search bar pasiva ("Buscar cliente…").
- Chips horizontales: Todos · VIP · Habituales · Nuevos (overflow hidden).
- Lista de 6 clientes (cards): avatar 42 + nombre + Pill tag + ultima visita + total gastado success + visitas count.

### 11.3 Mobile Equipo (`screenshots/08-mobile-equipo.png`)
- Header: "Equipo" 26/700 + sub "5 profesionales · 4 activos" + botón cuadrado primary.
- 2 stat tiles: "OCUPACIÓN · 78%" (primary) / "BLOQUES · 3 activos" (warning).
- Lista de 5 profesionales. Cada card:
  - Stripe top 2px color del prof.
  - Avatar 38 + nombre + rol+exp + citas count a la derecha.
  - Si activo: bar chart semanal 7 cols (alturas como en desktop).
  - Si inactivo: opacity 0.55.

### 11.4 Mobile Configuración (`screenshots/09-mobile-config.png`)
- Header: "Ajustes" 26/700 + "Salón Bonita · Madrid".
- **Card profile** primary gradient: avatar RM + "Rosa Mendoza" + "Admin · hola@salonbonita.es" + chevron.
- Sección "SERVICIOS · 8" — card con 4 filas (servicio + duración + precio + toggle).
- Sección "PREFERENCIAS" — card con 4 rows: Apariencia (Oscuro) · Notificaciones (Activas) · Horarios · Pagos (Stripe). Cada row: icono cuadrado 30×30 primarySoft + label + valor textSec + chevron.

---

## 12. Datos seed (mock)

**TODOS los datos en `source/screens/shared.jsx` son seed**. En producción:
- Reemplaza `PROFESIONALES`, `SERVICIOS`, `CLIENTES`, `CITAS_HOY` por queries reales a la base de datos del usuario.
- **Conserva los nombres de campo** (`id`, `nombre`, `rol`, `color`, `activo`, `citas`, `exp`, etc.) para minimizar refactor del JSX cuando lo portes.
- Los valores hardcoded de stats (9 citas, 487 €, 187/240, 78%) deben **calcularse**, no hardcodearse.
- Fechas: "15 Octubre 2026" es la fecha de referencia del mock. En producción usa la fecha real (i18n español).

---

## 13. Estados e interacciones

### Hover / focus (NO definidos en el JSX original, decisión tuya pero conservadora)
- **Botones**: brillo +5% en el gradient o background.
- **Filas de tabla**: bg `rgba(99,102,241,0.04)` al hover (no seleccionado).
- **Cards seleccionables**: aumentar el ring 1px al hover.

### Animaciones (las definidas en el JSX)
- Toggle: `transition: left 0.2s` para el círculo del knob.
- Resto: estáticas. **No añadas animaciones nuevas** salvo que el usuario las pida.

### Modal — clic fuera
El backdrop cierra el modal al click. El JSX no lo define explícitamente (`onClose` se llama desde el botón close), pero implementa también click-on-backdrop como comportamiento estándar.

### Stepper modal — interactivo
En el JSX el stepper no avanza realmente (los 3 pasos se ven a la vez). En producción **debe ser realmente multi-step**: cliente → servicio → hora, con back/next. Pregunta al usuario el flujo exacto si tienes dudas.

### Filtros del rail Agenda
Click en un profesional → filtra las citas mostradas en la timeline. "Todos" muestra todas. Implementado con `selectedProf` state.

### Selección de cliente (Clientes)
Click en una fila → cambia el contenido del panel derecho.

---

## 14. Cosas que faltan / preguntas para el usuario

Esta lista es para que el desarrollador la confirme antes de empezar:

1. **Backend / DB**: ¿Supabase? ¿Postgres + Prisma? ¿Otro?
2. **Auth**: ¿qué proveedor? ¿Hay roles distintos a "Admin"?
3. **Vista "Informes"**: aparece en la sidebar pero **no está diseñada**. Pregunta si hace falta diseñarla o queda fuera del scope.
4. **Vista mobile real**: el mock actual usa `<div>` para simular iOS. ¿El target real es **React Native** (nativo) o **PWA mobile-first** (web responsive)?
5. **Multi-step modal**: ¿el flujo real es Cliente → Servicio → Hora, o todo en una pantalla como el mock?
6. **Idioma / i18n**: ¿solo español o multi-idioma?
7. **Tema claro**: hay opción "Claro" en Configuración pero **el diseño claro no existe**. ¿Implementar tema claro o eliminar la opción del UI?
8. **Estados de la cita**: ¿el usuario puede cambiar el estado (pendiente → confirmada → completada) desde la timeline? ¿Cómo?
9. **Notificaciones SMS / Email**: están en Config pero ¿qué proveedor usar (Twilio, Resend)?

---

## 15. Lista de archivos en este bundle

```
design_handoff_hairy/
├── README.md                    ← este documento
├── source/                      ← código fuente del prototipo (fuente de verdad)
│   ├── Hairy Redesign.html      ← entry point desktop (4 pantallas + modal)
│   ├── Hairy Mobile.html        ← entry point mobile (4 pantallas iOS)
│   ├── design-canvas.jsx        ← componente del canvas (no portar — solo para presentación)
│   └── screens/
│       ├── shared.jsx           ← TOKENS + seed data + Sidebar + Pill + Btn + Topbar + iconos
│       ├── agenda.jsx           ← ScreenAgenda + DayTimeline + Stat + ProfRow + ViewTab
│       ├── clientes.jsx         ← ScreenClientes + Avatar + MiniStat + Section
│       ├── equipo.jsx           ← ScreenEquipo
│       ├── config.jsx           ← ScreenConfig + EditServiceModal + ModalShell + FormField
│       ├── modals.jsx           ← NuevaCitaModal
│       └── mobile.jsx           ← PhoneFrame + MobileTabBar + Mobile{Agenda,Clientes,Equipo,Config}
└── screenshots/                 ← capturas de referencia (ver índice abajo)
    ├── 01-desktop-agenda.png
    ├── 02-desktop-clientes.png
    ├── 03-desktop-equipo.png
    ├── 04-desktop-config.png
    ├── 05-modal-nueva-cita.png
    ├── 06-mobile-agenda.png
    ├── 07-mobile-clientes.png
    ├── 08-mobile-equipo.png
    └── 09-mobile-config.png
```

> **Tip para abrir el prototipo en local**: necesitas servir la carpeta `source/` con un servidor estático (los `<script type="text/babel">` no se cargan desde `file://`). Por ejemplo: `cd source && npx serve` y abre `http://localhost:3000/Hairy Redesign.html`.

---

## 16. Checklist final antes de marcar como hecho

- [ ] Las 4 pantallas desktop pixel-match las capturas (compara lado a lado).
- [ ] Las 4 pantallas mobile pixel-match las capturas.
- [ ] Modal "Nueva cita" pixel-match.
- [ ] Sidebar siempre visible en desktop, con el item activo correctamente marcado en cada ruta.
- [ ] Tipografías Inter + Instrument Serif cargadas correctamente.
- [ ] Tokens de color aplicados sin desviaciones.
- [ ] Colores específicos de profesional, estado y tag respetados.
- [ ] Datos seed reemplazados por queries reales.
- [ ] **Ningún elemento extra inventado**. Si algo te parece incompleto, vuelve a §14 y pregunta.
