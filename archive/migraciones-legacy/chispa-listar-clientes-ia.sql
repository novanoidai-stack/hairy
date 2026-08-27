-- Chispa · listar/segmentar la cartera de clientes para la capa de IA.
-- Aplicada en remoto 2026-07-11 (migracion MCP chispa_listar_clientes_ia).
-- Solo service_role (la llama el edge agenda-asistente via svc, mismo modelo que
-- resumen_gestion). NUNCA devuelve datos de salud (alergias/sensibilidades/notas).
-- Los clientes sin consentimiento IA no se listan en detalle pero cuentan en el total.
create or replace function public.listar_clientes_ia(
  p_negocio text,
  p_segmento text default 'todos',
  p_orden text default 'reciente',
  p_limite int default 20
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_excluidos int;
  v_items jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_seg text := lower(coalesce(p_segmento, 'todos'));
  v_ord text := lower(coalesce(p_orden, 'reciente'));
begin
  select count(*) into v_total from public.clientes where negocio_id = p_negocio;
  select count(*) into v_excluidos from public.clientes
    where negocio_id = p_negocio and coalesce(consiente_ia, true) = false;

  with base as (
    select c.id, c.nombre, c.ultima_visita, c.primera_visita,
           coalesce(c.total_visitas, 0) as total_visitas,
           c.frecuencia_dias, coalesce(c.noshows_count, 0) as noshows_count,
           c.perfil_riesgo,
           coalesce((select sum(co.total_cents) from public.cobros co
                     where co.cliente_id = c.id and co.cobrado_at is not null), 0) as gasto_cents
    from public.clientes c
    where c.negocio_id = p_negocio
      and coalesce(c.consiente_ia, true) = true
      and case v_seg
            when 'vip' then coalesce(c.total_visitas, 0) >= 6
            when 'recurrentes' then coalesce(c.total_visitas, 0) >= 3
            when 'nuevos' then c.primera_visita >= current_date - 30
            when 'en_riesgo' then coalesce(c.noshows_count, 0) >= 1 or c.perfil_riesgo in ('medio', 'alto')
            when 'fuga' then c.ultima_visita is not null
                 and c.ultima_visita < current_date - (coalesce(nullif(c.frecuencia_dias, 0), 45) * 2)
            when 'inactivos' then c.ultima_visita is not null and c.ultima_visita < current_date - 90
            else true
          end
  ), ordenada as (
    select * from base
    order by
      case when v_ord = 'gasto' then gasto_cents end desc nulls last,
      case when v_ord = 'frecuencia' then total_visitas end desc nulls last,
      case when v_ord = 'alfabetico' then nombre end asc nulls last,
      ultima_visita desc nulls last
    limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'nombre', nombre,
           'ultima_visita', ultima_visita,
           'total_visitas', total_visitas,
           'gasto_eur', round(gasto_cents / 100.0, 2),
           'frecuencia_dias', frecuencia_dias,
           'riesgo', case when noshows_count >= 1 or perfil_riesgo in ('medio', 'alto')
                          then coalesce(nullif(perfil_riesgo, ''), 'medio') else 'bajo' end
         )), '[]'::jsonb)
    into v_items from ordenada;

  return jsonb_build_object(
    'total', v_total,
    'excluidos_consentimiento', v_excluidos,
    'segmento', v_seg,
    'orden', v_ord,
    'listados', jsonb_array_length(v_items),
    'items', v_items
  );
end;
$$;

revoke all on function public.listar_clientes_ia(text, text, text, int) from public, anon, authenticated;
grant execute on function public.listar_clientes_ia(text, text, text, int) to service_role;

comment on function public.listar_clientes_ia(text, text, text, int) is
  'Lista/segmenta la cartera para Chispa (solo service_role). Sin datos de salud; excluye clientes sin consiente_ia del detalle pero los cuenta en total.';
