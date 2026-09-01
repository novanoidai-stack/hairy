-- Add-ons son solo dinero: no ocupan tiempo en agenda.
-- La UI ya no pide duracion al crear/editar un add-on y los modales de cita
-- dejan de sumarla al fin. Poner a 0 lo existente para que el dato no mienta.
-- Las citas ya creadas conservan su fin actual (no se reescribe historia).
update service_addons set duracion_min = 0 where duracion_min is distinct from 0;
