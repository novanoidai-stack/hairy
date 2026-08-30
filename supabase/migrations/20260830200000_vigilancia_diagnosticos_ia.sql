-- supabase/migrations/20260830200000_vigilancia_diagnosticos_ia.sql
--
-- Entidad y RPCs para el Cerebro IA de Diagnósticos y Auto-Reparación de Mecha OS.
-- Persiste sugerencias asistidas por IA, causas raíz, parches diff y prompts
-- ejecutables para resolver incidencias y deuda técnica.

create table if not exists public.vigilancia_diagnosticos_ia (
  id                    bigint generated always as identity primary key,
  creado_en             timestamptz not null default now(),
  ejecucion_id          bigint references public.vigilancia_ejecuciones(id) on delete set null,
  hallazgo_clave        text,
  ambito                text not null default 'otros',
  nivel                 text not null check (nivel in ('critico', 'bloqueante', 'aviso', 'sugerencia')),
  titulo                text not null,
  diagnostico           text not null,
  causa_raiz            text,
  fichero               text,
  linea                 integer,
  codigo_antes          text,
  codigo_despues        text,
  prompt_autorreparacion text not null,
  modelo_ia             text,
  coste_usd             numeric(10, 6),
  latencia_ms           integer,
  estado                text not null default 'propuesto'
                        check (estado in ('propuesto', 'en_revision', 'aplicado', 'descartado')),
  notas_staff           text,
  aplicado_por          text,
  aplicado_en           timestamptz
);

create index if not exists ix_vig_diag_creado on public.vigilancia_diagnosticos_ia (creado_en desc);
create index if not exists ix_vig_diag_clave  on public.vigilancia_diagnosticos_ia (hallazgo_clave, creado_en desc);
create index if not exists ix_vig_diag_estado on public.vigilancia_diagnosticos_ia (estado, creado_en desc);
create index if not exists ix_vig_diag_ambito on public.vigilancia_diagnosticos_ia (ambito);

alter table public.vigilancia_diagnosticos_ia enable row level security;

-- RPC: Lectura de Diagnósticos IA para el panel de Staff (web/admin.html)
create or replace function public.staff_vigilancia_diagnosticos_ia(
  p_dias   integer default 7,
  p_estado text default null,
  p_ambito text default null,
  p_limit  integer default 50
)
returns table(
  id bigint, creado_en timestamptz, ejecucion_id bigint, hallazgo_clave text,
  ambito text, nivel text, titulo text, diagnostico text, causa_raiz text,
  fichero text, linea integer, codigo_antes text, codigo_despues text,
  prompt_autorreparacion text, modelo_ia text, coste_usd numeric,
  estado text, notas_staff text, aplicado_por text, aplicado_en timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select d.id, d.creado_en, d.ejecucion_id, d.hallazgo_clave,
         d.ambito, d.nivel, d.titulo, d.diagnostico, d.causa_raiz,
         d.fichero, d.linea, d.codigo_antes, d.codigo_despues,
         d.prompt_autorreparacion, d.modelo_ia, d.coste_usd,
         d.estado, d.notas_staff, d.aplicado_por, d.aplicado_en
    from public.vigilancia_diagnosticos_ia d
   where d.creado_en > now() - make_interval(days => greatest(p_dias, 1))
     and (p_estado is null or p_estado = '' or d.estado = p_estado)
     and (p_ambito is null or p_ambito = '' or d.ambito = p_ambito)
   order by
     (case when d.nivel in ('critico', 'bloqueante') then 0 else 1 end),
     d.creado_en desc
   limit greatest(p_limit, 1);
end;
$$;

-- RPC: Marcar estado de Diagnóstico IA (solo Staff)
create or replace function public.staff_marcar_diagnostico_ia(
  p_id     bigint,
  p_estado text,
  p_notas  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_estado not in ('propuesto', 'en_revision', 'aplicado', 'descartado') then
    raise exception 'Estado no valido';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  update public.vigilancia_diagnosticos_ia
     set estado       = p_estado,
         aplicado_en  = case when p_estado = 'aplicado' then now() else null end,
         aplicado_por = case when p_estado = 'aplicado' then coalesce(v_email, auth.uid()::text) else null end,
         notas_staff  = coalesce(p_notas, notas_staff)
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'estado', p_estado);
end;
$$;

-- RPC: Guardar diagnósticos generados por el Orquestador IA (solo service_role)
create or replace function public.guardar_diagnosticos_ia(p_diagnosticos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count int := 0;
begin
  if not (auth.role() = 'service_role' or current_user = 'service_role') then
    raise exception 'solo service_role';
  end if;

  insert into public.vigilancia_diagnosticos_ia (
    ejecucion_id, hallazgo_clave, ambito, nivel, titulo, diagnostico,
    causa_raiz, fichero, linea, codigo_antes, codigo_despues,
    prompt_autorreparacion, modelo_ia, coste_usd, latencia_ms
  )
  select
    nullif(d->>'ejecucion_id', '')::bigint,
    d->>'hallazgo_clave',
    coalesce(d->>'ambito', 'otros'),
    coalesce(d->>'nivel', 'sugerencia'),
    coalesce(d->>'titulo', 'Diagnóstico automático'),
    coalesce(d->>'diagnostico', ''),
    d->>'causa_raiz',
    d->>'fichero',
    nullif(d->>'linea', '')::int,
    d->>'codigo_antes',
    d->>'codigo_despues',
    coalesce(d->>'prompt_autorreparacion', ''),
    d->>'modelo_ia',
    nullif(d->>'coste_usd', '')::numeric,
    nullif(d->>'latencia_ms', '')::int
  from jsonb_array_elements(p_diagnosticos) d;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'insertados', v_count);
end;
$$;

revoke all on function public.staff_vigilancia_diagnosticos_ia(integer, text, text, integer) from public, anon;
revoke all on function public.staff_marcar_diagnostico_ia(bigint, text, text)                  from public, anon;
revoke all on function public.guardar_diagnosticos_ia(jsonb)                                  from public, anon, authenticated;

grant execute on function public.staff_vigilancia_diagnosticos_ia(integer, text, text, integer) to authenticated;
grant execute on function public.staff_marcar_diagnostico_ia(bigint, text, text)                  to authenticated;
grant execute on function public.guardar_diagnosticos_ia(jsonb)                                  to service_role;
