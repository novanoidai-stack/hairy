-- Sesion 15 · Export RGPD por-clienta (derecho de portabilidad, art. 20)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Contexto: exportar_datos_negocio() (gdpr-anonimizacion-y-retencion.sql) ya vuelca
-- TODAS las clientas + citas del negocio. Falta el export de UNA sola clienta desde
-- su ficha, que es lo que se entrega cuando una clienta concreta ejerce su derecho de
-- portabilidad. Mismo patron: security definer, chequeo owner/admin dentro, multi-tenant.
--
-- Regla round 4: sin grant a anon (solo authenticated; el chequeo de rol va dentro).
-- No se envia nada a terceros ni al LLM: es un dump JSON que descarga el gestor.

create or replace function public.exportar_datos_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_negocio_id text;
  v_role text;
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario no valido');
  end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede exportar los datos de una clienta');
  end if;

  if not exists (select 1 from clientes where id = p_cliente_id and negocio_id = v_negocio_id) then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrada');
  end if;

  -- Dump de toda la informacion de la clienta que vive en el negocio. Incluye su
  -- ficha completa (incluidas notas/alergias): es su propio dato y el titular tiene
  -- derecho a recibirlo (art. 20). Esto NO es un flujo IA (la regla dura de salud
  -- aplica al LLM, no a la portabilidad hacia la propia titular).
  return jsonb_build_object(
    'ok', true,
    'exportado_at', now(),
    'negocio_id', v_negocio_id,
    'cliente', (select to_jsonb(c) from clientes c where c.id = p_cliente_id and c.negocio_id = v_negocio_id),
    'citas', coalesce((select jsonb_agg(to_jsonb(t) order by t.inicio) from citas t where t.cliente_id = p_cliente_id and t.negocio_id = v_negocio_id), '[]'::jsonb),
    'cobros', coalesce((select jsonb_agg(to_jsonb(co)) from cobros co where co.cliente_id = p_cliente_id and co.negocio_id = v_negocio_id), '[]'::jsonb),
    'presupuestos', coalesce((select jsonb_agg(to_jsonb(p)) from presupuestos p where p.cliente_id = p_cliente_id and p.negocio_id = v_negocio_id), '[]'::jsonb),
    'fichas_tecnicas', coalesce((select jsonb_agg(to_jsonb(f)) from fichas_tecnicas_color f where f.cliente_id = p_cliente_id and f.negocio_id = v_negocio_id), '[]'::jsonb),
    'consentimientos', coalesce((select jsonb_agg(to_jsonb(cs)) from consentimientos_cliente cs where cs.cliente_id = p_cliente_id and cs.negocio_id = v_negocio_id), '[]'::jsonb),
    'resenas', coalesce((select jsonb_agg(to_jsonb(r)) from resenas r where r.cliente_id = p_cliente_id and r.negocio_id = v_negocio_id), '[]'::jsonb),
    'lista_espera', coalesce((select jsonb_agg(to_jsonb(le)) from lista_espera le where le.cliente_id = p_cliente_id and le.negocio_id = v_negocio_id), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.exportar_datos_cliente(uuid) from public;
grant execute on function public.exportar_datos_cliente(uuid) to authenticated, service_role;
