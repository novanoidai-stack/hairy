# Peticiones de Jose — 6 sep 2026

Lista dictada por el socio, **contrastada punto por punto contra el código y
contra la base de datos de producción** (`vtrggiogjrhqtwbhbgia`) antes de
planificar nada.

**Estado: plan, no implementación.** No se ha tocado una línea de código.

---

## 0. Cómo se ha hecho esto, y por qué importa

Cada punto lleva tres cosas separadas a propósito:

- **Pide** — lo que dijo Jose, sin interpretar.
- **Hoy** — lo que hay, con fichero y línea, o con la consulta que lo demuestra.
- **Trabajo** — lo que habría que tocar.

La separación no es burocracia. **Cinco de las catorce peticiones cambian de
forma al mirar el código**, y dos de ellas ya estaban construidas. Si se
implementan "como se pidieron" se reconstruye lo que ya existe y se deja intacta
la causa real.

Números medidos el 6 sep 2026 contra producción, no recordados.

---

## 1. Resumen: las 14 peticiones y su estado real

| # | Petición | Estado real | Tanda |
|---|---|---|---|
| 1 | Cita en día cerrado: avisar, no bloquear | Bloqueo en 3 sitios | 3 |
| 2 | Modificar precio antes de cobrar | **Ya existe, capado** ⚠️ | 2 |
| 3 | Cobro rápido con servicios | Solo productos | 2 |
| 4 | Extras sin tiempo | **Ya existe; su salón no lo usa** ⚠️ | 0 |
| 5 | Añadir servicios desde la línea de caja | = 3 | 2 |
| 6 | Menú "qué crear" al clicar la agenda | Todo existe, falta el atajo | 3 |
| 7 | Solape forzado con aviso | **Lo impide Postgres** ⚠️ | 3 |
| 8 | Ver la agenda al crear cita | Una línea CSS | 1 |
| 9 | Preview cinemático | Aplazado por Jose | — |
| 10 | Cobrar cita con servicios/extras | = 3 | 2 |
| 11 | Scroll incómodo del buscador | = 3 | 1 |
| 12 | Caja a "uso diario" | Solo escritorio ⚠️ | 1 |
| 13 | Esenciales más resaltados | Color plano | 1 |
| 14 | Gastos completos + P&L | 8 columnas, 5 filas | 4 |

---

## 2. Los cinco hallazgos que reescriben la lista

### ⚠️ A — "Los extras me ocupan tiempo": el motor ya está bien, su salón no lo usa

