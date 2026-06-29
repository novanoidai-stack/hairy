-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Presupuestos (quotes/estimates)
-- Autor: Carlos + Claude (30 jun 2026)
--
-- Qué es: una herramienta para que el profesional genere un presupuesto a una
-- clienta (con líneas reutilizables guardadas en un catálogo de "conceptos"),
-- lo envíe por correo (Resend, ya) / WhatsApp (Alexandro, próximamente) con su
-- PDF, lo acepte la clienta desde una página pública, y se pueda COBRAR en Caja.
--
-- Reglas de coherencia (igual que POS):
-- 1. Un presupuesto es una OFERTA — nunca es dinero hasta que se cobra.
-- 2. Cobrar un presupuesto crea un `cobro` (la única fuente de facturación real).
-- 3. El presupuesto puede engancharse a una cita (cita_id) sin forzar nada:
--    la reserva la hace el portal, la IA o el profesional a mano.
-- 4. Importes SIEMPRE en céntimos (integer), como en cobros.
-- 5. Multi-tenant estricto por negocio_id + RLS, con bloqueo de escritura para el
--    visitante de la demo compartida (políticas RESTRICTIVE, patrón de clientes/servicios).
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. CATÁLOGO DE CONCEPTOS REUTILIZABLES
--    Lo que el usuario llama "subpresupuestos": nombre + precio que se guardan
--    para no tener que reescribirlos en cada presupuesto.
-- ===============================================================================
create table if not exists public.presupuesto_conceptos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  nombre text not null,
  precio_cents integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (negocio_id, nombre)
);

-- ===============================================================================
-- 2. PRESUPUESTOS (cabecera) — objeto independiente con su propio ciclo de vida
-- ===============================================================================
create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  numero integer,                                   -- ref humana por negocio (P-<numero>)

  estado text not null default 'borrador'
    check (estado in ('borrador','enviado','aceptado','rechazado','caducado','cobrado')),

  -- Contacto: cliente con ficha (cliente_id) o prospecta suelta (campos de contacto)
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,

  profesional_id uuid references public.profesionales(id) on delete set null,
  titulo text,
  notas text,
  total_cents integer not null default 0,           -- cacheado (suma de líneas)
  valido_hasta date,

  -- Vínculos opcionales
  cita_id uuid references public.citas(id) on delete set null,
  cobro_id uuid references public.cobros(id) on delete set null,

  -- Página pública de aceptación
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),

  -- PDF + envío
  pdf_path text,                                    -- ruta en el bucket privado `presupuestos`
  whatsapp_solicitado boolean not null default false, -- la cola de WhatsApp (Alexandro) lee esto
  enviado_email_at timestamptz,
  enviado_whatsapp_at timestamptz,
  aceptado_at timestamptz,

  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  modificado_at timestamptz not null default now(),

  unique (negocio_id, numero)
);

-- ===============================================================================
-- 3. LÍNEAS DEL PRESUPUESTO (detalle)
-- ===============================================================================
create table if not exists public.presupuesto_lineas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  concepto_id uuid references public.presupuesto_conceptos(id) on delete set null,
  nombre text not null,                             -- snapshot (por si se renombra el concepto)
  precio_cents integer not null default 0,
  cantidad integer not null default 1,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

-- ===============================================================================
-- 4. VÍNCULO CITA → PRESUPUESTO (para agenda / IA)
-- ===============================================================================
alter table public.citas
  add column if not exists presupuesto_id uuid references public.presupuestos(id) on delete set null;

-- ===============================================================================
-- 5. ÍNDICES
-- ===============================================================================
create index if not exists presupuesto_conceptos_negocio_idx on public.presupuesto_conceptos(negocio_id);
create index if not exists presupuestos_negocio_idx on public.presupuestos(negocio_id, created_at desc);
create index if not exists presupuestos_estado_idx on public.presupuestos(negocio_id, estado);
create index if not exists presupuestos_cliente_idx on public.presupuestos(cliente_id);
create index if not exists presupuesto_lineas_pre_idx on public.presupuesto_lineas(presupuesto_id);

-- ===============================================================================
-- 6. NUMERACIÓN POR NEGOCIO (P-1, P-2, ... por salón)
-- ===============================================================================
create or replace function public.presupuestos_set_numero()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if NEW.numero is null then
    select coalesce(max(numero), 0) + 1 into NEW.numero
    from public.presupuestos where negocio_id = NEW.negocio_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists presupuestos_set_numero_trg on public.presupuestos;
