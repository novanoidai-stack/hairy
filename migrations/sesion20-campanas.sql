-- S20 · Campañas (reactivación / difusión) — capa de datos.
--
-- Carlos construye: segmentación (audiencia por criterios reales, con conteo en
-- vivo y RLS), creación de campaña en borrador, y ENCOLADO (materializa los
-- destinatarios con su mensaje personalizado). El ENVÍO REAL (WhatsApp/correo)
-- es de Alexandro: lee campanas_destinatarios_pendientes() y confirma con
-- campana_marcar_enviado(). Aquí NO se envía nada.
--
-- Reglas: multi-tenant por negocio_id + rol gestor (owner/admin) dentro de cada
-- RPC (security definer). Tablas con RLS de solo-lectura por negocio; las
-- escrituras van por los RPC definer. Salud fuera (no se usa ningún dato del
-- art. 9). Se excluye siempre a clientas bloqueadas y sin canal de contacto.

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  nombre text not null,
  canal text not null default 'whatsapp' check (canal in ('whatsapp','email')),
  mensaje text not null,
  segmento jsonb not null default '{}'::jsonb,
  estado text not null default 'borrador'
    check (estado in ('borrador','encolada','enviando','enviada','cancelada')),
  total_destinatarios int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  encolada_en timestamptz
);

create index if not exists idx_campanas_negocio_estado on public.campanas(negocio_id, estado);

create table if not exists public.campana_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas(id) on delete cascade,
  negocio_id text not null,
  cliente_id uuid,
  nombre text,
  contacto text not null,               -- snapshot del telefono/email al encolar
  mensaje_final text not null,          -- mensaje ya personalizado
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviado','descartado','error')),
  enviado_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_campana_dest_campana_estado on public.campana_destinatarios(campana_id, estado);
create index if not exists idx_campana_dest_pendientes on public.campana_destinatarios(negocio_id, estado) where estado = 'pendiente';

-- ---------------------------------------------------------------------
-- 2. RLS: solo lectura por negocio. Las escrituras van por los RPC definer.
-- ---------------------------------------------------------------------
alter table public.campanas enable row level security;
alter table public.campana_destinatarios enable row level security;

drop policy if exists campanas_select_own on public.campanas;
create policy campanas_select_own on public.campanas
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