Los add-ons (`service_addons`) **son solo dinero desde el 1 sep**
(`20260901153000_addons_solo_dinero.sql`). El código lo dice en dos sitios
independientes: [NewCitaModal.web.tsx:923](components/agenda/modals/NewCitaModal.web.tsx#L923)
("no suman duracion ni bloquean agenda") y
[CobroSheet.tsx:245](components/pos/CobroSheet.tsx#L245).

Medido: **12 add-ons en toda la base, los 12 con `duracion_min = 0`.**

El problema es de datos:

| Salón | Add-ons | Servicios activos |
|---|---|---|
| `demo_salon_001` | **12** | — |
| `florent_surez_peluqueros_15004` (Jose) | **0** | **78** |

Su catálogo se importó con **todo como servicio**. Lo que él llama extras son
servicios con duración, y por eso colisionan:

| Servicio | Precio | Duración |
|---|---|---|
| `Decode Zero /Espuma/ Protector termico` | 5,50 € | **15 min** |
| `Mascarilla` | 10,00 € | **15 min** |
| `Secado espres` | 15,00 € | **15 min** |

No hay nada que arreglar en el cálculo de agenda. Hay que **llevar esas líneas a
`service_addons`** — y eso, hoy, no se puede hacer bien. Ver §3.

### ⚠️ B — "Modificar el precio antes de cobrar": ya está, pero capado a un caso

Construido el 1 sep: `20260901161500_editar_importe_y_addons_en_cobro.sql` +
[CobroSheet.tsx:238](components/pos/CobroSheet.tsx#L238). El importe editado
viaja como `p_base_cents` y queda auditado en `cobros` y `cobro_lineas`.

La condición que lo esconde:

```ts
const puedeEditarBase = props.mode === 'cita'
  && props.citaIds.length === 1
  && !usarBono;
```

**Tres puertas cerradas:** con dos o más citas seleccionadas, cobrando con bono,
o en venta suelta, el campo no aparece. Cualquiera de las tres explica que Jose
lo dé por inexistente. El trabajo es levantar límites y hacer visible el
afford­ance, no construir la función.

### ⚠️ C — "No bloquear solapamientos": hoy lo impide la base de datos

No es una validación de formulario. Es una `EXCLUDE USING gist`:

```sql
alter table public.citas
  add constraint citas_solape_profesional_excl
  exclude using gist (profesional_id with =, ventanas_ocupadas with &&)
  where (estado <> 'cancelada' and grupo_id is null
     and profesional_id is not null
     and inicio >= '2026-08-31 22:00:00+00');
```

Postgres rechaza el INSERT con **23P01**, que `lib/errores.ts:183` traduce como
*"Ese horario se solapa con otra reserva"*.

Ese candado se ha roto y re-arreglado **tres veces en seis días**
(`20260831220000` → `20260901153828` → `20260905233000`). Existe porque un
trigger no da la garantía: dos reservas simultáneas pasarían las dos, ya que un
trigger no ve la fila que otra transacción aún no ha confirmado. El índice sí.

**La buena noticia: la salida ya está inventada dentro del propio constraint.**
Su `WHERE` exime a `grupo_id is not null` — ya hay un caso donde el solape es
legítimo y sale del índice. Se replica con una columna `solape_forzado`.

**El precio, que hay que aceptar conscientemente:** una fila fuera del índice
parcial no participa en el candado *en ninguna dirección*. Una cita forzada no
solo puede solaparse: **tampoco impide que otra se le ponga encima después.**
"Forzada" significa, literalmente, fuera del candado. No hay término medio con
un índice parcial.

**Y la mejor noticia: la parte visual ya está hecha.** La agenda tiene un
repartidor de carriles completo —
[Timeline.web.tsx:967-1010](components/agenda/views/timeline/Timeline.web.tsx#L967) —
que ya pinta lado a lado las citas que se solapan (`_lane` / `_totalLanes`). La
duda de Jose *"¿cómo se va a ver la agenda?"* está resuelta desde antes de
preguntarla. Falta solo **marcar** el solape forzado, no maquetarlo.

### ⚠️ D — El vigilante de solapes está midiendo mal, y sobre-avisa

`vigilancia_bd_invariantes()` cuenta pares solapados así:

```sql
tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin)
```

**El bloque entero.** Pero la ocupación real de una cita no es su bloque: durante
el reposo el profesional está libre, y encajar otra clienta ahí es el
diferencial nº 1 del producto. Es exactamente el error que ya se corrigió *dos
veces* en el constraint — y que sigue vivo en el vigilante.

Medido hoy:

| Método | Pares |
|---|---|
| Bloque entero (lo que usa el vigilante) | **31** |
| Ocupación real (`ventanas_ocupadas`) | **24** |
| **Falsos positivos** | **7** |

Esos 7 son citas correctamente anidadas en un reposo. El vigilante las denuncia
como error. Y el `WHERE` no filtra por la fecha de corte, así que **avisa de 24
pares históricos que son deuda congelada e intocable**: un aviso que no baja
nunca es un aviso que se deja de mirar.

Tras el corte del 31 ago: **0 pares**. El candado aguanta.

> Esto no lo pidió Jose. Sale de mirar el punto 7, y hay que arreglarlo **antes**
> de tocar los solapes: si se permite el solape forzado sin corregirlo, el
> vigilante se llena de ruido y deja de servir justo cuando más falta hace.

### ⚠️ E — La columna `duracion_min` de los add-ons miente

```
duracion_min  smallint  NOT NULL  DEFAULT 10
```

El sistema entero ignora esa columna (los add-ons no ocupan agenda), pero el
formulario de Ajustes sigue pidiéndola
([configuracion.web.tsx:6049](app/(tabs)/configuracion.web.tsx#L6049)) y **la
columna nace con 10**. Todo add-on nuevo se crea diciendo que dura 10 minutos y
el sistema lo ignora en silencio.

Hoy no rompe nada. Romperá el día que alguien decida fiarse de esa columna.

---

## 3. La migración de extras a add-ons (opción elegida)

Elegida: **migrar el catálogo de Jose a `service_addons`**. Es lo que son
conceptualmente y el motor ya los trata bien. Pero el modelo actual no lo
soporta tal cual, y esto hay que saberlo antes de prometer fecha.

### El obstáculo

```
service_addons.servicio_id  uuid  NOT NULL
```

**Un add-on pertenece a UN servicio.** Para ofrecer "Espuma" en los 78 servicios
de Jose harían falta **78 filas** — que hay que mantener a mano una por una cada
vez que cambia el precio.

### Las tres salidas

| Opción | Qué implica | Veredicto |
|---|---|---|
| **Abanico**: N filas por servicio | 78 filas por extra, mantenidas a mano | **No.** Invariante repartido de manual |
| **`servicio_id` nullable** = add-on global del salón | Migración + tocar los `.eq('servicio_id', …)` | **Sí.** Cambio pequeño, modelo correcto |
| Tabla `extras` nueva a nivel de negocio | Duplica un concepto que ya existe | No |

**Recomendado: `servicio_id` nullable.** `null` = "vale para cualquier servicio".
Los cargadores pasan de `.eq('servicio_id', X)` a
`.or('servicio_id.eq.X,servicio_id.is.null')`. Son 4 sitios
([configuracion.web.tsx:5617](app/(tabs)/configuracion.web.tsx#L5617),
[NewCitaModal.web.tsx:807](components/agenda/modals/NewCitaModal.web.tsx#L807),
[DetalleCitaModal.web.tsx:1107](components/agenda/modals/DetalleCitaModal.web.tsx#L1107),
[CobroSheet.tsx:254](components/pos/CobroSheet.tsx#L254)).

### Trabajo, en orden

1. Migración: `servicio_id` nullable + `duracion_min` default a `0` (hallazgo E).
2. Los 4 cargadores aprenden a leer add-ons globales.
3. Ajustes: poder crear un add-on de salón, no solo colgado de un servicio.
4. **Con Jose**: decidir cuáles de sus 78 servicios pasan a extras. Es una
   decisión suya sobre su catálogo — nosotros no sabemos si "Mascarilla" se
   vende suelta.
5. Script de migración del catálogo, reversible.

**El paso 4 es el que manda el calendario, y no depende de nosotros.**

### Además, en la demo hay add-ons duplicados

`Ampolla de brillo` ×3, `Tratamiento hidratante` ×3, `Recogido sencillo` ×2.
Bug de siembra. Menor, pero se ve en el escaparate.

---

## 4. Ficha por punto

### 1 · Cita en día cerrado: avisar, no bloquear

**Hoy — dos puertas distintas, no una:**

- **Cierre del salón**: `cierreDelDia`
  ([NewCitaModal.web.tsx:409](components/agenda/modals/NewCitaModal.web.tsx#L409))
  no bloquea al guardar: **no ofrece ninguna hora**
  ([:3384](components/agenda/modals/NewCitaModal.web.tsx#L3384)). El efecto es el
  mismo, el arreglo no.
- **Horario del profesional**: `validarHorarioLaboral` (`lib/horarios.ts:41`) sí
  bloquea al guardar, en **dos** sitios:
  [NewCitaModal:1191](components/agenda/modals/NewCitaModal.web.tsx#L1191) y
  [DetalleCitaModal:1544](components/agenda/modals/DetalleCitaModal.web.tsx#L1544).

**Trabajo:** que la rejilla ofrezca las horas marcadas como "fuera de horario" en
vez de esconderlas, y que los dos `return` pasen a confirmación. Mismo patrón
que el punto 7 → conviene hacerlos juntos.

**Fuera de alcance:** el portal público. Que una clienta reserve sola un día
cerrado no es lo que pidió Jose, y `disponibilidad_publica` es otra cadena.

### 2 · Modificar precios antes del cobro
Ver ⚠️ B. Levantar las tres puertas de `puedeEditarBase`. Con bono hay que
decidir qué significa editar el importe (¿descuenta sesión igual?): **preguntar**.

### 3 · Cobro rápido con servicios · 5 · Desde la línea de caja · 10 · Al cobrar la cita · 11 · El scroll

Los cuatro son **el mismo componente**. Hoy el picker carga **solo productos**:

```ts
// CobroSheet.tsx:193
.from('productos').select('id, nombre, categoria, precio_cents, codigo_barras')
```

`crear_cobro_walkin` acepta `p_lineas jsonb` con líneas libres, así que **el
servidor ya admite cobrar cualquier cosa**: el límite es del selector.

**Trabajo:** un picker que se nutra de `productos` + `servicios` + `service_addons`
con píldoras de tipo, en modal ancho y lista virtualizada (resuelve el 11). Un
solo trabajo, cuatro peticiones.

### 6 · Menú "qué crear" al clicar la agenda

**Hoy:** el clic abre directo `NewCitaModal`. Los bloqueos se crean **solo desde
Equipo** ([equipo.web.tsx:479](app/(tabs)/equipo.web.tsx#L479)).

**Existe ya:** `bloqueos_profesional`, **133 filas**, tipos reales en producción:
`baja`, `descanso`, `formacion`, `reunion`, `vacaciones`. La agenda ya los carga
([AgendaCalendar.web.tsx:360](components/agenda/AgendaCalendar.web.tsx#L360)).

Los dos ejemplos de Jose ya tienen tipo: *"para comer"* → `descanso`; *"salir al
médico"* → `baja`. **No hace falta inventar nada**: es un menú entre el clic y el
modal. Riesgo bajo, valor alto.

### 7 · Solape forzado
Ver ⚠️ C y ⚠️ D. Tres mitades:

- **Servidor**: columna `solape_forzado` + `WHERE` del constraint + arreglar el
  vigilante (⚠️ D) **antes**.
- **Cliente**: hay **cinco** pre-comprobaciones de solape repartidas —
  [AgendaCalendar:5514](components/agenda/AgendaCalendar.web.tsx#L5514),
  [DetalleCitaModal:2142](components/agenda/modals/DetalleCitaModal.web.tsx#L2142),
  [NewCitaModal:669](components/agenda/modals/NewCitaModal.web.tsx#L669) y
  [:1208](components/agenda/modals/NewCitaModal.web.tsx#L1208),
  [Timeline:782](components/agenda/views/timeline/Timeline.web.tsx#L782).
  Todas usan el mismo ayudante (`citaSolapaOcupacion`), pero **cada una decide
  por su cuenta qué hacer con el resultado**. Las cinco tienen que aprender a
  ofrecer forzar.
- **Visual**: el repartidor de carriles ya existe. Falta la marca de "forzado".

**Es el punto más caro de la lista y el que más puede romper.** No debería
compartir sesión con nada.

### 8 · Ver la agenda al crear la cita
`backdropFilter: blur(8px)` en
[NewCitaModal.web.tsx:1540](components/agenda/modals/NewCitaModal.web.tsx#L1540)
y [:1588](components/agenda/modals/NewCitaModal.web.tsx#L1588). Bajar el blur y
aligerar el velo. **Diez minutos.**

### 9 · Preview cinemático — aplazado
Aplazado por el propio Jose. Depende del 6 y del 8. Debe ir a `docs/superpowers/plans/`
cuando le toque, no aquí.

### 12 · Caja a "uso diario" — **solo es escritorio**

- **Escritorio**: `Caja` está en el grupo `Gestión`
  ([Sidebar.tsx:46](components/layout/Sidebar.tsx#L46)). Hay que moverla a
  `Operativa`.
- **Móvil**: **ya es la segunda pestaña**, justo después de Agenda
  ([MobileTabBar.tsx:28](components/layout/MobileTabBar.tsx#L28)).

Si Jose lo vio en el móvil, esta petición ya está cumplida ahí. Conviene
confirmarlo antes de tocar.

### 13 · Esenciales más resaltados
`GROUP_META` ([Sidebar.tsx:27](components/layout/Sidebar.tsx#L27)) aplica hoy
color plano: `'Operativa': { color: '#f4501e' }`. Pide degradado/realce. Con la
paleta de marca (`#f4501e` → `#c0260a`, `lib/designTokens.ts`).

### 14 · Gastos completos + P&L

**Hoy — la tabla entera:**

```
id · negocio_id · concepto · categoria · importe_cents · fecha
es_recurrente · created_at
```

Ocho columnas. Cuatro categorías fijas (`alquiler | suministros | producto |
otros`). **5 filas en toda la base de datos.** UI en
`components/informes/GastosSection.tsx`, 282 líneas.

No hay: proveedor, base imponible / IVA, método de pago, nº de factura,
adjunto, profesional asociado, notas, centro de coste.

**P&L: existe en forma mínima.** `margenAproximado = totalCobrado - totalGastos`
([informes.web.tsx:605](app/(tabs)/informes.web.tsx#L605)), pintado como
"Margen (aprox)" en [:1960](app/(tabs)/informes.web.tsx#L1960). No es crear:
es convertir un número suelto en un desglose.

**Trabajo:** migración de esquema + sección en Caja + P&L en Informes,
manteniendo el alta también desde Informes (Jose lo pidió en los dos sitios).

**Aviso serio:** IVA deducible y nº de factura tienen implicaciones contables.
`CLAUDE.md` ya avisa de que la caja fiscal M-CJ **no se improvisa**. Los campos
los define Jose o un fiscalista; nosotros no los inventamos.

---

## 5. Decisiones pendientes

1. **Extras** → resuelta: migrar a add-ons. Falta que **Jose diga cuáles** de sus
   78 servicios pasan (§3, paso 4).
2. **Solape forzado**: ¿quién puede forzar — cualquiera, o solo owner/admin? Y
   una cita forzada, ¿avisa para siempre en la agenda o solo al crearla?
3. **Editar precio con bono**: si se edita el importe cobrando con bono, ¿se
   descuenta sesión igual?
4. **Caja en el móvil**: ¿Jose lo vio en escritorio? En móvil ya está arriba.
5. **Campos de gastos**: los define Jose o un fiscalista.

---

## 6. Orden propuesto

| Tanda | Puntos | Por qué | Riesgo |
|---|---|---|---|
| **1 — pulido** | 12, 13, 8, 11 | Navegación y CSS. Se nota el mismo día. | Ninguno |
| **2 — picker de cobro** | 3, 5, 10, 2 | Un componente, cuatro peticiones. El servidor ya lo admite. | Bajo |
| **2bis — extras** | 4 | Migración + decisión de Jose. Puede ir en paralelo. | Medio (dato) |
| **3a — vigilante** | ⚠️ D | **Antes** de tocar solapes, o el ruido tapa lo nuevo. | Bajo |
| **3b — agenda permisiva** | 1, 6, 7 | Mismo patrón "avisar en vez de bloquear". Toca el candado. | **Alto** |
| **4 — gastos** | 14 | Esquema + P&L. Bloqueado por decisión 5. | Medio |
| **Aplazado** | 9 | Lo aplazó Jose. | — |

**Nota sobre la tanda 3b:** toca el candado de solapes, que se ha roto tres veces
en seis días, y toca cinco comprobaciones repartidas. Merece rama propia,
vigilante actualizado en el mismo commit y prueba de escritura real antes de
`master`.

---

## 7. Vigilantes que hay que tocar en el mismo commit

Del `CLAUDE.md`: *"Al añadir un invariante nuevo, añade su vigilante en el mismo
commit o la próxima deriva será silenciosa otra vez."*

| Cambio | Vigilante | Qué |
|---|---|---|
| `solape_forzado` | `vigilancia_bd_invariantes()` | Pasar a `ventanas_ocupadas`, filtrar por la fecha de corte, y excluir los forzados |
| `solape_forzado` | `bd-invariantes.mjs` | Vector nuevo: forzados sin justificar |
| `servicio_id` nullable | `migraciones.mjs` | Política RLS de `service_addons` con la columna nullable |
| Gastos | `bd-invariantes.mjs` | Arqueo: gastos con importe ≤ 0 o fecha futura |
| Cita fuera de horario | `horarios-convenio.mjs` | Que el aviso no se convierta en silencio |