create trigger presupuestos_set_numero_trg
  before insert on public.presupuestos
  for each row execute function public.presupuestos_set_numero();

-- ===============================================================================
-- 7. ROW LEVEL SECURITY
-- ===============================================================================
alter table public.presupuesto_conceptos enable row level security;
alter table public.presupuestos enable row level security;
alter table public.presupuesto_lineas enable row level security;

-- ---- presupuesto_conceptos ----
drop policy if exists "conceptos_select_own" on public.presupuesto_conceptos;
create policy "conceptos_select_own" on public.presupuesto_conceptos for select
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "conceptos_insert_own" on public.presupuesto_conceptos;
create policy "conceptos_insert_own" on public.presupuesto_conceptos for insert
  with check (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "conceptos_update_own" on public.presupuesto_conceptos;
create policy "conceptos_update_own" on public.presupuesto_conceptos for update
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "conceptos_delete_own" on public.presupuesto_conceptos;
create policy "conceptos_delete_own" on public.presupuesto_conceptos for delete
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "conceptos_demo_block_insert" on public.presupuesto_conceptos;
create policy "conceptos_demo_block_insert" on public.presupuesto_conceptos as restrictive
  for insert with check (not public.is_shared_demo_visitor());
drop policy if exists "conceptos_demo_block_update" on public.presupuesto_conceptos;
create policy "conceptos_demo_block_update" on public.presupuesto_conceptos as restrictive
  for update using (not public.is_shared_demo_visitor()) with check (not public.is_shared_demo_visitor());
drop policy if exists "conceptos_demo_block_delete" on public.presupuesto_conceptos;
create policy "conceptos_demo_block_delete" on public.presupuesto_conceptos as restrictive
  for delete using (not public.is_shared_demo_visitor());

-- ---- presupuestos ----
drop policy if exists "presupuestos_select_own" on public.presupuestos;
create policy "presupuestos_select_own" on public.presupuestos for select
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_insert_own" on public.presupuestos;
create policy "presupuestos_insert_own" on public.presupuestos for insert
  with check (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_update_own" on public.presupuestos;
create policy "presupuestos_update_own" on public.presupuestos for update
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_delete_own" on public.presupuestos;
create policy "presupuestos_delete_own" on public.presupuestos for delete
  using (negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_demo_block_insert" on public.presupuestos;
create policy "presupuestos_demo_block_insert" on public.presupuestos as restrictive
  for insert with check (not public.is_shared_demo_visitor());
drop policy if exists "presupuestos_demo_block_update" on public.presupuestos;
create policy "presupuestos_demo_block_update" on public.presupuestos as restrictive
  for update using (not public.is_shared_demo_visitor()) with check (not public.is_shared_demo_visitor());
drop policy if exists "presupuestos_demo_block_delete" on public.presupuestos;
create policy "presupuestos_demo_block_delete" on public.presupuestos as restrictive
  for delete using (not public.is_shared_demo_visitor());

-- ---- presupuesto_lineas (heredan el negocio del presupuesto padre) ----
drop policy if exists "lineas_select_own" on public.presupuesto_lineas;
create policy "lineas_select_own" on public.presupuesto_lineas for select
  using (exists (select 1 from public.presupuestos pr where pr.id = presupuesto_id
    and pr.negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid())));
drop policy if exists "lineas_insert_own" on public.presupuesto_lineas;
create policy "lineas_insert_own" on public.presupuesto_lineas for insert
  with check (exists (select 1 from public.presupuestos pr where pr.id = presupuesto_id
    and pr.negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid())));
drop policy if exists "lineas_update_own" on public.presupuesto_lineas;
create policy "lineas_update_own" on public.presupuesto_lineas for update
  using (exists (select 1 from public.presupuestos pr where pr.id = presupuesto_id
    and pr.negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid())));
drop policy if exists "lineas_delete_own" on public.presupuesto_lineas;
create policy "lineas_delete_own" on public.presupuesto_lineas for delete
  using (exists (select 1 from public.presupuestos pr where pr.id = presupuesto_id
    and pr.negocio_id = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid())));
drop policy if exists "lineas_demo_block_insert" on public.presupuesto_lineas;
create policy "lineas_demo_block_insert" on public.presupuesto_lineas as restrictive
  for insert with check (not public.is_shared_demo_visitor());
