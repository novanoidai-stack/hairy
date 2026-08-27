-- Migration: antifraude-gastos-trazabilidad.sql (Mega-Plan WS-7 V7)
--
-- Los gastos son la otra mitad del margen: inflarlos o borrarlos cambia el
-- beneficio declarado igual que tocar los ingresos. Hoy owner/admin pueden
-- hacer UPDATE y DELETE directos sobre `gastos` sin dejar ningun rastro.
--
-- DECISION DE DISENO: aqui NO se bloquea el borrado, a diferencia de `cobros`.
-- Un cobro es un registro fiscal emitido a un tercero (no se puede borrar), pero
-- un gasto mal tecleado por el propio dueno es una correccion legitima y
-- cotidiana. Bloquearlo obligaria a dejar basura en el libro para siempre.
-- El plan contempla esta alternativa ("o tabla gastos_historico"): en vez de
-- impedir la operacion, se deja TRAZA de quien la hizo, cuando y con que datos.
-- Asi la correccion sigue siendo comoda pero deja de ser invisible.
--
-- El asiento va a auditoria_registros con modulo 'caja' (OJO: la tabla tiene un
-- CHECK cerrado de modulos y 'gastos' NO existe; usarlo perderia el asiento en
-- silencio, que es justo el fallo que ya nos mordio en anular_cobro).

create or replace function public.gastos_registrar_cambio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_nombre text;
  v_fila public.gastos := coalesce(NEW, OLD);
begin
  if v_uid is not null then
    select nombre into v_nombre from public.profiles where id = v_uid;
  end if;

  begin
    insert into public.auditoria_registros (
      negocio_id, usuario_id, usuario_nombre, modulo, tipo_evento, detalles
    ) values (
      v_fila.negocio_id,
      v_uid,
      coalesce(v_nombre, 'Sistema'),
      'caja',
      case TG_OP when 'DELETE' then 'gasto_eliminado' else 'gasto_modificado' end,
      case TG_OP
        when 'DELETE' then jsonb_build_object(
          'gasto_id', OLD.id, 'concepto', OLD.concepto, 'categoria', OLD.categoria,
          'importe_cents', OLD.importe_cents, 'fecha', OLD.fecha)
        else jsonb_build_object(
          'gasto_id', NEW.id,
          'antes', jsonb_build_object('concepto', OLD.concepto, 'categoria', OLD.categoria,
                                      'importe_cents', OLD.importe_cents, 'fecha', OLD.fecha),
          'despues', jsonb_build_object('concepto', NEW.concepto, 'categoria', NEW.categoria,
                                        'importe_cents', NEW.importe_cents, 'fecha', NEW.fecha))
      end
    );
  exception when others then
    -- La traza no puede tumbar la operacion, pero tiene que ser VISIBLE si falla
    -- (warning, no notice: un notice no aparece en los logs por defecto).
    raise warning 'auditoria gastos: no se registro % de % (%)', TG_OP, v_fila.id, sqlerrm;
  end;

  return null; -- AFTER: retorno ignorado.
end;
$$;

comment on function public.gastos_registrar_cambio() is
  'Deja asiento en auditoria_registros de cada modificacion o borrado de un gasto (trazabilidad antifraude).';

drop trigger if exists gastos_audit_cambios on public.gastos;
create trigger gastos_audit_cambios
  after update or delete on public.gastos
  for each row
  execute function public.gastos_registrar_cambio();

-- Funcion interna de trigger: no exponerla como RPC.
revoke execute on function public.gastos_registrar_cambio() from public, anon, authenticated;
