# 📋 INFORME / PROMPT — Sistema de diseño premium "Mecha" para la Agenda de Hairy

> **Propósito:** este documento es la especificación completa y cerrada de los diseños seleccionados
> para la agenda (rejilla día/semana, citas, estados, encadenados, reposos y estructura). Debe usarse
> como prompt de implementación en una sesión aparte. Todo lo aquí descrito fue validado visualmente
> en `design-demos/*.html` (prototipos de referencia: `agenda-premium-v3.html`, `mecha-final.html`,
> `agenda-cadenas-reposos.html`, `kinetic-cards.html`, `mecha-estados.html`).
>
> **Regla de oro de verificación:** cada cambio debe comprobarse VISUALMENTE en el navegador
> (capturas antes/después, dos frames separados ~1.5s para confirmar animaciones) — nunca dar por
> bueno un cambio solo por el código.

---

## 0. Contexto de arquitectura (dónde se implementa)

| Pieza | Archivo | Detalle |
|---|---|---|
| Rejilla día (web) | `components/agenda/AgendaCalendar.web.tsx` | CSS Grid `56px repeat(N, minmax(MIN_COL_W,1fr))`, `ROW_H=160px/hora`, columna horas sticky |
| Agenda nativa | `components/agenda/AgendaCalendar.tsx` | timeline por profesional, `borderLeftWidth:3` |
| Tarjeta de cita (lista/semana) | `components/agenda/AppointmentCard.tsx` | estados con `ESTADO_COLORS` |
| Tokens | `lib/designTokens.ts` | única fuente de color |
| Movimiento web | `lib/motion.tsx` | keyframes + clases `.m-*`, curva `cubic-bezier(.16,1,.3,1)` |
| Estados de cita | `lib/constants.ts` (`CITA_STATUS`) + `lib/citasEstadoUi.ts` | |
| Encadenadas | `grupo_id` + `orden_en_grupo` (AgendaCalendar ~7774) | |
| Reposo de cita | `fin_activa` / `fin_espera` (~7779–7890) | tramo interno: cliente puesta, profesional libre |
| Bloqueos | `bloqueos_profesional.tipo` (`descanso`, `reserva_temporal`, …) | NO confundir con reposo |

**Adaptación:** los prototipos usan 96px/hora y 780px de ancho fijo; en la app real se respeta la
estructura actual (`ROW_H=160`, `MIN_COL_W`, columna de 56px) — todas las medidas del informe se
expresan como reglas proporcionales cuando aplica.

---

## 1. Sistema de color — coherencia Mecha (AUDITADO)

**Solo tokens de `designTokens.ts`. Queda prohibido introducir colores foráneos.**

| Uso | Valor |
|---|---|
| Fuego (primario/citas normales) | `#f4501e` · hi `#c0260a` · gradiente `linear-gradient(135deg,#e0340e,#ff7a2e 55%,#ffcf4a)` |
| Success (cobrada/confirmada) | `#0f9d6b` |
| Warning (pendiente/sin cobrar) | `#e08a00` |
| Danger (cancelada/no presentada/vencida) | `#e23b34` |
| Texto | `#1c1814 / #5c5249 / #736658 / #b3a89d` |
| Fondo/tarjeta/panel | `#f6f1ea / #ffffff / #fffdfb` |
| **Cadena A "brasa"** | estático `linear-gradient(120deg,#7a3e1d,#c77b3a 45%,#e8a54b)` — familia cálida, NO compite con fuego |
| **Cadena B "humo"** | estático `linear-gradient(120deg,#6b6258,#a99e90 45%,#c9bda9)` — familia txt3 |
| **Línea de flujo cadena A** | gradiente `#c0260a → #ffcf4a → #c0260a` (stroke SVG `url(#beamA)`) |
| **Línea de flujo cadena B** | gradiente `#736658 → #c9bda9 → #736658` |

Decisiones cerradas:
- Completada usa `success #0f9d6b` (NO `#22c55e`).
- No-presentada usa `danger #e23b34` (NO `#ef4444`).
- Las cadenas se distinguen entre grupos por **gradiente brasa vs humo** + numeración `1/3`, no por colores ajenos.
- Canon de movimiento: **hover eleva · click hunde · la velocidad de animación ∝ urgencia**. Reposo y cadenas = lentas y serenas.

---

