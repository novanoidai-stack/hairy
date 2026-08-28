-- Pasar los seis llamadores internos a la cabecera `apikey`.
--
-- CONTEXTO: informes/MIGRACION-CLAVES-SUPABASE-2026-08-28.md
-- Se encontro una service_role filtrada en un repo publico y Supabase ya no
-- permite rotar las claves heredadas: la unica salida es sustituirlas por una
-- secret key (sb_secret_...) y desactivar la vieja.
--
-- EL PROBLEMA QUE ARREGLA ESTA MIGRACION
-- Una secret key NO es un JWT y no vale en `Authorization: Bearer`. Estos seis
-- llamadores mandan ahi la clave del vault, asi que el dia que ese secreto pase
-- a una `sb_secret_...` los seis dejarian de funcionar de golpe: cinco crons
-- (avisos de fin de prueba, descuentos de referidos, informes semanal y mensual,
-- y el vigilante de agenda) y el trigger que alimenta el modo "ojo".
--
-- POR QUE SE MANDAN LAS DOS CABECERAS Y NO SOLO `apikey`
-- Para que esta migracion y el despliegue de las edge functions no tengan que
-- ser el mismo minuto. Con las dos:
--   * verify_jwt aun encendido + clave heredada -> vale el Authorization  (hoy)
--   * verify_jwt apagado      + clave heredada -> vale cualquiera de las dos
--   * verify_jwt apagado      + secret key     -> vale el apikey          (fin)
-- Cada paso es reversible por su cuenta y no hay ventana de corte.
-- Cuando la heredada este desactivada y todo verificado, se puede quitar el
-- Authorization de aqui; mientras tanto no estorba.
--
-- ORDEN DE APLICACION (no da igual):
--   1. Desplegar las edge functions con supabase/config.toml (verify_jwt=false)
--      y la comprobacion propia `peticionDeServicio`. SIN esto, apagar el
--      verificador dejaria estas funciones ABIERTAS a cualquiera.
--   2. Aplicar esta migracion. Sigue funcionando con la clave heredada.
--   3. Cambiar el secreto `service_role_key` del vault por la sb_secret_...
--   4. Desactivar la clave heredada en el panel.
--
-- La clave NUNCA se escribe aqui: se lee del vault en cada llamada, como ya se
-- hacia. Esta migracion solo cambia DONDE viaja.

begin;

-- ---------------------------------------------------------------------------
-- 1. Los cinco crons
-- ---------------------------------------------------------------------------

select cron.schedule(
  'mecha_avisos_prueba',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/avisar-fin-prueba',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'mecha_descuento_referidos',
  '40 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/sincronizar-descuento-referidos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'mecha_informe_semanal',
  '0 6 * * 1',
  $cron$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/enviar-informe-periodico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"semanal"}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'mecha_informe_mensual',
  '30 6 1 * *',
  $cron$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/enviar-informe-periodico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"mensual"}'::jsonb
  );
  $cron$
);

-- Ojo: este cron vigila SOLO el negocio de pruebas (negocio_id 'prueba_46980'),
-- tal y como estaba. Esta migracion no cambia su alcance, solo la cabecera.
select cron.schedule(
  'vigilar-agenda-pruebas',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/vigilar-agenda',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('negocio_id', 'prueba_46980')
  );
  $cron$
);

-- ---------------------------------------------------------------------------
-- 2. El trigger del modo "ojo"
--    Identico al anterior salvo la cabecera. El debounce, el filtro de la demo
--    y el resto del cuerpo se conservan tal cual.
-- ---------------------------------------------------------------------------

create or replace function public.agenda_ojos_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_negocio text;
  v_ultimo timestamptz;
begin
  -- Todas las tablas vigiladas tienen negocio_id (lo usa vigilar-agenda).
  v_negocio := coalesce(new.negocio_id, old.negocio_id);

  if v_negocio is null or v_negocio = 'demo_salon_001' then
    return coalesce(new, old);
  end if;

  -- Debounce: max. un aviso por negocio y minuto. El update de la marca NO
  -- dispara triggers (ninguna tabla afectada la escucha).
  select ultimo_aviso into v_ultimo
    from public.agenda_ojos_latido
   where negocio_id = v_negocio;
  if v_ultimo is not null and v_ultimo > now() - interval '60 seconds' then
    return coalesce(new, old);
  end if;

  insert into public.agenda_ojos_latido (negocio_id, ultimo_aviso)
  values (v_negocio, now())
  on conflict (negocio_id) do update set ultimo_aviso = now();

  perform net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/agenda-optimizador',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- `apikey` es la que valdra con la clave nueva; el Authorization se
      -- mantiene mientras la heredada siga viva. Ver cabecera del fichero.
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('ojo', true, 'negocio_id', v_negocio)
  );

  return coalesce(new, old);
end;
$function$;

commit;

-- COMPROBACION despues de aplicar (deben salir los 5 crons con las dos banderas
-- en true, y ningun `clave_incrustada`):
--
--   select jobname,
--          (command ilike '%apikey%')        as tiene_apikey,
--          (command ilike '%Authorization%') as tiene_authorization,
--          (command ilike '%eyJhbGci%')      as clave_incrustada
--     from cron.job
--    where command ilike '%decrypted_secrets%'
--    order by jobname;
