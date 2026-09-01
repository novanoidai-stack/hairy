# Spec 1 — Reposos asíncronos múltiples: qué hay, qué falta y cómo hacerlo

> **Para la sesión que la retome.** Todo lo que sigue está **medido el 31 ago 2026** contra el
> proyecto de producción `vtrggiogjrhqtwbhbgia` y contra el árbol de `master`, no leído de
> documentación. Donde digo un número, lo he contado; donde digo que algo no existe, lo he
> comprobado en `information_schema` o en `pg_proc`.
>
> Complementa —y en tres puntos **corrige**— a `informes/SPECS-LO-QUE-FALTA-2026-08-30.md` §1.
>
> Incluye además, por petición, el estado real de los **módulos huérfanos** (parte 2) y de la
> **activación** (parte 3), que son los otros dos frentes abiertos, y dos cabos sueltos que
> salieron auditando —un claim fiscal por implicación y las vulnerabilidades de dependencias—
> en la parte 4.

---

## 0. Veredicto en una página

**La spec 1 no está entregada, pero está mucho más cerca de lo que parece, y el trabajo que
queda no es el que dice la spec.**

Lo que la spec daba por difícil —dibujar N tramos, que el reposo no ocupe, el recurso por
fase, el reloj— **ya está construido y funcionando en el cliente**. Lo que da por resuelto
—«las cuatro columnas se quedan como resumen mantenido por trigger»— es exactamente lo que
está al revés hoy, y es la razón por la que estructuralmente **no puede haber un segundo
reposo**.

| | |
|---|---|
| **El diseño está invertido** | `citas` (4 marcas) es la fuente de verdad y `cita_fases` es una **proyección de un solo sentido** derivada de ella. Las 4 marcas solo saben decir `activa → reposo → activa`. Medido en las 2.011 citas: **máximo 1 reposo, 0 fases `transicion`** |
| **Falta la plantilla** | `servicios.fases` **no la crea ninguna migración**. La rama que la leería existe en las tres versiones de `sembrar_fases_de_cita()` y es código muerto declarado («SI algún día existe») |
| **El cliente YA es multi-fase** | `lib/retrasos.ts` (`fasesMultiples`), `lib/recursos.ts` (`tramosDeRecurso`), `AppointmentCard.web.tsx` (mapea N reposos), `AgendaCalendar.web.tsx` (ya hace SELECT de `cita_fases`) y `useCitasRealtime.ts` (ya se suscribe). **Esto es la mitad cara del trabajo y está hecha** |
| **El alcance real es 4× el estimado** | La spec dice «seis sitios que leen las cuatro marcas». Son **26 funciones SQL** las que leen `fin_espera`, 20 de ellas deciden ocupación |
| **Ya existe la costura** | El 31 ago se extrajo la regla a `ventanas_activas_cita()` + `citas_chocan_activa_activa()` en SQL. Hoy solo la usan 2 funciones. **Es el punto por donde entra todo lo demás** |

**La frase con la que quedarse:** no hay que construir la spec 1, hay que **invertir el sentido
de la sincronización y llevar 20 funciones SQL a una costura que ya existe**. El riesgo no está
en el código nuevo: está en el backfill, que ya arrasó 2.009 citas una vez.

---

# PARTE 1 — LA SPEC 1

## 1. Qué se pidió (resumen del original)

`cita_fases(orden, tipo ∈ activa|reposo|transicion, inicio, fin, profesional_id, recurso_tipo,
etiqueta, iniciada_at, cerrada_at)` como **fuente de verdad**, `servicios.fases jsonb` como
plantilla, y las cuatro columnas de `citas` degradadas a **resumen mantenido por trigger**:

```
inicio     = min(fase.inicio)
fin        = max(fase.fin)
fin_activa = fin de la PRIMERA fase activa
fin_espera = fin del PRIMER reposo
```

Criterios de aceptación originales:

1. Un balayage con **dos reposos** se guarda, se pinta y se puede encajar algo **en los dos**.
2. Estirar el primer reposo 10 min no mueve el `inicio` ni rompe lo encajado en el segundo.
3. `disponibilidad_publica` ofrece huecos dentro del **segundo** reposo.
4. Las 2.011 citas existentes se ven **idénticas** a antes de la migración.

**Hoy fallan 1, 2 y 3.** El 4 se cumple, pero solo después de una reparación de urgencia (§3).

## 2. Qué hay hoy, medido

```
cita_fases ................................. 3.138 filas, cubren las 2.011 citas
  máximo reposos por cita .................. 1          <- el criterio 1 es imposible
  fases tipo 'transicion' .................. 0          <- el tipo existe, no se usa nunca
  fases con iniciada_at (reloj usado) ...... 0
servicios.fases ............................ NO EXISTE (ninguna migración la crea)
citas colapsadas por el backfill ........... 0          <- reparado, ver §3
```

### La cadena que hace imposible el segundo reposo

