-- =====================================================================
-- Mecha · S13 · Motor de escaneo proactivo 24/7 (cola de hallazgos_ia)
-- =====================================================================
-- Chispa vigila el negocio de forma autonoma y produce HALLAZGOS priorizados
-- (retrasos operativos, citas sin confirmar, bandeja sin responder, presupuestos
-- sin respuesta, stock bajo, fuga de clientas). El ENVIO real de avisos NO se
-- hace aqui: es S14 (Alexandro). Esto es solo deteccion + cola persistente.
--
-- Diseño (coherente con lo que ya existe, no se reconstruye):
--  - Forma de hallazgo = el shape que ya consume el briefing (lib/briefing.ts):
--    tipo/familia/severidad/resumen + datos{count,items} + accion sugerida.
--  - Patron motor = procesar_alertas_fuga (funcion service_role + cola + auto-descarte).
--  - Planificacion = pg_cron nativo cada 15 min (igual que autocompletar_citas), sin n8n.
--  - Registro en eventos_negocio (S08) cuando aparecen hallazgos nuevos.
--
-- Multi-tenant estricto por negocio_id + RLS. La demo (tenant compartido
-- demo_salon_001) NO se persiste (constraint #8): el barrido la salta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla-cola de hallazgos
-- ---------------------------------------------------------------------
create table if not exists public.hallazgos_ia (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  tipo text not null,                 -- senal_sin_pagar, cita_sin_confirmar, bandeja_sin_responder,
                                       -- presupuesto_sin_respuesta, stock_bajo, fuga_clienta
  familia text not null,              -- operativa, recuperar, inventario, setup
  severidad text not null check (severidad in ('urgente','alta','media','baja')),
  entidad text,                       -- cita, conversacion, presupuesto, producto, cliente, negocio
  entidad_id text,
  resumen text not null,
  detalle text,
  accion_sugerida jsonb not null default '{}'::jsonb,  -- { tipo, label, payload }
  datos jsonb not null default '{}'::jsonb,            -- { count, items[] } SIN datos de salud
  estado text not null default 'nuevo' check (estado in ('nuevo','visto','resuelto','descartado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  resuelto_en timestamptz
);

-- Idempotencia: un unico hallazgo ABIERTO por (negocio, tipo). Re-ejecutar el
-- barrido refresca la fila existente en vez de duplicar.
create unique index if not exists uq_hallazgos_ia_abierto
  on public.hallazgos_ia(negocio_id, tipo)
  where estado in ('nuevo','visto');

create index if not exists idx_hallazgos_ia_negocio_estado
  on public.hallazgos_ia(negocio_id, estado, severidad);

-- ---------------------------------------------------------------------
-- 2. RLS: lectura del propio negocio. La escritura solo por el motor
--    (service_role) y las RPC security definer de abajo. Sin INSERT/UPDATE/
--    DELETE para authenticated/anon (patron de fuga_clientas_avisos).
-- ---------------------------------------------------------------------
alter table public.hallazgos_ia enable row level security;

drop policy if exists hallazgos_ia_select_own on public.hallazgos_ia;
create policy hallazgos_ia_select_own on public.hallazgos_ia
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Upsert interno de un hallazgo (crea / refresca / auto-descarta).
--    Devuelve 1 si CREO uno nuevo, 0 en cualquier otro caso.
-- ---------------------------------------------------------------------
create or replace function public._upsert_hallazgo(
  p_negocio text,
  p_tipo text,
  p_familia text,
  p_severidad text,
  p_entidad text,
  p_resumen text,
  p_detalle text,
  p_accion jsonb,
  p_count int,
  p_items jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo int := 0;
begin
  if coalesce(p_count, 0) > 0 then
    update public.hallazgos_ia
      set severidad = p_severidad,
          familia = p_familia,
          entidad = p_entidad,
          resumen = p_resumen,
          detalle = p_detalle,
          accion_sugerida = coalesce(p_accion, '{}'::jsonb),
          datos = jsonb_build_object('count', p_count, 'items', coalesce(p_items, '[]'::jsonb)),
          actualizado_en = now()
      where negocio_id = p_negocio and tipo = p_tipo and estado in ('nuevo','visto');
    if not found then
      insert into public.hallazgos_ia
        (negocio_id, tipo, familia, severidad, entidad, resumen, detalle, accion_sugerida, datos)
      values
        (p_negocio, p_tipo, p_familia, p_severidad, p_entidad, p_resumen, p_detalle,
         coalesce(p_accion, '{}'::jsonb),
         jsonb_build_object('count', p_count, 'items', coalesce(p_items, '[]'::jsonb)));
      v_nuevo := 1;
    end if;
  else
    -- El hallazgo dejo de aplicar: se auto-descarta el abierto (si lo habia).
    update public.hallazgos_ia
      set estado = 'descartado', resuelto_en = now(), actualizado_en = now()
      where negocio_id = p_negocio and tipo = p_tipo and estado in ('nuevo','visto');
  end if;
  return v_nuevo;
end;
$$;

revoke all on function public._upsert_hallazgo(text,text,text,text,text,text,text,jsonb,int,jsonb) from public, anon, authenticated;
grant execute on function public._upsert_hallazgo(text,text,text,text,text,text,text,jsonb,int,jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 4. Barrido de UN negocio: corre todos los detectores deterministas.
--    Reutiliza la logica de deteccion ya existente en el proyecto (mismas
--    condiciones que agenda_briefing_operativa / clientes_en_riesgo_fuga /
--    notificaciones-aviso-retraso). Devuelve cuantos hallazgos NUEVOS creo.
-- ---------------------------------------------------------------------
create or replace function public.procesar_hallazgos_negocio(p_negocio text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevos int := 0;
  v_count int;
  v_items jsonb;
begin
  -- La demo es un tenant compartido: no acumulamos su cola (constraint #8).
  if p_negocio = 'demo_salon_001' then
    return 0;
  end if;

  -- (1) Señales sin pagar: cita con deposito requerido y no pagado, futura.
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('cita_id', s.id))
                             from (select id from public.citas
                                   where negocio_id = p_negocio and estado = 'pendiente'
                                     and coalesce(deposito_requerido, false) = true
                                     and coalesce(deposito_pagado, false) = false
                                     and inicio > now()
                                   order by inicio limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.citas
    where negocio_id = p_negocio and estado = 'pendiente'
      and coalesce(deposito_requerido, false) = true
      and coalesce(deposito_pagado, false) = false
      and inicio > now();
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'senal_sin_pagar', 'operativa', 'alta', 'cita',
    'Señales sin pagar', 'Citas con depósito pendiente de pago',
    jsonb_build_object('tipo','reenviar_pago','label','Reenviar enlace de pago','payload','{}'::jsonb),
    v_count, v_items);

  -- (2) Citas sin confirmar por el cliente en las proximas 48h.
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('cita_id', s.id))
                             from (select id from public.citas
                                   where negocio_id = p_negocio and estado = 'confirmada'
                                     and coalesce(confirmada_cliente, false) = false
                                     and inicio between now() and now() + interval '48 hours'
                                   order by inicio limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.citas
    where negocio_id = p_negocio and estado = 'confirmada'
      and coalesce(confirmada_cliente, false) = false
      and inicio between now() and now() + interval '48 hours';
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'cita_sin_confirmar', 'operativa', 'media', 'cita',
    'Citas sin confirmar', 'Citas de las próximas 48h que el cliente aún no ha confirmado',
    jsonb_build_object('tipo','ir_a','label','Ver agenda','payload', jsonb_build_object('destino','agenda')),
    v_count, v_items);

  -- (3) Bandeja sin responder: conversaciones abiertas.
  select count(*), coalesce((select jsonb_agg(jsonb_build_object('conversacion_id', s.id))
                             from (select id from public.conversaciones
                                   where negocio_id = p_negocio and estado = 'abierta'
                                   limit 50) s), '[]'::jsonb)
    into v_count, v_items
    from public.conversaciones
    where negocio_id = p_negocio and estado = 'abierta';
  v_nuevos := v_nuevos + public._upsert_hallazgo(
    p_negocio, 'bandeja_sin_responder', 'operativa', 'media', 'conversacion',
    'Bandeja sin responder', 'Conversaciones abiertas pendientes de respuesta',
    jsonb_build_object('tipo','ir_a','label','Ir a Bandeja','payload', jsonb_build_object('destino','bandeja')),
    v_count, v_items);

  -- (4) Presupuestos enviados hace mas de 3 dias, aun sin respuesta y vigentes.
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

  -- (5) Stock bajo: productos activos por debajo de su minimo.
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

  -- (6) Fuga de clientas: reusa la cola ya producida por procesar_alertas_fuga.
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

  -- Registro universal (S08): dejamos traza del barrido si aporto hallazgos nuevos.
  if v_nuevos > 0 then
    insert into public.eventos_negocio
      (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, resultado, motivo)
    values
      (p_negocio, 'escaneo_ia', 'hallazgos', null, 'sistema',
       'Escaneo proactivo: ' || v_nuevos || ' hallazgo(s) nuevo(s)',
       jsonb_build_object('nuevos', v_nuevos), null, 'barrido 24/7');
  end if;

  return v_nuevos;
end;
$$;

revoke all on function public.procesar_hallazgos_negocio(text) from public, anon, authenticated;
grant execute on function public.procesar_hallazgos_negocio(text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Barrido de TODOS los negocios (lo llama el cron). Excluye la demo.
-- ---------------------------------------------------------------------
create or replace function public.procesar_hallazgos_todos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg text;
  v_negocios int := 0;
  v_nuevos int := 0;
begin
  for v_neg in
    select distinct negocio_id from public.profiles
    where negocio_id is not null and negocio_id <> 'demo_salon_001'
  loop
    v_negocios := v_negocios + 1;
    v_nuevos := v_nuevos + public.procesar_hallazgos_negocio(v_neg);
  end loop;
  return jsonb_build_object('negocios', v_negocios, 'hallazgos_nuevos', v_nuevos);
end;
$$;

revoke all on function public.procesar_hallazgos_todos() from public, anon, authenticated;
grant execute on function public.procesar_hallazgos_todos() to service_role;

-- ---------------------------------------------------------------------
-- 6. RPCs de cliente (gateadas por auth.uid()).
-- ---------------------------------------------------------------------
-- Lectura: hallazgos abiertos del propio negocio (opcionalmente con resueltos).
create or replace function public.hallazgos_del_negocio(p_incluir_cerrados boolean default false)
returns setof public.hallazgos_ia
language sql
security definer
set search_path = public
stable
as $$
  select h.*
  from public.hallazgos_ia h
  join public.profiles p on p.negocio_id = h.negocio_id
  where p.id = auth.uid()
    and (p_incluir_cerrados or h.estado in ('nuevo','visto'))
  order by case h.severidad when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
           h.creado_en desc;
$$;

revoke all on function public.hallazgos_del_negocio(boolean) from public, anon;
grant execute on function public.hallazgos_del_negocio(boolean) to authenticated;

-- Barrido bajo demanda al abrir la app: procesa el propio negocio y devuelve
-- los hallazgos abiertos. Deriva el negocio del JWT; la demo no se persiste.
create or replace function public.escanear_hallazgos_ahora()
returns setof public.hallazgos_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg text;
begin
  select negocio_id into v_neg from public.profiles where id = auth.uid();
  if v_neg is null then
    return;
  end if;
  perform public.procesar_hallazgos_negocio(v_neg);
  return query
    select h.* from public.hallazgos_ia h
    where h.negocio_id = v_neg and h.estado in ('nuevo','visto')
    order by case h.severidad when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
             h.creado_en desc;
end;
$$;

revoke all on function public.escanear_hallazgos_ahora() from public, anon;
grant execute on function public.escanear_hallazgos_ahora() to authenticated;

-- Marcar un hallazgo (visto / resuelto / descartado) del propio negocio.
create or replace function public.marcar_hallazgo(p_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg text;
begin
  if p_estado not in ('visto','resuelto','descartado') then
    raise exception 'estado_invalido';
  end if;
  select negocio_id into v_neg from public.profiles where id = auth.uid();
  if v_neg is null then raise exception 'sin_perfil'; end if;

  update public.hallazgos_ia
    set estado = p_estado,
        actualizado_en = now(),
        resuelto_en = case when p_estado in ('resuelto','descartado') then now() else resuelto_en end
    where id = p_id and negocio_id = v_neg;

  if not found then raise exception 'hallazgo_no_encontrado'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.marcar_hallazgo(uuid, text) from public, anon;
grant execute on function public.marcar_hallazgo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Planificacion nativa (pg_cron), cada 15 min. Idempotente por nombre.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('mecha_hallazgos_ia', '*/15 * * * *', $$select public.procesar_hallazgos_todos();$$);

comment on table public.hallazgos_ia is 'Cola de hallazgos del escaneo proactivo 24/7 de Chispa (S13). La detecta el motor; la surface accionable es S14.';
