-- Spec 12 (series al servidor): la RPC existia, y cablearla tal cual habria sido
-- una regresion. Se arregla ANTES de enchufarla.
--
-- QUE PASABA
--
-- `crear_serie_citas` se creo el 30 ago y no la llamaba nadie: la serie seguia
-- generandose en el cliente (NewCitaModal.web.tsx), que es lo que la spec 12
-- queria quitar —no es atomica y ni el portal ni Chispa pueden crear una serie—.
-- Pero al comparar las dos validaciones, la del servidor era MAS POBRE en tres
-- cosas, y las tres crean citas malas:
--
--   1. Trataba la cita ajena como un bloque macizo:
--          c.inicio < v_curr_fin and c.fin > v_curr_inicio
--      Eso da por ocupado el REPOSO de la otra cita. El reposo es justo el hueco
--      que Mecha existe para vender (Modular 1, tiempos muertos productivos):
--      la RPC omitia como "conflicto" huecos que son validos y son el producto.
--   2. No miraba `bloqueos_profesional`: metia citas encima de una vacacion.
--   3. No miraba el horario laboral: metia citas a las 3 de la manana.
--
-- Las (2) y (3) son peores que la (1): el cliente se NEGABA a crearlas y el
-- servidor las creaba.
--
-- LA REGLA, QUE AHORA VIVE EN UN SOLO SITIO
--
-- La ocupacion real de un profesional es "activa contra activa": una cita ocupa
-- en [inicio, fin_activa) y en [fin_espera, fin), y deja libre el reposo. Estaba
-- escrita tres veces —`lib/retrasos.ts` (canonica), inline dentro de
-- `disponibilidad_publica`, y a medias aqui— que es la fabrica de regresiones que
-- describe la decision 10 del CLAUDE.md. Se extrae a `ventanas_activas_cita()` +
-- `citas_chocan_activa_activa()` y esta RPC pasa a usarlas.
--
-- Se replica exactamente `fasesDe` de lib/retrasos.ts, incluido su matiz mas
-- importante: **sin `fin_espera` no se puede afirmar que haya reposo**, asi que
-- la cita ocupa entera. Leerlo al reves daba por libre la cola de cualquier color
-- importado sin fases y colaba citas encima de otras.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Las ventanas activas de una cita (equivalente SQL de ventanasActivas)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.ventanas_activas_cita(
  p_inicio     timestamptz,
  p_fin_activa timestamptz,
  p_fin_espera timestamptz,
  p_fin        timestamptz
)
returns table (desde timestamptz, hasta timestamptz)
language sql
immutable
as $$
  with m as (
    select p_inicio                                                             as ini,
           coalesce(p_fin_activa, p_fin)                                        as fin_a,
           coalesce(p_fin_espera, coalesce(p_fin_activa, p_fin))                as fin_e,
           p_fin                                                                as fin
  )
  -- Primera fase activa: siempre.
  select m.ini, m.fin_a from m
  union all
  -- Segunda fase activa: solo si hay reposo declarado que termine antes del fin.
  select m.fin_e, m.fin from m where m.fin_e < m.fin;
$$;

comment on function public.ventanas_activas_cita(timestamptz, timestamptz, timestamptz, timestamptz) is
  'Tramos en los que una cita ocupa a su profesional. El reposo [fin_activa, fin_espera) NO ocupa: es el hueco vendible. Equivalente SQL de ventanasActivas() de lib/retrasos.ts.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. El predicado de choque (equivalente SQL de chocaActivaActiva)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.citas_chocan_activa_activa(
  a_inicio timestamptz, a_fin_activa timestamptz, a_fin_espera timestamptz, a_fin timestamptz,
  b_inicio timestamptz, b_fin_activa timestamptz, b_fin_espera timestamptz, b_fin timestamptz
)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
      from public.ventanas_activas_cita(a_inicio, a_fin_activa, a_fin_espera, a_fin) a
      join public.ventanas_activas_cita(b_inicio, b_fin_activa, b_fin_espera, b_fin) b
        on a.desde < b.hasta and b.desde < a.hasta
  );
