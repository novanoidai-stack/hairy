-- =====================================================================
-- Mecha · S14 · Avisos accionables + canal urgente (cola de notificacion)
-- =====================================================================
-- Los hallazgos de S13 se muestran en Avisos con acciones de un clic (ver /
-- resolver / descartar), y lo URGENTE se encola para notificacion externa.
-- El ENVIO real (WhatsApp/correo) NO se hace aqui: es de Alexandro. Esto deja
-- la cola-outbox y el contrato listos como stub.
--
-- Regla de urgencia (determinista): una cita sin confirmar que ocurre en menos
-- de 12h es urgente (worth interrumpir al gestor). El resto mantiene su severidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Outbox de notificaciones de hallazgos urgentes (la consume Alexandro).
--    Patron identico a presupuestos_pendientes_envio (n8n hace pull por RPC).
-- ---------------------------------------------------------------------
create table if not exists public.hallazgos_notificaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  hallazgo_id uuid not null references public.hallazgos_ia(id) on delete cascade,
  tipo text not null,
  resumen text not null,
  canal text not null default 'whatsapp',   -- canal sugerido; Alexandro decide el real
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','descartado')),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);

-- Dedup: como mucho UNA notificacion pendiente por hallazgo.
create unique index if not exists uq_hallazgos_notif_pendiente
  on public.hallazgos_notificaciones(hallazgo_id)
  where estado = 'pendiente';

create index if not exists idx_hallazgos_notif_negocio_estado
  on public.hallazgos_notificaciones(negocio_id, estado);

alter table public.hallazgos_notificaciones enable row level security;

drop policy if exists hallazgos_notif_select_own on public.hallazgos_notificaciones;
create policy hallazgos_notif_select_own on public.hallazgos_notificaciones
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));
-- Sin INSERT/UPDATE/DELETE para authenticated/anon: solo el motor (service_role)
-- y las funciones security definer tocan la cola.

