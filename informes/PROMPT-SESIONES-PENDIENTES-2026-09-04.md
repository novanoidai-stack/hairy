# Relevo: lo que quedó abierto en las sesiones del 31 ago – 1 sep 2026

> Medido el **4 sep 2026** contra `master` (`fb2957ed7`), contra el proyecto de producción
> `vtrggiogjrhqtwbhbgia` y contra los worktrees de `.claude/worktrees/`.
> No está leído de los transcripts: cada afirmación de abajo se volvió a comprobar hoy.
>
> Complementa `informes/PROMPT-SESION-SPECS-2026-09-01.md` (dónde está cada spec) y
> `informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md` (el plan de la spec 1).

## Estado de ejecución (actualizado 4 sep 2026)

- **S1 — HECHA.** Commit `ea1244e41`. El runner corre los 32 vigilantes, 0 bloqueantes, exit 0.
- **S2 — HECHA.** Commit `a20009490`. El trinquete mide de verdad (39 avisos contra techo 42).
- **S4 — la aplicó OTRA SESIÓN mientras se escribía esto.** `servicios.fases` y
  `fases_de_plantilla()` ya existen en producción (migración `20260904151604`, renombrada al
  timestamp que registró el MCP). 0 servicios con plantilla todavía. El `.sql` sigue **sin
  commitear** en el checkout principal. Antes de lanzar S5 o S6, comprobar en qué punto lo
  dejó esa sesión: el prompt de S4 de abajo ya no describe el estado de hoy.
- **S3, S5 y S6** siguen tal cual.

## El titular

**El runner de vigilantes lleva desde el 1 sep saliendo en verde sin ejecutar un solo
vigilante.** Todo lo que se haya verificado con `npm run vigilar` desde entonces —incluidas
las cinco sesiones de bugs de esa noche— leyó un verde que no medía nada. Por eso la sesión 1
va primera: sin ella, el "cómo verificas" de todas las demás es una mentira.

## Estado de las siete sesiones revisadas

| Sesión | Qué pasó | Queda |
|---|---|---|
| Añadir a `vigilancia_bd()` el guarda de la costura | Su commit está en `master` (`85ad5bf20`) | **Sí** — dejó dos hallazgos; dijiste "sí" a arreglar el primero y saltó el límite → **S1** |
| Fix meta-trinquete | 4 ficheros **sin commitear** en su worktree | **Sí** → **S2** |
| Documentar dos grants a `anon` | Solo se añadió el comentario; la revisión real nunca se hizo | **Sí** → **S3** |
| Tecnificador de catálogo: fases | Migración de 366 líneas **sin commitear y sin aplicar** | **Sí** → **S4** y **S5** |
| Spec 1: reposos múltiples | Paso 1 de 5 cerrado y subido | **Sí** → **S6** |
| Fix test pollution `.sistema` | `2c83dd2c7` en `master` | No |
| Meter `bizum_cents` en el guarda | `84346d158` en `master` | No |

### Lo que NO necesita sesión

- **Los dos `grant … to anon` que dejaban `master` en rojo ya no lo dejan.** `npm run vigilar:test`
  da **355/355, exit 0** (comprobado hoy). El comentario entró con `9cf72604e`. Pero eso solo
  calló al vigilante — la revisión de seguridad es **S3**.
- **Las vulnerabilidades npm** (§11 de la auditoría): cerradas con `overrides` en `fb2957ed7`.
  `dompurify` está en `^3.4.13`, que era el único de los 19 con camino hasta un navegador.
- **`web/sitemap.xml` y `web/sitemap-marketplace.xml` modificados** en el checkout principal:
  es un artefacto regenerado, el diff entero son `lastmod` de `2026-08-31` a `2026-09-01`.
  Ni trabajo ni riesgo: commitéalo suelto o descártalo.
- **El claim del 40 % contra Square** (`scripts/seo/pages.mjs:311`) sigue ahí. La sesión de
  auditoría no lo tocó a propósito: es una cifra sin fuente en una comparativa con un competidor
  nombrado, y sustituirla es **decisión comercial de Jose**, no de código.

---

## S1 · El runner de vigilantes sale en verde sin mirar nada

**Prioridad: máxima. Va antes que todo lo demás.**
Origen: sesión *"Añadir a `vigilancia_bd()` el guarda de la costura de ocupación"*, que lo
encontró al final y se quedó sin turnos justo después de que dijeras "sí".

