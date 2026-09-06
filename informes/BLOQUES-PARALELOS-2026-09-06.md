# Bloques paralelos — peticiones de Jose (6 sep 2026)

Reparto de las 14 peticiones de
[PETICIONES-JOSE-2026-09-06.md](PETICIONES-JOSE-2026-09-06.md) en **seis bloques
ejecutables en paralelo por sesiones distintas**.

- **Ejecutan:** otras IA, una por bloque, cada una en su rama.
- **Revisa:** esta sesión (Claude), contra los criterios de aceptación de cada bloque.

> **El reparto es por PROPIEDAD DE FICHEROS, no por tema.** `NewCitaModal.web.tsx`
> lo quieren cuatro peticiones a la vez y `CobroSheet.tsx` dos. Si se reparte por
> tema, dos sesiones editan el mismo fichero de 4.680 líneas y el merge decide
> quién gana. Por eso hay bloques que agrupan cosas que Jose dijo separadas, y
> peticiones partidas entre bloques.

---

## Mapa de propiedad — la regla que no se salta

**Una sesión solo edita los ficheros que posee.** Si necesita un cambio en un
fichero ajeno, se para y lo pide; no lo hace "de paso".

| Fichero | Dueño |
|---|---|
| `components/layout/Sidebar.tsx` | **A** |
| `components/pos/CobroSheet.tsx` | **B** |
| `components/pos/*` (nuevos) | **B** |
| `lib/datos/addons.ts` (nuevo) | **C** |
| `app/(tabs)/configuracion.web.tsx` | **C** |
| `scripts/vigilantes/bd-invariantes.mjs` | **D** |
| `components/agenda/**` | **E** |
| `lib/horarios.ts`, `lib/horariosFranjas.ts` | **E** |
| `components/informes/GastosSection.tsx` | **F** |
| `app/(tabs)/informes.web.tsx` | **F** |
| `app/(tabs)/caja.web.tsx` | **B** (entrada de cobro) · **F** (sección gastos) ⚠️ |

⚠️ **Único fichero compartido: `app/(tabs)/caja.web.tsx`** (2.961 líneas). B toca
solo la zona del botón "Cobro rápido" (~línea 893); F solo añade una sección
nueva. Regiones alejadas: git las mezcla. Aun así, **F rebasa sobre B**, no al
revés.

### Grafo de dependencias

```
A ──────────────────────────────► (independiente, arranca ya)
D ──────────────────────────────► (independiente, arranca ya)
C ──┬───────────────────────────► (arranca ya)
    └── contrato: lib/datos/addons.ts ──► B y E lo consumen
B ──┬───────────────────────────► (arranca ya)
    └──► F rebasa sobre B (caja.web.tsx)
D ──► E (la migración de E entra DESPUÉS de la de D)
F ──────────────────────────────► bloqueado por decisión de campos (Jose)
```

**Arrancan ya, sin esperar a nadie: A, B, C, D.**

---

## Contrato 1 — el cargador único de add-ons

> **CORREGIDO el 6 sep tras ejecutar el bloque C.** Este contrato decía cuatro
> sitios. Son **tres**: `CobroSheet.tsx:254` NO es un cargador de add-ons — es
> `.from('cita_addons')` filtrado por `cita_id`, o sea los add-ons ya enganchados
> a una cita, no el catálogo aplicable a un servicio. Su join a `service_addons`
> es legítimo y **no debe** pasar por el cargador. Consecuencia: **B no tenía
> nada que cambiar aquí**, y lo que queda pendiente es solo de E.

Hoy los add-ons se cargan en **tres sitios** con tres consultas copiadas.
Los tres tienen que aprender a leer add-ons **globales de salón**
(`servicio_id is null`, ver bloque C). Si cada bloque lo hace por su cuenta,
nace un invariante repartido — justo lo que el `CLAUDE.md` señala como *la
fábrica de regresiones*.

**C crea `lib/datos/addons.ts` y lo publica en su PRIMER commit:**

```ts
// Add-ons aplicables a un servicio: los suyos + los globales del salón.
// servicio_id NULL = add-on de salón, vale para cualquier servicio.
export async function cargarAddonsAplicables(
  negocioId: string,
  servicioId: string | null,
): Promise<Addon[]>
```

