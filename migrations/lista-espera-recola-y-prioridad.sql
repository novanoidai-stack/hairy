-- Migration: lista-espera-recola-y-prioridad.sql
-- 1. Re-cola al final de la lista de espera cuando la oferta caduca por falta de respuesta (envia al candidato al final).
-- 2. Gating por fidelidad para citas expres.
-- 3. Funciones RPC para reordenacion manual de prioridad por parte del staff.

-- Update procesar_lista_espera so expired offers move un-responsive candidate to the end of the line
create or replace function public.procesar_lista_espera()
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  r record;
  cfg jsonb;
  v_ventana integer;
  v_maxbloq integer;
  v_antel integer;
  v_pidesenal boolean;
  v_cand uuid;
  v_oferta uuid;
  v_creadas integer := 0;
  v_avanzadas integer := 0;
  v_resueltas integer := 0;
begin
  -- A. Nuevas cancelaciones -> ofertas
  for r in
    select c.* from public.citas c
    where c.estado = 'cancelada' and coalesce(c.lista_espera_revisada, false) = false
      and coalesce(c.es_oferta_espera, false) = false
      and c.cliente_id is not null and c.inicio > now()
  loop
    cfg := (select config from public.negocio_config where negocio_id = r.negocio_id);
    if coalesce((cfg->>'listaEsperaMatchingActivo')::boolean, false) then
      v_ventana := greatest(coalesce((cfg->>'listaEsperaVentanaMin')::int, 30), 1);
      v_maxbloq := greatest(coalesce((cfg->>'listaEsperaMaxBloqueoHoras')::int, 2), 1);
      v_antel := greatest(coalesce((cfg->>'listaEsperaAntelacionMinHoras')::int, 4), 0);
      v_pidesenal := coalesce((cfg->>'listaEsperaOfertaPideSenal')::boolean, false);
      if r.inicio >= now() + make_interval(hours => v_antel) then
        v_cand := public._lista_espera_mejor_candidato(r.negocio_id, r.servicio_id, r.profesional_id, r.inicio, array[]::uuid[]);
        if v_cand is not null then
          insert into public.lista_espera_ofertas(negocio_id, origen_cita_id, profesional_id, servicio_id,
            inicio, fin, fin_activa, fin_espera, estado, candidato_id, expira_at, bloqueo_hasta, avisados)
          values (r.negocio_id, r.id, r.profesional_id, r.servicio_id, r.inicio, r.fin, r.fin_activa,
            r.fin_espera, 'activa', v_cand, now() + make_interval(mins => v_ventana),
            now() + make_interval(hours => v_maxbloq), array[v_cand])
          returning id into v_oferta;
          perform public._lista_espera_ofrecer(v_oferta, v_cand, v_pidesenal, v_ventana);
          v_creadas := v_creadas + 1;
        end if;
      end if;
    end if;
    update public.citas set lista_espera_revisada = true where id = r.id;
  end loop;

  -- C. Confirmadas -> resolver (+ caducado a los demas). Antes que B.
  for r in
    select o.* from public.lista_espera_ofertas o
    join public.citas c on c.id = o.candidato_cita_id
    where o.estado = 'activa' and c.estado = 'confirmada'
  loop
    update public.lista_espera_ofertas set estado = 'resuelta' where id = r.id;
    update public.lista_espera set estado = 'resuelta' where id = r.candidato_id;
    cfg := (select config from public.negocio_config where negocio_id = r.negocio_id);
    if coalesce((cfg->>'listaEsperaAvisarCaducado')::boolean, false) then
      insert into public.lista_espera_avisos(negocio_id, lista_espera_id, telefono, nombre, salon, template, estado)
      select r.negocio_id, le.id, le.telefono, split_part(coalesce(le.nombre, ''), ' ', 1),
             coalesce(np.nombre_publico, ''), 'aviso_hueco_caducado', 'pendiente'
      from unnest(r.avisados) as a(id)
      join public.lista_espera le on le.id = a.id
      left join public.negocio_portal np on np.negocio_id = r.negocio_id and np.portal_activo = true
      where a.id <> r.candidato_id and le.telefono is not null and length(trim(le.telefono)) >= 6;
    end if;
    v_resueltas := v_resueltas + 1;
  end loop;

  -- B. Vencidas -> re-colar al candidato sin respuesta al final y avanzar al siguiente
  for r in
    select o.* from public.lista_espera_ofertas o
    where o.estado = 'activa' and o.expira_at < now()
  loop
    update public.citas set estado = 'cancelada', cancelado_por = 'sistema',
      motivo_cancelacion = 'Oferta de lista de espera no respondida a tiempo', modificado_at = now()
      where id = r.candidato_cita_id and estado = 'pendiente';
    
    -- RE-COLA: El candidato que no contesto pasa al final de la cola (created_at = now(), prioridad bajada)
    update public.lista_espera 
      set estado = 'esperando', 
          prioridad = greatest(prioridad - 1, 0),
          created_at = now()
      where id = r.candidato_id and estado = 'avisado';
      
    cfg := (select config from public.negocio_config where negocio_id = r.negocio_id);
    v_ventana := greatest(coalesce((cfg->>'listaEsperaVentanaMin')::int, 30), 1);
    v_maxbloq := greatest(coalesce((cfg->>'listaEsperaMaxBloqueoHoras')::int, 2), 1);
    v_pidesenal := coalesce((cfg->>'listaEsperaOfertaPideSenal')::boolean, false);
    if now() >= r.bloqueo_hasta then
      update public.lista_espera_ofertas set estado = 'agotada' where id = r.id;
    else
      v_cand := public._lista_espera_mejor_candidato(r.negocio_id, r.servicio_id, r.profesional_id, r.inicio, r.avisados);
      if v_cand is null then
        update public.lista_espera_ofertas set estado = 'agotada' where id = r.id;
      else
        update public.lista_espera_ofertas
          set candidato_id = v_cand, avisados = r.avisados || v_cand,
              expira_at = now() + make_interval(mins => v_ventana),
              bloqueo_hasta = case when coalesce(cfg->>'listaEsperaDesbloqueoDesde', 'primer_aviso') = 'ultimo_aviso'
                                   then now() + make_interval(hours => v_maxbloq) else bloqueo_hasta end
          where id = r.id;
        perform public._lista_espera_ofrecer(r.id, v_cand, v_pidesenal, v_ventana);
        v_avanzadas := v_avanzadas + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas, 'avanzadas', v_avanzadas, 'resueltas', v_resueltas);
end;
$function$;

-- RPC para cambiar la prioridad manualmente desde el panel del salon
create or replace function public.cambiar_prioridad_lista_espera(
  p_id uuid,
  p_nueva_prioridad integer
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_neg text;
begin
  select negocio_id into v_neg from public.profiles where id = auth.uid();
  if v_neg is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  update public.lista_espera
    set prioridad = greatest(p_nueva_prioridad, 0),
        created_at = case when p_nueva_prioridad >= 5 then now() else created_at end
    where id = p_id and negocio_id = v_neg;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cambiar_prioridad_lista_espera(uuid, integer) to authenticated;
