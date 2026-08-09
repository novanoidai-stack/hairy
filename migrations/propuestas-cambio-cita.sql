-- Entrega 2 de C+D: adelantar una cita deja de ser un movimiento unilateral y
-- pasa a ser una PROPUESTA al cliente, con caducidad y con el hueco retenido.
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Por que: el techo de adelanto era un numero fijo de minutos (60), que no dice
-- nada. Adelantar de 17:00 a 10:00 es razonable si son las 7:00 (el cliente
-- tiene 3 horas para contestar) y una temeridad si son las 9:50. Lo que importa
-- no son los minutos de adelanto sino el MARGEN DE REACCION: cuanto queda entre
-- que recibe el aviso y la hora nueva. Ese margen es ajustable por salon
-- (config.agendaMargenReaccionMin), con 120 minutos por defecto.
--
-- COMO SE RETIENE EL HUECO, y por que asi: la retencion se materializa como una
-- fila en bloqueos_profesional con tipo 'reserva_temporal'. Comprobado antes de
-- elegirlo: disponibilidad_publica, crear_cita_publica, modificar_cita_publica y
-- crear_cita_publica_grupo YA excluyen bloqueos_profesional, asi que la
-- retencion funciona en lectura y en escritura sin tocar ni una sola funcion de
-- la via de reserva/pago. Ademas la agenda ya pinta los bloqueos, asi que el
-- salon ve el hueco retenido sin trabajo extra.
--
-- OJO, hueco conocido y NO cubierto aqui: crear_cita_publica_express NO mira
-- bloqueos_profesional (comprobado). O sea que la reserva expres puede colarse
-- sobre una retencion, y de hecho tambien sobre unas vacaciones. Es un bug
-- previo e independiente de esta migracion; queda anotado.

-- 0) El tipo de bloqueo de la retencion -------------------------------------
--
-- bloqueos_profesional.tipo tiene un CHECK cerrado
-- (vacaciones/formacion/descanso/baja/otro) que rechazaria 'reserva_temporal'.
-- Se amplia de forma aditiva: no invalida ninguna fila existente.

alter table public.bloqueos_profesional
  drop constraint if exists bloqueos_profesional_tipo_check;

alter table public.bloqueos_profesional
  add constraint bloqueos_profesional_tipo_check
  check (tipo = any (array['vacaciones','formacion','descanso','baja','otro','reserva_temporal']));

-- 1) Propuestas -------------------------------------------------------------

create table if not exists public.citas_propuestas_cambio (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        text not null,
  cita_id           uuid not null references public.citas(id) on delete cascade,
  profesional_id    uuid,
  -- Foto de la hora actual: si la cita se movio por otro lado mientras el
  -- cliente pensaba, la propuesta ya no es valida y no se aplica a ciegas.
  inicio_actual     timestamptz not null,
  inicio_propuesto  timestamptz not null,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','aceptada','rechazada','caducada','cancelada')),
  -- Hasta cuando puede contestar. Nunca mas tarde que la hora nueva menos el
  -- margen de reaccion.
  expira_at         timestamptz not null,
  bloqueo_id        uuid,
  creada_por        uuid,
  created_at        timestamptz not null default now(),
  respondida_at     timestamptz
);

alter table public.citas_propuestas_cambio enable row level security;

create index if not exists citas_propuestas_cambio_pend_idx
  on public.citas_propuestas_cambio (estado, expira_at);
create index if not exists citas_propuestas_cambio_cita_idx
  on public.citas_propuestas_cambio (cita_id);

-- Una cita no puede tener dos propuestas vivas a la vez.
create unique index if not exists citas_propuestas_cambio_una_viva_idx
  on public.citas_propuestas_cambio (cita_id) where estado = 'pendiente';

drop policy if exists propuestas_read_own_negocio on public.citas_propuestas_cambio;
create policy propuestas_read_own_negocio on public.citas_propuestas_cambio
  for select using (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

-- 2) Bandeja de salida: se REUTILIZA lista_espera_avisos ---------------------
--
-- A proposito, para que n8n siga drenando UNA sola tabla en vez de dos. Se
-- amplian los templates permitidos y se añade la referencia a la propuesta.

alter table public.lista_espera_avisos
  add column if not exists propuesta_id uuid;

alter table public.lista_espera_avisos
  drop constraint if exists lista_espera_avisos_template_check;

alter table public.lista_espera_avisos
  add constraint lista_espera_avisos_template_check
  check (template in (
    'aviso_lista_espera',
    'aviso_hueco_caducado',
    'propuesta_cambio_cita',   -- "te podemos adelantar la cita, ¿te viene bien?"
    'propuesta_cambio_aplicada' -- confirmacion tras aceptar
  ));

-- 3) Crear la propuesta ------------------------------------------------------