Luego **cada bloque cambia sus propias llamadas**:

| Sitio | Dueño del cambio | Estado |
|---|---|---|
| `configuracion.web.tsx:5617` | C | ✅ hecho |
| `NewCitaModal.web.tsx:807` | **E** | ⬜ pendiente |
| `DetalleCitaModal.web.tsx:1107` | **E** | ⬜ pendiente |

Los dos pendientes están declarados como **aviso con línea base congelada** en
`scripts/vigilantes/addons-cargador.mjs`. **Al arreglarlos, quita su línea de
`PENDIENTES` en ese vigilante** — si te olvidas, el propio vigilante lo dice.

Hasta que C publique el fichero, B y E **dejan sus cargadores como están** y
siguen con el resto. Es un cambio de una línea al final; no bloquea nada.

---

## Reglas para todas las sesiones

1. **Rama propia** desde `master`: `feat/jose-<letra>-<tema>`.
2. **Solo tus ficheros.** Ver mapa. Si necesitas otro, párate y pregunta.
3. **No toques `CLAUDE.md`.** El informe final lo consolido yo.
4. Código en inglés, **comentarios en español**, sin emojis, **sin `any`**.
5. Commits `feat:` / `fix:` / `chore:`.
6. **Antes de entregar:** `npm run vigilar` y `npx tsc --noEmit` en verde.
   (Los errores de `supabase/functions` son Deno: se ignoran.)
7. **Si tocas migraciones:** advisors de seguridad después, y si usas
   `apply_migration` del MCP **renombra el `.sql`** — el MCP registra su propio
   timestamp y el vigilante de migraciones avisa para siempre.
8. **Si dices "verificado en el navegador": `npm run build:web` ANTES.**
   `web/app/` no está en git; sin recompilar estás mirando un bundle viejo. Así
   se coló a producción el fallo que tumbaba la agenda.
9. **Entrega:** rama + resumen de qué cambiaste y **qué comprobaste**, con la
   salida real. Sin salida no cuenta como verificado.

---

# Bloque A · Navegación y realce de esenciales

**Cubre:** peticiones 12 y 13 · **Tamaño:** pequeño (1-2 h) · **Riesgo:** ninguno
**Posee:** `components/layout/Sidebar.tsx`

### Contexto

