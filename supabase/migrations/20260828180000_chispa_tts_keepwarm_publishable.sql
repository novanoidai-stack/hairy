-- chispa_tts_keepwarm: pasar de la `anon` heredada a la publishable.
--
-- CONTEXTO: informes/MIGRACION-CLAVES-SUPABASE-2026-08-28.md y decision 9 de
-- CLAUDE.md. La parte de servidor (31 edge functions, vault, cinco crons y el
-- trigger de agenda) ya se migro el 28 ago. Esta es la ultima pieza que vive
-- DENTRO de la base de datos: la unica funcion cuya definicion llevaba una
-- clave incrustada.
--
-- POR QUE ENTRA EN LA MIGRACION SI LA `anon` NO ERA UNA FUGA
-- No lo era —es publica por diseno— pero no se puede rotar, y el boton del
-- panel que desactiva las heredadas se lleva la `anon` Y la `service_role` a la
-- vez. O sea: el dia que se desactiven para cerrar la fuga de la service_role,
-- esta funcion empezaria a recibir "Invalid API key" y el keepwarm de Kokoro
-- moriria en silencio (net.http_post no lanza: el fallo se queda en
-- net._http_response y nadie lo mira).
--
-- POR QUE LA CLAVE VA ESCRITA AQUI Y NO EN EL VAULT
-- Porque es publica por diseno, igual que lo era la anon: mismos privilegios
-- bajos, mismas RLS, pensada para viajar en el navegador. La regla de "nunca en
-- el codigo" es para los secretos (`sb_secret_...`), que sí van al vault y de
-- hecho es de donde los leen los otros seis llamadores.
--
-- VERIFICADO ANTES DE ESCRIBIR ESTO (peticion real a chispa-tts):
--   * `chispa-tts` NO esta en supabase/config.toml, o sea verify_jwt SIGUE
--     ENCENDIDO. Aun asi la publishable pasa la puerta de la plataforma: la
--     respuesta es el 401 propio de la funcion, {"error":"No autenticado"} por
--     no llevar X-Warm-Secret, y no el {"message":"Invalid API key"} que
--     devuelve la plataforma cuando rechaza la clave.
--   * Comprobado con `apikey` sola y con `apikey` + `Authorization`: las dos
--     llegan al codigo. O sea que este cambio no altera el comportamiento; solo
--     cambia la clave por una que sobrevivira al apagon de las heredadas.
--
-- Se mantienen las DOS cabeceras, como estaban y como en la migracion hermana
-- 20260828120000. Cuando la heredada este desactivada y verificado el keepwarm,
-- el `Authorization` se puede quitar; mientras tanto no estorba.
--
-- El cuerpo de la funcion no cambia en nada mas: mismo secreto de vault
-- (`kokoro_tts_secret`), misma salida temprana si no esta configurado, mismo
-- timeout y mismo search_path.

begin;

create or replace function public.chispa_tts_keepwarm()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare
  v_secret text;
begin
  -- Secreto del VPS de Kokoro, guardado en Vault (el usuario lo inserta una vez).
  -- Si aun no esta, no hacemos nada: el cron queda inofensivo hasta configurarlo.
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'kokoro_tts_secret'
  limit 1;

  if v_secret is null or v_secret = '' then
    return;
  end if;

  -- Pide al edge que caliente Kokoro (sintetiza una frase y descarta el audio).
  -- La clave es la publishable: publica por diseno, sustituye a la anon
  -- heredada (ver cabecera del fichero).
  perform net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/chispa-tts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR',
      'Authorization', 'Bearer sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR',
      'X-Warm-Secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$function$;

commit;

-- COMPROBACION despues de aplicar (debe salir 0 filas):
--
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and pg_get_functiondef(p.oid) like '%eyJ%';