create or replace function public.proponer_cambio_cita(
  p_cita_id uuid,
  p_inicio_propuesto timestamptz,
  p_margen_reaccion_min integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cita        record;
  v_negocio     text;
  v_dur         interval;
  v_fin_nuevo   timestamptz;
  v_expira      timestamptz;
  v_bloqueo_id  uuid;
  v_propuesta   uuid;
  v_slug        text;
  v_salon       text;
  v_servicio    text;
  v_telefono    text;
  v_nombre      text;
begin
  select c.*, cl.telefono as cl_telefono, cl.nombre as cl_nombre
    into v_cita
  from public.citas c
  left join public.clientes cl on cl.id = c.cliente_id
  where c.id = p_cita_id;
  if v_cita.id is null then
    return jsonb_build_object('ok', false, 'error', 'La cita ya no existe');
  end if;
  if v_cita.estado not in ('pendiente','confirmada') then
    return jsonb_build_object('ok', false, 'error', 'La cita no esta activa');
  end if;

  v_negocio := v_cita.negocio_id;
  v_dur := v_cita.fin - v_cita.inicio;
  v_fin_nuevo := p_inicio_propuesto + v_dur;

  -- Adelantar hacia atras, no hacia delante: esto no es un retraso.
  if p_inicio_propuesto >= v_cita.inicio then
    return jsonb_build_object('ok', false, 'error', 'La hora propuesta no adelanta la cita');
  end if;

  -- Margen de reaccion: el cliente tiene que tener tiempo de leer y contestar
  -- ANTES de la hora nueva. Esto sustituye al techo fijo de minutos.
  if p_inicio_propuesto < now() + make_interval(mins => greatest(p_margen_reaccion_min, 0)) then
    return jsonb_build_object(
      'ok', false,
      'error', format('No da tiempo: la hora nueva tiene que estar al menos a %s min vista', p_margen_reaccion_min)
    );
  end if;

  -- citas NO tiene columna telefono: el contacto solo vive en clientes.
  -- Una cita sin cliente asociado (walk-in) no tiene a quien avisar.
  v_telefono := v_cita.cl_telefono;
  if v_telefono is null or length(trim(v_telefono)) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Esta cita no tiene telefono al que avisar', 'sin_telefono', true);
  end if;

  -- Caduca al llegar la hora nueva menos el margen: pasado eso, aunque
  -- aceptara, ya no daria tiempo.
  v_expira := least(
    now() + make_interval(mins => greatest(p_margen_reaccion_min, 0)),
    p_inicio_propuesto - make_interval(mins => greatest(p_margen_reaccion_min, 0))
  );
  if v_expira <= now() then
    v_expira := now() + interval '15 minutes';
  end if;

  -- Retencion del hueco. Se apoya en bloqueos_profesional a proposito: las RPC
  -- publicas de lectura y escritura ya lo respetan.
  insert into public.bloqueos_profesional (profesional_id, negocio_id, inicio, fin, tipo, motivo)
  values (
    v_cita.profesional_id, v_negocio, p_inicio_propuesto, v_fin_nuevo,
    'reserva_temporal',
    'Hueco reservado a la espera de que el cliente conteste'
  )
  returning id into v_bloqueo_id;

  insert into public.citas_propuestas_cambio (
    negocio_id, cita_id, profesional_id, inicio_actual, inicio_propuesto,
    expira_at, bloqueo_id, creada_por
  ) values (
    v_negocio, p_cita_id, v_cita.profesional_id, v_cita.inicio, p_inicio_propuesto,
    v_expira, v_bloqueo_id, auth.uid()
  )
  returning id into v_propuesta;

  select np.slug, coalesce(np.nombre_publico, np.slug) into v_slug, v_salon
  from public.negocio_portal np where np.negocio_id = v_negocio;

  select s.nombre into v_servicio from public.servicios s where s.id = v_cita.servicio_id;
  v_nombre := coalesce(v_cita.cl_nombre, 'Hola');

  insert into public.lista_espera_avisos (
    negocio_id, cita_id, propuesta_id, telefono, nombre, salon, servicio,
    fecha, hora, ventana_texto, template
  ) values (
    v_negocio, p_cita_id, v_propuesta, v_telefono, v_nombre, v_salon, v_servicio,
    to_char(p_inicio_propuesto at time zone 'Europe/Madrid', 'DD/MM/YYYY'),
    to_char(p_inicio_propuesto at time zone 'Europe/Madrid', 'HH24:MI'),
    public._lista_espera_ventana_texto(
      greatest(1, (extract(epoch from (v_expira - now())) / 60)::int)
    ),
    'propuesta_cambio_cita'
  );

  return jsonb_build_object(
    'ok', true,
    'propuesta_id', v_propuesta,
    'expira_at', v_expira,
    'slug', v_slug
  );
end;
$function$;

revoke all on function public.proponer_cambio_cita(uuid, timestamptz, integer) from public;
grant execute on function public.proponer_cambio_cita(uuid, timestamptz, integer) to authenticated, service_role;

-- 4) El cliente contesta -----------------------------------------------------
--
-- Mismo modelo de seguridad que el resto de RPC publicas de cita
-- (cancelar_cita_publica, modificar_cita_publica): slug + id + telefono.