-- ---------------------------------------------------------------------
-- 2. Barrido por negocio (redefinido): añade la regla de urgencia en
--    cita_sin_confirmar + encola urgentes + reconcilia notificaciones stale.
-- ---------------------------------------------------------------------
create or replace function public.procesar_hallazgos_negocio(p_negocio text)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_nuevos int := 0; v_count int; v_items jsonb; v_urgente boolean;
begin
  if p_negocio = 'demo_salon_001' then return 0; end if;

  -- (1) Señales sin pagar
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('cita_id', s.id))
                             from (select id from public.citas
                                   where negocio_id = p_negocio and estado = 'pendiente'
                                     and coalesce(deposito_requerido, false) = true
                                     and coalesce(deposito_pagado, false) = false
                                     and coalesce(oculta_en_calendario, false) = false
                                     and inicio > now()
                                   order by inicio limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.citas
    where negocio_id = p_negocio and estado = 'pendiente'
      and coalesce(deposito_requerido, false) = true
      and coalesce(deposito_pagado, false) = false
      and coalesce(oculta_en_calendario, false) = false and inicio > now();
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'senal_sin_pagar', 'operativa', 'alta', 'cita',
    'Señales sin pagar', 'Citas con depósito pendiente de pago',
    jsonb_build_object('tipo','reenviar_pago','label','Reenviar enlace de pago','payload','{}'::jsonb),
    v_count, v_items);

  -- (2) Citas sin confirmar (48h). Urgente si alguna ocurre en <12h.
  select count(*),
         coalesce((select jsonb_agg(jsonb_build_object('cita_id', s.id))
                   from (select id from public.citas
                         where negocio_id = p_negocio and estado = 'confirmada'
                           and coalesce(confirmada_cliente, false) = false
                           and coalesce(oculta_en_calendario, false) = false
                           and inicio between now() and now() + interval '48 hours'
                         order by inicio limit 50) s), '[]'::jsonb),
         bool_or(inicio <= now() + interval '12 hours')
    into v_count, v_items, v_urgente
    from public.citas
    where negocio_id = p_negocio and estado = 'confirmada'
      and coalesce(confirmada_cliente, false) = false
      and coalesce(oculta_en_calendario, false) = false
      and inicio between now() and now() + interval '48 hours';
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'cita_sin_confirmar', 'operativa',
    case when coalesce(v_urgente, false) then 'urgente' else 'media' end, 'cita',
    'Citas sin confirmar', 'Citas de las próximas 48h que el cliente aún no ha confirmado',
    jsonb_build_object('tipo','ir_a','label','Ver agenda','payload', jsonb_build_object('destino','agenda')),
    v_count, v_items);

  -- (3) Bandeja sin responder
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('conversacion_id', s.id))
                             from (select id from public.conversaciones
                                   where negocio_id = p_negocio and estado = 'abierta' limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.conversaciones
    where negocio_id = p_negocio and estado = 'abierta';
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'bandeja_sin_responder', 'operativa', 'media', 'conversacion',
    'Bandeja sin responder', 'Conversaciones abiertas pendientes de respuesta',
    jsonb_build_object('tipo','ir_a','label','Ir a Bandeja','payload', jsonb_build_object('destino','bandeja')),
    v_count, v_items);

  -- (4) Presupuestos enviados sin respuesta (>3d, vigentes)
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('presupuesto_id', s.id))
                             from (select id from public.presupuestos
                                   where negocio_id = p_negocio and estado = 'enviado'
                                     and coalesce(enviado_whatsapp_at, enviado_email_at) < now() - interval '3 days'
                                     and (valido_hasta is null or valido_hasta >= current_date)
                                   order by created_at limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.presupuestos
    where negocio_id = p_negocio and estado = 'enviado'
      and coalesce(enviado_whatsapp_at, enviado_email_at) < now() - interval '3 days'
      and (valido_hasta is null or valido_hasta >= current_date);
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'presupuesto_sin_respuesta', 'recuperar', 'baja', 'presupuesto',
    'Presupuestos sin respuesta', 'Presupuestos enviados hace días que la clienta aún no ha aceptado',
    jsonb_build_object('tipo','ir_a','label','Ver presupuestos','payload', jsonb_build_object('destino','presupuestos')),
    v_count, v_items);

  -- (5) Stock bajo
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('producto_id', s.id, 'nombre', s.nombre))
                             from (select p.id, p.nombre
                                   from public.productos p
                                   left join public.inventario i on i.producto_id = p.id
                                   where p.negocio_id = p_negocio and p.activo = true
                                     and coalesce(i.unidades, 0) < p.stock_minimo
                                   order by coalesce(i.unidades, 0) limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.productos p
    left join public.inventario i on i.producto_id = p.id
    where p.negocio_id = p_negocio and p.activo = true
      and coalesce(i.unidades, 0) < p.stock_minimo;
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'stock_bajo', 'inventario', 'media', 'producto',
    'Stock bajo', 'Productos por debajo de su stock mínimo',
    jsonb_build_object('tipo','ir_a','label','Ver inventario','payload', jsonb_build_object('destino','inventario')),
    v_count, v_items);

  -- (6) Fuga de clientas (reusa la cola de procesar_alertas_fuga)
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('cliente_id', s.cliente_id))
                             from (select cliente_id from public.fuga_clientas_avisos
                                   where negocio_id = p_negocio and estado = 'pendiente'
                                   order by dias_desde_ultima_visita desc limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.fuga_clientas_avisos
    where negocio_id = p_negocio and estado = 'pendiente';
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'fuga_clienta', 'recuperar', 'baja', 'cliente',
    'Clientes a recuperar', 'Clientas que llevan tiempo sin volver',
    jsonb_build_object('tipo','ir_a','label','Ver clientes','payload', jsonb_build_object('destino','clientes','filtro','fuga')),
    v_count, v_items);

  -- Registro universal (S08) si aporto hallazgos nuevos.
  if v_nuevos > 0 then
    insert into public.eventos_negocio
      (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, resultado, motivo)
    values
      (p_negocio, 'escaneo_ia', 'hallazgos', null, 'sistema',
       'Escaneo proactivo: ' || v_nuevos || ' hallazgo(s) nuevo(s)',
       jsonb_build_object('nuevos', v_nuevos), null, 'barrido 24/7');
  end if;

  -- Cola urgente (S14): encola los hallazgos urgentes abiertos aun no encolados.
  -- El ENVIO real lo hace Alexandro leyendo notificaciones_hallazgos_pendientes().
  insert into public.hallazgos_notificaciones (negocio_id, hallazgo_id, tipo, resumen, canal)
  select p_negocio, h.id, h.tipo, h.resumen, 'whatsapp'
  from public.hallazgos_ia h
  where h.negocio_id = p_negocio and h.estado in ('nuevo','visto') and h.severidad = 'urgente'
  on conflict (hallazgo_id) where estado = 'pendiente' do nothing;

  -- Reconciliacion: cancela notificaciones pendientes cuyo hallazgo ya no es
  -- urgente/abierto (p.ej. la cita se confirmo o el hallazgo se resolvio).
  update public.hallazgos_notificaciones n
    set estado = 'descartado'
  where n.negocio_id = p_negocio and n.estado = 'pendiente'
    and not exists (
      select 1 from public.hallazgos_ia h
      where h.id = n.hallazgo_id and h.estado in ('nuevo','visto') and h.severidad = 'urgente'
    );

  return v_nuevos;