## 2. Estructura de la agenda (REJILLA) — se mantiene la actual

**Decisión: la estructura actual NO se cambia** (columnas por profesional, columna de horas sticky,
hairlines existentes). Solo dos añadidos:

### 2.1 Redondeo ligero
- Contenedor de la rejilla: `border-radius: 14px` (hoy ya lo tiene el wrapper; asegurar esquinas
  ligeramente redondeadas en tarjetas/citas: 9–10px, paneles 12px, chips 6–8px, píldoras 999px).

### 2.2 Borde del contenedor con degradado animado (aura Mecha) ⭐
Un aura fuego/dorado recorre lentamente el perímetro del contenedor de la agenda:

```css
@property --ang { syntax:'<angle>'; initial-value:0deg; inherits:false }
.agendaWrap::before {
  content:''; position:absolute; inset:0; border-radius:14px; padding:1.6px;
  z-index:30; pointer-events:none;
  background:conic-gradient(from var(--ang,0deg),
    rgba(244,80,30,0) 0deg,   rgba(244,80,30,0) 120deg,
    rgba(255,207,74,.9) 165deg, rgba(244,80,30,.95) 190deg,
    rgba(224,52,14,.9) 215deg, rgba(244,80,30,0) 260deg, rgba(244,80,30,0) 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude;
  animation:borderspin 7s linear infinite;
}
@keyframes borderspin { to { --ang:360deg } }
```
- 7s/vuelta, discreto. En React Native (no soporta conic): fallback a borde estático `borderHi`.

### 2.3 Cabecera de profesional (mejora admitida)
Avatar circular 28px con gradiente del color del profesional + nombre + contador
(`3 citas · 85% ocupada`, cifra de ocupación en `fire-hi`). Hover: tinte `rgba(244,80,30,.03)`.

---

## 3. Cita normal (bloque en la rejilla)

- Fondo: gradiente fuego (o color de categoría si se activan categorías, ver §7).
- `border-radius:10px`, padding `7px 9px`, sombra `0 1px 3px rgba(28,24,20,.10)`.
- **Anti-solape (obligatorio en todos los bloques):**
  1. Nombre y detalle: `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` — un texto largo se corta con "…", jamás rebasa.
  2. Chips/badges anclados a esquinas **con padding reservado** en el bloque (no flotan sobre texto).
  3. Hover: solo `box-shadow`+`filter:brightness(1.04)`+`z-index:9` — **nada se desplaza ni empuja vecinos**.
  4. Separación vertical mínima entre bloques: 4px.
  5. Índice de cadena / marcas: esquina inferior-derecha con ~18px de `padding-bottom` reservado.
  6. Texto centrado verticalmente (`justify-content:center`) para que no quede "a la mitad".

---

## 4. Estados — variantes seleccionadas (CERRADO)

Orden de elección del usuario: **B, A, A, B, B, B, A, C, A, A.**

| # | Estado (`citas.estado`/derivado) | Variante | Especificación del movimiento |
|---|---|---|---|
| 1 | `pendiente` | **B · Reloj de arena** | 3 puntos (4px, ámbar `#e08a00`) cayendo en el chip superior derecho: `@keyframes fall` translateY(-4px→6px) opacidad 0→1→0, 1.5s, delays 0/.2/.4s |
| 2 | `confirmada` | **A · Brillo lento** | barrido `linear-gradient(115deg, transparent 35%, rgba(19,195,138,.12) 47%, rgba(255,255,255,.5) 50%, …, transparent 65%)`, `background-size:250% 100%`, 5s lineal infinito |
| 3 | En curso (derivada hora) | **A · Flujo rápido + progreso** | mismo barrido a 1.8s con tonos `rgba(255,207,74,.25)`; barra de progreso 4px abajo (`--p` %) con gradiente fuego; sombra `0 4px 14px rgba(244,80,30,.4)` |
| 4 | `completada` | **B · Doble check secuencial** | dos ✓ (`#22c55e`→ corregir a `#0f9d6b` y `#0f9d6b`) que aparecen con `popin` (scale 0→1, rotate -30°→0), delays .15s/.5s |
| 5 | Completada sin cobrar (`!cobrada`) | **B · Borde cargándose** | perímetro conic girando: `conic-gradient(from var(--a), transparent 0 62%, #e08a00 78%, #ffc24a 88%, transparent)`, mask content-box XOR, padding 2px, 3s lineal infinito |
| 6 | `cobrada=true` | **B · Candado** | SVG: cuerpo del candado `popin` .15s + arco que se dibuja (`stroke-dashoffset` 24→0) .6s delay .4s, color `#0f9d6b` |
| 7 | `cancelada` | **A · Tachada** | `filter:saturate(.25); opacity:.62`; línea roja 2px que la tacha (`scaleX 0→1` desde la izquierda, .6s, delay .3s); sin carril propio (como hoy) |
| 8 | `no_presentada` | **C · Viñeta** | box-shadow interno pulsante: `inset 0 0 0 1.5px rgba(226,59,52,.25)` ↔ `inset 0 0 22px rgba(226,59,52,.22)`, 2.8s ease-in-out |
| 9 | Vencida por resolver | **A · Sacudida** | shake breve cada ciclo: 2.6s, solo entre 86%–96% del ciclo (translateX ±2.5px), borde `rgba(226,59,52,.4)` |
| 10 | `reserva_temporal` (bloqueo) | **A · Hormigas en marcha** | borde `1.5px dashed rgba(124,58,237,.55)` + fondo `rgba(124,58,237,.03)`; el dashed alterna opacidad cada 1.2s (steps) — **excepción de color justificada: ya existe en `BLOQUEO_COLORS`** |