drop policy if exists campana_dest_select_own on public.campana_destinatarios;
create policy campana_dest_select_own on public.campana_destinatarios
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Audiencia (filtro centralizado). Interno: lo llaman los RPC definer.
--    Criterios en jsonb, allowlist fija (no SQL dinámico):
--      inactividad_dias, min_visitas, max_visitas, min_ticket, etiqueta
--    Siempre excluye bloqueadas y exige contacto del canal.
-- ---------------------------------------------------------------------
create or replace function public._campana_audiencia(p_negocio text, p_canal text, p_seg jsonb)
returns table(cliente_id uuid, nombre text, contacto text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.nombre,
         case when p_canal = 'email' then c.email else c.telefono end as contacto
  from public.clientes c
  where c.negocio_id = p_negocio
    and coalesce(c.bloqueado, false) = false
    and case when p_canal = 'email'
             then (c.email is not null and btrim(c.email) <> '')
             else (c.telefono is not null and btrim(c.telefono) <> '') end
    and (p_seg->>'inactividad_dias' is null
         or (c.ultima_visita is not null
             and (current_date - c.ultima_visita) >= (p_seg->>'inactividad_dias')::int))
    and (p_seg->>'min_visitas' is null or coalesce(c.total_visitas, 0) >= (p_seg->>'min_visitas')::int)
    and (p_seg->>'max_visitas' is null or coalesce(c.total_visitas, 0) <= (p_seg->>'max_visitas')::int)
    and (p_seg->>'min_ticket' is null or coalesce(c.ticket_medio, 0) >= (p_seg->>'min_ticket')::numeric)
    and (p_seg->>'etiqueta' is null
         or (p_seg->>'etiqueta') = any(coalesce(c.etiquetas, array[]::text[])));
$$;

revoke execute on function public._campana_audiencia(text, text, jsonb) from public, anon, authenticated;

-- Helper de rol: negocio_id + rol gestor del JWT (o excepción).
create or replace function public._campana_gestor()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare v_negocio text; v_role text;
begin
  select negocio_id, role into v_negocio, v_role from public.profiles where id = auth.uid();
  if v_negocio is null then raise exception 'no_profile'; end if;
  if v_role not in ('owner','admin') then raise exception 'not_authorized'; end if;
  return v_negocio;
end;
$$;

revoke execute on function public._campana_gestor() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC de gestión (gestor): contar, crear, encolar, cancelar.
-- ---------------------------------------------------------------------
-- Conteo en vivo del segmento (para la vista previa antes de encolar).
create or replace function public.campana_contar(p_canal text, p_segmento jsonb)
returns int
language plpgsql stable security definer set search_path = public
as $$
declare v_negocio text; v_count int;
begin
  v_negocio := public._campana_gestor();
  select count(*) into v_count
    from public._campana_audiencia(v_negocio, coalesce(nullif(p_canal,''),'whatsapp'), coalesce(p_segmento, '{}'::jsonb));
  return v_count;
end;
$$;

revoke execute on function public.campana_contar(text, jsonb) from public, anon;
grant execute on function public.campana_contar(text, jsonb) to authenticated;

-- Crea una campaña en borrador (no materializa destinatarios todavía).
create or replace function public.campana_crear(p_nombre text, p_canal text, p_mensaje text, p_segmento jsonb)
returns public.campanas
language plpgsql security definer set search_path = public
as $$
declare v_negocio text; v_canal text; v_row public.campanas;
begin
  v_negocio := public._campana_gestor();
  if coalesce(btrim(p_nombre),'') = '' then raise exception 'nombre_vacio'; end if;
  if coalesce(btrim(p_mensaje),'') = '' then raise exception 'mensaje_vacio'; end if;
  v_canal := coalesce(nullif(p_canal,''),'whatsapp');
  if v_canal not in ('whatsapp','email') then raise exception 'canal_invalido'; end if;

  insert into public.campanas (negocio_id, nombre, canal, mensaje, segmento, created_by)
  values (v_negocio, btrim(p_nombre), v_canal, p_mensaje, coalesce(p_segmento,'{}'::jsonb), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.campana_crear(text, text, text, jsonb) from public, anon;
grant execute on function public.campana_crear(text, text, text, jsonb) to authenticated;

-- Encola: materializa los destinatarios (snapshot de contacto + mensaje
-- personalizado con {nombre}) y deja la campaña lista para el ENVÍO de Alexandro.
create or replace function public.campana_encolar(p_id uuid)
returns public.campanas
language plpgsql security definer set search_path = public
as $$
declare v_negocio text; v_row public.campanas; v_total int;
begin
  v_negocio := public._campana_gestor();
  select * into v_row from public.campanas where id = p_id and negocio_id = v_negocio;
  if not found then raise exception 'campana_no_encontrada'; end if;
  if v_row.estado <> 'borrador' then raise exception 'estado_no_borrador'; end if;

  insert into public.campana_destinatarios (campana_id, negocio_id, cliente_id, nombre, contacto, mensaje_final)
  select v_row.id, v_negocio, a.cliente_id, a.nombre, a.contacto,
         replace(v_row.mensaje, '{nombre}', coalesce(nullif(btrim(a.nombre),''),''))
    from public._campana_audiencia(v_negocio, v_row.canal, v_row.segmento) a;
  get diagnostics v_total = row_count;

  update public.campanas
     set estado = 'encolada', total_destinatarios = v_total, encolada_en = now()
   where id = v_row.id
   returning * into v_row;

  -- Registro universal (S08).
  insert into public.eventos_negocio
    (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, resultado, motivo)
  values
    (v_negocio, 'campana_encolada', 'campana', v_row.id::text, 'usuario',
     'Campaña encolada: ' || v_row.nombre || ' (' || v_total || ' destinatarios)',
     jsonb_build_object('canal', v_row.canal, 'total', v_total), 'encolada', 'envio pendiente (Alexandro)');

  return v_row;
end;
$$;

revoke execute on function public.campana_encolar(uuid) from public, anon;
grant execute on function public.campana_encolar(uuid) to authenticated;

-- Cancela una campaña (mientras no se haya enviado).
create or replace function public.campana_cancelar(p_id uuid)
returns public.campanas
language plpgsql security definer set search_path = public
as $$
declare v_negocio text; v_row public.campanas;
begin
  v_negocio := public._campana_gestor();
  select * into v_row from public.campanas where id = p_id and negocio_id = v_negocio;
  if not found then raise exception 'campana_no_encontrada'; end if;
  if v_row.estado = 'enviada' then raise exception 'ya_enviada'; end if;

  update public.campana_destinatarios set estado = 'descartado'
    where campana_id = v_row.id and estado = 'pendiente';
  update public.campanas set estado = 'cancelada' where id = v_row.id returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.campana_cancelar(uuid) from public, anon;
grant execute on function public.campana_cancelar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC del MOTOR DE ENVÍO (Alexandro, service_role). Contrato claro:
--    lee pendientes -> envía por su canal -> marca cada destinatario.
-- ---------------------------------------------------------------------
create or replace function public.campanas_destinatarios_pendientes(p_limit int default 100)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'destinatario_id', d.id,
    'campana_id', d.campana_id,
    'negocio_id', d.negocio_id,
    'canal', c.canal,
    'contacto', d.contacto,
    'nombre', d.nombre,
    'mensaje', d.mensaje_final,
    'creado_en', d.created_at
  )), '[]'::jsonb)
  from (
    select d.* from public.campana_destinatarios d
    join public.campanas c on c.id = d.campana_id
    where d.estado = 'pendiente' and c.estado in ('encolada','enviando')
    order by d.created_at
    limit greatest(p_limit, 1)
  ) d
  join public.campanas c on c.id = d.campana_id;