```
citas(inicio, fin_activa, fin_espera, fin)          ← FUENTE DE VERDAD
        │
        │  trg_seed_fases_from_cita   (AFTER INSERT)
        │  trg_resync_fases_de_cita   (AFTER UPDATE OF inicio, fin, fin_activa,
        │                              fin_espera, profesional_id)
        ▼
   sembrar_fases_de_cita(cita_id)
        │  DELETE FROM cita_fases WHERE cita_id = ...
        │  y reconstruye desde las 4 marcas:
        │     activa [inicio, fin_activa)
        │     reposo [fin_activa, fin_espera)     ← UNO. Solo uno. Siempre uno.
        │     activa [fin_espera, fin)            ← solo si fin > fin_espera
        ▼
   cita_fases                                        ← PROYECCIÓN, un solo sentido
```

`sembrar_fases_de_cita()` **borra y reconstruye** todas las fases de la cita en cada UPDATE de
esas cinco columnas. Consecuencia práctica: aunque alguien inserte a mano un segundo reposo en
`cita_fases`, **el siguiente UPDATE de la cita lo destruye**. Lo único que sobrevive es
`iniciada_at`/`cerrada_at`, que `resync_fases_de_cita()` rescata a propósito antes de resembrar
y vuelve a colocar por `orden`.

Hay una rama, en las tres versiones de la función, que leería `servicios.fases` y generaría N
tramos. Está escrita defensivamente (`to_jsonb(s) -> 'fases'`, que devuelve null si la columna
no existe, en vez de lanzar `42703`) y **nunca se ejecuta**.

## 3. Qué pasó el 30 de agosto — la forense, para no repetirla

Esto es lo más importante del informe. **El intento anterior tumbó producción dos veces.**

### 3.1 El trigger que no dejaba crear ninguna cita

`seed_fases_from_cita()` hacía `select fases into ... from public.servicios`. Esa columna no
existe. En PL/pgSQL eso **no devuelve null: lanza `42703` en tiempo de ejecución**, y al ser un
trigger `FOR EACH ROW` sobre `citas`, **tumbaba el INSERT entero**. Resultado: no se podía
crear **ninguna** cita — ni desde la agenda, ni desde el portal, ni desde el agente de
WhatsApp — ni resembrar la demo.

Es **exactamente** la trampa que el `CLAUDE.md` ya documentaba con `agenda_ojos_notify` (29
ago, un día antes). Se arregló igual: `to_jsonb(coalesce(new, old)) ->> 'campo'`.

> **Regla para la próxima sesión:** antes de escribir un trigger `FOR EACH ROW`, comprobar en
> `information_schema.columns` que **todas** las columnas que nombra existen en **esa** tabla.
> Lo vigila la comprobación 9 de `vigilancia_bd()` y el vigilante `bd-triggers-ciegos`, pero
> solo después de aplicar la migración.

### 3.2 El backfill que arrasó 2.009 citas

`cita_fases` nació como **segunda fuente de verdad sincronizada en los dos sentidos, y mal**:

- `sync_citas_from_fases` (AFTER I/U/D en `cita_fases`) reescribía
  `citas.inicio/fin/fin_activa/fin_espera` desde las fases.
- `shift_fases_on_cita_move` solo miraba `inicio`, así que un cambio de **duración** no llegaba
  nunca a las fases.

El backfill de `20260830152807` insertaba las fases una a una. **Al insertar la primera fase
(la activa), `sync_citas_from_fases` ya bajaba `citas.fin` a `fin_activa`.** Los dos INSERT
siguientes (reposo y fase final) filtraban por `fin_espera > fin_activa` y `fin > fin_espera`,
que ya no casaban. Resultado: cada cita se quedó **solo con su primera fase activa**.

Daño medido: **2.009 citas**. «Color Raíz + Peinado» pasó de 90 a 30 min en 156 citas; «Mechas
Balayage + Matiz» de 120 a 40 en 148. En la cartera real, **43 citas, 16 de ellas futuras**: en
la agenda se veían cortas y **se podía reservar encima del reposo**.

Efecto secundario: alargar una cita se revertía solo (15:15 → 15:45 → 15:15) en cuanto se
arrancaba el reloj de reposo.

### 3.3 La reparación, y lo que se perdió para siempre

- `20260830191032` — se corta el enganche de vuelta: fuera `sync_citas_from_fases` y
  `shift_fases_on_cita_move`. `citas` vuelve a ser la fuente de verdad. **Va antes de restaurar
  a propósito**: con el enganche puesto, cualquier restauración se deshacía sola.
- `20260830191309` — se reconstruyen `fin_espera` y `fin` de las citas colapsadas, anclando en
  `fin_activa` (que sobrevivió intacto) y aplicando `duracion_efectiva_profesional()`.

**Lo irrecuperable:** `citas_historial` no registró nada (el trigger hacía UPDATE directo), así
que los valores originales se perdieron. Se reconstruyeron con las duraciones **de catálogo**:
cualquier ajuste manual del salón sobre `fin`/`fin_espera` anterior al 30 ago **no volvió**.
Respaldo de lo que había justo antes en `respaldos.citas_antes_del_backfill_fases`
(esquema propio, sin RLS, revocado a `anon`/`authenticated`).