Notas:
- Los estados muertos (cancelada) no llevan animación perpetua: la tacha ocurre una vez.
- `finalizada` (solo frontend) y `no_show` (BD): unificar con `citasEstadoUi` para eliminar el fallback gris.

---

## 5. Encadenadas (`grupo_id`) — diseño final D3-v4 «una sola línea de flujo»

**Semántica:** cuando termina un servicio empieza el siguiente (mismo u otro profesional). Puede
haber varios grupos a la vez y cadenas que cruzan profesionales.

### 5.1 Elementos
1. **Bloques de cadena: ESTÁTICOS.** Gradiente brasa (grupo A) o humo (grupo B). Sin animación en
   el bloque — el movimiento es lenguaje exclusivo de los estados. Sombra suave
   (`0 2px 8px rgba(160,90,20,.35)` brasa / `0 1px 4px rgba(28,24,20,.18)` humo).
2. **UNA línea de flujo por cadena** que recorre TODO el trayecto:
   - Path SVG único: baja por el borde izquierdo de la columna del primer tramo → curva/esquina
     horizontal hacia la columna del siguiente → baja → … → termina en flecha ▼ del último.
   - Dos capas: **base** (mismo path, `opacity:.22`, sólido) + **flujo** (`stroke-dasharray:10 8`,
     gradiente brasa/humo, `animation:flowmove 1s linear infinite; stroke-dashoffset:-18`).
   - `stroke-width:3`, `stroke-linecap:round`, z-index por debajo de los bloques (2 vs 3).
3. **Nodos** (9px, sobre la línea): inicio = cuadrado lleno (brasa `#c0260a` / humo `#736658`);
   continuación = círculo con borde 2.5px; cierre = cuadrado claro. Alineados exactamente al
   inicio/fin de cada tramo (verificación en captura).
4. **Flechas de dirección:** triángulo sólido al final de cada tramo horizontal/vertical, apuntando
   AL bloque destino (nunca "a la nada").
5. **Índice de posición:** chip `1/3 · 2/3 · 3/3` (8px, fondo `rgba(255,253,251,.28)`) esquina
   inferior derecha, con `padding-bottom:18px` reservado en el bloque.
6. **Sin etiquetas de origen** ("viene de Ana…"): el propio recorrido lo comunica.

### 5.2 Geometría (regla para la app real)
- La línea corre a `8px` del borde izquierdo de cada columna; los bloques de cadena arrancan a
  `24px` (margen reservado de 16px — el texto jamás toca la línea).
- Tramos horizontales del flujo en el hueco temporal exacto entre fin de un bloque e inicio del
  siguiente (si hay gap de tiempo, la línea lo recorre igual: la cadena persiste).
- En React: calcular el path con las posiciones ya conocidas de los bloques (mismo sistema de
  coordenadas del grid; en web se puede dibujar un `<svg>` overlay absoluto sobre `.cols`).