Comprobado hoy: `npm run vigilar` tarda 43 s, imprime **una sola línea**
(`[peso-bundle] ok: total 8.28 MB …`) y sale con **código 0**.

```
Vas a arreglar el fallo más grave que hay hoy en Mecha: el runner de vigilantes
lleva desde el 1 sep 2026 saliendo en verde sin ejecutar ni un solo vigilante.

REPRODÚCELO PRIMERO, para verlo con tus ojos:

  npm run vigilar

Tarda 43 s, imprime UNA línea ([peso-bundle] ok: total 8.28 MB ...) y sale 0.
No imprime el informe de ningún vigilante. No escribe hallazgos. Sale limpio.

LA CAUSA, ya localizada (verifícala, no te fíes):

scripts/vigilantes/meta-contrato.mjs:100 importa dinámicamente TODOS los .mjs del
directorio que no estén en su propia lista ARCHIVOS_EXCLUIDOS_DE_CONTRATO (línea 17,
9 entradas). Esa lista es una COPIA INCOMPLETA de NO_SON_VIGILANTES de
scripts/vigilantes/meta-registro.mjs (línea 24, 13 entradas). Le faltan cuatro:

  peso-bundle.mjs   rendimiento.mjs   silencios.mjs   dr-backups.mjs

peso-bundle.mjs tiene `process.exit(0)` A NIVEL DE MÓDULO (línea 101). Importarlo lo
EJECUTA, y ese exit(0) mata el proceso entero del runner. De ahí la única línea de
salida y el código 0.

La ironía es exacta y merece quedar escrita: la comprobación 1 de meta-contrato.mjs
es "ningún vigilante usa process.exit()". Habría cazado a peso-bundle — pero muere
importándolo antes de poder imprimir el hallazgo.

POR QUÉ ES GRAVE, y no es solo un script local. En .github/workflows/ci.yml:

  línea 60: node scripts/vigilantes/index.mjs --json vigilancia.json   <- LA PUERTA
  línea 70: node scripts/vigilantes/enviar.mjs vigilancia.json          <- panel Salud
  después:  notificar.mjs (Telegram) e issues.mjs (GitHub issues)

La puerta pasa en verde, `vigilancia.json` NO SE ESCRIBE, y los tres canales de salida
se quedan mudos. Es el canario mudo de la decisión 10 del CLAUDE.md, con 25+ vigilantes,
el panel de staff y las dos alertas detrás.

EL ARREGLO QUE SE ACORDÓ (y por qué ese y no el de cuatro líneas):

Añadir los cuatro nombres a mano a ARCHIVOS_EXCLUIDOS_DE_CONTRATO deja la TERCERA copia
de la misma lista esperando a desincronizarse. La causa raíz es un invariante repartido,
que es exactamente la patología que nombra la decisión 10. Así que:

  1. Exporta la lista desde meta-registro.mjs (es la que está completa y la que tiene
     el comentario de por qué cada fichero está fuera) y consúmela en meta-contrato.mjs.
     Si las dos necesitan matices distintos —"no es un vigilante" no es lo mismo que "no
     necesita contrato"— derívalas de una sola fuente, no las dupliques.
  2. Añade el vigilante que impide la reincidencia: importar un módulo NO puede poder
     matar al runner. Decide con criterio dónde va —una comprobación en meta-contrato,
     o que el runner detecte que un hijo llamó a exit— pero que el fallo sea RUIDOSO.
     Un runner que muere no puede salir 0 nunca más.
  3. Regla del repo que aplica aquí: un vigilante que no ha podido mirar tiene que decir
     "no he podido mirar" en voz alta. Salir 0 es la forma más silenciosa de mentir.

DESPUÉS DEL ARREGLO, y esto es la mitad del trabajo: cuando el runner vuelva a correr
van a salir hallazgos REALES que llevan tres días tapados. NO los escondas ni los
silencies para dejarlo verde. Léelos uno a uno:

  - Los BLOQUEANTES se arreglan o se justifican, aquí o en una tarea aparte con su motivo.
  - Los AVISOS que sean deuda heredada van a su línea base congelada, como el resto.
  - Y dime cuántos había, que es el dato que mide lo que costó el silencio.

VERIFICAS CON:

  npm run vigilar          (tiene que IMPRIMIR el informe, no una línea)
  npm run vigilar:test     (hoy da 355/355, exit 0 — no lo empeores)
  node scripts/vigilantes/index.mjs --json /tmp/v.json && cat /tmp/v.json
                           (el fichero tiene que existir y tener hallazgos dentro)
  npx tsc --noEmit

Prueba de vida obligatoria: rompe a propósito un vigilante (por ejemplo, mete un
process.exit() en uno cualquiera), comprueba que el runner AHORA FALLA A GRITOS, y
deshazlo. Un arreglo de esto que no se demuestre rompiéndolo no está demostrado.

CONTEXTO: meta-contrato.mjs entró el 1 sep 2026 con el commit 78d849697. peso-bundle.mjs
es del 29 ago (9cec46084) y su process.exit() es legítimo: corre en el job e2e como
script suelto, no dentro del runner. El fallo es de la lista, no de peso-bundle.
```

