-- 29 ago 2026. Devolver a los ojos de la agenda el alcance que se les pidio.
--
-- APLICAR *DESPUES* DE DESPLEGAR supabase/functions/vigilar-agenda.
-- Motivo: hasta el commit de esta misma tanda, un salon cuya consulta fallara
-- hacia `return` con un 500 desde dentro del bucle y dejaba sin vigilar a todos
-- los que venian detras. Con un solo negocio en el body eso daba igual; al abrir
-- el barrido a toda la cartera, no. La edge ya acumula los fallos y devuelve 207,
-- pero eso solo vale una vez desplegada.
--
-- QUE PASABA. La edge vigilar-agenda recorre TODOS los negocios con horarios
-- configurados cuando el cuerpo no trae negocio_id. El job que la despierta se
-- creo apuntando a un tenant de pruebas:
--     body := jsonb_build_object('negocio_id', 'prueba_46980')
-- y ahi se quedo. Medido el 28 ago 2026:
--   - cron.job_run_details: 4.144 ejecuciones, TODAS "succeeded".
--   - net._http_response: todas las respuestas son
--     {"ok":true,"negocios":[{"negocioId":"prueba_46980","citas":0,"hallazgos":0}]}
--   - hallazgos_ia: CERO filas de tipo retraso / solape / hueco_muerto /
--     reposo_desaprovechado / fuera_jornada en toda la vida del sistema.
-- Es decir: cron en verde vigilando un salon de pruebas vacio, mientras la
-- cartera real no tenia ojos. El canario mudo del que habla la decision 10,
-- pero en la capa de base de datos.
--
-- Tambien se le pone nombre nuevo: "pruebas" describia lo que hacia de verdad,
-- y eso es justo lo que hacia que nadie lo mirase dos veces.
--
-- Lo vigila a partir de ahora vigilancia_bd(), comprobacion 7
-- (bd/vigilancia-agenda-acotada) y 8 (bd/vigilancia-agenda-sin-cron).
do $$
begin
  -- La clave sale del vault en cada llamada, nunca incrustada (regla 9).
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'no hay service_role_key en el vault: el cron quedaria sin autorizar';
  end if;

  if exists (select 1 from cron.job where jobname = 'vigilar-agenda-pruebas') then
    perform cron.unschedule('vigilar-agenda-pruebas');
  end if;

  perform cron.schedule(
    'vigilar-agenda',
    '*/15 * * * *',
    $cron$
    select net.http_post(
      url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/vigilar-agenda',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
end $$;