$$;

comment on function public.citas_chocan_activa_activa(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) is
  'True si dos citas se pisan el trabajo REAL (activa contra activa). Los reposos pueden solaparse entre si y con el trabajo ajeno. Equivalente SQL de chocaActivaActiva() de lib/retrasos.ts.';

revoke all on function public.ventanas_activas_cita(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.citas_chocan_activa_activa(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ventanas_activas_cita(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.citas_chocan_activa_activa(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. La serie, validando lo mismo que valida la agenda
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crear_serie_citas(
  p_base              jsonb,
  p_intervalo_semanas integer default 1,
  p_repeticiones      integer default 4,
  p_addon_ids         uuid[]  default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio       text;
  v_uid           uuid := auth.uid();
  v_serie_id      uuid := gen_random_uuid();
  v_prof_id       uuid;
  v_srv_id        uuid;
  v_clt_id        uuid;
  v_inicio        timestamptz;
  v_fin           timestamptz;
  v_fin_activa    timestamptz;
  v_fin_espera    timestamptz;
  v_dur_min       int;
  v_tz            text;
  v_i             int;
  v_shift         interval;
  v_c_inicio      timestamptz;
  v_c_fin         timestamptz;
  v_c_activa      timestamptz;
  v_c_espera      timestamptz;
  v_local_ini     timestamp;
  v_local_fin     timestamp;
  v_citas_creadas uuid[] := array[]::uuid[];
  v_omitidas      text[] := array[]::text[];
  v_nueva_cita_id uuid;
  v_motivo        text;
  v_addon_id      uuid;
begin
  select p.negocio_id into v_negocio from public.profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  v_prof_id    := (p_base->>'profesional_id')::uuid;
  v_srv_id     := (p_base->>'servicio_id')::uuid;
  v_clt_id     := (p_base->>'cliente_id')::uuid;
  v_inicio     := (p_base->>'inicio')::timestamptz;
  v_fin        := (p_base->>'fin')::timestamptz;
  v_fin_activa := (p_base->>'fin_activa')::timestamptz;
  v_fin_espera := (p_base->>'fin_espera')::timestamptz;

  if v_prof_id is null or v_srv_id is null or v_inicio is null or v_fin is null then
    return jsonb_build_object('ok', false, 'error', 'Parámetros base incompletos');
  end if;

  -- La regla del parametro: profesional, servicio y cliente son ids de los que
  -- se deduce el negocio. Se atan al del llamante en vez de fiarse del jsonb.
  if not exists (select 1 from public.profesionales where id = v_prof_id and negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Profesional no encontrado');
  end if;
  if not exists (select 1 from public.servicios where id = v_srv_id and negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Servicio no encontrado');
  end if;
  if v_clt_id is not null
     and not exists (select 1 from public.clientes where id = v_clt_id and negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  v_dur_min := round(extract(epoch from (v_fin - v_inicio)) / 60)::int;
  if v_dur_min <= 0 or v_dur_min > 720 then
    return jsonb_build_object('ok', false, 'error', 'Duración de cita inválida');
  end if;

  if p_repeticiones < 1 or p_repeticiones > 52 then
    return jsonb_build_object('ok', false, 'error', 'Número de repeticiones debe ser entre 1 y 52');
  end if;

  select coalesce(nullif(c.config->>'timezone', ''), 'Europe/Madrid')
    into v_tz
    from public.negocio_config c
   where c.negocio_id = v_negocio;
  v_tz := coalesce(v_tz, 'Europe/Madrid');

  for v_i in 0..(p_repeticiones - 1) loop
    v_shift    := make_interval(weeks => v_i * coalesce(p_intervalo_semanas, 1));
    v_c_inicio := v_inicio + v_shift;
    v_c_fin    := v_fin    + v_shift;
    v_c_activa := case when v_fin_activa is not null then v_fin_activa + v_shift end;
    v_c_espera := case when v_fin_espera is not null then v_fin_espera + v_shift end;
    v_motivo   := null;

    -- Hora local del salon: el horario laboral se guarda en reloj de pared.
    v_local_ini := v_c_inicio at time zone v_tz;
    v_local_fin := v_c_fin    at time zone v_tz;

    -- (a) Cierre del salon ese dia.
    if exists (
      select 1 from public.cierres_negocio cn
       where cn.negocio_id = v_negocio and cn.fecha = v_local_ini::date
    ) then
      v_motivo := 'cierre';
    end if;

    -- (b) Bloqueo del profesional (vacaciones, ausencias). El cliente ya lo
    --     miraba y el servidor no: creaba la cita encima.
    if v_motivo is null and exists (
      select 1 from public.bloqueos_profesional b
       where b.profesional_id = v_prof_id
         and b.inicio < v_c_fin
         and b.fin    > v_c_inicio
    ) then
      v_motivo := 'bloqueo';
    end if;

    -- (c) Horario laboral. Soporta jornada partida: basta con que UN tramo
    --     cubra la cita entera.
    if v_motivo is null and not exists (
      select 1 from public.horarios_profesional h
       where h.profesional_id = v_prof_id
         and h.dia_semana  = extract(dow from v_local_ini)::int
         and h.hora_inicio <= v_local_ini::time
         and h.hora_fin    >= v_local_fin::time
         and v_local_ini::date = v_local_fin::date
    ) then
      v_motivo := 'fuera_de_horario';
    end if;

    -- (d) Solape REAL: activa contra activa. El reposo ajeno no estorba, que es
    --     justo lo que la version anterior contaba como conflicto.
    if v_motivo is null and exists (
      select 1 from public.citas c
       where c.negocio_id     = v_negocio
         and c.profesional_id = v_prof_id
         and c.estado in ('pendiente', 'confirmada')
         and c.inicio < v_c_fin
         and c.fin    > v_c_inicio
         and public.citas_chocan_activa_activa(
               v_c_inicio, v_c_activa, v_c_espera, v_c_fin,
               c.inicio,   c.fin_activa, c.fin_espera, c.fin)
    ) then
      v_motivo := 'ocupado';
    end if;

    if v_motivo is not null then
      v_omitidas := array_append(
        v_omitidas,
        to_char(v_local_ini, 'YYYY-MM-DD HH24:MI') || ' (' || v_motivo || ')');
      continue;
    end if;

    insert into public.citas (
      negocio_id, profesional_id, servicio_id, cliente_id,
      inicio, fin, fin_activa, fin_espera,
      estado, canal, creado_por, serie_id, notas
    ) values (
      v_negocio, v_prof_id, v_srv_id, v_clt_id,
      v_c_inicio, v_c_fin, v_c_activa, v_c_espera,
      'pendiente', coalesce(p_base->>'canal', 'manual'), v_uid, v_serie_id, p_base->>'notas'
    ) returning id into v_nueva_cita_id;

    v_citas_creadas := array_append(v_citas_creadas, v_nueva_cita_id);

    if p_addon_ids is not null and array_length(p_addon_ids, 1) > 0 then
      foreach v_addon_id in array p_addon_ids loop
        insert into public.cita_addons (cita_id, addon_id) values (v_nueva_cita_id, v_addon_id);
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',        true,
    'serie_id',  v_serie_id,
    'creadas',   coalesce(array_length(v_citas_creadas, 1), 0),
    'omitidas',  v_omitidas,
    'cita_ids',  v_citas_creadas
  );
end;
$function$;

revoke all on function public.crear_serie_citas(jsonb, integer, integer, uuid[]) from public, anon;
grant execute on function public.crear_serie_citas(jsonb, integer, integer, uuid[]) to authenticated, service_role;

comment on function public.crear_serie_citas(jsonb, integer, integer, uuid[]) is
  'Crea una serie de citas recurrentes en UNA transaccion (spec 12). Valida lo mismo que la agenda: cierre, bloqueo, horario laboral y solape activa-activa. Las ocurrencias que chocan se omiten con su motivo, no se mueven de hueco.';
