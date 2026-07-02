-- Migracion: round 4 de seguridad — superficie de ejecucion de funciones y cierres varios
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- Origen: informes/PLAN_BLINDAJE_SEGURIDAD_2026-07-02.md (hallazgos H1, H3, H5, H7, H10 + inventario)
--
-- Que corrige:
--   H1  54 funciones ejecutables por `anon` sin necesitarlo (incluidas RPCs financieras:
--       crear_cobro_walkin, anular_liquidacion, generar_liquidacion, ...). Se revoca anon
--       de TODO salvo la whitelist publica intencional (portal/resenas/presupuestos/contacto
--       + helpers de RLS). Verificado antes con grep de `.rpc(` en el cliente: la lista de
--       abajo cubre exactamente lo que llaman las paginas anonimas. El agente de WhatsApp
--       (n8n) usa service_role (identificar_cliente/citas_de_cliente ya no eran ejecutables
--       por anon), asi que no le afecta.
--   H3  Politica solicitudes_insert_public WITH CHECK (true). OJO: la RPC
--       crear_solicitud_publica estaba escrita en migrations/solicitudes-rpc-rate-limiting.sql
--       pero NUNCA aplicada en remoto (el form de la landing fallaba la RPC). Se aplica aqui
--       (con validacion whitelist anadida) y ENTONCES se cierra el insert directo.
--   H5  search_path sin fijar (importe_senal_servicio + barrido de cualquier otra).
--   H7  Limites de subida solo en cliente: se fijan file_size_limit y allowed_mime_types
--       a nivel de bucket (autoridad en servidor).
--   H10 Tablas deny-all documentadas para que nadie las "arregle" abriendo un SELECT.
--   +   RPCs de escritura de inventario sin control de rol: cualquier empleado podia
--       crear/editar/desactivar productos. Se anade gate owner/admin (registrar movimientos
--       de stock sigue abierto a todo el equipo: es operativa diaria).
--   +   Trigger functions con EXECUTE para anon/authenticated (ruido de advisors; no son
--       invocables via RPC pero se limpia la superficie).
--   +   Default privileges: las funciones nuevas creadas por postgres ya NO nacen
--       ejecutables por anon. REGLA NUEVA: toda RPC publica nueva necesita
--       `grant execute ... to anon` explicito en su migracion.

-- ─────────────────────────────────────────────────────────────────
-- 1) crear_solicitud_publica (migracion perdida, aplicada con refuerzo)
-- ─────────────────────────────────────────────────────────────────

alter table public.solicitudes add column if not exists ip_origen text;

create or replace function public.crear_solicitud_publica(
  p_tipo               text,
  p_nombre             text,
  p_salon              text,
  p_email              text,
  p_telefono           text,
  p_num_profesionales  text default null,
  p_herramienta_actual text default null,
  p_nota               text default null,
  p_fecha_preferida    text default null,
  p_hora_preferida     text default null,
  p_meta               jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip text := public.request_ip();
  v_id uuid;
begin
  -- Validacion whitelist (tipos cerrados, longitudes, formato)
  if p_tipo is null or p_tipo not in ('demo', 'reserva_llamada', 'signup') then
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

  -- Anti-abuso: max 5 solicitudes por IP y por email al dia
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

  insert into public.solicitudes (
    tipo, nombre, salon, email, telefono, num_profesionales,
    herramienta_actual, nota, fecha_preferida, hora_preferida, meta, ip_origen
  )
  values (
    p_tipo, p_nombre, p_salon, p_email, p_telefono, p_num_profesionales,
    p_herramienta_actual, p_nota, p_fecha_preferida, p_hora_preferida, p_meta, v_ip
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.crear_solicitud_publica to anon, authenticated;

-- Cerrar el insert directo (H3): la RPC es ahora el unico camino para anon
revoke insert on public.solicitudes from anon, authenticated;
drop policy if exists "solicitudes_insert_public" on public.solicitudes;

-- ─────────────────────────────────────────────────────────────────
-- 2) Gate de rol en escrituras de inventario (owner/admin)
-- ─────────────────────────────────────────────────────────────────

create or replace function public.crear_producto(
  p_nombre text, p_descripcion text default null, p_categoria text default 'general',
  p_precio_cents integer default 0, p_iva_porcentaje numeric default 21.00,
  p_stock_minimo integer default 5, p_codigo_barras text default null,
  p_imagen_url text default null, p_proveedor text default null,
  p_inicial_unidades integer default 0, p_ubicacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_negocio_id text; v_role text; v_nuevo_id uuid; v_inventario_id uuid;
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Usuario no valido'); end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede modificar el catalogo');
  end if;
  if length(coalesce(p_nombre, '')) not between 1 and 120
     or p_precio_cents < 0 or p_precio_cents > 100000000
     or p_inicial_unidades < 0 or p_inicial_unidades > 1000000 then
    return jsonb_build_object('ok', false, 'error', 'Datos de producto no validos');
  end if;
  insert into productos (negocio_id, nombre, descripcion, categoria, precio_cents, iva_porcentaje, stock_minimo, codigo_barras, imagen_url, proveedor)
  values (v_negocio_id, p_nombre, p_descripcion, p_categoria, p_precio_cents, p_iva_porcentaje, p_stock_minimo, p_codigo_barras, p_imagen_url, p_proveedor) returning id into v_nuevo_id;
  if p_inicial_unidades > 0 then
    insert into inventario (negocio_id, producto_id, unidades, ubicacion, ultima_modificacion, modificado_por)
    values (v_negocio_id, v_nuevo_id, p_inicial_unidades, p_ubicacion, now(), auth.uid()) returning id into v_inventario_id;
    insert into movimientos_inventario (negocio_id, producto_id, tipo, unidades, motivo, creado_por)
    values (v_negocio_id, v_nuevo_id, 'entrada', p_inicial_unidades, 'Stock inicial', auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'producto_id', v_nuevo_id, 'inventario_id', v_inventario_id);
end; $$;

create or replace function public.actualizar_producto(
  p_producto_id uuid, p_nombre text default null, p_descripcion text default null,
  p_categoria text default null, p_precio_cents integer default null,
  p_iva_porcentaje numeric default null, p_stock_minimo integer default null,
  p_codigo_barras text default null, p_imagen_url text default null,
  p_proveedor text default null, p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_negocio_id text; v_role text;
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Usuario no valido'); end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede modificar el catalogo');
  end if;
  if p_precio_cents is not null and (p_precio_cents < 0 or p_precio_cents > 100000000) then
    return jsonb_build_object('ok', false, 'error', 'Datos de producto no validos');
  end if;
  update productos set nombre = coalesce(p_nombre, nombre), descripcion = coalesce(p_descripcion, descripcion), categoria = coalesce(p_categoria, categoria),
    precio_cents = coalesce(p_precio_cents, precio_cents), iva_porcentaje = coalesce(p_iva_porcentaje, iva_porcentaje), stock_minimo = coalesce(p_stock_minimo, stock_minimo),
    codigo_barras = coalesce(p_codigo_barras, codigo_barras), imagen_url = coalesce(p_imagen_url, imagen_url), proveedor = coalesce(p_proveedor, proveedor), activo = coalesce(p_activo, activo), updated_at = now()
  where id = p_producto_id and negocio_id = v_negocio_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Producto no encontrado'); end if;
  return jsonb_build_object('ok', true, 'producto_id', p_producto_id);
end; $$;

create or replace function public.eliminar_producto(p_producto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_negocio_id text; v_role text;
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Usuario no valido'); end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede modificar el catalogo');
  end if;
  update productos set activo = false, updated_at = now() where id = p_producto_id and negocio_id = v_negocio_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Producto no encontrado'); end if;
  return jsonb_build_object('ok', true, 'producto_id', p_producto_id);
end; $$;

-- ─────────────────────────────────────────────────────────────────
-- 3) H1: revocar anon de todo salvo la whitelist publica intencional
--    (preservando exactamente lo que ya tienen authenticated y service_role)
-- ─────────────────────────────────────────────────────────────────