> **Las tres lecciones que hay que llevarse:**
> 1. **Un backfill que dispara triggers de sincronización se come a sí mismo.** Desactivar los
>    triggers durante el backfill (`alter table ... disable trigger`) o hacerlo en una tabla
>    nueva y cambiar el puntero al final.
> 2. **Antes de tocar 2.011 filas, guardar una foto.** El respaldo de `respaldos.*` se creó
>    *después* del desastre, para la reparación. La próxima vez va **antes**.
> 3. **La verificación no es «la migración corrió sin error»**: es «cuento las citas cuya
>    duración cambió y tiene que dar 0». Esa consulta hay que escribirla antes de migrar.

## 4. El descubrimiento que cambia el plan: el cliente ya está hecho

Esto no lo dice la spec y cambia el reparto de esfuerzo. **La capa de presentación y la regla
de ocupación en TypeScript ya soportan N fases**, con degradación limpia a las 4 marcas:

| Fichero | Qué ya hace |
|---|---|
| `lib/retrasos.ts` | `fasesDe()` construye `fasesMultiples` a partir de `cita_fases` si vienen; `ventanasActivas()` **prefiere** esa lista sobre las 4 marcas. La regla canónica ya es N-fase |
| `lib/recursos.ts` | `tramosDeRecurso()` devuelve un tramo **por fase con `recurso_tipo`**; solo cae al tramo único si no hay fases. El «recurso por fase» de la spec ya existe |
| `components/agenda/views/timeline/AppointmentCard.web.tsx` | Filtra `repososList` y **mapea N reposos** (comentario literal: «Si hay fases estructuradas (Spec 1: múltiples reposos)»), con fallback clásico. Y pinta el reloj de reposo en vivo |
| `components/agenda/AgendaCalendar.web.tsx` | El SELECT ya trae `cita_fases(id, orden, tipo, inicio, fin, profesional_id, recurso_tipo, etiqueta, iniciada_at, cerrada_at)` |
| `lib/hooks/useCitasRealtime.ts` | Ya se suscribe a `cita_fases` y reconcilia altas, cambios y bajas por `orden` |
| `components/agenda/FasesCitaPanel.web.tsx` | Panel de fases dentro de `DetalleCitaModal`, con `iniciar_fase_reposo` / `finalizar_fase_reposo` |

**Traducción:** el día que `cita_fases` contenga dos reposos de verdad, la agenda **los pinta
sola**, el reposo **no ocupa** solo, el recurso **se pide por fase** solo y el realtime **los
propaga** solo. No hay que tocar nada de esto.

Lo que **sí** falta en el cliente: arrastrar el borde entre dos fases para repartir minutos, los
±5 min en móvil, el tratamiento visual propio de `transicion`, y la cinta de «aquí cabe».

## 5. El alcance real en SQL: 26 lectores, no 6

La spec dice «seis sitios». Contados en `pg_proc` el 31 ago, **26 funciones** mencionan
`fin_espera`. Se dividen en tres grupos, y solo el primero es trabajo de verdad.

> **CORREGIDO el 1 sep 2026, al ejecutar el paso 1.** El grupo A no son 20 funciones sino
> **8**. Contadas por el predicado inline (`coalesce(c.fin_espera, coalesce(c.fin_activa,
> c.fin))`), que es lo único que hay que migrar, no por mencionar `fin_espera`. De las 12
> restantes de esta lista: `crear_serie_citas` ya estaba en la costura desde el 31 ago;
> `asignar_candidato_hueco` y `_lista_espera_ofrecer` nombran la columna en la lista de un
> INSERT; `responder_propuesta_cambio` desplaza las cuatro marcas por un delta;
> `revisar_hueco_lista_espera` las recibe como parámetros y **no consulta `citas`**;
> `procesar_lista_espera` y `avisar_lista_espera_candidata` son la máquina de estados de las
> ofertas; `citas_normalizar_fases` es el trigger BEFORE que rellena las marcas que faltan.
> Ninguna decide ocupación. Aparte quedan `recurso_tramo_de_cita` y
> `recursos_ocupados_negocio`: **sí deciden, pero otra cosa** — desde cuándo un servicio
> retiene un recurso, según `recurso_fase`. Pasarlas por la costura de ocupación les
> cambiaría el significado; van con el paso 5.

### Grupo A — deciden ocupación (hay que migrarlas): 20

```
disponibilidad_publica            disponibilidad_publica_cadena
portal_dias_disponibles           portal_dias_disponibles_cadena
crear_cita_publica                crear_cita_publica_cadena
crear_cita_publica_grupo          modificar_cita_publica
crear_serie_citas                 responder_propuesta_cambio
revisar_hueco_lista_espera        procesar_lista_espera
_lista_espera_ofrecer             avisar_lista_espera_candidata
asignar_candidato_hueco           citas_normalizar_fases
recurso_tramo_de_cita             recursos_ocupados_negocio
ventanas_activas_cita             citas_chocan_activa_activa
```

### Grupo B — leen para informar, no para decidir: 4

