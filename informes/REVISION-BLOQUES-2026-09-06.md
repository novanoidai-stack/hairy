# Revisión de los bloques paralelos — 6 sep 2026

Revisión del trabajo repartido en
[BLOQUES-PARALELOS-2026-09-06.md](BLOQUES-PARALELOS-2026-09-06.md).

## Veredicto

**No está todo. De seis bloques: uno en producción, tres hechos y sin desplegar,
dos sin empezar.**

| Bloque | Peticiones | Trabajo | En `master` | En producción |
|---|---|---|---|---|
| **A** Navegación | 12, 13 | ✅ 1 commit | ❌ | ❌ |
| **B** Cobro | 2, 3, 5, 10, 11 | ✅ 5 commits | ❌ | ⚠️ solo la BD |
| **C** Extras | 4 | ✅ 6 commits | ❌ | ⚠️ solo la BD |
| **D** Vigilante | ⚠️D | ✅ | ✅ | ✅ |
| **E** Agenda | 1, 6, 7, 8 | ❌ **nada** | ❌ | ❌ |
| **F** Gastos | 14 | ❌ **nada** | ❌ | ❌ |

**Peticiones de Jose entregadas a producción: 0 de 14.**

---

## 1. Evidencia

### Ramas

```
feat/jose-a-navegacion          adelante:1  atras:3
feat/jose-b-cobro               adelante:5  atras:3
feat/jose-c-extras              adelante:6  atras:1
feat/jose-d-vigilante-solapes   adelante:0  atras:0   ← mergeado
```

`master == origin/master` (empujado). Vercel despliega desde `master`.

De los bloques de Jose, `master` contiene **solo** el commit de D
(`56b7f61ac fix(vigilantes): el vigilante de solapes mide la ocupacion real`).

### Ficheros clave, ausentes de `master`

```
components/pos/SelectorCatalogo.tsx                                     NO
lib/datos/addons.ts                                                     NO
scripts/vigilantes/addons-cargador.mjs                                  NO
supabase/migrations/20260906111517_cobro_lineas_de_cualquier_tipo.sql   NO
supabase/migrations/20260906120907_addons_globales_de_salon.sql         NO
```

Y en `master`, la petición 12 sigue sin hacer:

```ts
{ label: 'Caja', ..., group: 'Gestión' }   // sigue en Gestión
```

### Bloques E y F: no existen

Sin rama, sin commit, sin stash. Buscado por nombre de rama, por mensaje de
commit (`gasto`, `solape_forzado`, `forzad`) y en producción:

- `citas.solape_forzado` → **no existe** (0 columnas).
- `gastos` → **sigue con 8 columnas**.

---

## 2. ⚠️ Riesgo activo: la base de datos va por delante del código

**Las migraciones de B y C están aplicadas en producción. Su código no está
desplegado.**

```
20260906111517  cobro_lineas_de_cualquier_tipo   ← bloque B, aplicada
20260906120907  addons_globales_de_salon         ← bloque C, aplicada
20260906205757  vigilante_solapes_...            ← bloque D, aplicada Y en master
```

Las dos primeras **solo existen en ramas que nadie ha mergeado**. Es exactamente
la deriva que este repo ya sufrió: *"`vigilancia_bd_rendimiento()` y
`migraciones_sin_aplicar()` estaban aplicadas en producción y su SQL no estaba en
el repo"*. Si mañana alguien reconstruye desde `master`, esas dos funciones
desaparecen del historial y quedan como magia en la base.

### ¿Hay incidente ahora mismo? No, y no por suerte

Comprobado leyendo la migración de B, que reescribe `crear_cobro_desde_cita` y
`crear_cobro_walkin`:

- **La firma no cambió** (`crear_cobro_walkin(p_lineas, p_metodo, p_propina_cents,
  p_descuento_cents, p_profesional_id, p_cliente_id)`).
- El campo `tipo` de cada línea es **opcional con el mismo valor por defecto de
  antes**:

  ```sql
  -- Compatible hacia atras: sin 'tipo' se deduce como se deducia antes.
  v_tipo := coalesce(
    nullif(trim(coalesce(v_linea->>'tipo','')), ''),
    case when v_ref_id is not null then 'producto' else 'servicio' end);
  ```

El cliente viejo que hay desplegado sigue cobrando. **Verificado por lectura del
código, no ejecutando un cobro**: escribir en `cobros` en producción crea un
eslabón en la cadena antifraude que luego no se borra sin pelea, y la
compatibilidad aquí es inequívoca.

**Aun así hay que cerrarlo**: mergear B y C, o revertir sus migraciones. Dejarlo
así es deuda silenciosa.

### Y no son las únicas

`20260906211058` y `20260906212054` (timeouts de `pg_net` en los crons) también
están aplicadas y viven en `fix/pgnet-timeout-crons`, **1 commit por delante de
`master` y sin mergear**. Mismo problema, otro dueño.

---

## 3. Calidad de lo que sí se hizo: buena

Los tres bloques **respetaron el mapa de propiedad de ficheros**, que era la
condición para que el paralelismo funcionara:

| Bloque | Tocó | Invadió |
|---|---|---|
| A | `Sidebar.tsx` | nada |
| B | `CobroSheet.tsx`, `SelectorCatalogo.tsx` (nuevo), su migración | nada |
| C | `configuracion.web.tsx`, `lib/datos/addons.ts`, su migración, scripts | nada |

Prueba de merge de los tres sobre `master`: **limpia**, sin conflictos.
Vigilantes en la rama C: **0 bloqueantes**, 306 avisos (los dos de add-ons son
deuda declarada del bloque E, con línea base congelada). `npx tsc --noEmit`:
**limpio**.

### Hallazgos propios de los bloques, verificados por mí

**B — el cobro de add-ons estaba muerto desde el 1 sep.**
`crear_cobro_desde_cita` insertaba las líneas de add-on con `tipo='addon'`, valor
que **el CHECK no admite** (`servicio | producto | suplemento | bono`). Cobrar
una cita con extras habría reventado con 23514.
*Verificado:* `cita_addons` tiene **0 filas** en producción — nadie había
enganchado nunca un add-on a una cita, así que el camino estaba muerto y por eso
no saltó. Corregido usando `suplemento`, el valor que el CHECK ya tenía, en vez
de ampliar el CHECK: dos nombres para la misma cosa es cómo empieza un
invariante repartido.

**B — deriva de seguridad preexistente.** `anon` podía ejecutar
`crear_cobro_walkin` pese a que dos migraciones del repo la revocan. No
explotable (sin sesión sale por `sin_perfil`), pero es una RPC financiera.
*Verificado ahora:* `anon=false`, `authenticated=true` en las dos RPC de cobro.

**C — cerró la puerta a que la deriva se repita.** Añadió
`scripts/vigilantes/addons-cargador.mjs` **en el mismo commit** que el cargador
único, con la deuda del bloque E declarada como aviso y con instrucción de
retirarla cuando E entre. Es la regla del `CLAUDE.md` aplicada bien.

---

## 4. Dos errores míos que los bloques corrigieron

Los anoto porque estaban en el informe de planificación y alguien podría
seguirlos:

**1. "178 servicios" era el total de TODOS los salones, no el de Jose.**
Mi consulta fue `count(*) from servicios where activo`, sin filtrar por
`negocio_id`. Lo correcto:

| | |
|---|---|
| Servicios activos de Jose (`florent_surez_peluqueros_15004`) | **78** |
| Servicios activos de todos los salones | 178 |

El argumento no cambia (78 filas a mano tampoco se mantienen), pero la cifra sí.
Bloque C lo detectó y corrigió: `704c6a5f4 fix(addons): el catalogo de Jose son
78 servicios, no 178`.

**2. `CobroSheet.tsx:254` NO era un cuarto cargador de add-ons.**
El Contrato 1 listaba cuatro sitios. Son **tres**. Lo de CobroSheet es
`.from('cita_addons')` filtrado por `cita_id` — los add-ons ya enganchados a una
cita, no el catálogo aplicable a un servicio. Su join a `service_addons` es
legítimo y no debe pasar por el cargador. Bloque C lo documentó en la sección
"lo que no mira, a propósito" de su vigilante.

Consecuencia práctica: **B no tenía ninguna llamada que cambiar**, y el contrato
solo afecta a C (hecho) y a E (pendiente).

---

## 5. Qué falta, en orden

### Inmediato — cerrar la desincronización

1. **Mergear A, B y C a `master`.** Los tres test-mergean limpio. Sin esto, la
   BD de producción tiene funciones cuyo SQL no está en el repo.
2. Decidir qué se hace con `fix/pgnet-timeout-crons` (mismo problema).
3. Desplegar y **verificar sobre el bundle**, no sobre el código: `web/app/` no
   está en git.

### Pendiente de ejecutar — los dos bloques que no existen

- **Bloque E** (peticiones 1, 6, 7, 8): agenda permisiva. El más grande y el de
  más riesgo. Su prerrequisito (**D**) ya está en `master`, así que **no tiene
  nada que lo bloquee**.
- **Bloque F** (petición 14): gastos. Sigue bloqueado por la decisión de campos
  de Jose.

### Pendiente de Jose — sin esto no se cierran C, E ni F

1. **Qué servicios de los 78 pasan a add-ons.** C dejó el script reversible
   hecho (`scripts/migrar-servicios-a-addons.mjs`) y **sin ejecutar**, que es lo
   correcto: no es nuestra decisión.
2. **Quién puede forzar un solape** y si la cita forzada avisa para siempre.
3. **Qué campos lleva un gasto.**
4. **Editar importe con bono**: ¿descuenta sesión igual? (B lo dejó pendiente.)

---

## 6. Resumen para Jose

De sus 14 peticiones, **ninguna se puede ver todavía en el software**. Cuatro
están construidas y a un merge de distancia (12, 13, y la base de 2, 3, 5, 10,
11, 4). Las de la agenda — citar fuera de horario, el menú al clicar, el solape
forzado y ver la agenda al crear la cita — **no se han empezado**. Los gastos,
tampoco.