- `Caja` está hoy en el grupo `Gestión` ([Sidebar.tsx:46](../components/layout/Sidebar.tsx#L46)).
  Jose la quiere en uso diario → grupo `Operativa`.
- `GROUP_META` ([Sidebar.tsx:27](../components/layout/Sidebar.tsx#L27)) aplica
  hoy **color plano**: `'Operativa': { color: '#f4501e' }`. Pide degradado o
  realce, "que tengan ganas de darle a cada botón".
- **Comprobado: en móvil Caja ya es la segunda pestaña**
  ([MobileTabBar.tsx:28](../components/layout/MobileTabBar.tsx#L28)). **No la
  toques.** La petición 12 solo aplica a escritorio.

### Trabajo

1. Mover `Caja` de `Gestión` a `Operativa` en `NAV_ITEMS`. Mantener
   `cap: 'config.ver'` — es un permiso de rol, no decorativo.
2. Dar realce visual al grupo `Operativa`: degradado con la paleta de marca
   (`#f4501e` → `#c0260a`, `lib/designTokens.ts`), sin romper el rail plegado ni
   el estado activo.
3. Comprobar el sidebar **plegado y desplegado** (el rail de iconos es el estado
   por defecto: `mecha-sidebar-collapsed`).

### Aceptación

- [ ] Caja aparece bajo `Operativa`, tras Agenda.
- [ ] `Operativa` se distingue del resto sin leer las etiquetas.
- [ ] Plegado y desplegado se ven bien; el estado activo sigue legible.
- [ ] Los roles no-gestor siguen sin ver Caja (`cap: 'config.ver'`).
- [ ] `MobileTabBar.tsx` **sin tocar**.
- [ ] Captura de los dos estados.

---

# Bloque B · Cobro: selector unificado y edición de precio

**Cubre:** 2, 3, 5, 10, 11 · **Tamaño:** medio-grande (½ día) · **Riesgo:** bajo
**Posee:** `components/pos/CobroSheet.tsx`, nuevos en `components/pos/`,
zona del botón "Cobro rápido" de `app/(tabs)/caja.web.tsx`

### Contexto — lo que ya está hecho, no lo rehagas

**La edición de precio EXISTE.** Migración `20260901161500_editar_importe_y_addons_en_cobro.sql`
+ [CobroSheet.tsx:238](../components/pos/CobroSheet.tsx#L238). El importe viaja
como `p_base_cents` y queda auditado. Está capado por:

```ts
const puedeEditarBase = props.mode === 'cita'
  && props.citaIds.length === 1
  && !usarBono;
```

Tu trabajo es **levantar esas puertas y hacer visible el control**, no
construirlo.

**El servidor ya admite cobrar cualquier cosa.** `crear_cobro_walkin` recibe
`p_lineas jsonb` (líneas libres):

```
p_lineas jsonb, p_metodo text, p_propina_cents integer,
p_descuento_cents integer, p_profesional_id uuid, p_cliente_id uuid
```

**El límite es el selector**, que hoy carga solo productos
([CobroSheet.tsx:193](../components/pos/CobroSheet.tsx#L193)).

### Trabajo

1. **Selector unificado** (componente nuevo en `components/pos/`): se nutre de
   `productos` + `servicios` + `service_addons`, con píldoras de tipo
   (Producto / Servicio / Extra) además del filtro por categoría que ya hay.
2. **Modal ancho + lista virtualizada** → resuelve la petición 11 (el scroll
   incómodo). No lo arregles con un `max-height` mayor: con 78 servicios el
   scroll vuelve.
3. **Levantar los tres límites** de `puedeEditarBase`. Con varias citas, el
   importe se edita **por línea**, no en bloque.
4. **Precio editable en toda línea** antes de cobrar, venga de donde venga.
5. **Contrato 1**: cuando C publique `lib/datos/addons.ts`, cambia
   `CobroSheet.tsx:254` para usarlo. Hasta entonces, no toques esa consulta.

### Decisión pendiente (pregunta antes de programarla)

**Editar el importe cobrando con bono: ¿se descuenta sesión igual?** Hoy el bono
cierra la edición precisamente por eso. Que lo diga Jose.

### Aceptación

- [ ] Desde "Cobro rápido" se cobra un servicio sin escribirlo a mano.
- [ ] Al cobrar una cita se pueden añadir servicios y extras, no solo productos.
- [ ] El precio se edita antes de cobrar con 1 cita **y con 2+**.
- [ ] Con 78 servicios el buscador no obliga a un scroll incómodo.
- [ ] `cobro_lineas` guarda el tipo y el `ref_id` correctos de cada línea.
- [ ] Los importes cuadran en Caja y en Informes tras un cobro de prueba.
- [ ] **Verificado con un cobro real en la demo**, con la fila resultante pegada.

### Trampa del repo

**`total_cents` YA INCLUYE la propina.** Hay un comentario en la migración
`20260830210025` que dice lo contrario y **está mal**: con esa fórmula, 161
cobros buenos darían descuadre. Si tocas totales, esta es la convención.

---

# Bloque C · Extras de catálogo a add-ons

**Cubre:** petición 4 · **Tamaño:** medio (½ día + decisión de Jose)
**Posee:** migración nueva, `app/(tabs)/configuracion.web.tsx`,
`lib/datos/addons.ts` (nuevo)

### Contexto — el diagnóstico ya está hecho

Los add-ons **ya son solo dinero** (`20260901153000_addons_solo_dinero.sql`).
Verificado: 12 add-ons en producción, los 12 con `duracion_min = 0`.

**El problema es de datos, no de motor:**

| Salón | Add-ons | Servicios activos |
|---|---|---|
| `demo_salon_001` | 12 | — |
| `florent_surez_peluqueros_15004` (Jose) | **0** | **78** |

Su catálogo se importó con todo como servicio. `Espuma` (15 min), `Mascarilla`
(15 min) y `Secado espres` (15 min) son servicios, y por eso colisionan.

### El obstáculo real

```
service_addons.servicio_id  uuid  NOT NULL
```

Un add-on pertenece a **UN** servicio. Ofrecer "Espuma" en los 78 servicios de
Jose serían **78 filas mantenidas a mano**. Inaceptable.

**Solución acordada:** `servicio_id` **nullable** = add-on global del salón.

### Trabajo

1. **Migración:**
   - `servicio_id` → nullable. Comentario explicando que `null` = add-on de salón.
   - `duracion_min` default `10` → **`0`**. Hoy nace diciendo que dura 10 min y
     el sistema lo ignora: la columna miente.
   - Revisar la política RLS de `service_addons` con la columna nullable —
     `security-hardening-exec-sql-addons.sql` la ata por `negocio_id`; que siga
     atada.
2. **`lib/datos/addons.ts`** — el cargador único del Contrato 1. **Publícalo en
   tu primer commit**: B y E lo esperan.
3. **Ajustes**: poder crear un add-on **de salón**, no solo colgado de un
   servicio. Y quitar o justificar el campo de duración del formulario
   ([configuracion.web.tsx:6049](<../app/(tabs)/configuracion.web.tsx#L6049>)):
   pide un dato que nadie usa.
4. **Cambiar tu propia llamada** (`configuracion.web.tsx:5617`). Las otras tres
   las hacen sus dueños.
5. **Script de migración de catálogo, reversible**, para pasar servicios a
   add-ons. **No lo ejecutes contra el salón de Jose sin su lista.**

### Bloqueo externo

**Qué servicios de los 78 pasan a extras lo decide Jose**, no nosotros: no
sabemos si "Mascarilla" se vende suelta. Prepara la maquinaria y el script;
la ejecución espera su lista.

### Bug menor incluido

En la demo hay add-ons duplicados: `Ampolla de brillo` ×3,
`Tratamiento hidratante` ×3, `Recogido sencillo` ×2. Bug de siembra. Se ve en el
escaparate. Arréglalo de paso.

### Aceptación

- [ ] Se crea un add-on de salón y aparece en cualquier servicio.
- [ ] Un add-on nuevo nace con `duracion_min = 0`.
- [ ] Los add-ons existentes (los 12) siguen funcionando igual.
- [ ] `lib/datos/addons.ts` publicado y con test.
- [ ] Advisors de seguridad pasados tras la migración.
- [ ] Demo sin add-ons duplicados.
- [ ] Script de migración probado **contra la demo**, con su reverso.

---

# Bloque D · El vigilante de solapes mide mal

**Cubre:** hallazgo ⚠️D (no lo pidió Jose) · **Tamaño:** pequeño (1-2 h)
**Posee:** migración nueva, `scripts/vigilantes/bd-invariantes.mjs`
**Es prerrequisito del bloque E.**

### El fallo

`vigilancia_bd_invariantes()` cuenta solapes así:

```sql
tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin)
```

**El bloque entero.** Pero la ocupación real es `citas.ventanas_ocupadas`:
durante el reposo el profesional está libre, y encajar otra clienta ahí es el
**diferencial nº 1 del producto**. Es el mismo error corregido ya *dos veces* en
el constraint (`20260901153828`, `20260905233000`) y que sigue vivo aquí.

**Medido el 6 sep 2026 contra producción:**

| Método | Pares |
|---|---|
| Bloque entero (lo que usa hoy) | **31** |
| Ocupación real (`ventanas_ocupadas`) | **24** |
| **Falsos positivos** | **7** |

Y el `WHERE` **no filtra por la fecha de corte** (`2026-08-31 22:00:00+00`), así
que denuncia 24 pares históricos que son deuda congelada por decisión de
producto. Un aviso que no puede bajar nunca es un aviso que se deja de mirar.

Tras el corte: **0 pares**. El candado aguanta.

### Trabajo

1. Migración que reescriba el vector 1 de `vigilancia_bd_invariantes()`:
   - `a.ventanas_ocupadas && b.ventanas_ocupadas` en vez de los `tstzrange`.
   - Filtrar por la fecha de corte, **igual que el constraint**.
   - Mantener las exclusiones que ya tiene: `cancelada`, `grupo_id`,
     `profesional_id is not null`.
2. **Deja hueco para el bloque E**: cuando exista `citas.solape_forzado`, los
   forzados salen de este recuento. Escríbelo como comentario; **no crees tú la
   columna**.
3. Actualiza la cabecera de `bd-invariantes.mjs`: dice "108 pares" y hoy son otros
   números.

### Aceptación

- [ ] `npm run vigilar:bd` devuelve **0 pares** de agenda solapada.
- [ ] Consulta pegada demostrando 31 → 24 → 0 tras el filtro de corte.
- [ ] Los otros vectores (bonos, arqueo de caja) **intactos**.
- [ ] La migración explica por qué, no solo qué. Es la tercera vez que este par
      se desincroniza: que la próxima persona lo lea.

### Cuidado

**No relajes el vigilante para que dé verde.** El objetivo es que mida *lo
correcto*, no que calle. Si tras el cambio aparecen solapes reales posteriores al
corte, eso es un hallazgo bueno: repórtalo, no lo filtres.

---

# Bloque E · Agenda permisiva

**Cubre:** 1, 6, 7, 8 · **Tamaño:** grande (1-2 días) · **Riesgo: ALTO**
**Posee:** `components/agenda/**`, `lib/horarios.ts`, `lib/horariosFranjas.ts`,
migración nueva
**Depende de:** D (su migración entra después)

> **El bloque delicado.** Toca el candado de solapes, que se ha roto y
> re-arreglado **tres veces en seis días**. Rama propia, sin prisa, y la
> migración no entra hasta que D esté en `master`.

## E.1 — Blur del modal (petición 8) · *empieza por aquí, es gratis*

`backdropFilter: blur(8px)` en
[NewCitaModal.web.tsx:1540](../components/agenda/modals/NewCitaModal.web.tsx#L1540)
y [:1588](../components/agenda/modals/NewCitaModal.web.tsx#L1588). Bajar el blur
y aligerar el velo para que se vea la agenda detrás. Diez minutos y se nota.

## E.2 — Menú "qué crear" al clicar (petición 6)

Hoy el clic abre directo `NewCitaModal`. Jose quiere elegir: cita / bloqueo /
ausencia / pausa.

**No hace falta inventar nada.** `bloqueos_profesional` existe con **133 filas** y
tipos reales en producción: `baja`, `descanso`, `formacion`, `reunion`,
`vacaciones`. La agenda ya los carga
([AgendaCalendar.web.tsx:360](../components/agenda/AgendaCalendar.web.tsx#L360)).
Los dos ejemplos de Jose ya tienen tipo: *"para comer"* → `descanso`;
*"salir al médico"* → `baja`.

Hoy solo se crean desde Equipo ([equipo.web.tsx:479](<../app/(tabs)/equipo.web.tsx#L479>)) —
**no toques ese fichero**, es de otro. Reimplementa el alta en la agenda usando
la misma tabla.

Cuidado: el menú no puede meter un clic de más en el flujo diario de crear cita,
que es la acción más repetida del producto. "Cita" tiene que seguir estando a un
gesto.

## E.3 — Fuera de horario: avisar, no bloquear (petición 1)

**Son dos puertas distintas, no una:**

| Puerta | Dónde | Cómo bloquea |
|---|---|---|
| Cierre del salón | `cierreDelDia` ([NewCitaModal:409](../components/agenda/modals/NewCitaModal.web.tsx#L409)) | **No ofrece ninguna hora** ([:3384](../components/agenda/modals/NewCitaModal.web.tsx#L3384)) |
| Horario del profesional | `validarHorarioLaboral` (`lib/horarios.ts:41`) | `return` al guardar, en **dos** sitios: [NewCitaModal:1191](../components/agenda/modals/NewCitaModal.web.tsx#L1191) y [DetalleCitaModal:1544](../components/agenda/modals/DetalleCitaModal.web.tsx#L1544) |

La rejilla debe **ofrecer** esas horas marcadas como fuera de horario, y el
guardado pasar a confirmación.

**Fuera de alcance: el portal público.** Que una clienta reserve sola un día
cerrado no es lo que pidió Jose. `disponibilidad_publica` **no se toca.**

## E.4 — Solape forzado (petición 7)

**Hoy lo impide Postgres**, no la interfaz:

```sql
constraint citas_solape_profesional_excl
exclude using gist (profesional_id with =, ventanas_ocupadas with &&)
where (estado <> 'cancelada' and grupo_id is null
   and profesional_id is not null
   and inicio >= '2026-08-31 22:00:00+00')
```

Rechaza con **23P01**, que `lib/errores.ts:183` ya traduce.

**La salida ya está inventada dentro del propio constraint:** exime a
`grupo_id is not null`. Se replica con `citas.solape_forzado boolean`.

**El precio, y hay que asumirlo explícitamente:** una fila fuera de un índice
parcial no participa en el candado **en ninguna dirección**. Una cita forzada no
solo puede solaparse: **tampoco impide que otra se le ponga encima después.** No
hay término medio. Escríbelo en el comentario de la migración.

**Tres frentes:**

1. **Servidor**: columna + `WHERE` del constraint. La migración entra **después**
   de la de D.
2. **Cliente — hay CINCO pre-comprobaciones repartidas**:
   [AgendaCalendar:5514](../components/agenda/AgendaCalendar.web.tsx#L5514) ·
   [DetalleCitaModal:2142](../components/agenda/modals/DetalleCitaModal.web.tsx#L2142) ·
   [NewCitaModal:669](../components/agenda/modals/NewCitaModal.web.tsx#L669) y
   [:1208](../components/agenda/modals/NewCitaModal.web.tsx#L1208) ·
   [Timeline:782](../components/agenda/views/timeline/Timeline.web.tsx#L782).
   Todas usan `citaSolapaOcupacion`, pero **cada una decide por su cuenta qué
   hacer con el resultado**. Las cinco tienen que aprender a ofrecer forzar, o
   habrá caminos donde el solape se siga bloqueando sin explicación.
3. **Visual — ya está casi hecho.** El repartidor de carriles
   ([Timeline.web.tsx:967-1010](../components/agenda/views/timeline/Timeline.web.tsx#L967))
   **ya pinta lado a lado las citas solapadas** (`_lane` / `_totalLanes`). Solo
   falta **marcar** el solape forzado. **No lo reescribas.**

**El aviso tiene que ser de fricción alta.** Jose: *"queremos evitar solapamientos,
pero si ellos por lo que sea quieren un solapamiento, debemos dejarles, pero con
un aviso bien claro y fuerte."* Un "¿Seguro?" con Aceptar por defecto no es eso.

### Decisiones pendientes (pregunta antes de programarlas)

1. **¿Quién puede forzar?** ¿Cualquiera con acceso a la agenda, o solo
   owner/admin? Cambia si el gate va en la RLS o solo en la UI.
2. **¿La cita forzada avisa para siempre en la agenda, o solo al crearla?**

### Aceptación del bloque E

- [ ] Se ve la agenda de fondo al crear una cita.
- [ ] Al clicar un hueco se puede elegir cita o bloqueo; "cita" sigue a un gesto.
- [ ] Un bloqueo creado desde la agenda sale igual que uno creado desde Equipo.
- [ ] Se puede citar en día cerrado / fuera de horario, con aviso, desde los
      **dos** modales.
- [ ] Se puede forzar un solape desde los **cinco** caminos.
- [ ] Sin forzar, el solape **se sigue impidiendo**: 23P01 y su mensaje.
- [ ] Dos citas forzadas a la misma hora se leen bien en la agenda.
- [ ] El portal público sigue **sin** ofrecer días cerrados.
- [ ] `npm run vigilar:bd` en verde tras la migración (por eso D va antes).
- [ ] Vigilante actualizado **en el mismo commit** que la columna.

### Trampas del repo

- **`horarios_profesional` NO tiene `negocio_id`** (se llega por `profesional_id`);
  `bloqueos_profesional` **sí**. Un trigger que lea `new.negocio_id` sobre la
  primera lanza `42703` y **tumba la escritura entera**.
- **`negocio_horarios`: el 0 es LUNES.** Las dos tablas de horario cuentan los
  días al revés. Si copias `dia_semana` entre ellas, `% 7`.
- **Las edge functions corren en UTC.** `setHours()` sobre horarios de salón los
  corre 1-2 h en servidor.

---

# Bloque F · Gastos completos y P&L

**Cubre:** petición 14 · **Tamaño:** grande (1 día) · **Riesgo:** medio
**Posee:** migración nueva, `components/informes/GastosSection.tsx`,
`app/(tabs)/informes.web.tsx`, sección nueva en `app/(tabs)/caja.web.tsx`
**Bloqueado por:** decisión de campos (Jose / fiscalista)
**Rebasa sobre B** por `caja.web.tsx`

### Contexto

La tabla `gastos` **entera**, hoy:

```
id · negocio_id · concepto · categoria · importe_cents · fecha
es_recurrente · created_at
```

Ocho columnas, cuatro categorías fijas (`alquiler | suministros | producto |
otros`), **5 filas en toda la base**. UI: `GastosSection.tsx`, 282 líneas, solo
dentro de Informes ([informes.web.tsx:3226](<../app/(tabs)/informes.web.tsx#L3226>)).

**El P&L ya existe en forma mínima:** `margenAproximado = totalCobrado - totalGastos`
([informes.web.tsx:605](<../app/(tabs)/informes.web.tsx#L605>)), pintado como
"Margen (aprox)" en [:1960](<../app/(tabs)/informes.web.tsx#L1960>). **No es
crear: es convertir un número suelto en un desglose.**

### Trabajo

1. **Migración** que amplíe `gastos` con los campos que decida Jose. Candidatos:
   proveedor, base imponible / IVA, método de pago, nº de factura, adjunto,
   profesional asociado, notas, centro de coste. **No los inventes.**
2. **Sección de gastos en Caja**, y que **siga estando en Informes** — Jose lo
   pidió en los dos sitios explícitamente.
3. **Desglose en Informes**: ingresos, gastos por categoría, resultado. Sobre el
   `margenAproximado` que ya existe.
4. RLS de las columnas nuevas: `gastos` lleva `negocio_id` → la regla del
   parámetro y política atada al llamante.

### Bloqueo real

**IVA deducible y nº de factura tienen implicaciones contables.** El `CLAUDE.md`
avisa de que la caja fiscal M-CJ **no se improvisa y requiere fiscalista**. Un
campo de IVA mal modelado es peor que no tenerlo: parece contabilidad y no lo es.

**Empieza por la UI y el desglose sobre el esquema actual.** Los campos fiscales
entran cuando Jose los confirme.

### Aceptación

- [ ] Se registra un gasto desde Caja **y** desde Informes.
- [ ] Los gastos de Caja aparecen en Informes y viceversa (una sola fuente).
- [ ] El desglose cuadra: ingresos − gastos = resultado, contra `cobros` reales.
- [ ] Las 5 filas existentes siguen leyéndose (campos nuevos nullable).
- [ ] Advisors pasados; RLS atada al llamante.
- [ ] Ningún campo fiscal inventado sin confirmación.

### Trampa del repo

`total_cents` de `cobros` **ya incluye la propina**. Si calculas ingresos
sumándola aparte, inflas el resultado.

---

## Resumen de arranque

| Bloque | Peticiones | Arranca | Espera a | Tamaño |
|---|---|---|---|---|
| **A** Navegación | 12, 13 | **ya** | — | 1-2 h |
| **B** Cobro | 2, 3, 5, 10, 11 | **ya** | — | ½ día |
| **C** Extras | 4 | **ya** | Lista de Jose (paso 5) | ½ día |
| **D** Vigilante | ⚠️D | **ya** | — | 1-2 h |
| **E** Agenda | 1, 6, 7, 8 | ya (E.1-E.3) | D para su migración | 1-2 días |
| **F** Gastos | 14 | parcial | Campos de Jose · rebase sobre B | 1 día |

**Cuatro sesiones pueden arrancar ahora mismo sin pisarse: A, B, C, D.**

---

## Protocolo de revisión

Cada bloque se entrega con: rama, resumen de cambios y **salida real** de lo
comprobado. Al revisar miro, en este orden:

1. **¿Tocó ficheros ajenos?** Es el fallo que rompe el paralelismo. Se mira primero.
2. **¿Las afirmaciones tienen prueba?** "Verificado" sin salida pegada no cuenta.
   Y si dice "probado en el navegador", que haya `build:web` antes — si no, midió
   un bundle viejo.
3. **¿El vigilante entró en el mismo commit que el invariante?**
4. **Criterios de aceptación**, uno a uno.
5. **Trampas del repo** listadas en su bloque.
6. `npm run vigilar` · `npx tsc --noEmit` · `npm run vigilar:bd` si tocó SQL.

**No se mergea a `master` un bloque que toque el candado de solapes (E) sin que
D esté dentro.**
