-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Bandeja de mensajes (comunicación cliente → salón)
-- Autor: Carlos + Claude (1 jul 2026)
--
-- Qué es: una sola tabla de conversaciones para los dos sitios donde un cliente
-- puede escribirle al salón a través de Mecha:
--   1) el hilo de un presupuesto (rechazar con motivo / pedir cambio / mensaje libre)
--   2) la página pública "Contactar con el salón" (/app/contacto/<slug>)
-- Todo cae en la misma Bandeja del software. Sin SELECT directo a anon: todo pasa
-- por RPCs security definer con anti-abuso inline (mismo patrón que el portal).
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. CONVERSACIONES (cabecera)
-- ===============================================================================
create table if not exists public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  origen text not null check (origen in ('presupuesto', 'contacto')),
  presupuesto_id uuid references public.presupuestos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,

  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,

  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta')),
  leido_at timestamptz,                              -- null = sin leer por el salon
  ip_origen text,                                     -- solo origen='contacto'; anti-abuso (uso interno)

  created_at timestamptz not null default now(),
  ultimo_mensaje_at timestamptz not null default now()
);

-- Un presupuesto tiene como mucho una conversacion (se reutiliza si escribe varias veces).
create unique index if not exists conversaciones_presupuesto_unique
  on public.conversaciones(presupuesto_id) where presupuesto_id is not null;

create index if not exists conversaciones_negocio_idx
  on public.conversaciones(negocio_id, estado, ultimo_mensaje_at desc);
create index if not exists conversaciones_cliente_idx on public.conversaciones(cliente_id);

-- ===============================================================================
-- 2. MENSAJES DE LA CONVERSACIÓN (detalle)
-- ===============================================================================
create table if not exists public.mensajes_conversacion (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  autor text not null check (autor in ('cliente', 'salon')),
  tipo text not null default 'mensaje' check (tipo in ('mensaje', 'rechazo', 'cambio')),
  cuerpo text not null,

  notificado_at timestamptz,                          -- aviso por correo al salon ya enviado
  enviado_email_at timestamptz,                        -- solo autor='salon': respuesta enviada al cliente

  created_at timestamptz not null default now()
);

create index if not exists mensajes_conversacion_conv_idx
  on public.mensajes_conversacion(conversacion_id, created_at);

-- ===============================================================================
-- 3. TRIGGER: mantener ultimo_mensaje_at y reabrir "sin leer" cuando escribe el cliente
-- ===============================================================================
create or replace function public.conversaciones_on_nuevo_mensaje()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  update public.conversaciones
    set ultimo_mensaje_at = NEW.created_at,
        leido_at = case when NEW.autor = 'cliente' then null else leido_at end
  where id = NEW.conversacion_id;
  return NEW;
end;
$$;

drop trigger if exists mensajes_conversacion_trg on public.mensajes_conversacion;
create trigger mensajes_conversacion_trg
  after insert on public.mensajes_conversacion
  for each row execute function public.conversaciones_on_nuevo_mensaje();

-- ===============================================================================
-- 4. ROW LEVEL SECURITY
-- ===============================================================================
alter table public.conversaciones enable row level security;
alter table public.mensajes_conversacion enable row level security;

-- ---- conversaciones (patron clientes/presupuestos) ----
drop policy if exists "conversaciones_select_own" on public.conversaciones;
create policy "conversaciones_select_own" on public.conversaciones for select
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "conversaciones_update_own" on public.conversaciones;
create policy "conversaciones_update_own" on public.conversaciones for update
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "conversaciones_demo_block_update" on public.conversaciones;
create policy "conversaciones_demo_block_update" on public.conversaciones as restrictive
  for update using (not public.is_shared_demo_visitor()) with check (not public.is_shared_demo_visitor());
-- (insert/delete: solo via RPCs security definer; ningun grant directo a authenticated/anon)

-- ---- mensajes_conversacion (heredan el negocio de la conversacion padre) ----
drop policy if exists "mensajes_conv_select_own" on public.mensajes_conversacion;
create policy "mensajes_conv_select_own" on public.mensajes_conversacion for select
  using (exists (select 1 from public.conversaciones c where c.id = conversacion_id
    and c.negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid())));
drop policy if exists "mensajes_conv_insert_own" on public.mensajes_conversacion;
create policy "mensajes_conv_insert_own" on public.mensajes_conversacion for insert
  with check (autor = 'salon' and exists (select 1 from public.conversaciones c where c.id = conversacion_id
    and c.negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid())));
drop policy if exists "mensajes_conv_demo_block_insert" on public.mensajes_conversacion;
create policy "mensajes_conv_demo_block_insert" on public.mensajes_conversacion as restrictive
  for insert with check (not public.is_shared_demo_visitor());