`avisos_del_negocio`, `equipo_jornada_ranking`, `objetivo_valor_actual`, `resembrar_demo`.
No necesitan migrarse: si el resumen de 4 marcas sigue siendo correcto, siguen siendo correctas.

### Grupo C — ya están en `cita_fases`: 5

`sembrar_fases_de_cita`, `resync_fases_de_cita`, `iniciar_fase_reposo`,
`finalizar_fase_reposo`, `vigilancia_bd_profunda`.

## 6. La costura, que ya existe

El 31 ago 2026, al arreglar la spec 12, se extrajo la regla de ocupación a SQL **por primera
vez** (antes vivía en `lib/retrasos.ts` y duplicada inline dentro de `disponibilidad_publica`):

```sql
public.ventanas_activas_cita(p_inicio, p_fin_activa, p_fin_espera, p_fin)
  → tabla(desde, hasta)     -- los tramos en que la cita ocupa al profesional

public.citas_chocan_activa_activa(a_inicio,a_fa,a_fe,a_fin, b_inicio,b_fa,b_fe,b_fin)
  → boolean                 -- activa contra activa; los reposos no estorban
```

Réplica exacta de `ventanasActivas()` / `chocaActivaActiva()` de `lib/retrasos.ts`, **verificada
contra los 7 casos del test canónico**, incluidos los dos sutiles de NULL (sin `fin_espera` no
se puede afirmar que haya reposo: la cita **ocupa entera**).

**Hoy solo las usan 2 funciones** (`citas_chocan_activa_activa` y `crear_serie_citas`). Ese es
el punto de entrada de toda la migración, y es lo que hace que este plan sea distinto del
anterior.

## 7. El plan, en cinco pasos que se pueden parar en cualquiera

La idea: **primero se centraliza sin cambiar comportamiento, luego se cambia el comportamiento
en un solo sitio.** Cada paso es desplegable y reversible por separado.

### Paso 1 · Llevar el Grupo A a la costura (sin cambiar nada) — ✅ HECHO el 1 sep 2026

Reescribir las 20 funciones del grupo A para que su comprobación de solape pase por
`citas_chocan_activa_activa()` / `ventanas_activas_cita()` en vez de hacerlo inline.

- **Cambio de comportamiento esperado: ninguno.** Con una cita de un solo reposo, la costura
  devuelve exactamente lo mismo que el SQL inline.
- **Cómo se demuestra:** para cada función, capturar su salida en un conjunto de casos ANTES y
  DESPUÉS y comparar. `disponibilidad_publica` es la fácil de comprobar: cuenta de huecos por
  (salón, servicio, día) sobre 14 días × los 4 tenants. Tiene que dar **idéntico**.
- Se puede hacer en varios PR, una función por commit. **Aquí no hay riesgo de datos.**

> **ENTREGADO.** Migración `20260901145526_grupo_a_a_la_costura_de_ocupacion.sql`, aplicada a
> producción. Las **8** funciones con predicado inline (ver la corrección del §5) pasan ya por
> `ventanas_activas_cita()`; `grep` de `coalesce(c.fin_espera` en todo `public` da **0**.
>
> **Lo que se comprobó, en este orden:**
> 1. **Equivalencia del predicado, exhaustiva.** 763.476 comparaciones — las 2.051 citas
>    reales **más una matriz sintética de 35 combinaciones de NULL y de orden entre las cuatro
>    marcas** (hace falta: en producción no hay ni una cita con `fin_activa` o `fin_espera` a
>    NULL, y ese es justo el caso que se lee al revés), cruzadas con 61 desplazamientos y 6
>    duraciones. **0 discrepancias.**
> 2. **Extremo a extremo, dentro de una sola transacción** (foto → migración → foto →
>    `rollback`): 4 salones × servicios reservables × 14 días = 1.876 casos.
>    `disponibilidad_publica` 110.637 huecos y `portal_dias_disponibles` 1.506 días,
>    `except all` **en los dos sentidos: 0**. Las de cadena, 311 huecos y 12 días, también 0.
>    La transacción es imprescindible por dos motivos: `now()` queda congelado (si no, el
>    filtro de antelación mueve el resultado) y la demo se resiembra cada 2 h — entre dos
>    medidas mías el total ya se movió de 110.815 a 110.637 solo por eso.
> 3. **Las 4 de escritura, ejecutadas de verdad** (`begin … rollback`): crear en hueco libre
>    → ok; crear encima de la fase activa → «El hueco ya esta ocupado»; **crear DENTRO del
>    reposo → reserva** (la regla que no se puede perder); modificar sobre ocupado, cadena y
>    grupo → todas rechazan por ocupación. PL/pgSQL no valida alias en tiempo de creación, así
>    que sin ejecutarlas un `v.desde` mal resuelto no habría saltado hasta la primera clienta.
> 4. `tsc` · `vigilar` (0 bloqueantes) · `vigilar:bd` (0 bloqueantes) · `vigilar:test`
>    (327/327) · `npm test` deno (481/481) · smoke `--project=publico` (24/24) · advisors sin
>    categoría nueva.
>
> **Dos cosas aprendidas que condicionan el paso 5:**
>
> - **La costura se llama con `cross join lateral`, NUNCA envuelta en un ayudante booleano.**
>   Un `cita_ocupa_ventana(marcas…, desde, hasta) → boolean` queda más limpio y es una trampa:
>   Postgres no inlinea una función escalar cuyo cuerpo es un `EXISTS (SELECT … FROM <función
>   de conjunto>)`, así que el plan deja la llamada opaca en el `Join Filter` y se evalúa por
>   fila. Medido sobre `salon_pruebas_mecha`, 14 días de slots: **15 ms con el lateral, 883 ms
>   con el booleano — 59×**. Con el lateral sí se inlinea y el plan sale `Hash Anti Join`.
> - **Se parcheó por ancla sobre `pg_get_functiondef()`, no con `CREATE OR REPLACE` desde el
>   repo.** `crear_cita_publica` tiene 10 definiciones repartidas entre `supabase/migrations/`
>   y `archive/migraciones-legacy/`; reconstruirlas enteras es como se revierte un hotfix sin
>   que nadie se entere. La migración **exige que el ancla exista** y falla si no.

