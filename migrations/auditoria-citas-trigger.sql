-- Migration: auditoria-citas-trigger.sql
-- Registra un asiento inmutable en auditoria_registros cada vez que cambia el
-- estado de una cita (modulo 'citas', tipo_evento 'cambio_estado').
-- Depende de: migrations/auditoria-registros-inmutables.sql (tabla + RPCs).
--
-- Diseno:
--   - AFTER UPDATE (solo auditamos cambios que realmente se confirmaron).
--   - Condicion de trigger: OLD.estado IS DISTINCT FROM NEW.estado.
--   - Insercion DIRECTA en auditoria_registros (no via RPC) para capturar tambien
--     cambios hechos por service_role / jobs sin contexto auth.uid(); en ese caso
--     usuario_id cae a NEW.modificado_por y usuario_nombre a 'Sistema'.
--   - SECURITY DEFINER + set search_path=public: el dueno (postgres) ignora RLS,
--     por lo que la insercion siempre funciona aunque no haya policy de INSERT.
--   - Handler de excepciones: NUNCA debe bloquear el UPDATE de la cita.
--   - Detalles: {cita_id, cliente_id, profesional_id, inicio, estado_anterior,
--     estado_nuevo, cobrada} (matches payload definido en el Mega-Plan WS-6).

create or replace function public.citas_registrar_cambio_estado()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_usuario_id uuid;
  v_usuario_nombre text;
begin
  -- Resolver quien hizo el cambio: JWT si hay, si no modificado_por de la cita.
  v_usuario_id := coalesce(v_uid, NEW.modificado_por);
  if v_usuario_id is not null then
    select nombre into v_usuario_nombre from public.profiles where id = v_usuario_id;
  end if;
  v_usuario_nombre := coalesce(v_usuario_nombre, 'Sistema');

  begin
    insert into public.auditoria_registros (
      negocio_id, usuario_id, usuario_nombre, modulo, tipo_evento, detalles
    ) values (
      NEW.negocio_id,
      v_usuario_id,
      v_usuario_nombre,
      'citas',
      'cambio_estado',
      jsonb_build_object(
        'cita_id', NEW.id,
        'cliente_id', NEW.cliente_id,
        'profesional_id', NEW.profesional_id,
        'inicio', NEW.inicio,
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'cobrada', NEW.cobrada
      )
    );
  exception when others then
    -- Un fallo de auditoria nunca debe impedir el cambio de estado de la cita.
    raise notice 'auditoria citas: no se registro el asiento (%)', sqlerrm;
  end;

  return null; -- trigger AFTER: el valor de retorno se ignora.
end;
$$;

comment on function public.citas_registrar_cambio_estado() is
  'Escribe un asiento inmutable en auditoria_registros por cada cambio de estado de cita (Ley Antifraude / trazabilidad).';

-- Trigger AFTER UPDATE solo cuando cambia el estado.
drop trigger if exists citas_audit_cambio_estado on public.citas;
create trigger citas_audit_cambio_estado
  after update of estado on public.citas
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.citas_registrar_cambio_estado();

-- La funcion es interna (trigger); no exponerla como RPC.
revoke execute on function public.citas_registrar_cambio_estado() from public, anon, authenticated;
