-- Sesion 3 (PLAN-IA-CHISPA) — Capa de accion universal + cierre de fallas de coherencia.
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-07-05.
--
-- Cierra dos fallas del plan (§"Fallas de coherencia detectadas"):
--   Falla #2 (auditoria en citas_historial): la tabla NUNCA registro nada. Sus
--     policies exigian negocio_id = auth.uid() (uuid), pero el flujo manual y la
--     IA insertan el negocio_id de negocio (text, p.ej. 'demo_salon_001'). El
--     insert fallaba en RLS de forma SILENCIOSA (best-effort, sin comprobar el
--     error) y el historial de la ficha salia siempre vacio. Aqui se repara:
--     negocio_id pasa a text y las policies se rescopan al negocio del usuario
--     (via profiles), como el resto de tablas. Asi el rastro (manual e IA) SI se
--     graba y se puede leer. La tabla esta vacia (0 filas), sin migracion de datos.
--   Falla #4 (cambiar_config read-merge-write pisable): RPC atomica que mezcla una
--     sola clave con `||` en un unico UPDATE bajo lock de fila, sin leer-mezclar-
--     escribir en el cliente (dos sesiones concurrentes ya no se pisan).

-- ---------------------------------------------------------------------------
-- Falla #2 — reparar citas_historial (auditoria multi-tenant que SI funciona)
-- ---------------------------------------------------------------------------

-- 1) Sustituir las policies rotas (= auth.uid()) por las correctas (= negocio del
--    usuario, resuelto via profiles). Mismo patron que citas/servicios/etc.
--    (Se dropean ANTES de tocar el tipo: dependen de la columna.)
drop policy if exists "Users can view own historial" on public.citas_historial;
drop policy if exists "Users can insert own historial" on public.citas_historial;

-- 2) El FK apuntaba a profiles(id): la columna guardaba en realidad un user id
--    (columna mal nombrada). El audit trail debe scoparse por NEGOCIO (text),
--    como el resto del modelo. Sin datos que migrar (tabla vacia).
alter table public.citas_historial drop constraint if exists citas_historial_negocio_id_fkey;
alter table public.citas_historial
  alter column negocio_id type text using negocio_id::text;

create policy "hist_select_own_negocio" on public.citas_historial
  for select to public
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- Insert acotado al negocio del usuario; ademas bloqueado para el visitante de la
-- demo compartida (coherente con los demo_block_* del resto de tablas). La IA en
-- demo simula sin escribir, pero esto es defensa en profundidad.
create policy "hist_insert_own_negocio" on public.citas_historial
  for insert to public
  with check (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and not public.is_shared_demo_visitor()
  );

-- (La policy demo_block_delete existente se mantiene: nadie borra el historial en demo.)

-- ---------------------------------------------------------------------------
-- Falla #4 — cambiar_config atomico (merge por clave, sin read-merge-write)
-- ---------------------------------------------------------------------------
create or replace function public.set_negocio_config_key(
  p_negocio_id text,
  p_clave text,
  p_valor jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo el PROPIETARIO del negocio puede cambiar la configuracion (el edge ya lo
  -- exige; esto es defensa en profundidad al ser security definer).
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and negocio_id = p_negocio_id and role = 'owner'
  ) then
    raise exception 'No autorizado para cambiar la configuracion del negocio';
  end if;

  -- La demo compartida no escribe configuracion real.
  if public.is_shared_demo_visitor() then
    raise exception 'Accion no permitida en la demo compartida';
  end if;

  -- Merge ATOMICO de una sola clave: coalesce(config,'{}') || {clave: valor} en un
  -- unico UPDATE bajo lock de fila. Nada de leer en el cliente y reescribir el
  -- objeto entero (que pisaba cambios de sesiones concurrentes).
  insert into public.negocio_config (negocio_id, config, updated_at)
  values (p_negocio_id, jsonb_build_object(p_clave, p_valor), now())
  on conflict (negocio_id) do update
    set config = coalesce(public.negocio_config.config, '{}'::jsonb)
                 || jsonb_build_object(p_clave, p_valor),
        updated_at = now();
end;
$$;

-- No es una RPC publica: solo usuarios autenticados (el edge nunca la llama; la
-- ejecuta el cliente al confirmar la propuesta, con la sesion del propietario).
revoke all on function public.set_negocio_config_key(text, text, jsonb) from public;
revoke all on function public.set_negocio_config_key(text, text, jsonb) from anon;
grant execute on function public.set_negocio_config_key(text, text, jsonb) to authenticated;
