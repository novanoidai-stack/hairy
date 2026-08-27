-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: arreglo del cálculo de clientes.frecuencia_dias
-- Autor: Carlos + Claude (9 ago 2026)
--
-- Redefine public.procesar_alertas_fuga() (creada en alerta-fuga-clientas.sql)
-- para corregir un fallo de cálculo silencioso en la media de intervalos entre
-- visitas. Ver el comentario dentro de la CTE `gaps_numerados`.
--
-- Efecto práctico: frecuencia_dias sube o baja unos días en los clientes con
-- pocas visitas, y con ella el umbral de fuga (frecuencia × 1,4). Nada más
-- cambia: misma firma, mismos permisos, mismo resto del cuerpo.
--
-- Se vuelve a poner el revoke/grant al final porque redefinir la función con
-- `create or replace` NO reinstala los permisos si algún día se recrea desde
-- cero, y dejarla accesible a `authenticated` seria un agujero (gotcha ya
-- documentado en el proyecto).
-- ────────────────────────────────────────────────────────────────────────────────

create or replace function public.procesar_alertas_fuga()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_procesados int := 0;
  v_avisos_creados int := 0;
  v_avisos_descartados int := 0;
begin
  -- A. Recalcular agregados para clientes con >=3 citas completadas
  with gaps as (
    select
      c.cliente_id,
      c.inicio,
      c.inicio - lag(c.inicio) over (partition by c.cliente_id order by c.inicio) as gap
    from public.citas c
    where c.estado = 'completada' and c.cliente_id is not null
  ),
  gaps_numerados as (
    -- ARREGLO (9 ago 2026): antes el row_number() se calculaba en `gaps`, es
    -- decir sobre TODAS las citas incluida la primera, que no tiene intervalo
    -- (lag = null). Al filtrar despues por `gap is not null` se caia una fila
    -- dentro del tope de 6, asi que en los clientes de pocas visitas la media
    -- salia de 5 intervalos en vez de 6. Ahora se numera solo lo que tiene
    -- intervalo, que es lo que se quiere promediar.
    select cliente_id, gap,
           row_number() over (partition by cliente_id order by inicio desc) as rn_desc
    from gaps
    where gap is not null
  ),
  ultimas_6 as (
    select cliente_id, gap
    from gaps_numerados
    where rn_desc <= 6
  ),
  agregados as (
    select
      c.cliente_id,
      count(*) as total_visitas,
      max(c.inicio) as ultima_visita,
      (select round(avg(extract(epoch from u6.gap) / 86400))::int
         from ultimas_6 u6 where u6.cliente_id = c.cliente_id) as frecuencia_dias
    from public.citas c
    where c.estado = 'completada' and c.cliente_id is not null
    group by c.cliente_id
    having count(*) >= 3
  )
  update public.clientes cl
  set total_visitas = a.total_visitas,
      ultima_visita = a.ultima_visita::date,
      frecuencia_dias = a.frecuencia_dias
  from agregados a
  where cl.id = a.cliente_id
    and (cl.total_visitas is distinct from a.total_visitas
      or cl.ultima_visita is distinct from a.ultima_visita::date
      or cl.frecuencia_dias is distinct from a.frecuencia_dias);
  get diagnostics v_procesados = row_count;

  -- B + C. Detectar riesgo y gestionar outbox (insert + descarte) en una sola
  -- sentencia (las CTEs no cruzan sentencias distintas), solo negocios con el
  -- toggle activo. El recalculo de agregados de arriba corre siempre.
  with en_riesgo as (
    select
      cl.id as cliente_id,
      cl.negocio_id,
      (current_date - cl.ultima_visita) as dias_desde_ultima_visita,
      cl.frecuencia_dias,
      cl.total_visitas
    from public.clientes cl
    join public.negocio_config nc on nc.negocio_id = cl.negocio_id
    where coalesce((nc.config->>'fugaClientasActivo')::boolean, false) = true
      and cl.bloqueado = false
      and cl.frecuencia_dias is not null
      and cl.ultima_visita is not null
      and (current_date - cl.ultima_visita) > (cl.frecuencia_dias * 1.4)
      and not exists (
        select 1 from public.citas fc
        where fc.cliente_id = cl.id
          and fc.estado <> 'cancelada'
          and fc.inicio > now()
      )
  ),
  nuevos as (
    select er.*
    from en_riesgo er
    where not exists (
      select 1 from public.fuga_clientas_avisos fa
      where fa.cliente_id = er.cliente_id and fa.estado = 'pendiente'
    )
  ),
  insertados as (
    insert into public.fuga_clientas_avisos
      (negocio_id, cliente_id, dias_desde_ultima_visita, frecuencia_dias, recompensa_sugerida_id)
    select
      n.negocio_id, n.cliente_id, n.dias_desde_ultima_visita, n.frecuencia_dias,
      (
        select r.id from public.recompensas r
        where r.negocio_id = n.negocio_id and r.activo = true
          and r.umbral_visitas <= n.total_visitas
        order by r.umbral_visitas desc
        limit 1
      )
    from nuevos n
    returning 1
  ),
  descartados as (
    -- Clientas con aviso pendiente que ya dejaron de estar en riesgo (p.ej.
    -- reservaron antes de que saliera el WhatsApp): no tiene sentido avisarlas.
    update public.fuga_clientas_avisos fa
    set estado = 'descartado'
    where fa.estado = 'pendiente'
      and not exists (select 1 from en_riesgo er where er.cliente_id = fa.cliente_id)
    returning 1
  )
  select
    (select count(*) from insertados),
    (select count(*) from descartados)
  into v_avisos_creados, v_avisos_descartados;

  return jsonb_build_object(
    'clientes_actualizados', v_procesados,
    'avisos_creados', v_avisos_creados,
    'avisos_descartados', v_avisos_descartados
  );
end;
$$;

revoke all on function public.procesar_alertas_fuga() from public, anon, authenticated;
grant execute on function public.procesar_alertas_fuga() to service_role;
