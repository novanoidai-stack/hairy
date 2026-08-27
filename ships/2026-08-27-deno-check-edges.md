# Ship: deno check de las edges falla en silencio (deno.json las excluye)

**Estado:** abierto · **Detectado:** 2026-08-27 · **Zona:** `deno.json`, `supabase/functions/`

## Contexto

`deno.json` raíz tiene `"exclude": [... "supabase/functions/" ...]`. Consecuencia: `deno check supabase/functions/cualquier-cosa/index.ts` desde la raíz devuelve solo un `Warning: No matching files found` y **exit 0** — parece que pasa sin haber comprobado nada. Hoy se descubrió porque una sesión creyó que validaba las edges y no estaba validando nada.

## Tarea

1. Añadir al `deno.json` una tarea `check:edges`: `deno check --no-config supabase/functions/vigilar-agenda/index.ts supabase/functions/agenda-optimizador/index.ts` (con `--no-config` el exclude de la raíz no aplica). Ampliarla con más edges si se van añadiendo al flujo.
2. Opcional pero mejor: sacar las edges del `exclude` y ver qué rompe (si el exclude existe es por los imports `../../../lib/*.ts` con resolución bundler; documentar el motivo real en el propio deno.json si se deja como está).
3. Usar esa tarea como paso estándar tras tocar cualquier edge, junto a `npx tsc --noEmit` para la app.
