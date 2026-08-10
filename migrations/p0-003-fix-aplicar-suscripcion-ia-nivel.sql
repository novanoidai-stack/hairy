-- P0-003 fix (aplicada en remoto via MCP el 10-ago-2026).
--
-- El webhook stripe-webhook, en customer.subscription.*, llama a
-- aplicar_suscripcion_stripe pasandole p_ia_nivel (el addon IA es la 2a linea de
-- la suscripcion desde la reestructura del 7-ago). La RPC desplegada NO tenia ese
-- parametro -> PostgREST no encontraba la funcion y esos eventos fallaban. No
-- habia saltado nunca porque hay 0 suscripciones todavia.
--
-- Se anade p_ia_nivel, se escribe ia_nivel y se propaga al equipo via
-- sincronizar_plan_negocio (que copia plan e ia_nivel del owner).
--
-- Se DROPa la firma vieja de 6 args para NO dejar dos overloads que solo se
-- diferencian en un parametro opcional: crearia ambiguedad (PGRST203) en las
-- llamadas que no pasan p_ia_nivel (invoice.paid, creacion del customer).

drop function if exists public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid);

create or replace function public.aplicar_suscripcion_stripe(
  p_stripe_customer_id text,
  p_stripe_subscription_id text default null,
  p_estado text default null,
  p_periodo_fin timestamptz default null,
  p_plan text default null,
  p_profile_id uuid default null,
  p_ia_nivel text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_negocio text;
  v_role text;
begin
  -- Solo el backend. Nunca se concede a anon ni a authenticated.
  if auth.role() is distinct from 'service_role' then
    raise exception 'solo service_role';
  end if;

  if p_estado is not null and p_estado not in
     ('prueba','activa','pago_pendiente','impagada','cancelada','pausada','caducada') then
    raise exception 'estado de suscripcion no valido: %', p_estado;
  end if;

  if p_plan is not null and p_plan not in ('free','esencial','estudio') then
    raise exception 'plan no valido: %', p_plan;
  end if;

  if p_ia_nivel is not null and p_ia_nivel not in ('ninguna','whatsapp','voz','completa') then
    raise exception 'ia_nivel no valido: %', p_ia_nivel;
  end if;

  -- En el alta llega el profile_id por metadata; despues se localiza por customer.
  select id into v_id from public.profiles
   where (p_profile_id is not null and id = p_profile_id)
      or (p_profile_id is null and stripe_customer_id = p_stripe_customer_id)
   limit 1;

  if v_id is null then
    raise exception 'perfil no encontrado para customer %', p_stripe_customer_id;
  end if;

  perform set_config('mecha.identity_ctx', '1', true);

  update public.profiles
     set stripe_customer_id     = coalesce(p_stripe_customer_id, stripe_customer_id),
         stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
         suscripcion_estado     = coalesce(p_estado, suscripcion_estado),
         periodo_fin            = coalesce(p_periodo_fin, periodo_fin),
         plan                   = coalesce(p_plan, plan),
         ia_nivel               = coalesce(p_ia_nivel, ia_nivel)
   where id = v_id
   returning negocio_id, role into v_negocio, v_role;

  -- El equipo hereda plan e ia_nivel del owner. sincronizar_plan_negocio copia
  -- ambos desde la fila del owner, asi que se sincroniza cuando cambia cualquiera
  -- de los dos y quien paga es el owner.
  if (p_plan is not null or p_ia_nivel is not null) and v_role = 'owner' then
    perform public.sincronizar_plan_negocio(v_negocio);
  end if;

  return v_id;
end;
$function$;

-- Round-4: las funciones nuevas nacen ejecutables por public (+ authenticated via
-- default privileges de Supabase); se cierra y se deja solo service_role.
revoke execute on function public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid, text) from public, anon, authenticated;
grant execute on function public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid, text) to service_role;
