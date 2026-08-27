-- Vigilancia de la agenda en segundo plano (informe #1, "Deteccion Omnipresente").
--
-- El barrido pg_cron (procesar_hallazgos_todos, cada 15 min) es plpgsql y el motor de agenda
-- es TypeScript: el SQL no puede llamarlo. Esta RPC es el punto de entrada para que el edge
-- `vigilar-agenda` (Deno, importa lib/organizarAgenda.ts) escriba lo que detecta.
--
-- SEGURIDAD DE AVISOS: procesar_hallazgos_negocio mete en la cola de WhatsApp todo hallazgo
-- con severidad 'urgente'. Un solape detectado cada 15 min spamearia al salon. Por eso esta
-- funcion ACOTA la severidad a 'alta' como maximo: es estructuralmente imposible que la
-- vigilancia de agenda dispare un mensaje real, aunque el llamador pida 'urgente'.

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

  -- Los tipos son los 4 problemas que sabe detectar lib/organizarAgenda.ts.
  if p_tipo not in ('retraso', 'solape', 'hueco_muerto', 'reposo_desaprovechado') then
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