drop policy if exists "lineas_demo_block_update" on public.presupuesto_lineas;
create policy "lineas_demo_block_update" on public.presupuesto_lineas as restrictive
  for update using (not public.is_shared_demo_visitor()) with check (not public.is_shared_demo_visitor());
drop policy if exists "lineas_demo_block_delete" on public.presupuesto_lineas;
create policy "lineas_demo_block_delete" on public.presupuesto_lineas as restrictive
  for delete using (not public.is_shared_demo_visitor());

-- ===============================================================================
-- 8. STORAGE: bucket privado para los PDF (signed URLs, como cliente-fotos)
-- ===============================================================================
insert into storage.buckets (id, name, public)
values ('presupuestos', 'presupuestos', false)
on conflict (id) do nothing;

drop policy if exists "presupuestos_obj_select" on storage.objects;
create policy "presupuestos_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'presupuestos'
    and (storage.foldername(name))[1] = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_obj_insert" on storage.objects;
create policy "presupuestos_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'presupuestos'
    and (storage.foldername(name))[1] = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_obj_update" on storage.objects;
create policy "presupuestos_obj_update" on storage.objects for update to authenticated
  using (bucket_id = 'presupuestos'
    and (storage.foldername(name))[1] = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));
drop policy if exists "presupuestos_obj_delete" on storage.objects;
create policy "presupuestos_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'presupuestos'
    and (storage.foldername(name))[1] = (select profiles.negocio_id from public.profiles where profiles.id = auth.uid()));

-- ===============================================================================
-- 9. RPC: COBRAR UN PRESUPUESTO (espejo de crear_cobro_walkin)
--    Crea un cobro + líneas desde el presupuesto, lo marca cobrado, y si estaba
--    enganchado a una cita aún no cobrada la marca cobrada (sin doble cargo).
-- ===============================================================================
create or replace function public.crear_cobro_desde_presupuesto(
  p_presupuesto_id uuid,
  p_metodo text default 'efectivo',
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0
) returns uuid
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_pre public.presupuestos%rowtype;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_base integer := 0;
  v_total integer;
  v_cobro_id uuid;
