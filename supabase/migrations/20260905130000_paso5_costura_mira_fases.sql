-- Spec 1, paso 5 del plan (informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §7):
-- LA COSTURA MIRA LAS FASES. Un unico cambio de significado en un unico sitio
-- y las 8 funciones del grupo A se vuelven multi-fase a la vez, porque desde el
-- paso 1 pasan todas por aqui.
--
--   ventanas_activas_cita(p_cita_id, inicio, fin_activa, fin_espera, fin)
--     -> si la cita tiene fases NO-reposo: esas son sus ventanas de ocupacion
--     -> si no (sin fases, o sin ninguna fase de trabajo): las 4 marcas clasicas
--
-- Es el mismo patron que lib/retrasos.ts (ventanasActivas prefiere
-- fasesMultiples), solo que en SQL y para el lado servidor. La version de 4
-- argumentos se queda tal cual: la siguen usando citas_chocan_activa_activa
-- (compara dos CANDIDATAS por marcas: no tienen fases todavia) y es el fallback
-- interno de esta.
--
-- Tambien entra aqui: SE RETIRA EL TRIPWIRE del paso 3/4. Su propio comentario
-- lo decretaba ("se retira con el paso 5") y la foto de respaldos ya no puede
-- cambiar mas: desde el paso 4 las marcas salen de las fases. La tabla
-- respaldos.citas_antes_de_fases_v2 SE QUEDA (historica, cerrada, revocada);
-- lo que se retira es la RPC y, en el repo, el vigilante bd-regresion-fases.

-- ---------------------------------------------------------------------------
-- 1. La costura, version con cita_id
-- ---------------------------------------------------------------------------

create or replace function public.ventanas_activas_cita(
  p_cita_id     uuid,
  p_inicio      timestamptz,
  p_fin_activa  timestamptz,
  p_fin_espera  timestamptz,
  p_fin         timestamptz
)
returns table (desde timestamptz, hasta timestamptz)
language sql
stable
set search_path to 'public'
as $function$
  with trabajo as (
    select f.inicio, f.fin
      from public.cita_fases f
     where f.cita_id = p_cita_id
       and f.tipo <> 'reposo'      -- transicion SI ocupa al profesional
       and f.inicio < f.fin
  )
  select t.inicio, t.fin from trabajo t
  union all
  select v.desde, v.hasta
    from public.ventanas_activas_cita(p_inicio, p_fin_activa, p_fin_espera, p_fin) v
   where not exists (select 1 from trabajo t2);
$function$;

comment on function public.ventanas_activas_cita(uuid, timestamptz, timestamptz, timestamptz, timestamptz) is
  'Spec 1 paso 5: las ventanas de ocupacion de una cita SALen de sus fases NO-reposo cuando existen; si no (cita sin fases, o plantilla sin fases de trabajo), cae a las 4 marcas clasicas. STABLE, no IMMUTABLE: lee cita_fases. Se llama con cross join lateral, nunca envuelta en un ayudante booleano (15 ms vs 883 ms, ver paso 1).';

-- ---------------------------------------------------------------------------
-- 2. Las 8 del grupo A pasan su cita_id (parche por ancla, como el paso 1)
-- ---------------------------------------------------------------------------
-- El ancla es la llamada literal de 4 argumentos con alias c. Si alguna
-- funcion del grupo ya no la tuviera, la migracion REVIENTA en vez de dejar
-- una funcion decidiendo ocupacion por el camino viejo sin que nadie lo vea.

do $parche$
declare
  r    record;
  v_def text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'crear_cita_publica', 'crear_cita_publica_cadena', 'crear_cita_publica_grupo',
         'disponibilidad_publica', 'disponibilidad_publica_cadena',
         'modificar_cita_publica',
         'portal_dias_disponibles', 'portal_dias_disponibles_cadena')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position('ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin)' in v_def) = 0 then
      raise exception 'Ancla perdida en %: la llamada a la costura de 4 argumentos ya no esta donde el paso 1 la dejo', r.proname;
    end if;

    v_def := replace(
      v_def,
      'ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin)',
      'ventanas_activas_cita(c.id, c.inicio, c.fin_activa, c.fin_espera, c.fin)');

    execute v_def;
  end loop;
end;
$parche$;

-- ---------------------------------------------------------------------------
-- 3. Fuera el tripwire (la foto se queda)
-- ---------------------------------------------------------------------------

drop function if exists public.regresion_citas_fases_v2();
