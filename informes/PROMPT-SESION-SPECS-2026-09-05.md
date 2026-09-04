Vas a ejecutar el paso 4 de la spec 1 de Mecha: INVERTIR EL SENTIDO de la
sincronización. Es el único paso peligroso del plan y el que ya tumbó producción
dos veces. Todo lo que había que tener ANTES de tocarlo ya está: la foto y el
tripwire. Ahora sí se puede hacer — pero como si llevaras dinamita.

ANTES DE TOCAR NADA, lee enteros:
  informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md    (el plan; §7 pasos 3-5,
    y §3 la forense del desastre del 30 ago — es OBLIGATORIO releerla)
  supabase/migrations/20260904151604_servicios_fases_plantilla_y_proyeccion_anclada.sql
  supabase/migrations/20260904190000_paso3_foto_y_rpc_de_regresion_fases.sql
  supabase/migrations/20260904155547_aplicar_tecnificacion_con_fases.sql

ESTADO REAL, medido el 4 sep por la tarde (no lo re-cites, re-compruébalo):
  - Paso 2 ENTERO aplicado: servicios.fases + fases_de_plantilla() anclada +
    el tecnificador propone secuencias (edge desplegada) + RPC de aplicación.
  - 14 servicios del salón real (`florent_surez_peluqueros_15004`) con plantilla:
    8 de reposo único (idénticos al camino clásico) y 6 mechas con DOS reposos.
  - Paso 3 HECHO (commit 69c052208): foto `respaldos.citas_antes_de_fases_v2`
    con 1.968 citas de 4 negocios, y RPC `regresion_citas_fases_v2()` que cuenta
    cuántas cambiaron de duración. Tripwire activo en la edge de vigilancia.
  - Última medida: 0 citas con duración cambiada.
  - `citas` MANDA y `cita_fases` es proyección; los triggers trg_seed_fases_from_cita
    y trg_resync_fases_de_cita siguen instalados. Todo eso es lo que inviertes.

TU TRABAJO (migración ÚNICA, atómica):

1. El trigger de resumen: AFTER INSERT/UPDATE/DELETE ON cita_fases, escribe en
   `citas` las 4 marcas. Las fórmulas están decididas ya — usa las de la
   migración 20260904151604 (§5), NO las literales de la spec original:
     inicio/fin  = min(fase.inicio) / max(fase.fin)
     fin_activa  = INICIO DEL PRIMER REPOSO (la spec decía "fin de la primera
                   activa" y es un error: con transición declararía libre un
                   tramo con trabajo)
     fin_espera  = fin del PRIMER reposo
2. Los triggers de proyección (trg_seed_fases_from_cita, trg_resync_fases_de_cita)
   se RETIRAN EN LA MISMA MIGACIÓN. Los dos sentidos a la vez son literalmente
   el desastre del 30 ago. Sin excepción.
3. RECURSIÓN: el trigger de resumen escribe en `citas`; comprueba en pg_trigger
   que NINGÚN trigger de citas escriba en cita_fases antes de aplicar, y pon
   `pg_trigger_depth() = 0` de guarda si hace falta.
4. EL BACKFILL, con los triggers desactivados y en UN SOLO INSERT...SELECT.
   Nada de fila a fila — así murió la vez anterior: la primera fila insertada
   disparaba el enganche y colapsaba la cita. Genera las 1-3 fases por cita
   desde las marcas actuales (para los servicios SIN plantilla es exactamente
   la descomposición clásica; para los 14 con plantilla, fases_de_plantilla()).
5. Verifica contra la foto: `select * from regresion_citas_fases_v2()` tiene que
   dar 0 filas. Y NO vale el verde del panel: lanza `npm run vigilar:bd` tú.
   Compara DENTRO de una sola transacción (begin; ... rollback;) si sondeo
   antes: congela now() y te aísla de la resiembra de la demo (cada 2 h).

ENSAYO OBLIGATORIO ANTES DE APLICAR NADA: la migración entera dentro de un
begin/rollback sobre producción, y en esa misma transacción
   foto -> migración -> regresion_citas_fases_v2() -> count de fases por tipo
El count de fases por tipo tras el backfill tiene que cuadrar con lo esperado
(hoy: 2.876+ fases, ~541 reposos, 0 transición; los 14 servicios con plantilla
aún no tienen citas que hayan pasado por sembrar desde su tecnificación, así
que el backfill desde las marcas reproduce el mundo clásico — dilo y cuéntalo).

PROHIBIDO, y ya sabes por qué:
- NO dejes los dos sentidos de sincronización activos. Ni un minuto.
- NO hagas el backfill fila a fila ni con triggers de resumen activos.
- NO uses `npm audit fix --force` (baja Expo de 54 a 46).
- NO toques la clave de ocupación: `ventanas_activas_cita()` con cross join
  lateral, NUNCA envuelta en booleano (15 ms vs 883 ms). El paso 5 —que la
  costura mire cita_fases— NO entra en esta sesión. Uno por sesión.

AL APLICAR: si usas el MCP de Supabase, registra su propio timestamp: renombra
el .sql después para que coincida, o el vigilante de migraciones avisa para
siempre. El 4 sep se aplicó por Management API y hubo que registrar la versión
a mano en supabase_migrations.schema_migrations — si vas por ahí, acuérdate.

VERIFICAS CON:
  npx tsc --noEmit
  npm run vigilar        (comprueba que imprime el informe ento: si solo sale
                          una línea de [peso-bundle] el runner está muerto)
  npm run vigilar:bd     (aquí vive el tripwire: 0 bloqueantes o te explicas)
  npm run vigilar:test
  npm test
  npx playwright test tests/smoke --project=publico
                          (el "resenas" flakea en tanda: reejecútalo solo
                          antes de declararlo roto)

Y DESPUÉS, EN PRODUCCIÓN DE VERDAD (no en rollback): crea una cita de prueba de
una de las 6 mechas con dos reposos y comprueba en la agenda que se pintan las
dos bandas de reposo, que el inicio no se mueve al estirar la primera, y que
disponibilidad_publica ofrece hueco DENTRO del segundo reposo. Esos son los
criterios 1, 2 y 3 de aceptación del §9 del plan. Borra la cita de prueba.

CIERRE: commitea la migración y actualiza la nota del día en memory/. Anota en
el commit el resultado del ensayo (citas/fases antes-después). El paso 5 y la
UI incremental (borde arrastrable, ±5 min móvil, visual de transición, cinta
de «aquí cabe» rehaciendo serviciosCompatiblesReposo) van en sesiones propias.

La regla que no cambia: nada de esto se da por hecho cuando compila. Se da por
hecho cuando el salón real lo ha usado una vez.
