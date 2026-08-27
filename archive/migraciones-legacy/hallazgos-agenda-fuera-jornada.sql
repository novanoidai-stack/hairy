-- Amplia upsert_hallazgo_agenda con el quinto tipo del motor: fuera_jornada.
--
-- El modo "ojo" de agenda-optimizador ya lo enviaba (RESUMEN_OJO), pero la RPC
-- lo rechazaba con 'Tipo de hallazgo de agenda no reconocido' y el edge se
-- tragaba el error (if (!error) escritos++), asi que las citas fuera de jornada
-- nunca llegaron a la campana de Avisos. Idem vigilar-agenda, que ahora tambien
-- lo vigila.
--
-- Sin cambios de fondo: mismo contrato, misma familia 'ineficiencia' y mismo
-- techo de severidad. fuera_jornada entra como 'alta' desde los llamadores
-- (misma banda que retraso/solape: es una cita mal puesta que hay que reubicar
-- o avisar), y la RPC sigue acotando a 'alta' como maximo.

create or replace function public.upsert_hallazgo_agenda(
  p_negocio text,
  p_tipo text,
  p_severidad text,
  p_resumen text,
  p_detalle text,
  p_count integer,
  p_items jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sev text;
begin
  -- Solo el service_role (el edge). Ningun cliente puede escribir hallazgos a mano.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Solo el servicio de vigilancia puede escribir hallazgos de agenda';
  end if;

  -- Los 5 tipos que sabe detectar lib/organizarAgenda.ts y escriben las edges
  -- de vigilancia (vigilar-agenda + modo ojo de agenda-optimizador).
  if p_tipo not in ('retraso', 'solape', 'hueco_muerto', 'reposo_desaprovechado', 'fuera_jornada') then
    raise exception 'Tipo de hallazgo de agenda no reconocido: %', p_tipo;
  end if;

  -- Techo de severidad: 'urgente' esta reservado a lo que merece un WhatsApp.
  v_sev := case when p_severidad in ('alta', 'media', 'baja') then p_severidad else 'media' end;

  return public._upsert_hallazgo(
    p_negocio,
    p_tipo,
    'ineficiencia',            -- familia: ya existe en avisosCategorias.ts
    v_sev,
    'cita',
    p_resumen,
    p_detalle,
    jsonb_build_object(
      'tipo', 'ir_a',
      'label', 'Organizar mi agenda',
      'payload', jsonb_build_object('destino', 'agenda')
    ),
    p_count,
    p_items
  );
end;
$$;

revoke all on function public.upsert_hallazgo_agenda(text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
