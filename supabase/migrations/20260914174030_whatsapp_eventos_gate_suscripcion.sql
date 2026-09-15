-- El gate de suscripcion que le faltaba a whatsapp_eventos.
--
-- Lo cazo `vigilancia_bd()` (bloqueante) en la primera corrida tras desplegar
-- la tabla: TODA tabla con negocio_id tiene que bloquear escrituras si la
-- suscripcion del salon no esta activa. Es el mismo hueco que tuvo
-- tarjetas_regalo el 8 sep 2026 (20260908205201), y se corrige igual.
--
-- La tabla la escriben los workflows de n8n con la service_role, para la que
-- el gate es transparencia total: `exige_negocio_con_acceso()` solo corta a
-- quien llega con sesion (auth.uid() no nulo) y no es staff. Lo que cierra es
-- el camino de una app con sesion caducada escribiendo en ella igualmente.
--
-- Va en su propia migracion en vez de retocar la 20260911150000, que ya estaba
-- aplicada: una migracion aplicada no se reescribe, se completa con otra.

drop trigger if exists trg_gate_suscripcion_exige_acceso on public.whatsapp_eventos;
create trigger trg_gate_suscripcion_exige_acceso
  before insert or delete or update on public.whatsapp_eventos
  for each statement execute function public.exige_negocio_con_acceso();
