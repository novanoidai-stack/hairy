-- Lista de espera: matching automático + oferta del hueco (cron-pull, OFF por defecto).
-- Spec: docs/superpowers/specs/2026-06-21-lista-espera-matching-design.md
-- Aislado del motor principal: workflow n8n dedicado + outbox propio.
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-06-21.

-- 1) Flags en citas
alter table public.citas add column if not exists es_oferta_espera boolean not null default false;
alter table public.citas add column if not exists lista_espera_revisada boolean not null default false;
-- No reprocesar cancelaciones ya existentes
update public.citas set lista_espera_revisada = true where estado = 'cancelada' and lista_espera_revisada = false;

-- 2) Oferta por hueco liberado (recorre candidatos)
create table if not exists public.lista_espera_ofertas (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        text not null,
  origen_cita_id    uuid,
  profesional_id    uuid,
  servicio_id       uuid,
  inicio            timestamptz not null,
  fin               timestamptz,
  fin_activa        timestamptz,
  fin_espera        timestamptz,
  estado            text not null default 'activa' check (estado in ('activa','resuelta','agotada','cancelada')),
  candidato_id      uuid,
  candidato_cita_id uuid,
  expira_at         timestamptz,
  bloqueo_hasta     timestamptz,
  avisados          uuid[] not null default array[]::uuid[],
  created_at        timestamptz not null default now()
);
alter table public.lista_espera_ofertas enable row level security;
-- Solo service_role la maneja (el motor); el equipo no necesita verla directamente.
create index if not exists lista_espera_ofertas_estado_idx on public.lista_espera_ofertas (estado, expira_at);

-- 3) Outbox de avisos de lista de espera (lo drena el workflow n8n dedicado)
create table if not exists public.lista_espera_avisos (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null,
  lista_espera_id uuid,
  cita_id         uuid,
  telefono        text,
  nombre          text,
  salon           text,
  servicio        text,
  fecha           text,
  hora            text,
  ventana_texto   text,
  template        text not null check (template in ('aviso_lista_espera','aviso_hueco_caducado')),
  estado          text not null default 'pendiente' check (estado in ('pendiente','enviado')),
  created_at      timestamptz not null default now(),
  enviado_at      timestamptz
);
alter table public.lista_espera_avisos enable row level security;
create index if not exists lista_espera_avisos_estado_idx on public.lista_espera_avisos (estado, created_at);

-- 4) Helpers
create or replace function public._lista_espera_ventana_texto(p_min integer)
 returns text language sql immutable as $function$
  select case when p_min % 60 = 0
              then (p_min/60)::text || ' hora' || case when p_min/60 = 1 then '' else 's' end
              else p_min::text || ' minutos' end;
$function$;

create or replace function public._lista_espera_mejor_candidato(
  p_negocio text, p_servicio uuid, p_profesional uuid, p_inicio timestamptz, p_avisados uuid[])
 returns uuid language sql stable security definer set search_path to 'public' as $function$
  select le.id from public.lista_espera le
  where le.negocio_id = p_negocio and le.estado = 'esperando'
    and (le.servicio_id is null or le.servicio_id = p_servicio)
    and (le.profesional_id is null or le.profesional_id = p_profesional)
    and (le.franja = 'cualquiera' or le.franja =
         case when extract(hour from p_inicio at time zone 'Europe/Madrid') < 14 then 'manana' else 'tarde' end)
    and (le.desde is null or (p_inicio at time zone 'Europe/Madrid')::date >= le.desde)
    and (le.hasta is null or (p_inicio at time zone 'Europe/Madrid')::date <= le.hasta)
    and le.telefono is not null and length(trim(le.telefono)) >= 6
    and not (le.id = any(coalesce(p_avisados, array[]::uuid[])))
  order by le.prioridad desc, le.created_at asc
  limit 1;
$function$;

