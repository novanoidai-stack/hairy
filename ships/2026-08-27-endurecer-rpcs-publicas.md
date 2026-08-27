# Ship: auditoría de seguridad — RPCs públicas SECURITY DEFINER y leftovers

**Estado:** abierto · **Detectado:** 2026-08-27, advisors de Supabase tras la migración `hallazgos-agenda-fuera-jornada` · **Zona:** base de datos

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