### Paso 2 · `servicios.fases` y el técnificador

```sql
alter table servicios add column fases jsonb;
```

Con su CHECK de forma (array de objetos con `tipo ∈ activa|reposo|transicion` y `min > 0`).
La rama muerta de `sembrar_fases_de_cita()` **empieza a funcionar sola** en cuanto la columna
existe: ya está escrita y ya la lee con `to_jsonb`.

Extender el técnificador (`supabase/functions/tecnificar-catalogo` +
`components/config/ModalTecnificarCatalogo.tsx`) para que proponga la **secuencia** y no solo
los tres números. Es lo que da datos con los que probar el resto — sin catálogo con fases, la
spec 1 no se puede ni ver.

> **Ojo:** en cuanto exista `servicios.fases`, las citas de servicios técnificados pasarán a
> tener N fases **aunque `citas` siga mandando**. La proyección será más rica que el resumen, y
> el resumen dejará de poder representarla. Ese es justo el momento en que hay que hacer el
> paso 4, y **no antes**.

### Paso 3 · La foto y el vigilante de regresión

Antes de invertir nada:

```sql
create table respaldos.citas_antes_de_fases_v2 as
select id, negocio_id, inicio, fin, fin_activa, fin_espera, profesional_id, now() as guardado_en
from public.citas;
```

Y un vigilante que compare la duración de cada cita contra esa foto y **falle si alguna cambió**.
Es la comprobación que no existía el 30 ago y que habría cazado el desastre en el minuto uno.

### Paso 4 · Invertir el sentido (el único paso peligroso)

`cita_fases` pasa a fuente de verdad y las 4 marcas a resumen mantenido por trigger.

- El trigger de resumen va **AFTER INSERT/UPDATE/DELETE ON cita_fases**, y escribe en `citas`
  las cuatro marcas con la fórmula de la spec (§1).
- **Los triggers de proyección (`trg_seed_fases_from_cita`, `trg_resync_fases_de_cita`) se
  retiran en la MISMA migración.** Tener los dos sentidos a la vez es literalmente lo que
  provocó el desastre del 30 ago.
- **Recursión:** el trigger de resumen escribe en `citas`; si quedara cualquier trigger de
  `citas` que escriba en `cita_fases`, se entra en bucle. Comprobar con
  `pg_trigger` sobre las dos tablas antes de aplicar, y usar `pg_trigger_depth() = 0` como
  guarda si hace falta.
- **El backfill se hace con los triggers desactivados** y en un solo `INSERT ... SELECT`
  generando las 1-3 fases por cita desde las marcas actuales. Nada de fila a fila.
- Verificar contra la foto del paso 3: **0 citas con duración cambiada**.

### Paso 5 · Que la costura mire las fases

Un único cambio, en un único sitio:

```sql
-- ventanas_activas_cita pasa a aceptar p_cita_id y, si hay filas en cita_fases,
-- devuelve las ventanas de las fases NO-reposo; si no, cae a las 4 marcas.
```

En cuanto eso entre, **las 20 funciones del grupo A se vuelven multi-fase a la vez**, porque ya
pasan por ahí desde el paso 1. Es el mismo patrón que `ventanasActivas()` en TypeScript, que ya
prefiere `fasesMultiples` sobre las marcas.

A partir de aquí: criterios 1, 2 y 3 de la spec cumplidos, y el resto (arrastrar el borde entre
fases, ±5 min en móvil, visual de `transicion`, cinta de «aquí cabe») es UI incremental.

## 8. Trampas concretas ya verificadas

1. **`transicion` no ocupa recurso automáticamente.** El tipo existe en el CHECK y hay **0
   filas** en producción. Nada lo ha ejercitado nunca: el primer servicio con transición es
   también su primera prueba.
2. **`horarios_profesional` no tiene `negocio_id`** (se llega por `profesional_id`);
   `bloqueos_profesional` **sí** lo tiene. Hay comentarios en el repo que dicen que ninguna de
   las dos. Documentado en `CLAUDE.md`, decisión 10.
