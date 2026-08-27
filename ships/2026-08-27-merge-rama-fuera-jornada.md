# Ship: merge de la rama paralela de fuera_jornada (diaCerrado + tests) sobre master

**Estado:** abierto · **Detectado:** 2026-08-27 · **Zona:** rama de worktree con `fuera_jornada` restringido a día cerrado (sesión Claude paralela)

## Contexto

Una sesión paralela implementó `fuera_jornada` en un worktree donde `87f9135e9` (relojSalon.ts) NO era ancestro, así que restringió la publicación al subcaso "día cerrado" (inmune a zona horaria) con un campo `diaCerrado` en `ProblemaAgenda` y filtro `soloPublicable`.

Master ya resolvió el problema completo (`eef06d943`): ambas edges aplican el reloj del salón, publican los DOS subcasos, la RPC acepta los 5 tipos (migración aplicada en producción) y hay auto-descarte con count 0.

## Tarea al mergear

- **Conservar** de esa rama: el campo `diaCerrado` en `ProblemaAgenda` (filtrar por dato > por texto del título) y sus 4 tests del discriminador en `organizarAgenda.test.ts`.
- **Descartar** de esa rama: el filtro `soloPublicable` y la restricción a día cerrado en ambas edges (obsoletos: master tiene reloj), y su versión de `hallazgos-agenda-fuera-jornada.sql` (la de master en `migrations/` es la aplicada).
- Conflictos esperados: el `Promise.all` de consultas de `vigilar-agenda` y los mapas RESUMEN/DETALLE/SEVERIDAD (master añadió `fuera_jornada` y el helper `escribirHallazgos`). Resolver siempre hacia la versión de master.
- Tras el merge: `deno task test` y `deno check --no-config` en ambas edges antes de pushear.

Nota: ese merge no urge — master ya cubre funcionalmente todo lo que esa rama hacía. Solo aporta el discriminador y los tests.
