-- ---------------------------------------------------------------------------
-- DEMO · las fotos del salon pasan a rutas RELATIVAS
--
-- El problema, medido en el navegador: las 11 imagenes del salon de demo
-- (avatares del equipo, fotos de servicio, fondo del portal y galeria) se
-- guardaban como URL absoluta de produccion — 'https://www.mechaa.es/demo-fotos/…'.
-- Los ficheros existen y produccion los sirve, pero fuera de ese dominio la
-- imagen es de OTRO origen y no carga: en el espejo local no se ve ni una, y en
-- los despliegues de vista previa de Vercel tampoco. La misma imagen pedida como
-- '/demo-fotos/equipo-maria.svg' carga sin tocar nada.
--
-- Ademas es fragil por si sola: el dominio ya cambio una vez (hairy-two.vercel.app
-- -> mechaa.es) y estas URLs habria que reescribirlas otra vez con el siguiente.
-- En relativo valen en cualquier origen y no hay nada que mantener.
--
-- LA EXCEPCION, y es importante: `negocio_portal.logo_url` SE QUEDA ABSOLUTA.
-- No se pinta solo en la web: las edge functions `enviar-presupuesto` y
-- `responder-mensaje-bandeja` lo meten en el <img> de un CORREO, y ahi una ruta
-- relativa no resuelve contra nada. Un logo roto en el correo que le llega a la
-- clienta es peor que un logo que no carga en localhost.
--
-- No hace falta coordinarlo con el cron `resembrar_demo`: comprobado que no
-- menciona 'demo-fotos' ni 'mechaa.es', asi que regenera citas y cobros pero no
-- vuelve a escribir estas columnas.
--
-- Idempotente: solo toca las filas que siguen en absoluto.
-- ---------------------------------------------------------------------------

begin;

-- Avatares del equipo (los 3 de la columna de la agenda).
update public.profesionales
   set foto_perfil = replace(foto_perfil, 'https://www.mechaa.es/demo-fotos/', '/demo-fotos/')
 where negocio_id = 'demo_salon_001'
   and foto_perfil like 'https://www.mechaa.es/demo-fotos/%';

-- Fotos del catalogo de servicios (portal publico y ficha de servicio).
update public.servicios
   set foto_url = replace(foto_url, 'https://www.mechaa.es/demo-fotos/', '/demo-fotos/')
 where negocio_id = 'demo_salon_001'
   and foto_url like 'https://www.mechaa.es/demo-fotos/%';

-- Fondo del portal. Solo lo consume la pagina de reserva, nunca un correo.
update public.negocio_portal
   set fondo_portal_url = replace(fondo_portal_url, 'https://www.mechaa.es/demo-fotos/', '/demo-fotos/')
 where negocio_id = 'demo_salon_001'
   and fondo_portal_url like 'https://www.mechaa.es/demo-fotos/%';

-- Galeria del portal.
update public.negocio_fotos
   set url = replace(url, 'https://www.mechaa.es/demo-fotos/', '/demo-fotos/')
 where negocio_id = 'demo_salon_001'
   and url like 'https://www.mechaa.es/demo-fotos/%';

commit;

-- Comprobacion: 'absolutas' tiene que quedar a 0 en todo menos en logo_url.
--   select 'profesionales' t, count(*) filter (where foto_perfil like 'https://%') abs
--     from public.profesionales where negocio_id='demo_salon_001'
--   union all select 'servicios', count(*) filter (where foto_url like 'https://%')
--     from public.servicios where negocio_id='demo_salon_001'
--   union all select 'galeria', count(*) filter (where url like 'https://%')
--     from public.negocio_fotos where negocio_id='demo_salon_001'
--   union all select 'fondo_portal', count(*) filter (where fondo_portal_url like 'https://%')
--     from public.negocio_portal where negocio_id='demo_salon_001'
--   union all select 'logo (debe seguir en 1)', count(*) filter (where logo_url like 'https://%')
--     from public.negocio_portal where negocio_id='demo_salon_001';