---

## S2 · Aterrizar el arreglo del meta-trinquete que quedó sin commitear

Origen: sesión *"Fix meta-trinquete reading a field that doesn't exist"*. Saltó el límite con
el trabajo hecho y sin commitear.

Estado hoy: worktree `.claude/worktrees/mystifying-mclaren-19f135`, **5 commits por detrás de
`master`**, con 4 ficheros sucios (332 inserciones). El código y sus tests parecen completos;
lo que **no** está bien es el `.sistema/` que arrastra.

```
Vas a terminar y aterrizar un arreglo que quedó a medio camino el 1 sep 2026.

DÓNDE ESTÁ: worktree .claude/worktrees/mystifying-mclaren-19f135 (rama
claude/mystifying-mclaren-19f135), con 4 ficheros modificados SIN COMMITEAR:

  scripts/vigilantes/meta-trinquete.mjs        (+153)
  scripts/vigilantes/meta-trinquete.test.mjs   (+134)
  .sistema/ESTADO_SALUD.md                     <- NO se commitea, ver abajo
  .sistema/estado-salud.json                   <- NO se commitea, ver abajo

Ese worktree está 5 commits por detrás de master. Empieza rebasando.

QUÉ ARREGLA, y por qué merece entrar:

meta-trinquete es el vigilante que impide que la deuda técnica crezca en silencio: compara
los avisos del snapshot de salud contra un techo congelado. En master lee el recuento con
`snapshot.avisos ?? 0` (línea 59) — y ese campo NO EXISTE en el snapshot. compilar-estado.mjs
lo escribe DENTRO de `resumen` (`resumen.avisos`). El `?? 0` convertía ese hueco en un cero,
así que la comparación real era siempre evaluarTrinquete(0, 42): el trinquete llevaba desde
que se escribió en verde sin haber comparado jamás una cifra.

Y el mismo fallo otra vez debajo: `configBase.maximo_avisos_permitidos ?? 45` (línea 52) cae
a un 45 que es MÁS PERMISIVO que el techo real (42). Una línea base mal escrita aflojaba el
trinquete en silencio, que es lo contrario de lo que hace un trinquete.

El trabajo sin commitear ya sustituye los dos `??` y los `if (!existsSync) return []` por
AnclaPerdida, que es lo correcto: los dos ficheros que lee están VERSIONADOS, así que no
existe el caso legítimo de "aquí no aplica" que sí tiene el bundle en claves.mjs. Si falta
uno, alguien lo ha borrado, y eso se dice a gritos.

LO QUE TIENES QUE HACER:

1. Rebasa el worktree sobre master (fb2957ed7 o posterior).
2. REVISA el trabajo antes de firmarlo. No es tuyo: léelo entero y comprueba que
   `resumen.avisos` es de verdad el campo que escribe compilar-estado.mjs, que los tests
   nuevos prueban el fallo real (no solo la forma nueva) y que AnclaPerdida se propaga hasta
   convertirse en hallazgo bloqueante en el runner.
3. DESCARTA los dos ficheros de .sistema/. Su diff dice bloqueantes 0 -> 2 y avisos 39 -> 37,
   y esos 2 bloqueantes son los grants a anon que ya se arreglaron en 9cf72604e: es un
   snapshot regenerado desde un master que estaba en rojo y hoy ya no lo está. Además, la
   regla del repo: regenerar el snapshot desde una rama sucia BAJA el contador de deuda, no
   solo ensucia el diff — lo leen meta-trinquete y guardrail-ia como línea base.
   Si hay que regenerarlo, se hace en un commit aparte y desde master limpio.
4. Commit solo de los dos ficheros de scripts/vigilantes/, rebase limpio, push a master.

VERIFICAS CON:

  node --test scripts/vigilantes/meta-trinquete.test.mjs
  npm run vigilar:test
  npm run vigilar
  npx tsc --noEmit

PRUEBA DE VIDA, que es lo que de verdad demuestra el arreglo: el trinquete tiene que
DISPARAR. Sube a mano el recuento del snapshot por encima de 42, comprueba que sale el
hallazgo bloqueante, y deshazlo. Luego rompe el campo (quítale `resumen` al JSON) y comprueba
que lanza AnclaPerdida en vez de leer cero. Sin esas dos pruebas no sabes si lo has arreglado
o si has cambiado un silencio por otro.

OJO: scripts/vigilantes/meta-trinquete-baseline.json existe y está congelado en
maximo_avisos_permitidos: 42, con fecha 2026-09-01. Si el recuento REAL resulta estar por
encima de 42 cuando el vigilante empiece a medir de verdad, NO subas el techo para que pase.
Eso es exactamente lo que el trinquete existe para impedir. Cuéntamelo y decidimos.

DEPENDENCIA: si la sesión del runner de vigilantes (meta-contrato / peso-bundle) no está
hecha todavía, `npm run vigilar` te va a salir en verde sin ejecutar nada — incluido este
vigilante. Compruébalo antes de fiarte de ese comando: si solo imprime una línea de
[peso-bundle], está muerto y tienes que ejecutar meta-trinquete suelto.
```

