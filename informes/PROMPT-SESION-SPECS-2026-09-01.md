# Relevo: en qué punto están las 14 specs — medido el 1 sep 2026

> Contado contra `vtrggiogjrhqtwbhbgia` el 1 sep 2026, no leído de commits. Complementa
> `informes/SPECS-LO-QUE-FALTA-2026-08-30.md` (el catálogo) y
> `informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md` (el plan de la spec 1).

## El titular

**El cuello de botella ya no es el código.** De las 14 specs, **9 tienen su código completo
y cero uso real**. Solo 1 está cerrada de verdad, y 4 están a medias.

Aplicando la regla del propio catálogo (§16: *«ninguna se da por hecha cuando compila: se da
por hecha cuando el salón real la ha usado una vez»*), lo que queda por hacer no es sobre
todo construir: es **activar**.

## La tabla, con la medida que la respalda

| # | Spec | Código | Uso real medido | Estado |
|---|---|---|---|---|
| 14 | Alquiler de sillón | ✅ | 4 NIF emisores distintos en `tickets_verifactu` | **CERRADA** — su alcance era *no cerrar la puerta*: encadenar por `(negocio_id, nif_emisor, serie)`. Hecho |
| 9 | Recursos en disponibilidad | ✅ `disponibilidad_publica` llama a `recurso_hay_hueco_negocio` | **1** servicio con `recurso_tipo` (era 0) | Código hecho. Falta configurar el catálogo |
| 12 | Series al servidor | ✅ RPC `crear_serie_citas` | 4 citas con `serie_id`, todas anteriores a la RPC | Código hecho. Ninguna serie nueva |
| 6 | Bonos con calendario | ✅ tabla `bono_sesiones` | **0** filas | Código hecho, sin estrenar |
| 5 | Prueba de alergia 48 h | ✅ tabla `pruebas_alergia` | **0** filas | Código hecho, sin estrenar |
| 7 | Cola del día | ✅ tabla `cola_dia` | **0** filas | Código hecho, sin estrenar |
| 8 | Reserva de grupo | ✅ tabla + `crear_cita_publica_grupo` (verificada en vivo el 1 sep) | **0** filas | Código hecho, sin estrenar |
| 11 | Comisiones | ✅ `calcular_comisiones_periodo` | **0** liquidaciones | Se calcula, no se liquida |
| 13 | Retención y caducidad | ✅ funciones de anonimización | sin ejecutar | Código hecho, sin estrenar |
| 10 | Bizum | ✅ `cobros.bizum_cents` + `sesiones_caja` + `cerrar_caja` cuenta bizum | **0** cobros usan la columna, y **243 cobros (8.112 €) con `metodo='bizum'` siguen en `online_cents`** | Ver la trampa de abajo |
| 1 | Reposos múltiples | 🟡 paso 1 de 5 | **0** citas con 2+ reposos, 0 fases `transicion` | En curso |
| 4 | Reloj de reposo | 🟡 | **2** fases cronometradas (eran 0), pero `duraciones_profesional` sigue a **0** | Falta el bucle de realimentación, que es la mitad valiosa |
| 3 | Fórmula → producto | 🟡 `productos.tono` y `.marca` existen | **0** fichas con `producto_id` resuelto | Falta la resolución |
| 2 | Gramajes | 🟡 `cantidad` ya es `numeric`, `cantidad_base` y `abierto_restante` existen | **0** filas en `cita_consumos`, **0** productos tarifados | Bloqueada por datos, no por esquema |

## Dos trampas concretas que valen tiempo

**Spec 10 — la migración de los 243 cobros está bloqueada por la Ley Antifraude.**
`cobros_prevent_financial_updates` congela `total_cents`, `efectivo_cents`, `datafono_cents`,
`online_cents` y `propina_cents`. Mover 8.112 € de `online_cents` a `bizum_cents` es
exactamente un UPDATE de esas columnas: **no se puede**, igual que no se pudieron corregir los
7 cobros descuadrados de la demo. Antes de planificar esa migración hay que decidir si se
acepta que el histórico se quede como está (con su aviso) y la columna solo valga de hoy en
adelante — que es lo que se hizo con los solapes históricos y con los descuadres.
Y de paso: **`bizum_cents` NO está en la lista de columnas que congela ese guarda.** Es una
columna que guarda dinero y no tiene la inmutabilidad de las otras cuatro. Eso es un hueco,
no una decisión.

**Spec 2 — el escandallo no puede existir con 0 productos tarifados.**
`lib/inventario/escandallo.ts` está bien escrito y calcula en micros de euro; sin
`capacidad_envase` ni `coste_envase_cents` no puede devolver nada. No es trabajo de código.

## Por dónde seguir, y por qué

El catálogo (§16) y el plan de la spec 1 (§12) coinciden en lo mismo, y las medidas de arriba
lo confirman: **el bloque 2, activación, va primero**, porque es la condición de entrada de
las tres specs grandes que quedan a medias.