begin
  select negocio_id into v_negocio from public.profiles where id = auth.uid();
  if v_negocio is null then raise exception 'sin_perfil'; end if;
  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;

  select * into v_pre from public.presupuestos where id = p_presupuesto_id;
  if not found then raise exception 'presupuesto_no_encontrado'; end if;
  if v_pre.negocio_id <> v_negocio then raise exception 'no_autorizado'; end if;
  if v_pre.estado = 'cobrado' or v_pre.cobro_id is not null then raise exception 'presupuesto_ya_cobrado'; end if;

  select coalesce(sum(precio_cents * cantidad), 0) into v_base
  from public.presupuesto_lineas where presupuesto_id = p_presupuesto_id;
  if v_base <= 0 then raise exception 'presupuesto_sin_lineas'; end if;

  v_total := greatest(0, v_base - v_desc) + v_prop;
  if v_total <= 0 then raise exception 'total_invalido'; end if;

  insert into public.cobros (
    negocio_id, cita_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado, nota
  ) values (
    v_negocio, null, v_pre.profesional_id, v_pre.cliente_id,
    v_total, v_prop, v_desc, p_metodo,
    case when p_metodo = 'efectivo' then v_total else 0 end,
    case when p_metodo = 'datafono' then v_total else 0 end,
    0, 'pos', 'completado',
    'Presupuesto P-' || coalesce(v_pre.numero::text, '?')
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  select v_cobro_id, 'servicio', null, nombre, precio_cents, cantidad
  from public.presupuesto_lineas where presupuesto_id = p_presupuesto_id
  order by orden, created_at;

  update public.presupuestos
    set estado = 'cobrado', cobro_id = v_cobro_id, modificado_at = now()
  where id = p_presupuesto_id;

  if v_pre.cita_id is not null then
    update public.citas set cobrada = true, cobro_id = v_cobro_id
    where id = v_pre.cita_id and coalesce(cobrada, false) = false;
  end if;

  return v_cobro_id;
end;
$function$;

-- Por defecto Postgres concede EXECUTE a PUBLIC; revocamos para que anon no pueda llamarla.
revoke execute on function public.crear_cobro_desde_presupuesto(uuid, text, integer, integer) from public, anon;
grant execute on function public.crear_cobro_desde_presupuesto(uuid, text, integer, integer) to authenticated;

-- ===============================================================================
-- 10. RPCs PÚBLICAS (página de aceptación anónima) — sin SELECT directo a anon
-- ===============================================================================
create or replace function public.presupuesto_publico(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_pre public.presupuestos%rowtype;
  v_lineas jsonb;
  v_salon record;
begin
  select * into v_pre from public.presupuestos where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_encontrado'); end if;

  select jsonb_agg(jsonb_build_object('nombre', nombre, 'precio_cents', precio_cents, 'cantidad', cantidad)
                   order by orden, created_at)
  into v_lineas from public.presupuesto_lineas where presupuesto_id = v_pre.id;

  select nombre_publico, logo_url, color_acento, slug, direccion, telefono
  into v_salon from public.negocio_portal where negocio_id = v_pre.negocio_id;

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

create or replace function public.aceptar_presupuesto_publico(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_pre public.presupuestos%rowtype;
begin
  select * into v_pre from public.presupuestos where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_encontrado'); end if;
  if v_pre.estado not in ('enviado', 'aceptado') then
    return jsonb_build_object('ok', false, 'motivo', 'estado_no_valido', 'estado', v_pre.estado);
  end if;
  update public.presupuestos
    set estado = 'aceptado', aceptado_at = coalesce(aceptado_at, now()), modificado_at = now()
  where id = v_pre.id;
  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.aceptar_presupuesto_publico(text) to anon, authenticated;

-- ===============================================================================
-- 11. RPCs DE LA COLA DE ENVÍO (las consume el workflow n8n de Alexandro) — service_role
--     WhatsApp = "próximamente": el motor lee whatsapp_solicitado=true y manda el PDF.
-- ===============================================================================
create or replace function public.presupuestos_pendientes_envio(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'presupuesto_id', p.id,
    'numero', p.numero,
    'token', p.token,
    'telefono', p.contacto_telefono,
    'nombre', split_part(coalesce(p.contacto_nombre, ''), ' ', 1),
    'salon', coalesce(np.nombre_publico, ''),
    'slug', np.slug,
    'total_cents', p.total_cents,
    'pdf_path', p.pdf_path
  )), '[]'::jsonb)
  from public.presupuestos p
  join public.negocio_portal np on np.negocio_id = p.negocio_id and np.portal_activo = true
  where p.whatsapp_solicitado = true
    and p.enviado_whatsapp_at is null
    and p.contacto_telefono is not null and length(trim(p.contacto_telefono)) >= 6
    and p.pdf_path is not null
  limit greatest(p_limit, 1);
$function$;

-- SOLO service_role (n8n): revocar de PUBLIC para no filtrar telefonos entre negocios.
revoke execute on function public.presupuestos_pendientes_envio(integer) from public, anon, authenticated;
grant execute on function public.presupuestos_pendientes_envio(integer) to service_role;

create or replace function public.marcar_presupuesto_enviado(p_presupuesto_id uuid, p_canal text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_canal = 'whatsapp' then
    update public.presupuestos
      set enviado_whatsapp_at = now(),
          estado = case when estado = 'borrador' then 'enviado' else estado end
    where id = p_presupuesto_id;
  elsif p_canal = 'email' then
    update public.presupuestos
      set enviado_email_at = now(),
          estado = case when estado = 'borrador' then 'enviado' else estado end
    where id = p_presupuesto_id;
  else
    raise exception 'canal_invalido';
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke execute on function public.marcar_presupuesto_enviado(uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_presupuesto_enviado(uuid, text) to service_role;

-- ===============================================================================
-- 12. COMENTARIOS
-- ===============================================================================
comment on table public.presupuestos is 'Presupuestos/ofertas a clientas. NO es dinero hasta que se cobra (crea un cobro).';
comment on table public.presupuesto_conceptos is 'Catálogo reutilizable de conceptos (nombre+precio) para no reescribirlos.';
comment on column public.presupuestos.whatsapp_solicitado is 'true = encolado para que el workflow n8n (Alexandro) lo mande por WhatsApp con el PDF.';
comment on column public.presupuestos.cita_id is 'Cita enganchada (reservada después por portal/IA/manual). No fuerza nada.';
