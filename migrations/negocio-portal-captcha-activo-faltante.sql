-- Alinea el remoto con migrations/captcha-portal.sql (linea 258), que declaraba
-- esta columna pero nunca llego a aplicarse en produccion.
--
-- Consecuencia del desfase: Ajustes > Reserva online manda captcha_activo en su
-- upsert de negocio_portal, asi que el boton "Guardar portal" fallaba ENTERO con
--   PGRST204 "Could not find the 'captcha_activo' column of 'negocio_portal'"
-- y no se podia guardar ningun dato del portal. Reproducido y verificado el
-- 3 ago 2026 antes de aplicar esto.
--
-- Hoy nadie lee la columna: el portal publico (app/r/[slug].web.tsx) decide el
-- captcha por captcha_site_key. El interruptor de Ajustes queda persistido a la
-- espera de que el portal lo respete.
--
-- Aplicada en remoto el 3 ago 2026 (migracion negocio_portal_captcha_activo_faltante).

alter table negocio_portal
  add column if not exists captcha_activo boolean default true;

comment on column negocio_portal.captcha_activo is
  'Interruptor de CAPTCHA del portal. Hoy solo lo escribe Ajustes; el portal usa captcha_site_key.';