$$;

revoke execute on function public.campanas_destinatarios_pendientes(int) from public, anon, authenticated;
grant execute on function public.campanas_destinatarios_pendientes(int) to service_role;

-- Marca un destinatario tras el envío. Auto-avanza la campaña a 'enviando' y, si
-- ya no quedan pendientes, a 'enviada'.
create or replace function public.campana_marcar_enviado(p_destinatario uuid, p_estado text default 'enviado')
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_campana uuid; v_pend int;
begin
  if coalesce(p_estado,'enviado') not in ('enviado','error','descartado') then
    raise exception 'estado_invalido';
  end if;
  update public.campana_destinatarios
     set estado = p_estado, enviado_en = case when p_estado = 'enviado' then now() else enviado_en end
   where id = p_destinatario and estado = 'pendiente'
   returning campana_id into v_campana;
  if v_campana is null then return jsonb_build_object('ok', false, 'motivo', 'no_pendiente'); end if;

  select count(*) into v_pend from public.campana_destinatarios
    where campana_id = v_campana and estado = 'pendiente';
  update public.campanas
     set estado = case when v_pend = 0 then 'enviada' else 'enviando' end
   where id = v_campana and estado in ('encolada','enviando');

  return jsonb_build_object('ok', true, 'pendientes', v_pend);
end;
$$;

revoke execute on function public.campana_marcar_enviado(uuid, text) from public, anon, authenticated;
grant execute on function public.campana_marcar_enviado(uuid, text) to service_role;

comment on table public.campanas is 'Campañas de reactivación/difusión (S20). Carlos: segmentación + encolado. ENVÍO REAL (WhatsApp/correo) = Alexandro via campanas_destinatarios_pendientes() + campana_marcar_enviado().';
comment on table public.campana_destinatarios is 'Outbox de destinatarios de campaña (S20). Lo rellena campana_encolar(); lo consume el motor de envío de Alexandro.';