3. **Sin `fin_espera` no hay reposo: la cita ocupa entera.** Leerlo al revés daba por libre la
   cola de cualquier color importado sin fases y colaba citas encima de otras. Está en el
   comentario de cabecera de `lib/utils/appointment.ts` y en los tests de deno.
4. **Las citas de grupo comparten profesional a propósito.** Cualquier constraint de exclusión
   temporal (`EXCLUDE USING gist`) tiene que excluirlas, y hoy hay 108 pares de solapes
   históricos. Por eso el invariante de agenda es aviso agregado y no bloqueante.
5. **`apply_migration` del MCP registra su propio timestamp.** Hay que renombrar el `.sql`
   después o el vigilante de migraciones avisa para siempre.
6. **La demo se resiembra cada 2 h** (`resembrar_demo`, cron). Cualquier prueba sobre
   `demo_salon_001` puede desaparecer sola; y esa función **no está en el repo** (17 KB, solo en
   producción): si hay que tocarla, parchear por ancla como en
   `20260831205630_resembrar_demo_cobro_con_propina_cuadrado.sql`.

## 9. Criterios de aceptación (los originales, hechos comprobables)

| # | Criterio | Cómo se comprueba |
|---|---|---|
| 1 | Balayage con dos reposos se guarda y se pinta | `select max(n) from (select count(*) filter (where tipo='reposo') n from cita_fases group by cita_id) t` → **≥ 2**. Y verlo en la agenda |
| 2 | Estirar el primer reposo no mueve el `inicio` | Estirar la fase 2, comprobar que `citas.inicio` no cambia y que la fase 4 sigue donde estaba |
| 3 | `disponibilidad_publica` ofrece hueco en el **segundo** reposo | Crear la cita de dos reposos y pedir disponibilidad de un servicio corto que quepa en el segundo |
| 4 | Las citas existentes se ven idénticas | 0 filas al comparar duración contra `respaldos.citas_antes_de_fases_v2` |
| 5 | `transicion` deja de ser teórica | `select count(*) from cita_fases where tipo='transicion'` → **> 0** |
| 6 | El salón real la ha usado una vez | La regla del §16 del catálogo: **no se da por hecha cuando compila** |

---

# PARTE 2 — MÓDULOS HUÉRFANOS (§8 del estudio del 30 ago)

Estado **medido el 31 ago 2026**. El triaje del 30 ago decía «12 se borran, 10 se enchufan, 6
por triar». Ejecutado: **poco**.

## De los 12 que había que borrar, siguen 11

Ninguno tiene consumidores fuera de su propio test:

```
lib/caja/cobroMultiPago.ts              lib/caja/arqueoCajaPropinas.ts
lib/caja/propinasAcumuladas.ts          lib/caja/verifactuHash.ts
lib/clientes/detectarDuplicados.ts      lib/inventario/alertasStockMinimo.ts
lib/agenda/serviciosCompatiblesReposo.ts
lib/security/validadorRPC.ts            lib/security/sanitizadorCliente.ts
```

(Sí se borraron `qrPagoRapido`, `insigniasCliente` y `validadorFestivosTurnos`.)

**Los dos de `lib/security/` son los importantes.** Detectan «inyección SQL» y escapan HTML **en
el cliente**. Eso no es un límite de seguridad: las RPC de Supabase van parametrizadas y el
control real es RLS más `exige_mi_negocio`. **Enchufarlos sería peor que borrarlos**: dan
confianza falsa y bloquearían entradas legítimas (una nota que diga «union», un apellido con
guion). Buena noticia: **siguen sin consumidores**. Que sigan así.

**`serviciosCompatiblesReposo.ts` tiene relación directa con la spec 1**: es lo que la «cinta de
aquí cabe» quiso ser. La spec dice explícitamente «se rehace bien y se borra». Al llegar al paso
5, borrarlo y rehacerlo sobre `cita_fases`, no adaptarlo.

## De los 10 que había que enchufar, 4 lo están

| Módulo | Consumidores | Estado |
|---|---|---|
| `lib/fiscal/huella.ts` | 8 | ✅ enchufado (VeriFactu) |
| `lib/fichas/colorAlergias.ts` | 1 | ✅ `clientes.web.tsx` |
| `lib/fichas/diagnosticoCapilar.ts` | 1 | ✅ |
| `lib/fichas/recomendarHomecare.ts` | 1 | ✅ |
| `lib/informes/rentabilidadSillon.ts` | 1 | ✅ (la métrica de los 20,26 €/h) |
| `lib/agenda/desinfeccionPausas.ts` | **0** | ❌ — es la fase `transicion` de la spec 1 |
| `lib/bonos/consumoBonos.ts` | **0** | ❌ |
| `lib/marketing/campanasFranjasValle.ts` | **0** | ❌ |
| `lib/nominas/liquidacionNominas.ts` | **0** | ❌ |
| `lib/legal/contratoRgpdTablet.ts` | **0** | ❌ |

`desinfeccionPausas.ts` **entra con la spec 1**: es el contenido de la fase `transicion`.

