-- De donde viene cada cosa que le llega al staff.
--
-- Al panel de Mecha le entran cinco corrientes distintas -- Leads, Dudas demo,
-- Soporte, Errores y Salud -- y tres de ellas no sabian decir de que salon
-- venian. Lo comprobado el 30 ago 2026:
--
-- 1) SOPORTE: crear_mensaje_soporte() metia `nombre_negocio` (el rotulo del
--    salon, texto libre) DENTRO de la columna `negocio_id`. Luego
--    staff_mensajes_soporte() intentaba unir por
--    `profiles.negocio_id = m.negocio_id`, que con un rotulo dentro no casa
--    nunca, y caia siempre al coalesce. En pantalla se veia bien por accidente,
--    pero el mensaje no estaba atado a ningun tenant: no se podia saber si quien
--    escribe paga, en que plan esta ni si es un salon nuestro de pruebas.
--
-- 2) ERRORES DEL PORTAL: 76 de los 130 errores guardados (el 58 %) son del
--    portal publico y tienen negocio_id NULL, porque registrar_error_cliente()
--    saca el salon de my_negocio_id_text() y en el portal no hay sesion. Pero la
--    URL lleva el slug delante (`/app/r/demo`): el salon SE PUEDE deducir, no
--    hace falta que lo mande el cliente.
--
-- 3) LEADS: 22 de las 23 solicitudes son pruebas nuestras ("el cagiom",
--    "testeo", "caca@gmail.com", "Salon QA"), y la unica real esta en 'ganada'.
--    La pestana Leads enseñaba "22 nuevos" de ruido. No habia forma de marcar
--    una solicitud como prueba.

-- ===========================================================================
-- 1) SOPORTE: atar el mensaje a su salon de verdad
-- ===========================================================================

alter table public.soporte_mensajes
  add column if not exists negocio_nombre text,
  add column if not exists origen text;

comment on column public.soporte_mensajes.negocio_id is
  'El identificador del tenant. Hasta el 30 ago 2026 aqui se guardaba el ROTULO del salon por error.';
comment on column public.soporte_mensajes.negocio_nombre is
  'El rotulo, que es lo que se ense~na. Separado del id para poder unir por id.';

-- Rescate de lo que hubiera guardado con el rotulo en la columna equivocada: si
-- el valor no es ningun negocio_id conocido pero SI es el rotulo de uno, se
-- mueve de columna. Lo que no se pueda resolver se deja como estaba y se marca
-- para que nadie lo confunda con un dato bueno.
update public.soporte_mensajes m
   set negocio_nombre = coalesce(m.negocio_nombre, m.negocio_id),
       negocio_id = (
         select p.negocio_id from public.profiles p
          where p.nombre_negocio = m.negocio_id
          order by p.created_at asc limit 1
       )
 where m.negocio_id is not null
   and not exists (select 1 from public.profiles p2 where p2.negocio_id = m.negocio_id);

-- Se retira la firma de dos argumentos: si conviven las dos, PostgREST no sabe
-- cual llamar cuando le llegan solo asunto y mensaje.
drop function if exists public.crear_mensaje_soporte(text, text);
create or replace function public.crear_mensaje_soporte(p_asunto text, p_mensaje text, p_origen text default 'ayuda')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asunto  text := left(btrim(coalesce(p_asunto, '')), 200);
  v_mensaje text := left(btrim(coalesce(p_mensaje, '')), 4000);
  v_uid     uuid := auth.uid();
  v_nombre  text;
  v_email   text;
  v_negocio text;
  v_rotulo  text;
  v_origen  text := lower(coalesce(nullif(btrim(p_origen), ''), 'ayuda'));
  v_id      bigint;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;
  if v_asunto = '' or v_mensaje = '' then
    raise exception 'faltan_datos';
  end if;
  if not public.check_rate_limit('soporte_mensajes', v_uid::text, 10, 60) then
    raise exception 'demasiados_mensajes';
  end if;
  -- Desde DONDE se escribio. Hay dos formularios distintos dentro de la app
  -- ("Ayuda" y "Ajustes -> Escríbenos") y el panel los recibia iguales, asi que
  -- no se podia saber si a alguien se le atasca la pantalla de ayuda o si esta
  -- pidiendo algo de su cuenta.
  if v_origen not in ('ayuda', 'ajustes', 'landing', 'automatico') then
    v_origen := 'ayuda';
  end if;

  -- El id del tenant y el rotulo, cada uno en su columna. Antes las dos cosas
  -- salian de nombre_negocio y acababan en negocio_id.
  select p.negocio_id,
         p.nombre_negocio,
         coalesce(nullif(btrim(p.nombre || ' ' || coalesce(p.apellido, '')), ''), p.email),
         p.email
    into v_negocio, v_rotulo, v_nombre, v_email
    from public.profiles p where p.id = v_uid;

  insert into public.soporte_mensajes
    (negocio_id, negocio_nombre, origen, user_id, autor_nombre, autor_email, asunto, mensaje)
  values
    (v_negocio, v_rotulo, v_origen, v_uid, btrim(v_nombre), v_email, v_asunto, v_mensaje)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_mensaje_soporte(text, text, text) to authenticated;