---

## S3 · El anti-abuso de verdad de las dos RPC públicas de pago

Origen: sesión *"Documentar dos grants a `anon` que dejan `master` en rojo"*. Saltó el límite
tras dos comandos: **de sus cuatro puntos, solo entró el comentario** (por otra vía, en
`9cf72604e`). Los puntos 1 a 3 —que eran los importantes— no se hicieron.

Su propio prompt lo avisaba: *«no confundir "el vigilante se calla" con "está bien"»*. Es
justo lo que ha pasado.

```
Vas a hacer la revisión de seguridad que quedó sin hacer el 1 sep 2026. El vigilante ya
está callado, pero a nadie le consta que las dos RPC estén bien: solo se les puso el
comentario que el vigilante exige.

DÓNDE: supabase/migrations/20260901170000_restaurar_cobro_online.sql

  línea 286: grant execute on function public.pago_info_publica(text) to anon, ...
  línea 354: grant execute on function public.completar_datos_pago_publico(
               text, text, text, text, boolean) to anon, authenticated;

LA REGLA (decisión 4 del CLAUDE.md, round 4 de seguridad): toda RPC pública necesita su
grant explícito Y un comentario que diga qué la hace pública y CÓMO se defiende del abuso.
El comentario está. La defensa hay que comprobarla.

LO QUE YA HE MIRADO YO, para que no repitas camino (verifícalo, no te fíes):

completar_datos_pago_publico ESCRIBE sin sesión. Recibe un token, y con él:
  - hace UPDATE sobre public.clientes (nombre, teléfono, email)
  - hace INSERT en public.consentimientos_cliente

Lo que SÍ tiene:
  - Puerta por token opaco con TTL: select ... from cita_pago_enlaces
    where token = p_token and expira_at > now(). Sin token vivo no hace nada.
  - No pisa datos buenos: solo rellena campos vacíos o inválidos (el CASE de cada columna).
  - Valida nombre (>= 2 chars), teléfono normalizado (>= 7 dígitos) y consentimiento.

Lo que NO tiene, y es lo que hay que decidir:
  - NINGÚN límite de intentos. Con UN token válido, cada llamada mete otra fila en
    consentimientos_cliente — el insert es incondicional, no hay upsert ni comprobación de
    si ya existe. Eso es escritura anónima sin tope sobre una tabla de CUMPLIMIENTO LEGAL
    (RGPD): no solo crece sin límite, es que ensucia el registro de consentimientos de una
    clienta real con entradas falsas fechadas a now().
  - No he comprobado la ENTROPÍA del token. cita_pago_enlaces se rellena en la línea 66 de
    esa misma migración: mira cómo se genera. Si es adivinable, todo lo demás da igual.

TU TRABAJO:

1. Lee las dos funciones ENTERAS y comprueba de verdad cómo se atan. pago_info_publica es
   solo lectura (mira qué PII devuelve y si el token la protege bien);
   completar_datos_pago_publico escribe, y es la que pesa.
2. Comprueba la entropía y el ciclo de vida del token: cómo se genera, cuánto vive, si se
   invalida al usarse, si se puede enumerar.
3. Decide y arregla. Si la defensa NO existe —y para el insert de consentimientos creo que
   no— el arreglo es AÑADIR EL ANTI-ABUSO, no ampliar el comentario. Hay patrón que copiar
   en el propio portal: crear_cita_publica tiene límites por teléfono/IP/negocio
   (20260830190511_crear_cita_publica_una_sola_firma_con_gate.sql y
   20260805171343_rate_limit_edges_publicas.sql).
   Para el insert, plantéate además si no debería ser idempotente por (cliente_id, tipo,
   token): un consentimiento por enlace de pago, no uno por clic.
4. Actualiza el comentario de cada grant para que describa la defensa REAL que quede, no
   la que nos gustaría.

REGLAS DE LA CASA QUE APLICAN AQUÍ:

- La regla del parámetro: si una RPC recibe un id del que se deduce el negocio, tiene que
  atarse a quien llama. Estas dos no pueden usar exige_mi_negocio() porque son del portal
  público y no hay sesión — su prueba de tenencia es el secreto por registro (el token).
  Por eso la calidad de ese token ES el control de acceso, y no un detalle.
- Si aplicas una migración con el MCP de Supabase, registra su propio timestamp: renombra
  el .sql después o el vigilante de migraciones avisa para siempre.
- Para probar SQL contra producción, envuelve en begin; ... rollback;. Los cobros son
  inmutables por Ley Antifraude: ahí nunca pruebes sin rollback.

VERIFICAS CON:

  npm run vigilar:test     (hoy 355/355, exit 0 — tiene que seguir)
  npm run vigilar
  npm run vigilar:bd

Y la comprobación que de verdad cierra esto: monta el abuso en producción dentro de
begin; ... rollback; — llama N veces con un token válido y cuenta las filas que aparecen
en consentimientos_cliente. Si salen N, el agujero está confirmado y el arreglo tiene que
hacer que salgan 1 o 0.
```