-- ===============================================================================
-- 5. RPC: presupuesto_publico — se amplia para devolver el hilo de mensajes
-- ===============================================================================
create or replace function public.presupuesto_publico(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_pre public.presupuestos%rowtype;
  v_lineas jsonb;
  v_salon record;
  v_mensajes jsonb;
begin
  select * into v_pre from public.presupuestos where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_encontrado'); end if;

  select jsonb_agg(jsonb_build_object('nombre', nombre, 'precio_cents', precio_cents, 'cantidad', cantidad)
                   order by orden, created_at)
  into v_lineas from public.presupuesto_lineas where presupuesto_id = v_pre.id;

  select nombre_publico, logo_url, color_acento, slug, direccion, telefono
  into v_salon from public.negocio_portal where negocio_id = v_pre.negocio_id;

  select jsonb_agg(jsonb_build_object('autor', m.autor, 'tipo', m.tipo, 'cuerpo', m.cuerpo, 'created_at', m.created_at)
                   order by m.created_at)
  into v_mensajes
  from public.mensajes_conversacion m
  join public.conversaciones c on c.id = m.conversacion_id
  where c.presupuesto_id = v_pre.id;

  return jsonb_build_object(
    'ok', true,
    'numero', v_pre.numero,
    'estado', v_pre.estado,
    'titulo', v_pre.titulo,
    'notas', v_pre.notas,
    'contacto_nombre', v_pre.contacto_nombre,
    'total_cents', v_pre.total_cents,
    'valido_hasta', v_pre.valido_hasta,
    'created_at', v_pre.created_at,
    'lineas', coalesce(v_lineas, '[]'::jsonb),
    'mensajes', coalesce(v_mensajes, '[]'::jsonb),
    'salon', jsonb_build_object(
      'nombre', coalesce(v_salon.nombre_publico, ''),
      'logo_url', v_salon.logo_url,
      'color', coalesce(nullif(v_salon.color_acento, ''), '#f4501e'),
      'slug', v_salon.slug,
      'direccion', v_salon.direccion,
      'telefono', v_salon.telefono
    ),
    'aceptable', (v_pre.estado in ('enviado', 'aceptado')),
    'aceptado', (v_pre.estado = 'aceptado'),
    'cobrado', (v_pre.estado = 'cobrado'),
    'caducado', (v_pre.valido_hasta is not null and v_pre.valido_hasta < current_date)
  );
end;
$function$;

grant execute on function public.presupuesto_publico(text) to anon, authenticated;

-- ===============================================================================
-- 6. RPC: presupuesto_enviar_mensaje_publico — rechazar / pedir cambio / escribir
-- ===============================================================================
create or replace function public.presupuesto_enviar_mensaje_publico(
  p_token text,
  p_tipo text,
  p_cuerpo text
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_pre public.presupuestos%rowtype;
  v_conv_id uuid;
  v_mensaje_id uuid;
  v_cuerpo text := left(trim(coalesce(p_cuerpo, '')), 1000);
begin
  if p_tipo not in ('mensaje', 'rechazo', 'cambio') then
    return jsonb_build_object('ok', false, 'motivo', 'tipo_invalido');
  end if;
  if p_tipo <> 'rechazo' and v_cuerpo = '' then
    return jsonb_build_object('ok', false, 'motivo', 'mensaje_vacio');
  end if;

  select * into v_pre from public.presupuestos where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_encontrado'); end if;
  if v_pre.estado not in ('enviado', 'aceptado', 'rechazado') then
    return jsonb_build_object('ok', false, 'motivo', 'estado_no_valido', 'estado', v_pre.estado);
  end if;

  -- Anti-abuso: maximo 5 mensajes/hora por presupuesto.
  select c.id into v_conv_id from public.conversaciones c where c.presupuesto_id = v_pre.id;
  if v_conv_id is not null and (
    select count(*) from public.mensajes_conversacion
    where conversacion_id = v_conv_id and autor = 'cliente' and created_at > now() - interval '1 hour'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_mensajes');
  end if;

  if v_conv_id is null then
    insert into public.conversaciones (negocio_id, origen, presupuesto_id, cliente_id, contacto_nombre, contacto_telefono, contacto_email)
    values (v_pre.negocio_id, 'presupuesto', v_pre.id, v_pre.cliente_id, v_pre.contacto_nombre, v_pre.contacto_telefono, v_pre.contacto_email)
    returning id into v_conv_id;
  end if;

  insert into public.mensajes_conversacion (conversacion_id, autor, tipo, cuerpo)
  values (v_conv_id, 'cliente', p_tipo, coalesce(nullif(v_cuerpo, ''),
    case p_tipo when 'rechazo' then 'El cliente ha rechazado el presupuesto.' else v_cuerpo end))
  returning id into v_mensaje_id;

  if p_tipo = 'rechazo' then
    update public.presupuestos set estado = 'rechazado', modificado_at = now() where id = v_pre.id;
  end if;

  return jsonb_build_object('ok', true, 'mensaje_id', v_mensaje_id);
end;
$function$;

grant execute on function public.presupuesto_enviar_mensaje_publico(text, text, text) to anon, authenticated;

-- ===============================================================================
-- 7. RPC: negocio_contacto_publico — identidad publica minima para /app/contacto/<slug>
-- ===============================================================================
create or replace function public.negocio_contacto_publico(p_slug text)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select case when np.negocio_id is null then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'nombre', coalesce(np.nombre_publico, ''),
    'logo_url', np.logo_url,
    'color', coalesce(nullif(np.color_acento, ''), '#f4501e'),
    'slug', np.slug,
    'direccion', np.direccion,
    'telefono', np.telefono
  ) end
  from (select 1) dummy
  left join public.negocio_portal np on np.slug = p_slug and np.portal_activo = true;
$function$;

grant execute on function public.negocio_contacto_publico(text) to anon, authenticated;

-- ===============================================================================
-- 8. RPC: enviar_mensaje_contacto_publico — formulario "Contactar con el salon"
-- ===============================================================================
create or replace function public.enviar_mensaje_contacto_publico(
  p_slug text,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_cuerpo text
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_ip text := public.request_ip();
  v_nombre text := left(trim(coalesce(p_nombre, '')), 120);
  v_telefono text := nullif(left(trim(coalesce(p_telefono, '')), 40), '');
  v_email text := nullif(left(trim(coalesce(p_email, '')), 200), '');
  v_cuerpo text := left(trim(coalesce(p_cuerpo, '')), 1000);
  v_cliente_id uuid;
  v_conv_id uuid;
  v_mensaje_id uuid;
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then return jsonb_build_object('ok', false, 'motivo', 'portal_no_disponible'); end if;
  if length(v_nombre) < 2 then return jsonb_build_object('ok', false, 'motivo', 'nombre_invalido'); end if;
  if v_telefono is null and v_email is null then return jsonb_build_object('ok', false, 'motivo', 'falta_contacto'); end if;
  if v_cuerpo = '' then return jsonb_build_object('ok', false, 'motivo', 'mensaje_vacio'); end if;

  -- Anti-abuso: misma IP max 3 mensajes/dia por negocio; negocio max 30/dia (igual que resenas).
  if v_ip <> '' and (
    select count(*) from public.conversaciones
    where negocio_id = v_negocio and origen = 'contacto' and ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 3 then
    return jsonb_build_object('ok', false, 'motivo', 'limite_ip');
  end if;
  if (
    select count(*) from public.conversaciones
    where negocio_id = v_negocio and origen = 'contacto' and created_at > now() - interval '1 day'
  ) >= 30 then
    return jsonb_build_object('ok', false, 'motivo', 'limite_negocio');
  end if;

  if v_telefono is not null then
    select id into v_cliente_id from public.clientes
    where negocio_id = v_negocio and telefono = v_telefono limit 1;
  end if;

  insert into public.conversaciones (negocio_id, origen, cliente_id, contacto_nombre, contacto_telefono, contacto_email, ip_origen)
  values (v_negocio, 'contacto', v_cliente_id, v_nombre, v_telefono, v_email, nullif(v_ip, ''))
  returning id into v_conv_id;

  insert into public.mensajes_conversacion (conversacion_id, autor, tipo, cuerpo)
  values (v_conv_id, 'cliente', 'mensaje', v_cuerpo)
  returning id into v_mensaje_id;

  return jsonb_build_object('ok', true, 'mensaje_id', v_mensaje_id);
end;
$function$;

grant execute on function public.enviar_mensaje_contacto_publico(text, text, text, text, text) to anon, authenticated;

-- ===============================================================================
-- 9. COMENTARIOS
-- ===============================================================================
comment on table public.conversaciones is 'Bandeja de entrada: hilos de mensajes cliente->salon (desde un presupuesto o desde /app/contacto/<slug>).';
comment on table public.mensajes_conversacion is 'Mensajes de una conversacion. notificado_at evita reenviar el aviso por correo al salon dos veces.';
comment on column public.conversaciones.leido_at is 'null = sin leer por el salon. Se vacia automaticamente cuando el cliente escribe de nuevo (trigger).';