### 5.3 Verificación exigida
- Captura de pantalla: la línea debe conectar visualmente TODOS los bloques del grupo, nodos alineados, flechas apuntando a bloques.
- Dos frames a 1.5s: deben diferir (flujo corriendo).

---

## 6. Reposos (tramo interno de la cita) — se mantiene el diseño actual

**Se mantiene la franja rayada existente** (patrón actual del software), con estos blindajes:

1. **Franja dentro del bloque:** `repeating-linear-gradient(-45deg, rgba(255,253,251,.96) 0 8px, rgba(115,102,88,.13) 8px 16px)`, borde `1.5px dashed rgba(92,82,73,.55)`, radius 8px, inset `9px` laterales.
2. **Contenido:** icono ☕ (círculo 21px, fondo `#736658`) + texto `REPOSO · 45 min / Ana libre 10:15–11:00 · tinte actuando` (9px/8px, bold) — con `nowrap+ellipsis`.
3. **Tramos activos etiquetados:** `▶ ACTIVA 9:15–10:15` arriba y `▶ ACTIVA 11:00–12:15` abajo (7.5px, `rgba(255,255,255,.9)`) en zonas sin contenido del bloque.
4. **Interactivo (hueco vivo):**
   - Hover: `filter:brightness(1.04)` + aparece `＋` verde (11px) con 26px reservados a la derecha.
   - Click → popover: ✨ Sugerir clienta de lista de espera · 👤 Agendar aquí · 🔒 Reservar hueco · ✂️ Dividir.
   - **Drop-zone:** acepta drag de una clienta (lista de espera); estado drag-over = outline verde 2.5px + glow pulsante (`dropglow` 1s). Al soltar se crea la cita dentro del hueco.
5. **Huecos libres** (entre citas): píldora `LIBRE` con borde `1.5px dashed rgba(15,157,107,.5)`, fondo `rgba(15,157,107,.04)`, ＋ pulsante (`breathslot` 2.6s), cursor grab, mismo drop-zone.
6. **NO confundir** con bloqueo `descanso` (ámbar, sistema de bloqueos) — lenguajes separados.

---

## 7. Categorías de servicio (insignias por color) — opcional pero especificado

- Insignia chip + borde superior 3px de la card con el color de categoría:
  Corte `#f4501e` (gradiente fuego) · Color `#8a5cf6` · Barba `#736658` · Peinado `#ec4899` ·
  Tratamiento `#0f9d6b` · Ritual `#3b82f6`.
- El color de categoría responde a "qué trabajo"; el chip/estado a "en qué va". Nunca mezclar: el
  estado usa su gradiente/borde, la categoría solo el top-border + insignia.

---

## 8. Tarjetas de cita para vistas de lista/semana (`AppointmentCard.tsx`)

Mismos estados de §4 aplicados a la card (chip superior derecho, `border-top:3px` de categoría).
Estructura: nombre + servicio | hora bold + duración | badges. Hover eleva 2px, nunca desplaza.

---

## 9. Checklist de implementación y no-regresión

- [ ] Tokens: cero colores fuera de `designTokens.ts` (grep de `#22c55e|#ef4444|#8a5cf6` fuera de categorías/cadena según §1 y §7).
- [ ] Estructura actual intacta (grid, ROW_H=160, sticky hours, MIN_COL_W).
- [ ] Borde animado del contenedor (§2.2) + redondeos ligeros.
- [ ] 10 estados con su variante exacta (§4) y velocidades según urgencia.
- [ ] Cadena D3-v4: línea única + nodos + flechas + bloques estáticos (§5).
- [ ] Reposo interactivo + drop zones + popover (§6).
- [ ] Anti-solape: pasar por los 6 puntos de §3.3 en CADA tipo de bloque (incluye textos largos de prueba: "Inés R. · Peinado de gala con rulos…").
- [ ] Verificación visual en navegador de TODO (capturas antes/después; pares de frames para animaciones).
- [ ] `px tsc --noEmit` en segundo plano antes de dar el cambio por listo (regla del workspace).
- [ ] No arrancar servidores en puertos alternos; si el dev server del usuario se detiene, pedirle que lo reinicie en su puerto original.

---

*Documento generado a partir de las demos validadas en `design-demos/`. Prototipo maestro final:
`agenda-premium-v3.html` (estructura + borde animado + cadena v4 + reposo blindado).*