end;
$$;

revoke all on function public.procesar_hallazgos_negocio(text) from public, anon, authenticated;
grant execute on function public.procesar_hallazgos_negocio(text) to service_role;

-- ---------------------------------------------------------------------
-- 3. marcar_hallazgo (redefinido): al resolver/descartar, cancela tambien su
--    notificacion pendiente (cerrar el bucle).
-- ---------------------------------------------------------------------
create or replace function public.marcar_hallazgo(p_id uuid, p_estado text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_neg text;
begin
  if p_estado not in ('visto','resuelto','descartado') then raise exception 'estado_invalido'; end if;
  select negocio_id into v_neg from public.profiles where id = auth.uid();
  if v_neg is null then raise exception 'sin_perfil'; end if;
  update public.hallazgos_ia
    set estado = p_estado, actualizado_en = now(),
        resuelto_en = case when p_estado in ('resuelto','descartado') then now() else resuelto_en end
    where id = p_id and negocio_id = v_neg;
  if not found then raise exception 'hallazgo_no_encontrado'; end if;
  -- Cierra la notificacion pendiente asociada si el hallazgo deja de estar abierto.
  if p_estado in ('resuelto','descartado') then
    update public.hallazgos_notificaciones
      set estado = 'descartado'
      where hallazgo_id = p_id and negocio_id = v_neg and estado = 'pendiente';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.marcar_hallazgo(uuid, text) from public, anon;
grant execute on function public.marcar_hallazgo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. RPCs del outbox (STUB para Alexandro) — solo service_role (n8n).
-- ---------------------------------------------------------------------
-- Pull de notificaciones urgentes pendientes. Trae telefono/nombre del negocio
-- para que el workflow arme el mensaje. NO envia: solo lista.
create or replace function public.notificaciones_hallazgos_pendientes(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'notificacion_id', n.id,
    'hallazgo_id', n.hallazgo_id,
    'negocio_id', n.negocio_id,
    'tipo', n.tipo,
    'resumen', n.resumen,
    'canal', n.canal,
    'creado_en', n.creado_en
  )), '[]'::jsonb)
  from (
    select * from public.hallazgos_notificaciones
    where estado = 'pendiente'
    order by creado_en
    limit greatest(p_limit, 1)
  ) n;
$$;

revoke execute on function public.notificaciones_hallazgos_pendientes(integer) from public, anon, authenticated;
grant execute on function public.notificaciones_hallazgos_pendientes(integer) to service_role;

-- Marca una notificacion como enviada (la llama el workflow tras mandar el aviso).
create or replace function public.marcar_notificacion_hallazgo_enviada(p_id uuid, p_canal text default 'whatsapp')
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  update public.hallazgos_notificaciones
    set estado = 'enviado', canal = coalesce(p_canal, canal), enviado_en = now()
    where id = p_id and estado = 'pendiente';
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_pendiente'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.marcar_notificacion_hallazgo_enviada(uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_notificacion_hallazgo_enviada(uuid, text) to service_role;

comment on table public.hallazgos_notificaciones is 'Outbox de avisos urgentes de hallazgos (S14). La rellena el motor; el ENVIO real (WhatsApp/correo) lo hace Alexandro via notificaciones_hallazgos_pendientes() + marcar_notificacion_hallazgo_enviada().';