do $$
declare
  r record;
  allow constant text[] := array[
    -- portal de reserva y autogestion de cita
    'portal_info', 'disponibilidad_publica', 'portal_dias_disponibles',
    'crear_cita_publica', 'crear_cita_publica_grupo', 'modificar_cita_publica',
    'cancelar_cita_publica', 'cita_publica', 'confirmar_cita_oferta',
    -- resenas publicas
    'crear_resena_publica', 'resenas_publicas',
    -- presupuestos y contacto publicos
    'presupuesto_publico', 'aceptar_presupuesto_publico', 'presupuesto_enviar_mensaje_publico',
    'negocio_contacto_publico', 'enviar_mensaje_contacto_publico',
    -- landing
    'crear_solicitud_publica', 'obtener_estadisticas_mecha',
    -- helpers usados dentro de politicas RLS (inofensivos: devuelven null/false sin sesion)
    'is_staff', 'is_team_member', 'is_shared_demo_visitor',
    'my_app_role', 'my_negocio_id', 'my_negocio_id_text'
  ];
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname <> all(allow)
  loop
    -- fijar explicitamente lo que authenticated/service_role ya tenian, por si
    -- su acceso dependia del grant implicito a PUBLIC que vamos a revocar
    if has_function_privilege('authenticated', r.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    execute format('grant execute on function %s to service_role', r.sig);
    execute format('revoke execute on function %s from anon, public', r.sig);
  end loop;
end $$;

-- Trigger functions: no son invocables via RPC (devuelven trigger) pero se les
-- retira EXECUTE de los roles de cliente para limpiar la superficie/advisors.
-- El disparo de triggers NO comprueba EXECUTE del invocador: no rompe nada.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.sig);
  end loop;
end $$;

-- Default privileges: las funciones nuevas de postgres dejan de nacer con anon.
-- (Las de supabase_admin no se pueden tocar desde postgres; sus defaults solo
-- aplican a objetos que cree supabase_admin, no a nuestras migraciones.)
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ─────────────────────────────────────────────────────────────────
-- 4) H5: fijar search_path en toda funcion que no lo tenga
-- ─────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 5) H10: documentar las tablas deny-all como intencionales
-- ─────────────────────────────────────────────────────────────────

comment on table public.stripe_webhook_eventos is
  'RLS activado SIN politicas A PROPOSITO: solo la toca service_role (webhook Stripe, idempotencia). No anadir politicas.';
comment on table public.cita_pago_enlaces is
  'RLS activado SIN politicas A PROPOSITO: solo la toca service_role (enlaces de pago). El acceso publico va por RPCs security definer.';
comment on table public.lista_espera_avisos is
  'RLS activado SIN politicas A PROPOSITO: solo la toca service_role (motor de avisos n8n).';
comment on table public.lista_espera_ofertas is
  'RLS activado SIN politicas A PROPOSITO: solo la toca service_role (matching lista de espera).';

-- ─────────────────────────────────────────────────────────────────
-- 6) H7: limites de subida a nivel de bucket (autoridad en servidor)
--    El cliente ya validaba (5MB, image/*) pero era saltable por API directa.
-- ─────────────────────────────────────────────────────────────────

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/gif']
where id in ('cliente-fotos', 'servicio-fotos');

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = array['application/pdf']  -- lib/presupuestos.ts sube con contentType application/pdf
where id = 'presupuestos';
