-- Sesion S05 (PLAN-IA-CHISPA-V3) — Historial de acciones reversibles de Chispa.
-- Aplicar en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP.
--
-- Crea la tabla chispa_acciones que almacena el estado previo suficiente para
-- revertir cualquier accion de Chispa (crear/reagendar/cancelar cita, cambiar
-- config, editar servicio, etc.). El estado_previo es un jsonb flexible que
-- contiene lo que cada tipo de accion necesita para su inversa.
--
-- Reglas:
-- - Multi-tenant estricto por negocio_id.
-- - RLS: solo el negocio propio puede ver/insertar/sus acciones.
-- - Demo: visitante de demo compartida NO inserta (guardrail).
-- - Las acciones no reversibles se marcan con reversible=false.

-- ---------------------------------------------------------------------------
-- Tabla chispa_acciones
-- ---------------------------------------------------------------------------

create table if not exists public.chispa_acciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  tipo_accion text not null, -- 'crear_cita', 'reagendar_cita', 'cambiar_config', etc.
  estado_previo jsonb, -- Estado antes de la accion (para revertir)
  reversible boolean not null default true, -- Si se puede deshacer
  deshecha boolean not null default false, -- Si ya se deshizo
  creada_en timestamptz not null default now(),
  deshecha_en timestamptz, -- Cuando se deshizo
  -- Metadata opcional para identificar la accion (cita_id, servicio_id, etc.)
  target_id text, -- ID del recurso afectado (cita, servicio, etc.)
  target_label text -- Etiqueta legible (ej. "Cita con Maria a las 15:00")
);

-- Index para consultas rapidas por negocio + usuario (no deshechas, recientes)
create index if not exists idx_chispa_acciones_negocio_usuario
  on public.chispa_acciones(negocio_id, usuario_id)
  where deshecha = false;
create index if not exists idx_chispa_acciones_creada_en
  on public.chispa_acciones(creada_en desc);

-- ---------------------------------------------------------------------------
-- RLS (multi-tenant + rol + guardrail demo)
-- ---------------------------------------------------------------------------

-- Solo el negocio propio puede ver sus acciones (y staff con rol staff/admin).
create policy "chiacc_select_own_negocio" on public.chispa_acciones
  for select to public
  using (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and (
      (select p.role from public.profiles p where p.id = auth.uid()) = any(array['owner'::public.role_type, 'admin'::public.role_type, 'staff'::public.role_type])
    )
  );

-- Solo el negocio propio puede insertar (owner/admin/staff).
-- Bloqueado para visitante de demo compartida.
create policy "chiacc_insert_own_negocio" on public.chispa_acciones
  for insert to public
  with check (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and (select p.role from public.profiles p where p.id = auth.uid()) = any(array['owner'::public.role_type, 'admin'::public.role_type, 'staff'::public.role_type])
    and not public.is_shared_demo_visitor()
  );

-- Solo quien la creo puede deshacer (update de deshecha=true).
create policy "chiacc_update_own_usuario" on public.chispa_acciones
  for update to public
  using (
    usuario_id = auth.uid()
    and (select p.negocio_id from public.profiles p where p.id = auth.uid()) = negocio_id
  )
  with check (
    usuario_id = auth.uid()
    and (select p.negocio_id from public.profiles p where p.id = auth.uid()) = negocio_id
  );

-- Nadie borra acciones (auditoria permanente).
create policy "chiacc_delete_none" on public.chispa_acciones
  for delete to public
  using (false);

-- ---------------------------------------------------------------------------
-- Funcion auxiliar: registrar accion (llamada desde chispaOps.ts)
-- ---------------------------------------------------------------------------

create or replace function public.registrar_accion_chispa(
  p_negocio_id text,
  p_usuario_id uuid,
  p_tipo_accion text,
  p_estado_previo jsonb,
  p_reversible boolean default true,
  p_target_id text default null,
  p_target_label text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Solo usuarios autenticados (el edge nunca llama esto; el cliente si).
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  -- Guardrail demo: no registrar accion real en demo compartida.
  if public.is_shared_demo_visitor() then
    -- Devuelve un ID falso para que la UI funcione, pero no graba nada.
    return '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  insert into public.chispa_acciones (
    negocio_id, usuario_id, tipo_accion, estado_previo, reversible, target_id, target_label
  ) values (
    p_negocio_id, p_usuario_id, p_tipo_accion, p_estado_previo, p_reversible, p_target_id, p_target_label
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Grant para authenticated (owner/admin/staff ya filtrados en RLS).
revoke all on function public.registrar_accion_chispa(text, uuid, text, jsonb, boolean, text, text) from public;
revoke all on function public.registrar_accion_chispa(text, uuid, text, jsonb, boolean, text, text) from anon;
grant execute on function public.registrar_accion_chispa(text, uuid, text, jsonb, boolean, text, text) to authenticated;