create or replace function public.responder_propuesta_cambio(
  p_slug text,
  p_propuesta_id uuid,
  p_telefono text,
  p_acepta boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_p       record;
  v_cita    record;
  v_delta   interval;
  v_tel_ok  boolean;
begin
  select negocio_id into v_negocio
  from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Portal no disponible');
  end if;

  select * into v_p from public.citas_propuestas_cambio
  where id = p_propuesta_id and negocio_id = v_negocio;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'Propuesta no encontrada');
  end if;
  if v_p.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'Esta propuesta ya no esta activa', 'estado', v_p.estado);
  end if;
  if v_p.expira_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'La propuesta ha caducado');
  end if;

  select c.*, cl.telefono as cl_telefono into v_cita
  from public.citas c
  left join public.clientes cl on cl.id = c.cliente_id
  where c.id = v_p.cita_id;
  if v_cita.id is null then
    return jsonb_build_object('ok', false, 'error', 'La cita ya no existe');
  end if;

  v_tel_ok := v_cita.cl_telefono is not null
              and public.normalizar_telefono(v_cita.cl_telefono)
                  = public.normalizar_telefono(p_telefono);
  if not v_tel_ok then
    return jsonb_build_object('ok', false, 'error', 'No hemos podido verificar tu telefono');
  end if;

  -- La cita se movio por otro lado mientras tanto: no se aplica a ciegas.
  if v_cita.inicio <> v_p.inicio_actual then
    update public.citas_propuestas_cambio
      set estado = 'cancelada', respondida_at = now() where id = v_p.id;
    delete from public.bloqueos_profesional where id = v_p.bloqueo_id;
    return jsonb_build_object('ok', false, 'error', 'La cita ha cambiado desde que te lo propusimos');
  end if;

  if not p_acepta then
    update public.citas_propuestas_cambio
      set estado = 'rechazada', respondida_at = now() where id = v_p.id;
    -- Se suelta el hueco: vuelve al bote y puede ofrecerse a la lista de espera.
    delete from public.bloqueos_profesional where id = v_p.bloqueo_id;
    return jsonb_build_object('ok', true, 'aceptada', false);
  end if;

  v_delta := v_p.inicio_propuesto - v_cita.inicio;

  -- Se suelta la retencion ANTES de mover, si no la propia cita chocaria con ella.
  delete from public.bloqueos_profesional where id = v_p.bloqueo_id;

  update public.citas set
    inicio     = inicio + v_delta,
    fin        = fin + v_delta,
    fin_activa = case when fin_activa is null then null else fin_activa + v_delta end,
    fin_espera = case when fin_espera is null then null else fin_espera + v_delta end
  where id = v_cita.id;

  update public.citas_propuestas_cambio
    set estado = 'aceptada', respondida_at = now() where id = v_p.id;

  insert into public.lista_espera_avisos (
    negocio_id, cita_id, propuesta_id, telefono, nombre, salon, servicio,
    fecha, hora, template
  )
  select v_negocio, v_cita.id, v_p.id, p_telefono,
         coalesce(cl.nombre, 'Hola'),
         coalesce(np.nombre_publico, np.slug),
         s.nombre,
         to_char(v_p.inicio_propuesto at time zone 'Europe/Madrid', 'DD/MM/YYYY'),
         to_char(v_p.inicio_propuesto at time zone 'Europe/Madrid', 'HH24:MI'),
         'propuesta_cambio_aplicada'
  from public.negocio_portal np
  left join public.clientes cl on cl.id = v_cita.cliente_id
  left join public.servicios s on s.id = v_cita.servicio_id
  where np.negocio_id = v_negocio;

  return jsonb_build_object('ok', true, 'aceptada', true, 'inicio', v_p.inicio_propuesto);
end;
$function$;

revoke all on function public.responder_propuesta_cambio(text, uuid, text, boolean) from public;
grant execute on function public.responder_propuesta_cambio(text, uuid, text, boolean) to anon, authenticated, service_role;

-- 5) Caducidad ---------------------------------------------------------------

create or replace function public.caducar_propuestas_cambio()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer := 0;
begin
  -- Dos pasos en vez de CTEs anidadas que modifican datos: mas aburrido y sin
  -- sutilezas de orden entre el DELETE y el UPDATE.
  update public.citas_propuestas_cambio
    set estado = 'caducada', respondida_at = now()
  where estado = 'pendiente' and expira_at <= now();

  get diagnostics v_n = row_count;

  -- Se sueltan las retenciones de las que acaban de caducar. El hueco vuelve al
  -- bote y puede ofrecerse a la lista de espera.
  delete from public.bloqueos_profesional b
  where b.tipo = 'reserva_temporal'
    and not exists (
      select 1 from public.citas_propuestas_cambio p
      where p.bloqueo_id = b.id and p.estado = 'pendiente'
    );

  return v_n;
end;
$function$;

revoke all on function public.caducar_propuestas_cambio() from public;
grant execute on function public.caducar_propuestas_cambio() to service_role;

-- 6) Cron --------------------------------------------------------------------
-- Aplicado en produccion: jobid 11, cada 5 minutos.
--   select cron.schedule('caducar-propuestas-cambio', '*/5 * * * *',
--                        $$select public.caducar_propuestas_cambio();$$);