---

# PARTE 3 — ACTIVACIÓN (§9 del estudio del 30 ago)

El hallazgo C del estudio decía que Mecha no tiene un problema de funciones que faltan sino de
funciones construidas que nadie usa. **Sigue siendo verdad, con un matiz nuevo bueno.**

## El salón real (`florent_surez_peluqueros_15004`), medido el 31 ago

```
Servicios activos ..........................  72
  con reposo configurado ...................   7   (9,7 %)   <- era 8,6 %
  reservables online .......................  46   (64 %)
  con recurso_tipo asignado ................   0
Productos ..................................  116
  tarifados (envase + coste) ...............   0             <- escandallo IMPOSIBLE
Citas del salón ............................ 189
  por canal 'web' (portal) .................   3   <- ¡ya no es 0!
  con señal (deposito_requerido) ...........   0
```

Y en toda la base de datos: **0** filas en `cita_consumos`, `comisiones`, `cola_dia`,
`pruebas_alergia`, `reservas_grupo`, `bono_sesiones`, y **0** fases de reposo cronometradas.

## Lo que ha cambiado, y es la mejor noticia del informe

**El portal ha empezado a producir.** 513 citas por canal `web` en toda la base (desde el 5 jul)
y 325 por `whatsapp`. En el salón real son solo 3, pero **ya no es cero**: la máquina funciona
de punta a punta y lo que falta es llevar la clienta hasta ella.

| Canal | Total | En el salón real |
|---|---|---|
| `manual` | 1.171 | 186 |
| `web` (portal) | 513 | **3** |
| `whatsapp` | 325 | 0 |

## Lo que sigue bloqueado por configuración, no por código

1. **El escandallo no puede existir**: 116 productos, **0 tarifados**. `lib/inventario/escandallo.ts`
   está bien escrito y calcula en micros de euro; sin `capacidad_envase` ni `coste_envase_cents`
   no puede devolver nada. Es el técnificador de inventario del bloque 2.
2. **Los recursos no filtran nada**: hay 2 recursos creados y **0 servicios con `recurso_tipo`**.
   La spec 9 está correctamente implementada (`disponibilidad_publica` llama a
   `recurso_hay_hueco_negocio` con la ventana según `recurso_fase`) y **no se ejerce nunca**.
3. **La señal, que es el ROI de 20×, no se ha cobrado jamás.** El motor entero existe.
4. **26 servicios no son reservables online**, y entre ellos están los de color con reposo —
   justo los que más margen dejan y los que el portal debería vender.

## El vínculo con la spec 1, que es el que importa

**7 de 72 servicios tienen reposo configurado.** Aunque la spec 1 se entregue perfecta, sin
catálogo técnificado **no se va a ver**: no habrá ninguna cita con dos reposos porque no habrá
ningún servicio que los declare.

Por eso el paso 2 del plan (§7) no es opcional ni posterior: **el técnificador es lo que da
datos con los que la spec 1 se puede probar y vender**. Si se entrega la spec 1 sobre un
catálogo con 7 servicios técnificados, el resultado medible será el mismo cero de hoy.

---

# PARTE 4 — DOS CABOS SUELTOS QUE NO SON DE LA SPEC 1

Salieron auditando lo anterior. No bloquean nada, pero se pierden si no se anotan.

## 10. El claim de VeriFactu que queda, y es por implicación

El 31 ago se corrigieron 20 claims fiscales falsos en `scripts/seo/pages.mjs` (el generador
de las landings). Queda uno que **el vigilante no marca y probablemente debería**, en el FAQ de
`alternativa-square-appointments`:

> «Porque Square carece de las funciones críticas de una peluquería: no gestiona tiempos de
> reposo (**te hace perder hasta un 40 % de citas**), no guarda fórmulas de tinte estructuradas
> y **no cumple con la normativa española de VeriFactu** ni el registro obligatorio de jornada
> laboral.»

Son **dos** problemas en una frase, y ninguno lo caza `claims-fiscales.mjs` porque literalmente
habla del competidor:

1. **El claim fiscal por implicación.** Decir «Square no cumple VeriFactu» como razón para
   elegir Mecha afirma, sin decirlo, que Mecha sí. Y no cumple: el envío a la AEAT no existe.
   Es más difícil de defender que un claim directo, no menos: la comparativa es justo donde el
   lector lo lee como un hecho verificado.
2. **La cifra sin fuente.** «Hasta un 40 % de citas» no sale de ningún sitio medido. La
   decisión 5 del `CLAUDE.md` («sin claims falsos») lo prohíbe explícitamente para la landing, y
   ya se retiraron cifras así una vez.

**Por qué no lo he tocado:** cambiar una comparativa con un competidor nombrado es decisión
comercial, no técnica, y no tengo con qué sustituir el 40 % (habría que medirlo o quitarlo).

**Si se decide arreglarlo**, el sitio es `scripts/seo/pages.mjs` (las páginas de `web/` son
generadas y gitignoradas), y conviene extender `claims-fiscales.mjs` con un patrón para la forma
comparativa —«no cumple … VeriFactu», «carece de … VeriFactu»— porque hoy es un hueco del
vigilante, no un descuido puntual.

