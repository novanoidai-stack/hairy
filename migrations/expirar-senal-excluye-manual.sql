-- Entregable 2 (depositos en reservas del staff): las citas de mostrador (canal='manual')
-- con senal NO se auto-cancelan -> el hueco queda reservado hasta que el cliente pague o el
-- staff lo gestione. Online (canal='web') sigue caducando. Aplicado como
-- `expirar_senal_excluye_manual`.
create or replace function public.expirar_citas_sin_senal(p_minutos integer default 15)
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$
  with upd as (
    update public.citas c
      set estado = 'cancelada', cancelado_por = 'sistema',
          motivo_cancelacion = 'Senal no pagada a tiempo', modificado_at = now()
    where c.estado = 'pendiente' and c.deposito_requerido = true and c.deposito_pagado = false
      and coalesce(c.es_oferta_espera, false) = false
      and coalesce(c.canal, '') <> 'manual'
      and c.inicio > now()
      and c.created_at < now() - make_interval(mins => greatest(p_minutos, 1))
    returning c.id
  )
  select jsonb_build_object('ok', true, 'canceladas', coalesce(jsonb_agg(id), '[]'::jsonb)) from upd;
$function$;