---

## S4 · Tecnificador de catálogo, mitad (a): `servicios.fases` en producción

Origen: sesión *"Tecnificador de catálogo: fases"*, interrumpida a mitad de la verificación.
Es el **paso 2 del §7 de la spec 1** y desbloquea a la vez las specs 1, 2 y 3.

Estado hoy, comprobado contra producción: **`servicios.fases` NO existe**, y la migración
`supabase/migrations/20260901180000_servicios_fases_plantilla_y_proyeccion_anclada.sql`
(366 líneas) está **sin trackear en git y sin aplicar**. Es un borrador bueno: tiene la
cuenta de por qué hay que anclar las fases a `[inicio, fin]` real (60 de 1.917 citas no
cuadran con el catálogo) y deja fuera a propósito el paso 4.

```
Vas a cerrar la mitad (a) del técnificador de catálogo, que es el paso 2 del §7 de la
spec 1 de Mecha. Una sesión anterior lo dejó escrito y sin aplicar.

ANTES DE TOCAR NADA, lee enteros:
  informes/PROMPT-SESION-SPECS-2026-09-01.md              (dónde está cada spec, medido)
  informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md    (el plan; el paso 1 ya está hecho)
  supabase/migrations/20260901180000_servicios_fases_plantilla_y_proyeccion_anclada.sql

ESE ÚLTIMO ES EL TRABAJO. Está SIN TRACKEAR en git y SIN APLICAR en producción (comprobado
el 4 sep: servicios.fases no existe y no hay migración con ese timestamp en el historial
remoto). Son 366 líneas y su cabecera explica el diseño. Lo que trae:

  1. servicios.fases jsonb + su CHECK de forma (array de objetos con
     tipo ∈ activa|reposo|transicion y min > 0).
  2. public.fases_de_plantilla(): la costura que convierte una plantilla en los tramos
     concretos de UNA cita, anclados a su [inicio, fin] REAL.
  3. sembrar_fases_de_cita(): su rama de plantilla —escrita hace tiempo y muerta hasta
     ahora— pasa por esa costura.
  4. citas_normalizar_fases(): las 4 marcas se deducen de la MISMA costura, para que el
     resumen y la proyección no puedan contradecirse.

POR QUÉ ANCLA, que es la decisión que más importa de la migración: la rama de plantilla
extendía las fases desde c.inicio sumando minutos del CATÁLOGO, sin mirar c.fin. Y la
duración de una cita no siempre es la del catálogo: de las 1.917 citas con servicio vivo,
60 NO cuadran (53 más cortas, hasta -45 min; 7 más largas, hasta +30), por los overrides
por profesional y por ajustes a mano. Sin anclar, una cita más larga que el catálogo deja
su última fase activa acabando ANTES que la cita, y la agenda ofrece como LIBRE una silla
con una clienta sentada. Por eso fases_de_plantilla garantiza siempre
min(fase.inicio) = cita.inicio y max(fase.fin) = cita.fin.

TU TRABAJO:

1. REVISA la migración entera antes de aplicarla. No es tuya. Comprueba en especial:
   - que el CHECK no puede tumbar la pantalla de servicios (un CHECK que llama a una
     función se evalúa con los permisos de QUIEN ESCRIBE: pruébalo con
     `set local role authenticated`, que es lo que hizo la sesión anterior);
   - que ningún trigger FOR EACH ROW nombra una columna sin comprobar en
     information_schema que existe en ESA tabla (así se cayó toda alta de citas horas);
   - que sigue dejando fuera el paso 4: `citas` manda, `cita_fases` es proyección, y los
     triggers trg_seed_fases_from_cita y trg_resync_fases_de_cita se quedan donde están.
2. Repite el ensayo de regresión que faltó el 30 de agosto, DENTRO de una sola transacción:
   contar cuántas citas y cuántas fases cambian, y que dé CERO. La sesión anterior lo midió
   y le dio 1.917 citas / 0 marcas movidas y 2.876 fases / 0 diferencias — reprodúcelo, no
   lo cites.
3. Añade la propiedad que de verdad importa y compruébala sobre una rejilla: SQL nunca
   declara libre un minuto en el que la plantilla pone trabajo. Incluye el camino ANÓNIMO
   del portal (disponibilidad_publica), que es por donde entra una clienta de verdad.
4. Aplica, y luego commitea el .sql. Si lo aplicas con el MCP de Supabase, registra su
   propio timestamp: RENOMBRA el fichero después para que coincida, o el vigilante de
   migraciones avisa para siempre.

PROHIBIDO, y no es retórica — ya tumbó producción dos veces:
- NO hagas el backfill (paso 4) en esta sesión. Ni aunque veas que la rama de plantilla ya
  funciona. El paso 4 necesita antes la foto y el vigilante de regresión del paso 3. El
  backfill anterior colapsó 2.009 citas reales, 16 futuras en la cartera del único salón que
  paga, y los valores originales NO se pudieron recuperar.
- NO dejes los dos sentidos de sincronización activos a la vez.
- NO uses `npm audit fix --force`: propone bajar Expo de 54 a 46.

AL TOCAR LA REGLA DE OCUPACIÓN: la costura es public.ventanas_activas_cita() y se llama con
cross join lateral, NUNCA envuelta en un ayudante booleano (15 ms vs 883 ms, 59x). Y todo lo
que hable de "cita ocupada" —constraints, índices, vigilantes— tiene que decir lo mismo que
esa función: el 1 sep un EXCLUDE que usaba el bloque entero prohibió encajar una clienta en
el reposo mientras el portal seguía ofreciendo el hueco.

VERIFICAS CON:
  npx tsc --noEmit
  npm run vigilar
  npm run vigilar:bd
  npm run vigilar:test
  npm test
  npx playwright test tests/smoke --project=publico

Para probar SQL contra producción, begin; ... rollback;. Compara siempre DENTRO de una sola
transacción: congela now() y te aísla de la resiembra de la demo, que corre cada 2 h y mueve
los números entre dos medidas.

DEPENDENCIA: comprueba que `npm run vigilar` imprime el informe. Si solo imprime una línea de
[peso-bundle] y sale 0, el runner está muerto (fallo conocido del 1 sep) y ese "verde" no
vale como verificación.

NO ENTRA EN ESTA SESIÓN la mitad (b): que la IA proponga la secuencia de fases
(supabase/functions/tecnificar-catalogo y components/config/ModalTecnificarCatalogo.tsx).
Va en su propia sesión, después de esta.
```