```
1. Técnificador de catálogo (= paso 2 de la spec 1)
     servicios.fases + tarifar inventario.
     Desbloquea a la vez las specs 1, 2 y 3, y es lo unico que hace que la
     spec 1 se pueda VER: hoy 7 de 72 servicios del salon real tienen reposo
     configurado, asi que aunque la spec 1 se entregue perfecta no habra
     ninguna cita con dos reposos que enseñar.

2. Spec 1, pasos 3 a 5     (el 3 ANTES del 4, sin excepcion)
     3 · foto + vigilante de regresion
     4 · invertir el sentido  <- el unico paso peligroso
     5 · que la costura mire cita_fases

3. Activaciones baratas, sin codigo nuevo
     9 · poner recurso_tipo a los servicios que usan lavacabezas o cabina
     11 · cerrar UN periodo de comisiones
     5 · una prueba de alergia de verdad
```

## El prompt para la siguiente sesión

> Vas a seguir con las specs de Mecha. Antes de tocar nada, lee entero:
>
> - `informes/PROMPT-SESION-SPECS-2026-09-01.md` (este fichero: dónde está cada spec, medido)
> - `informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md` (el plan en cinco pasos; el paso 1
>   ya está hecho y su §7 explica con qué evidencia)
> - `informes/SPECS-LO-QUE-FALTA-2026-08-30.md` §16 (el orden y la regla de "hecha cuando")
>
> **Empieza por el técnificador de catálogo, que es el paso 2 del §7 de la spec 1.** Dos
> mitades:
>
> 1. `alter table servicios add column fases jsonb;` con su CHECK de forma (array de objetos
>    con `tipo ∈ activa|reposo|transicion` y `min > 0`). Ojo: en cuanto esa columna exista, la
>    rama muerta de `sembrar_fases_de_cita()` **empieza a funcionar sola** — ya está escrita y
>    ya la lee con `to_jsonb`. Ese es justo el momento en que la proyección pasa a ser más
>    rica que el resumen de 4 marcas, y por tanto el momento de hacer el paso 4, **y no
>    antes**.
> 2. Extender `supabase/functions/tecnificar-catalogo` y
>    `components/config/ModalTecnificarCatalogo.tsx` para que propongan la **secuencia** de
>    fases y no solo los tres números.
>
> **Lo que NO puedes hacer, y no es retórica — ya tumbó producción dos veces:**
>
> - No hagas el backfill (paso 4) sin antes la foto y el vigilante de regresión del paso 3. El
>   backfill anterior colapsó 2.009 citas reales, 16 futuras en la cartera del único salón que
>   paga, y los valores originales no se pudieron recuperar.
> - No dejes los dos sentidos de sincronización activos a la vez. Los triggers de proyección
>   (`trg_seed_fases_from_cita`, `trg_resync_fases_de_cita`) se retiran en la MISMA migración
>   que instala el trigger de resumen.
> - No escribas un trigger `FOR EACH ROW` que nombre una columna sin comprobar en
>   `information_schema` que existe en ESA tabla. Así se cayó toda alta de citas durante horas.
> - No uses `npm audit fix --force`: propone bajar Expo de 54 a 46 (§11 del plan).
>
> **Al tocar la regla de ocupación**, la costura es `public.ventanas_activas_cita()` y se
> llama con `cross join lateral`, **nunca** envuelta en un ayudante booleano: Postgres no
> inlinea una función escalar cuyo cuerpo es un `EXISTS` sobre una función de conjunto, y eso
> son 15 ms contra 883 ms (59×). Y todo lo que hable de "cita ocupada" —constraints, índices,
> vigilantes— tiene que decir lo mismo que esa función: el 1 sep un `EXCLUDE` que usaba el
> bloque entero prohibió encajar una clienta en el reposo mientras el portal seguía ofreciendo
> el hueco.
>
> **Cómo verificas** (todo en verde antes de dar nada por hecho):
>
> ```
> npx tsc --noEmit
> npm run vigilar
> npm run vigilar:bd
> npm run vigilar:test
> npm test
> npx playwright test tests/smoke --project=publico
> ```
>
> Para probar SQL contra producción sin dejar rastro, envuelve en `begin; … rollback;`.
> Compara siempre **dentro de una sola transacción**: `now()` queda congelado y te aísla de la
> resiembra de la demo, que corre cada 2 h y mueve los números entre dos medidas.
> Los cobros son inmutables por Ley Antifraude: ahí nunca pruebes sin rollback.
> Si aplicas migraciones con el MCP de Supabase, registra su propio timestamp: renombra el
> `.sql` después o el vigilante de migraciones avisa para siempre.
>
> Y la regla que aplica a todo: una spec no se da por hecha cuando compila. Se da por hecha
> cuando el salón real la ha usado una vez. Hoy hay **nueve specs con el código entero y cero
> filas** que dicen que eso todavía no ha pasado.
