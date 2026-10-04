# Spec de Jose: cola/boda, encadenamiento y bloqueos — 5 oct 2026

Fuente: nota de voz de Carlos + foto del bug de Jose (cadena de 4 eslabones con
las líneas del riel cruzadas por encima de las tarjetas y un nodo flotando sobre
la cabecera). Todo verificado en la demo local contra el build nuevo.

## Qué se pidió y qué se hizo

### 1. Emojis fuera de los botones de la agenda

- `AgendaCalendar.web.tsx`: «💈 Cola del día» pasa a icono SVG `list` y
  «👰 Grupo / Boda» a icono `cake` (del catálogo `ui/Icon.web.tsx`).
- `ColaDiaPanel.web.tsx`: la cabecera del panel pierde el 💈.
- El modal de grupo pierde el 👰 del título, el de «Novia» y el ⏱ de duración.

### 2. Modal de Grupo/Boda rehecho

`components/agenda/modals/ReservaGrupoModal.web.tsx`:

- **Combos con buscador** (`ComboBuscador`, local al fichero) para Servicio,
  Profesional y **Cliente** (nuevo: la ficha es opcional, «Sin ficha» por
  defecto; al elegirla rellena el nombre si este era el por defecto). Busca
  normalizando acentos; Enter elige el primero; Esc y clic fuera cierran; al
  hacer scroll en el modal el popover se cierra para no quedar despegado.
  El popover es `position:fixed` porque el cuerpo del modal recorta
  (`overflow:auto`) un popover absoluto.
- **Duración arreglada de raíz**: el catálogo (`lib/datos/catalogo.ts`) no
  tiene campo `duracion`; la duración real es `activa + espera + extra` (la
  misma suma que NewCitaModal). El código viejo leía `s.duracion` → las
  opciones mostraban «undefined′» y TODAS las duraciones caían al default
  (60/45). Ahora `duracionServicioMin()` hace la suma canónica y la duración
  es un input editable en escritorio y móvil (se resincroniza al cambiar de
  servicio).
- **Columnas alineadas por construcción**: cabecera y filas comparten la
  constante `GRID_COLS`; antes cada una llevaba su plantilla y «Duración»
  acababa visualmente sobre el selector de profesional (lo de la spec). Modal
  ensanchado a 920px con columna de Cliente.
- Validación nueva: si un integrante no tiene servicio o profesional, el
  submit se detiene con un mensaje concreto (antes la RPC fallaba por FK).
- `cliente_id` ya viaja en el payload cuando se elige ficha (antes siempre
  null: el prop `clientes` se recibía y no se usaba).

### 3. «Se cruzan cosas con el dashboard y las bodas» → riel de cadenas

No hay página de bodas aparte ni estado compartido dashboard↔agenda (el tab
inicial `app/(tabs)/index.tsx` ES la agenda). Lo que se cruza — y lo que
muestra la foto de Jose — es el **ChainFlowOverlay**: una cadena legítima de
4 eslabones (misma clienta, marcas «1/4…4/4») con cables por ENCIMA de las
tarjetas y geometría descontrolada. Tres causas:

1. **z-index invertido**: el overlay pintaba a z-5 y el contenedor de citas a
   z-3 → las líneas atravesaban el texto de las tarjetas (el comentario del
   código ya decía que iba debajo).
2. **Geometría recalculada a mano**: `xDeCita` reproducía columna × carril ×
   ROW_H por su cuenta; cualquier caso no contemplado (profesional oculto →
   `findIndex` -1 → columna 0; cita anidada en un reposo; desfases de carril)
   ponía el riel donde no había tarjeta y el cable cruzaba la rejilla entera.
3. **Curvas sin tope**: `dy = |Δt|·0.45` sin límite hundía el cable media
   rejilla con dos horas de espera.

**Arreglo** (`ChainFlowOverlay.web.tsx`, reescrito): la única fuente de
verdad ahora es la **tarjeta renderizada** — se localiza por el gancho
`data-mecha-cita` (AppointmentCard) y se mide con `getBoundingClientRect`.
Si la tarjeta no está en el DOM, ese eslabón no dibuja nada: la línea une lo
que se ve. Riel a 12px a la izquierda del borde de su tarjeta (dentro del
`CHAIN_GUTTER` que la propia tarjeta reserva), recortado a los límites de la
rejilla; cables con curva acotada (dy ∈ [12,40]); overlay a z-2, por debajo
de las citas. Re-mide tras cada render (rAF), al redimensionar (ResizeObserver)
y al mutar la rejilla (MutationObserver con guarda de firma: no buclea).
Las clases `mch-*` (definidas en `lib/motion.tsx`, montadas en `_layout`)
siguen siendo las de siempre: riel rayado en carbón cálido, nodos y punto
dorado viajero.

Además, `esReservaGrupo()` (lib/agenda/cadena.ts) gana la **regla de solape
temporal**: dos eslabones del mismo grupo que se solapan en el tiempo no
pueden ser una cadena (una clienta no está en dos sillas a la vez) → se
trata como reserva de grupo aunque las notas hayan perdido la marca «(Grupo)»
y no haya varias fichas. Así un grupo de boda sin marca jamás dibuja cables
cruzando sillas. Los extremos que se tocan (fin de uno = inicio del siguiente)
NO cuentan como solape. 3 tests nuevos (12/12 en verde).

### 4. Bloqueos demasiado oscuros con el salón cerrado

`ProfessionalColumn.web.tsx`: la banda de «salón cerrado» pintaba un velo
negro al 46–38% **encima** de todo (se apilaba la última). Ahora:

- El orden de apilado es `salonCerrado → fueraJornada → pausas → bloqueos`:
  los bloqueos reales (vacaciones, ausencias) van ENCIMA del velo.
- El velo baja a 18–12%: sigue leyéndose «cerrado» por el borde rojo y la
  etiqueta, pero no negro el día.

### 5. Lo que NO cambia

- La RPC `crear_reserva_grupo_hacia_atras` no se toca (ya marca notas con
  « (Grupo)»). Sin migraciones en esta tanda.
- La creación desde Presupuestos queda como está («así está bien»).

## Verificación

- `npx tsc --noEmit` limpio.
- `npm run vigilar:rapido`: 0 bloqueantes (285 avisos heredados).
- `npm run test:componentes`: 6/6.
- `deno test lib/agenda/cadena.test.ts`: 12/12.
- `expo export -p web`: compila.
- **Demo local (verificación visual con navegador)**: cabecera con iconos SVG
  y sin emojis; modal con columnas alineadas, los tres combos con buscador,
  duración editable y duraciones reales («Mechas Balayage + Matiz 120′»,
  «Color Raíz + Peinado 90′»…); filtro del combo probado («color» → 1
  resultado). No se guardó ninguna reserva (se cerró con Cancelar; 11 citas
  antes y después).

## Límites conocidos

- El «cruce dashboard/bodas» queda cubierto por el fix del riel + la regla de
  solape. Si Jose lo reproduce de otra forma (p. ej. dos pestañas del
  navegador), falta una captura para perseguirlo.
- El riel no persigue la tarjeta mientras se arrastra (se actualiza al
  soltar, igual que antes); medir en cada mousemove costaría más de lo que
  aporta.