---

## S5 · Tecnificador de catálogo, mitad (b): que la IA proponga la **secuencia**

Origen: la misma sesión. Esta mitad **no se empezó** — los dos ficheros no se tocan desde
`0f615d62d`.

**Depende de S4**: sin la columna `servicios.fases` no hay dónde guardar lo que proponga.

```
Vas a hacer la mitad (b) del técnificador de catálogo de Mecha: que la propuesta de la IA
incluya la SECUENCIA DE FASES de un servicio, no solo los tres números de siempre.

REQUISITO PREVIO: la columna servicios.fases tiene que existir ya en producción, con su
CHECK de forma (array de objetos con tipo ∈ activa|reposo|transicion y min > 0). La trae
la migración 20260901180000_servicios_fases_plantilla_y_proyeccion_anclada.sql. Si no está
aplicada, para: esta sesión no puede empezar.

ANTES DE TOCAR NADA:
  informes/PROMPT-SESION-SPECS-2026-09-01.md
  informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §7
  supabase/functions/tecnificar-catalogo/
  components/config/ModalTecnificarCatalogo.tsx
  la migración de arriba, para saber la forma EXACTA que acepta el CHECK

QUÉ HAY QUE CONSEGUIR, y por qué importa: hoy 7 de 72 servicios del salón real tienen
reposo configurado. Aunque la spec 1 se entregue perfecta, no habrá ninguna cita con dos
reposos que enseñar. Esta es la pieza que hace que la spec 1 se pueda VER.

Las dos mitades del cambio:
  - La edge function tecnificar-catalogo tiene que proponer la secuencia (p. ej.
    activa 15 / reposo 40 / activa 20 para un tinte) además de los tres números que ya da.
  - ModalTecnificarCatalogo.tsx tiene que enseñarla, dejar editarla y guardarla en
    servicios.fases con la forma que el CHECK acepta.

REGLAS DE LA CASA QUE APLICAN AQUÍ:

- CAPA DE IA, UNA SOLA PUERTA (decisión 8): toda llamada a un LLM pasa por
  supabase/functions/shared/openrouterClient.ts. Ninguna edge hace fetch a openrouter.ai ni
  escribe un id de modelo a mano. Los ids, capacidades y precios viven SOLO en
  shared/modelos.ts. Antes de tocar modelos.ts: `npm run verificar:modelos`.
  La cascada NO se escribe a mano: se pide por capacidad y el cliente filtra.
- La respuesta del modelo hay que VALIDARLA contra el mismo CHECK antes de guardar. Un
  modelo que devuelve `min: 0` o un tipo inventado no puede llegar a la base de datos: que
  falle en el cliente con un mensaje útil, no con un error de constraint.
- Móvil primero: useResponsive() (lib/hooks/useResponsive.ts, isMobile <768) en toda
  pantalla. Nada de grids con columnas px fijas; usa minmax(0,1fr) o layouts apilados.
- Código en inglés, comentarios en español, sin emojis, sin `any`.
- Coste: shared/chispa-auditoria.ts registra cada llamada con el precio real de modelos.ts.

CUIDADO CON UNA COSA: en cuanto un servicio tenga plantilla, la rama de plantilla de
sembrar_fases_de_cita() empieza a funcionar SOLA para las citas de ese servicio. Eso es lo
esperado y por eso la mitad (a) ancla las fases a [inicio, fin] real. Pero significa que
esta sesión CAMBIA DATOS DE AGENDA en cuanto alguien guarde una plantilla: prueba primero
en demo_salon_001, mira la agenda y el portal con tus ojos, y solo después toca el catálogo
del salón real.

NO HAGAS el backfill (paso 4 de la spec 1) en esta sesión, pase lo que pase.

VERIFICAS CON:
  npx tsc --noEmit
  npm run vigilar
  npm run vigilar:bd
  npm run vigilar:test
  npm test                 (deno, edge functions)
  deno task test:ia
  npx playwright test tests/smoke --project=publico
  npm run build:web        (y mira la pantalla de verdad, en móvil y en escritorio)

Y la regla que aplica a todo esto: una spec no se da por hecha cuando compila. Se da por
hecha cuando el salón real la ha usado una vez.
```