## 11. Las vulnerabilidades de dependencias, y la trampa de arreglarlas

GitHub avisa de 7 en la rama por defecto; `npm audit` local cuenta **19 (7 high, 12 moderate)**.
La diferencia es normal —Dependabot deduplica y solo cuenta lo accionable— pero conviene mirar
el detalle antes de tocar nada, porque **la reparación automática es peor que el problema**.

### La trampa: `npm audit fix --force` degrada el proyecto

Doce de los diecinueve avisos proponen como arreglo `expo@46.0.21`, marcado
`isSemVerMajor: true`. Mecha va en **Expo ~54 con expo-router 6**. Eso no es una actualización:
es **bajar ocho majors** y romper el producto entero. Afecta a `expo`, `@expo/cli`,
`@expo/config`, `@expo/config-plugins`, `@expo/metro-config`, `uuid`, `xcode` y compañía.

> **Regla:** aquí no se corre `npm audit fix --force` jamás. Se miran uno a uno.

### El reparto real

| Grupo | Paquetes | Riesgo real |
|---|---|---|
| **Cadena de build** (no viaja al navegador) | `metro`, `metro-config`, `metro-transform-worker`, `@expo/metro`, `@expo/*`, `image-size`, `js-yaml`, `brace-expansion`, `xcode` | DoS y consumo de CPU **en la máquina que compila**. Molesto en CI, no alcanzable por un usuario |
| **Directas** | `expo`, `expo-splash-screen` | Su «arreglo» es el downgrade de arriba. No se toca sin un plan de actualización |
| **Runtime, y es el único** | `dompurify` | Ver abajo |

### El único con camino hasta el navegador: `dompurify`

`jspdf@4.2.1` arrastra `dompurify@3.4.12`, y **está en el bundle de producción** —comprobado:
`web/app/_expo/static/js/web/purify-*.js`—. El aviso es
[GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7): *IN_PLACE hook removal
leaves a detached subtree executable*, o sea, un bypass del saneado que deja ejecutable un
subárbol.

Dónde se usa jsPDF en Mecha, que es lo que decide si importa:

```
lib/caja/ticketPdf.web.ts       el ticket fiscal
lib/jornadaPdf.web.ts           el registro de jornada (art. 34.9 ET)
lib/presupuestoPdf.web.ts       los presupuestos
```

**La cadena teórica que habría que descartar:** el nombre y las notas que entran por el
**portal público** los escribe la clienta, acaban en la ficha, y de ahí en un PDF que se genera
**en el navegador del salón**. Es el único punto donde texto de un tercero pasa por ese
sanitizador.

**No está demostrado que sea explotable aquí** —jsPDF usa DOMPurify sobre su propio HTML de
render, no sobre el DOM de la app— y por eso no lo he tratado como incidente. Pero es el único
de los 19 con superficie de usuario, tiene `fixAvailable: true` **sin downgrade**, y por tanto
es el que se mira primero.

### Orden sugerido

1. `dompurify` (vía `jspdf`) — el único con camino a un navegador, y se arregla solo.
2. `brace-expansion`, `image-size`, `js-yaml` — `high`, arreglo directo, sin downgrade.
3. La familia `metro`/`@expo/metro` — arreglo disponible, pero verificar que el build sigue
   dando el mismo bundle (`npm run build:web` + `scripts/vigilantes/peso-bundle.mjs`).
4. `expo` / `expo-splash-screen` — **no tocar** salvo dentro de una subida de versión planeada.

---

## 12. Orden recomendado

```
1.  Paso 1 del §7      Llevar las 20 funciones del grupo A a la costura.
                       Sin cambio de comportamiento. Sin riesgo de datos.
                       Se puede repartir y parar en cualquier punto.

2.  Paso 2 del §7      servicios.fases + técnificador de secuencia.
    (= §9 activación)  Es el mismo trabajo que desbloquea la activación.

3.  Paso 3 del §7      La foto y el vigilante de regresión. ANTES de tocar nada.

4.  Paso 4 del §7      Invertir el sentido. El único paso peligroso.
                       Triggers de proyección fuera en la MISMA migración.

5.  Paso 5 del §7      La costura mira cita_fases. Un cambio, 20 funciones.

6.  UI incremental     Borde arrastrable, ±5 min móvil, visual de transicion,
                       cinta de "aquí cabe" (rehaciendo serviciosCompatiblesReposo).

7.  Limpieza           Borrar los 11 huérfanos duplicados; enchufar
                       desinfeccionPausas con la fase transicion.
```

**Y el aviso que vale para todo:** ninguna de estas piezas se da por hecha cuando compila. Se da
por hecha cuando el salón real la ha usado una vez. Hoy hay siete tablas a cero que dicen que
eso todavía no ha pasado.

---

*Medido contra `vtrggiogjrhqtwbhbgia` y contra el árbol de `master` el 31 ago 2026.
Las cifras de §9 cambian solas: volver a contarlas antes de usarlas.*
