-- El indice viejo anulaba la decision irreversible del encadenado por NIF.
--
-- La spec 14 (alquiler de sillon) pedia una sola cosa hoy: que la cadena fiscal
-- vaya por (negocio_id, nif_emisor, serie) y no por negocio_id, porque con
-- 50.000 tickets emitidos ya no se puede cambiar -- reencadenar es reescribir la
-- cadena, que es justo lo que la cadena existe para impedir.
--
-- Eso se hizo bien: existe `tickets_verifactu_cadena_uk` sobre
-- (negocio_id, coalesce(nif_emisor,''), serie, numero).
--
-- Pero se quedo puesto el anterior, `tickets_verifactu_neg_serie_numero_uidx`
-- sobre (negocio_id, serie, numero), que es MAS ESTRICTO y manda: prohibe que
-- dos emisores distintos bajo el mismo techo usen la misma serie y numero, que
-- es exactamente el caso de N autonomos en un salon de alquiler de sillon. Con
-- el puesto, la decision estaba tomada sobre el papel y desactivada en la
-- practica.
--
-- Se retira, y hoy no se pierde ninguna proteccion: los tres negocios con
-- tickets tienen UN solo nif_emisor y UNA sola serie (1.357, 138 y 105
-- tickets), asi que para el dato actual los dos indices son el mismo. La
-- unicidad de la cadena la sigue garantizando cadena_uk.

drop index if exists public.tickets_verifactu_neg_serie_numero_uidx;

comment on index public.tickets_verifactu_cadena_uk is
  'Unicidad de la cadena fiscal por (negocio_id, nif_emisor, serie, numero). Es la que permite N emisores bajo un mismo negocio_id (alquiler de sillon, spec 14). No volver a anadir un indice sobre (negocio_id, serie, numero): seria mas estricto y volveria a cerrar esa puerta.';
