# Permiso denegado al cambiar el estado de una cita — 8 sep 2026

## Resumen

**Síntoma reportado:** el botón de cambiar el estado de una cita le dice al
usuario "No tienes permisos para hacer esto.".

**Alcance real:** no era un botón — era TODA escritura de `citas` con la sesión
de un usuario (cambiar estado, mover, editar, guardar desde la ficha, crear
desde la agenda). El candado de solapes y las RPC SECURITY DEFINER
(`marcar_cita_no_show`, `crear_cita_publica*`) seguían vivas, y por eso ni el
portal ni el no-show delataron nada hasta que alguien fue a cambiar un estado
a mano.

**Causa raíz (dos defectos que se suman):**

1. **Defecto del repo, desde el 5 sep.** Desde `20260905233000`, todo
   INSERT/UPDATE de `citas` pasa por el sello `trg_citas_sellar_ventanas` →
   `ventanas_ocupadas_de_cita()` → `ventanas_activas_cita()`. Ese trigger es
   SECURITY INVOKER a propósito, así que la cadena corre con los permisos de
   quien escribe. La firma de 4 argumentos estaba revocada a `authenticated`
   desde `20260831204047` (entonces solo la llamaban RPCs definer), y el paso 5
   (`20260905130000`) hizo que la firma de 5 argumentos llamara DENTRO a la de
   4 cuando la cita no tiene fases. La cadena quedó pidiendo permisos que nadie
   le había concedido: una BD recién creada con las migraciones del repo ya
   nacía rota.
2. **Deriva de producción.** En producción la firma de 5 argumentos TAMBIÉN
   estaba denegada a `authenticated` (verificado en vivo con el usuario E2E:
   `POST /rpc/ventanas_activas_cita` → 42501 en ambas firmas). El repo jamás
   revocó esa firma. El vector exacto no es demostrable (Postgres no guarda
   historial de ACLs y `create or replace` preserva las que hay), pero el
   patrón sí: en producción hay migraciones aplicadas a mano desde el
   dashboard (la `20260908150851` de hoy, reconstruida ya en el repo, no
   revoca ventanas; pero si el rol del editor SQL corre con
   `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE FROM PUBLIC`, toda función
   creada desde ahí nace sin el grant que el repo da por sentado — y varias
   migraciones de principios de sep constan aplicadas con timestamp propio).
   Es exactamente el agujero que la skill `migracion-bd-segura` prohíbe
   aplicar a mano: el fichero del repo y la base de verdad dejan de ser el
   mismo objeto.

**Traducción al usuario:** Postgres devuelve `42501`; `lib/errores.ts` lo mapea
a "No tienes permisos para hacer esto." — un mensaje que apuntaba a RLS cuando
el problema eran grants de EXECUTE en funciones del sello.

## Arreglo

`supabase/migrations/20260908155046_permiso_sello_ventanas_citas.sql`,
aplicada vía CLI (`supabase db query --linked`) y registrada con
`supabase migration repair --status applied 20260908155046`:

- `grant execute` a `authenticated, service_role` para las dos firmas de
  `ventanas_activas_cita` y para `ventanas_ocupadas_de_cita` (esta última
  funcionaba por el grant POR DEFECTO de PUBLIC; los grants por defecto son los
  que una sesión de dashboard pierde sin rastro, así que quedan atados).
- `anon` sigue SIN permiso: el portal público escribe por las RPC definer.
- Seguridad del grant: la de 4 argumentos es aritmética pura sobre sus marcas;
  la de 5 lee `cita_fases` como INVOKER, con la RLS del llamante filtrando
  otros negocios.

## Invariante nuevo (para que no vuelva a pasar inadvertido)

`bd-escritura-critica` ya hacía un INSERT real de citas... **con la clave de
servicio**, que no pide los grants de `authenticated`: hoy ese vigilante daba
verde mientras ningún usuario podía escribir. Se extiende con una **pata de
usuario**: login E2E real + PATCH del estado ACTUAL de una cita de su negocio
(no-op de datos, viaje completo por triggers y candado). Cualquier 403/42501
es BLOQUEANTE y el título lleva el nombre de la función denegada. Con tests
(`bd-escritura-critica.test.mjs`, 6/6) y la deuda de test rebajada en
`meta-contrato-baseline.json` (de 9 a 8).

## Verificación

- Reproducción antes: PATCH `citas` como usuario → **403 42501**
  "permission denied for function ventanas_activas_cita" (rol `owner`).
- Reproducción después: PATCH → **200**. Probado con roles `owner`, `employee`
  y `recepcion` (204). Restaurado todo lo tocado (estado y rol).
- `npm run vigilar:rapido` → 0 bloqueantes, 282 avisos (antes 283).
- `npm run vigilar:bd` → 0 bloqueantes, 297 avisos (antes 300).
- `npm run vigilar:test` → 418 pass, 0 fail.
- `npx tsc --noEmit` → limpio.
- `npm run test:componentes` → 6/6.
- Evidencia en `repro-permiso-citas.json` (antes/después).

## Qué queda abierto (no de hoy)

- Reconstructuir el fichero de `20260908150851_cerrar_senales_y_captchas` con
  `pg_get_functiondef()` de producción (lo pide `bd-migraciones`).
- P0s ya documentados en `informes/auditoria-2026-09-08/INFORME.md`: migración
  `20260907224902` sin aplicar (tarjeta regalo), token `sbp_` por revocar.