drop function if exists public.staff_mensajes_soporte(text, int);
create or replace function public.staff_mensajes_soporte(p_estado text default null, p_limit int default 100)
returns table (
  id             bigint,
  creado_en      timestamptz,
  negocio_id     text,
  negocio_nombre text,
  clasificacion  text,
  plan_salon     text,
  origen         text,
  autor_nombre   text,
  autor_email    text,
  asunto         text,
  mensaje        text,
  estado         text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select m.id,
         m.creado_en,
         m.negocio_id,
         -- El rotulo bueno es el del titular; el guardado es el respaldo.
         coalesce(
           (select t.nombre_negocio from public.profiles t
             where t.id = public.titular_del_negocio(m.negocio_id)),
           m.negocio_nombre,
           m.negocio_id),
         case when m.negocio_id is null then 'desconocido'
              else public.clasificacion_negocio(m.negocio_id) end,
         case when m.negocio_id is null then null
              else public.plan_del_negocio(m.negocio_id) end,
         coalesce(m.origen, 'ayuda'),
         m.autor_nombre, m.autor_email, m.asunto, m.mensaje, m.estado
    from public.soporte_mensajes m
   where p_estado is null or m.estado = p_estado
   order by m.creado_en desc
   limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.staff_mensajes_soporte(text, int) to authenticated;

-- ===========================================================================
-- 2) ERRORES: el portal publico deja de ser anonimo para nosotros
-- ===========================================================================
--
-- El salon se DEDUCE de la ruta, no se acepta por parametro: el cliente ya
-- controla la ruta (es su URL), asi que no gana nada nuevo, y nosotros no
-- abrimos un campo donde alguien pueda escribir el id de otro salon.
create or replace function public.registrar_error_cliente(
  p_mensaje text,
  p_ruta text default null,
  p_pila text default null,
  p_origen text default 'app',
  p_navegador text default null,
  p_tipo text default 'excepcion'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip        text := public.request_ip();
  v_mensaje   text := left(btrim(coalesce(p_mensaje, '')), 500);
  v_ruta      text := left(coalesce(p_ruta, ''), 200);
  v_origen    text := lower(coalesce(p_origen, 'app'));
  v_tipo      text := lower(coalesce(p_tipo, 'excepcion'));
  v_lower_msg text;
  v_negocio   text := public.my_negocio_id_text();
  v_slug      text;
begin
  if v_mensaje = '' then return; end if;

  v_lower_msg := lower(v_mensaje || ' ' || coalesce(p_pila, ''));
  if v_tipo in ('excepcion', 'operativo') then
    if v_lower_msg ~* 'key limit|403|quota|credits?|insufficient_quota|balance|payment required|billing|402' then
      v_tipo := 'creditos';
    elsif v_lower_msg ~* 'openrouter|chispa|model_not_found|edge function|tokens|completions' then
      v_tipo := 'ia';
    elsif v_lower_msg ~* 'failed to fetch|networkerror|fetch failed|err_network|timeout|connection' then
      v_tipo := 'red';
    end if;
  end if;

  if v_origen not in ('app', 'portal', 'landing', 'marketplace', 'edge_function') then
    v_origen := 'app';
  end if;
  if v_tipo not in ('excepcion', 'operativo', 'ia', 'creditos', 'red') then
    v_tipo := 'excepcion';
  end if;

  -- Sin sesion (portal publico, pagina de resena, autogestion de la cita) el
  -- salon se saca del slug de la URL. La app va montada en /app, asi que la ruta
  -- real es /app/r/<slug>: por eso se acepta el prefijo opcional.
  if v_negocio is null and v_ruta <> '' then
    v_slug := nullif(lower(btrim((regexp_match(v_ruta, '^(?:/app)?/(?:r|resena)/([A-Za-z0-9_-]{1,60})'))[1])), '');
    if v_slug is not null then
      select np.negocio_id into v_negocio
        from public.negocio_portal np where lower(np.slug) = v_slug limit 1;
      -- Un error del portal SIEMPRE es del portal, diga lo que diga el cliente.
      if v_negocio is not null then
        v_origen := 'portal';
      end if;
    end if;
  end if;

  if v_ip <> '' and not public.check_rate_limit('errores_cliente', v_ip, 40, 60) then
    return;
  end if;

  insert into public.errores_cliente (
    negocio_id, user_id, origen, ruta, mensaje, pila, navegador, huella, tipo, estado
  )
  values (
    v_negocio,
    auth.uid(),
    v_origen,
    v_ruta,
    v_mensaje,
    left(coalesce(p_pila, ''), 2000),
    left(coalesce(p_navegador, ''), 200),
    md5(v_mensaje || coalesce(left(p_ruta, 200), '')),
    v_tipo,
    'nuevo'
  );
end;
$$;

-- Publica a proposito: la escribe cualquier visitante anonimo del portal, que
-- es justo de donde venian los errores que no sabiamos de quien eran. Se
-- defiende con el limite por IP de arriba (40 cada 60 min) y no lee nada.
grant execute on function public.registrar_error_cliente(text, text, text, text, text, text) to anon, authenticated;

-- Los 76 del portal que ya estaban guardados: mismo criterio, aplicado hacia atras.
update public.errores_cliente e
   set negocio_id = np.negocio_id,
       origen = 'portal'
  from public.negocio_portal np
 where e.negocio_id is null
   and lower(np.slug) = lower((regexp_match(e.ruta, '^(?:/app)?/(?:r|resena)/([A-Za-z0-9_-]{1,60})'))[1]);

-- Y que el panel pueda decir A QUIEN le paso, no solo a cuantos.
drop function if exists public.staff_errores_cliente(int, int, text, text, text);
create or replace function public.staff_errores_cliente(
  p_dias integer default 7,
  p_limit integer default 50,
  p_estado text default null,
  p_origen text default null,
  p_tipo text default null,
  p_solo_reales boolean default false
)
returns table (
  huella       text,
  mensaje      text,
  ruta         text,
  origen       text,
  tipo         text,
  estado       text,
  veces        integer,
  salones      integer,
  salones_lista text[],
  clases       text[],
  primera_vez  timestamptz,
  ultima_vez   timestamptz,
  pila         text,
  resuelto_en  timestamptz,
  resuelto_por text,
  notas_staff  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select e.huella,
         min(e.mensaje),
         min(e.ruta),
         min(e.origen),
         min(e.tipo),
         (array_agg(e.estado order by e.creado_en desc))[1],
         count(*)::int,
         count(distinct e.negocio_id)::int,
         -- Quien lo sufrio. Sin esto, "3 salones" no dice si uno era un cliente
         -- que paga o los tres eran nuestro salon de pruebas.
         coalesce(array_agg(distinct e.negocio_id) filter (where e.negocio_id is not null), '{}'::text[]),
         coalesce(array_agg(distinct public.clasificacion_negocio(e.negocio_id))
                    filter (where e.negocio_id is not null), '{}'::text[]),
         min(e.creado_en),
         max(e.creado_en),
         (array_agg(e.pila order by e.creado_en desc))[1],
         max(e.resuelto_en),
         (array_agg(e.resuelto_por order by e.resuelto_en desc nulls last))[1],
         (array_agg(e.notas_staff order by e.resuelto_en desc nulls last))[1]
    from public.errores_cliente e
   where e.creado_en > now() - make_interval(days => greatest(p_dias, 1))
     and (p_estado is null or p_estado = '' or e.estado = p_estado)
     and (p_origen is null or p_origen = '' or e.origen = p_origen)
     and (p_tipo is null or p_tipo = '' or e.tipo = p_tipo)
     -- "Solo lo que le paso a un cliente de verdad". Un error sin salon (landing,
     -- marketplace, visitante anonimo) cuenta como real: puede ser un prospecto.
     and (not coalesce(p_solo_reales, false)
          or e.negocio_id is null
          or public.clasificacion_negocio(e.negocio_id) = 'real')
   group by e.huella
   order by max(e.creado_en) desc
   limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.staff_errores_cliente(int, int, text, text, text, boolean) to authenticated;

-- ===========================================================================
-- 3) LEADS: separar el mercado de nuestras propias pruebas
-- ===========================================================================

alter table public.solicitudes
  add column if not exists es_prueba boolean not null default false,
  add column if not exists origen text;

comment on column public.solicitudes.es_prueba is
  'Alta nuestra (QA, demo interna, correo del equipo). No cuenta como lead.';
comment on column public.solicitudes.origen is
  'De donde salio el formulario. Antes solo vivia dentro de meta->>origen y solo lo ponian dos de los cinco tipos.';

-- El origen ya venia dentro de meta en dos tipos ('calculadora' y 'mensaje');
-- se sube a columna para que sirva en los cinco.
update public.solicitudes
   set origen = coalesce(origen, meta->>'origen', tipo)
 where origen is null;

-- Marcado automatico de lo que se puede afirmar: correo del equipo, dominio
-- nuestro, o correo de alguien que ya tiene cuenta en un salon interno.
update public.solicitudes s
   set es_prueba = true
 where s.es_prueba = false
   and (
     -- Solo dominios que son objetivamente NUESTROS. Un gmail personal, aunque
     -- huela a prueba ("caca@", "test@"), se deja en real y se marca a mano
     -- desde el panel: un falso "es prueba" esconde un lead, que es el error
     -- caro; un falso "es real" solo mete ruido, que se ve y se corrige.
     lower(s.email) like '%@novanoidai.com'
     or lower(s.email) like '%@novanoidtest.com'
     or lower(s.email) like '%@mecha.app'
     or exists (select 1 from public.staff st where lower(st.email) = lower(s.email))
     or exists (
       select 1 from public.profiles p
        where lower(p.email) = lower(s.email)
          and p.negocio_id is not null
          and public.clasificacion_negocio(p.negocio_id) <> 'real')
   );

-- Y a partir de ahora, en el alta.
create or replace function public.crear_solicitud_publica(
  p_tipo text, p_nombre text, p_salon text, p_email text, p_telefono text,
  p_num_profesionales text default null, p_herramienta_actual text default null,
  p_nota text default null, p_fecha_preferida text default null,
  p_hora_preferida text default null, p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip text := public.request_ip();
  v_id uuid;
  v_es_prueba boolean;
begin
  if p_tipo is null or p_tipo not in ('demo', 'reserva_llamada', 'signup', 'mensaje', 'quiero_software', 'calculadora', 'addon_ia') then
    raise exception 'Tipo de solicitud invalido';
  end if;
  if p_email is null or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(p_email) > 120 then
    raise exception 'El email es obligatorio';
  end if;
  if length(coalesce(p_nombre, '')) > 80 or length(coalesce(p_salon, '')) > 80
     or length(coalesce(p_telefono, '')) > 20 or length(coalesce(p_nota, '')) > 1000
     or length(coalesce(p_herramienta_actual, '')) > 80
     or length(coalesce(p_num_profesionales, '')) > 10
     or length(coalesce(p_fecha_preferida, '')) > 40 or length(coalesce(p_hora_preferida, '')) > 40
     or pg_column_size(p_meta) > 4096 then
    raise exception 'Datos demasiado largos';
  end if;

  if p_telefono is not null and btrim(p_telefono) <> ''
     and coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    raise exception 'El telefono debe contener al menos 7 digitos';
  end if;

  if v_ip <> '' and (
    select count(*) from public.solicitudes
    where ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes enviadas. Intentalo de nuevo mas tarde.';
  end if;
  if (
    select count(*) from public.solicitudes
    where lower(email) = lower(p_email) and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes para esta direccion de correo hoy.';
  end if;

  -- Nuestras propias pruebas entran igual, pero marcadas: asi el contador de
  -- Leads cuenta mercado y no ruido. No se rechazan -- probar el formulario de
  -- verdad, de punta a punta, es exactamente lo que hay que poder hacer.
  v_es_prueba := lower(p_email) like '%@novanoidai.com'
                 or lower(p_email) like '%@novanoidtest.com'
                 or lower(p_email) like '%@mecha.app'
                 or exists (select 1 from public.staff st where lower(st.email) = lower(p_email));

  insert into public.solicitudes (
    tipo, nombre, salon, email, telefono, num_profesionales,
    herramienta_actual, nota, fecha_preferida, hora_preferida, meta, ip_origen,
    origen, es_prueba
  )
  values (
    p_tipo, p_nombre, p_salon, p_email, p_telefono, p_num_profesionales,
    p_herramienta_actual, p_nota, p_fecha_preferida, p_hora_preferida, p_meta, v_ip,
    coalesce(p_meta->>'origen', p_tipo), v_es_prueba
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'es_prueba', v_es_prueba);
end;
$$;

-- Publica desde siempre: es el formulario de la landing (los tres caminos de
-- contacto de #precios). Se defiende con el limite de 5 al dia por IP y por
-- correo que tiene dentro.
grant execute on function public.crear_solicitud_publica(text, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
