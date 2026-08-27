# Ship: auditoría de seguridad — RPCs públicas SECURITY DEFINER y leftovers

**Estado:** cerrado 2026-08-27 · Migración `endurecer-internas-advisors` aplicada en producción: (1) política `restrictive using(false)` para anon/authenticated en `agenda_ojos_latido` (tabla solo-servicio por diseño; el trigger corre como postgres); (2) `pg_net` reinstalada en schema `extensions` — `net.http_post` sigue existiendo y el cron `vigilar-agenda` corrió `succeeded` 3 min después. Auditoría de las 3 candidatas: `horas_llamada_ocupadas` y `obtener_estadisticas_mecha` son lecturas públicas de marketing (web/reservar.html, diseno-*.html), intencionales; `registrar_error_cliente` ya tiene rate-limit por IP (40/60 s), truncado y allowlists — 115 filas / 32 huellas, sin señal de abuso. Ningún revoke necesario: todas las RPC públicas restantes son del portal (p_slug/p_token/captcha). Baseline de advisors: los dos lints diana ya no aparecen; quedan solo los WARN de RPCs intencionalmente públicas.

## Contexto

Los advisors de seguridad del proyecto devuelven un baseline largo que nadie ha revisado de golpe. Lo urgente y acotado:

1. **`public.agenda_ojos_latido` tiene RLS habilitado SIN políticas** (INFO, pero o hay que darle sus políticas o quitarle RLS — hoy está a medias, lo peor de ambos mundos: bloquea todo acceso directo por RLS y no define quién puede).
2. **`pg_net` instalada en el schema `public`** (WARN) — moverla a `extensions` o `supabase_functions` según toque.
3. **~35 RPCs `*_publico` SECURITY DEFINER ejecutables por `anon`** vía PostgREST. La mayoría son legítimas por diseño (portal de reservas: `crear_cita_publica`, `disponibilidad_publica`...) y se protegen por token/captcha/llamadas puntules, pero el advisor no distingue: hay que repasarlas UNA a UNa y confirmar que cada una es intencionalmente pública. Candidatos a revisar primero (sin token aparente en la firma): `horas_llamada_ocupadas`, `obtener_estadisticas_mecha`, `registrar_error_cliente` (¿rate limit? puede ser un vector de spam/escritura anónima).

## Tarea

1. Arreglar 1 y 2 (migraciones pequeñas).
2. Auditoría de 3: tabla con cada RPC pública, si lleva token/captcha, y revoke de las que no lo necesiten.
3. Pasar `get_advisors` de seguridad y performance al terminar; el suelo actual de lints WARN+INFO es el baseline a batir.

Verificar tras cualquier migración con los advisors, como marca el CLAUDE.md.