-- Crea la cita tentativa para el candidato, la vincula a la oferta, marca avisado y encola el aviso.
create or replace function public._lista_espera_ofrecer(
  p_oferta uuid, p_cand uuid, p_pide_senal boolean, p_ventana integer)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  o public.lista_espera_ofertas;
  le public.lista_espera;
  v_cliente uuid;
  v_cita uuid;
  v_dep boolean;
  v_salon text;
  v_servicio text;
begin
  select * into o from public.lista_espera_ofertas where id = p_oferta;
  select * into le from public.lista_espera where id = p_cand;

  -- Cliente: el de la lista, o find-or-create por telefono
  v_cliente := le.cliente_id;
  if v_cliente is null then
    select id into v_cliente from public.clientes
      where negocio_id = o.negocio_id and telefono = le.telefono limit 1;
    if v_cliente is null then
      insert into public.clientes(negocio_id, nombre, telefono)
        values (o.negocio_id, coalesce(le.nombre, 'Cliente'), le.telefono) returning id into v_cliente;
    end if;
  end if;

  -- Señal solo si la config lo pide y el servicio tiene señal
  v_dep := coalesce(p_pide_senal, false) and coalesce(public.importe_senal_servicio(o.servicio_id), 0) > 0;

  -- Cita tentativa. senal_enviada=true para que el motor PRINCIPAL no mande el enlace de señal
  -- (el aviso de oferta lo manda el workflow dedicado). confirmacion_enviada=false: al confirmarse,
  -- el motor principal mandará la confirmación normal.
  insert into public.citas(negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa,
    fin_espera, estado, canal, es_oferta_espera, deposito_requerido, deposito_pagado,
    confirmacion_enviada, senal_enviada, recordatorio_enviado)
  values (o.negocio_id, v_cliente, o.servicio_id, o.profesional_id, o.inicio, o.fin, o.fin_activa,
    o.fin_espera, 'pendiente', 'web', true, v_dep, false, false, true, false)
  returning id into v_cita;

  update public.lista_espera_ofertas set candidato_cita_id = v_cita where id = p_oferta;
  update public.lista_espera set estado = 'avisado', avisado_at = now() where id = p_cand;

  select coalesce(nombre_publico, '') into v_salon from public.negocio_portal
    where negocio_id = o.negocio_id and portal_activo = true limit 1;
  select coalesce(nombre, '') into v_servicio from public.servicios where id = o.servicio_id;

  insert into public.lista_espera_avisos(negocio_id, lista_espera_id, cita_id, telefono, nombre, salon,
    servicio, fecha, hora, ventana_texto, template, estado)
  values (o.negocio_id, p_cand, v_cita, le.telefono, split_part(coalesce(le.nombre, ''), ' ', 1), v_salon,
    v_servicio, to_char(o.inicio at time zone 'Europe/Madrid', 'DD/MM'),
    to_char(o.inicio at time zone 'Europe/Madrid', 'HH24:MI'),
    public._lista_espera_ventana_texto(p_ventana), 'aviso_lista_espera', 'pendiente');
end;
$function$;

-- 5) Motor: tick que procesa nuevas cancelaciones, resoluciones y vencimientos.
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

  -- B. Vencidas -> avanzar al siguiente (silencioso)
  for r in
    select o.* from public.lista_espera_ofertas o
    where o.estado = 'activa' and o.expira_at < now()
  loop
    update public.citas set estado = 'cancelada', cancelado_por = 'sistema',
      motivo_cancelacion = 'Oferta de lista de espera no respondida a tiempo', modificado_at = now()
      where id = r.candidato_cita_id and estado = 'pendiente';
    update public.lista_espera set estado = 'esperando' where id = r.candidato_id and estado = 'avisado';
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

-- 6) Outbox: cola + marcar enviado (los usa el workflow n8n dedicado, service_role)
create or replace function public.lista_espera_avisos_pendientes(p_limit integer default 50)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'template', template, 'telefono', telefono, 'nombre', nombre, 'salon', salon,
    'servicio', servicio, 'fecha', fecha, 'hora', hora, 'ventana', ventana_texto, 'cita_id', cita_id
  )), '[]'::jsonb)
  from (select * from public.lista_espera_avisos where estado = 'pendiente'
        order by created_at limit greatest(p_limit, 1)) q;
