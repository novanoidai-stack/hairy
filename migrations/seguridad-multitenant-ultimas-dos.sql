-- =====================================================================
-- Mecha · Las dos ultimas del cierre multi-tenant
-- =====================================================================
-- Cierra la lista que abrieron
-- `seguridad-multitenant-rpcs-que-se-fiaban-del-parametro.sql` y
-- `seguridad-multitenant-facturas-fidelizacion-y-espera.sql`.
--
--   deposito_dinamico_cents   Calcula la señal que se le pide a una clienta
--                             segun su historial de plantones. Recibia el
--                             cliente y el servicio y no miraba de quien eran:
--                             se podia sondear el perfil de riesgo de las
--                             clientas de otro salon. Se ata al negocio del
--                             SERVICIO, que es de donde ya sacaba la config.
--                             La llama tambien `_lista_espera_ofrecer` por
--                             dentro, y ahi el uid es nulo: pasa a proposito.
--
--   registrar_auditoria_ia    Apunta el gasto de cada llamada al LLM. Ya
--                             comprobaba que el usuario perteneciera al
--                             negocio, pero no que QUIEN LLAMA fuera ese
--                             usuario: se podia cargar gasto de IA a nombre de
--                             otra persona de tu propio salon. La escriben
--                             solo las edge functions
--                             (shared/chispa-auditoria.ts) con service_role, y
--                             el cliente no la llama nunca -> se cierra a
--                             `authenticated` en vez de complicar la funcion.
-- =====================================================================

create or replace function public.deposito_dinamico_cents(p_cliente_id uuid, p_servicio_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_precio numeric;
  v_base_cents int;
  v_activo boolean;
  v_factor numeric;
  v_uf int;
  v_ua int;
  v_tier text;
  v_precio_cents int;
begin
  select negocio_id, precio into v_negocio, v_precio from public.servicios where id = p_servicio_id;
  perform public.exige_mi_negocio(v_negocio);
  v_base_cents := coalesce(public.importe_senal_servicio(p_servicio_id), 0);
  v_precio_cents := coalesce(round(coalesce(v_precio,0) * 100)::int, 0);

  select coalesce((config->>'depositoDinamicoActivo')::boolean, false),
         coalesce((config->>'depositoFactorRiesgo')::numeric, 2),
         coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3),
         coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
    into v_activo, v_factor, v_uf, v_ua
    from public.negocio_config where negocio_id = v_negocio;

  if not coalesce(v_activo, false) then
    return v_base_cents;
  end if;

  v_tier := public.perfil_riesgo_cliente(p_cliente_id, coalesce(v_uf,3), coalesce(v_ua,2));
  if v_tier = 'exento' then return 0; end if;
  if v_tier = 'alto'   then return v_precio_cents; end if;
  if v_tier = 'riesgo' then return least(round(v_base_cents * coalesce(v_factor,2))::int, v_precio_cents); end if;
  return v_base_cents; -- normal
end;
$function$;

revoke all on function public.registrar_auditoria_ia(text, uuid, text, text, integer, integer, numeric, text, boolean, text, integer, jsonb)
  from public, anon, authenticated;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
