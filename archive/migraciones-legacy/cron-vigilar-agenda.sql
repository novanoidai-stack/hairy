-- Cron de la vigilancia de agenda (informe #1, "Deteccion Omnipresente").
-- Aplicado en remoto el 2026-07-16.
--
-- ARRANCA ACOTADO A prueba_46980 a proposito: el edge escribe avisos en la pagina de
-- Avisos, y florent_surez_peluqueros_15004 es un cliente REAL con 750 clientas. Cuando
-- este rodado, quitar el negocio_id del body para que vigile todos los salones abiertos:
--   body := '{}'::jsonb
--
-- La service_role key vive en el vault (secret 'service_role_key'), no en texto plano.
select cron.schedule(
  'vigilar-agenda-pruebas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/vigilar-agenda',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('negocio_id', 'prueba_46980')
  );
  $$
);