---

## S6 · Spec 1, paso 3: la foto y el vigilante de regresión

Origen: sesión *"Spec 1: reposos asíncronos múltiples"*, que cerró el paso 1 y dejó el relevo
escrito. **Depende de S4.**

Es el último paso sin riesgo de datos, y es el que hace barato (y reversible) el paso 4.

```
Vas a hacer el PASO 3 del §7 de la spec 1 de Mecha: la foto y el vigilante de regresión.
Ni el 4 ni el 5.

ANTES DE TOCAR NADA, lee enteros:
  informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md   (el plan; §7 los cinco pasos,
                                                          §3 la forense de las dos caídas)
  informes/PROMPT-SESION-SPECS-2026-09-01.md             (dónde está cada spec, medido)

DÓNDE ESTAMOS: el paso 1 está hecho (las funciones de ocupación pasan por la costura
ventanas_activas_cita() + citas_chocan_activa_activa(), sin cambiar comportamiento). El
paso 2 —el técnificador, servicios.fases— tiene que estar aplicado ya; si no lo está, para.

POR QUÉ ESTE PASO EXISTE, y no es burocracia: el paso 4 invierte el sentido de la
sincronización y toca las ~2.011 citas de producción. El intento anterior, el 30 ago,
colapsó 2.009 citas reales —16 de ellas FUTURAS, en la cartera del único salón que paga— y
los valores originales NO se pudieron recuperar porque nadie había hecho la foto. Este paso
es esa foto, más el vigilante que canta si los números se mueven.

LO QUE TIENE QUE QUEDAR HECHO:
  - Una foto de los datos que el paso 4 va a tocar, guardada de forma que se pueda
    RESTAURAR, no solo mirar. Decide dónde vive y demuéstralo restaurando una muestra
    dentro de begin; ... rollback;.
  - Un vigilante de regresión que compare el ANTES y el DESPUÉS y falle si no cuadran. Que
    diga en voz alta cuántas filas mira: un vigilante que mira un tenant de pruebas vacío da
    exactamente el mismo verde que uno correcto (así estuvo vigilar-agenda 4.144 ejecuciones
    sobre prueba_46980, con cero hallazgos en toda su vida).
  - El criterio de "esto ha ido mal" escrito ANTES de correr nada, con números.

CÓMO SE MIDE QUE NO HA CAMBIADO NADA (es el método del paso 1, reutilízalo): la cuenta de
huecos de disponibilidad_publica por salón/servicio/día, 14 días, los 4 tenants, antes y
después. Tiene que dar idéntico. Compara siempre DENTRO de una sola transacción: congela
now() y te aísla de la resiembra de la demo, que corre cada 2 h.

PROHIBIDO EN ESTA SESIÓN:
- El paso 4 (invertir el sentido). No lo empieces "para dejarlo preparado". Prefiero que
  esta sesión pare en el 3 con todo verde a que corra para llegar al 5.
- Dejar los dos sentidos de sincronización activos a la vez. Cuando llegue el paso 4, los
  triggers de proyección se retiran en la MISMA migración que instala el de resumen.
- Escribir un trigger FOR EACH ROW que nombre una columna sin comprobar en
  information_schema que existe en ESA tabla.
- `npm audit fix --force`: propone bajar Expo de 54 a 46.

AL TOCAR LA REGLA DE OCUPACIÓN: la costura es public.ventanas_activas_cita(), con cross join
lateral, NUNCA envuelta en un ayudante booleano (15 ms vs 883 ms, 59x). Todo lo que hable de
"cita ocupada" —constraints, índices, vigilantes— tiene que decir lo mismo que esa función.

VERIFICAS CON:
  npx tsc --noEmit
  npm run vigilar
  npm run vigilar:bd
  npm run vigilar:test
  npm test
  npx playwright test tests/smoke --project=publico

begin; ... rollback; para probar contra producción. Los cobros son inmutables por Ley
Antifraude: ahí nunca sin rollback. Si aplicas migraciones con el MCP de Supabase, renombra
el .sql al timestamp que registre.

CUANDO ACABES, dime si la foto y el vigilante te dejan tranquilo para el paso 4, y qué
esperas que muevan exactamente esas 2.011 citas. Esa respuesta es la que decide si el paso 4
se lanza o no.
```

---

## Lo que viene después (no lanzar todavía)

**Spec 1, pasos 4 y 5** — invertir el sentido de la sincronización y que la costura mire
`cita_fases`. Es el único paso peligroso del plan y el que ya tumbó producción dos veces.

**Condición de entrada, sin excepción:** S4 aplicado, S6 cerrado con la foto restaurable y el
vigilante cantando, y una respuesta concreta a *"¿qué esperas que se mueva en esas 2.011
citas?"*. Hasta entonces no hay prompt para esto a propósito.

## Orden y dependencias

```
S1 (runner muerto)  ─── va primero: sin él, "npm run vigilar en verde" no significa nada
 │
 ├── S2 (meta-trinquete)   independiente, pero se verifica mejor con S1 hecho
 ├── S3 (anti-abuso pago)  independiente
 │
 └── S4 (servicios.fases)  ──┬── S5 (la IA propone la secuencia)
                             └── S6 (spec 1, paso 3) ── [paso 4 y 5, bloqueados]
```

S1, S2 y S3 se pueden lanzar en paralelo en worktrees distintos. S4 antes que S5 y S6.