$function$;

create or replace function public.marcar_lista_espera_aviso_enviado(p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.lista_espera_avisos set estado = 'enviado', enviado_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$function$;

-- 7) Confirmar la oferta desde el portal (anónima, gated por par cita+telefono).
--    Si la oferta pide señal, devuelve needs_payment (la página redirige a /app/pago).
create or replace function public.confirmar_cita_oferta(p_cita_id uuid, p_telefono text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cita public.citas;
  v_tel text;
begin
  select * into v_cita from public.citas
    where id = p_cita_id and es_oferta_espera = true and estado = 'pendiente';
  if not found then return jsonb_build_object('ok', false, 'error', 'oferta_no_disponible'); end if;
  select telefono into v_tel from public.clientes where id = v_cita.cliente_id;
  if right(regexp_replace(coalesce(v_tel, ''), '\D', '', 'g'), 9)
     <> right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9) then
    return jsonb_build_object('ok', false, 'error', 'telefono_no_coincide');
  end if;
  if v_cita.deposito_requerido and not v_cita.deposito_pagado then
    return jsonb_build_object('ok', false, 'needs_payment', true, 'cita_id', p_cita_id);
  end if;
  update public.citas set estado = 'confirmada', confirmacion_enviada = false, confirmada_cliente = true,
    confirmada_at = now(), modificado_at = now() where id = p_cita_id;
  return jsonb_build_object('ok', true, 'cita_id', p_cita_id);
end;
$function$;

-- 8) La expiración de señal del motor principal NO debe tocar las citas tentativas de oferta
--    (tienen su propia ventana en procesar_lista_espera).
create or replace function public.expirar_citas_sin_senal(p_minutos integer DEFAULT 15)
 returns jsonb language sql security definer set search_path to 'public' as $function$
  with upd as (
    update public.citas c
      set estado = 'cancelada', cancelado_por = 'sistema',
          motivo_cancelacion = 'Senal no pagada a tiempo', modificado_at = now()
    where c.estado = 'pendiente' and c.deposito_requerido = true and c.deposito_pagado = false
      and coalesce(c.es_oferta_espera, false) = false
      and c.inicio > now()
      and c.created_at < now() - make_interval(mins => greatest(p_minutos, 1))
    returning c.id
  )
  select jsonb_build_object('ok', true, 'canceladas', coalesce(jsonb_agg(id), '[]'::jsonb)) from upd;
$function$;

-- Funciones del motor: solo service_role (n8n). Cerradas a anon/authenticated.
revoke execute on function public.procesar_lista_espera() from public, anon, authenticated;
revoke execute on function public.lista_espera_avisos_pendientes(integer) from public, anon, authenticated;
revoke execute on function public.marcar_lista_espera_aviso_enviado(uuid) from public, anon, authenticated;
revoke execute on function public._lista_espera_mejor_candidato(text, uuid, uuid, timestamptz, uuid[]) from public, anon, authenticated;
revoke execute on function public._lista_espera_ofrecer(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke execute on function public.expirar_citas_sin_senal(integer) from public, anon, authenticated;

grant execute on function public.procesar_lista_espera() to service_role;
grant execute on function public.lista_espera_avisos_pendientes(integer) to service_role;
grant execute on function public.marcar_lista_espera_aviso_enviado(uuid) to service_role;
grant execute on function public._lista_espera_mejor_candidato(text, uuid, uuid, timestamptz, uuid[]) to service_role;
grant execute on function public._lista_espera_ofrecer(uuid, uuid, boolean, integer) to service_role;
grant execute on function public.expirar_citas_sin_senal(integer) to service_role;
-- confirmar_cita_oferta SE QUEDA ejecutable por anon (portal), gated por par cita+telefono.
