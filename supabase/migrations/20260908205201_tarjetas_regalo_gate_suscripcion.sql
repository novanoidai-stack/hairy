-- El gate de suscripcion que le faltaba a tarjetas_regalo.
--
-- Lo cazo `vigilancia_bd()` en la primera corrida despues de crear la tabla, y es
-- justo el tipo de cosa que solo se ve desde dentro de Postgres: TODA tabla con
-- negocio_id tiene que bloquear escrituras si la suscripcion del salon no esta
-- activa. Sin esto, un salon con la prueba caducada seguiria pudiendo vender y
-- consumir tarjetas regalo -- vender producto a quien ya no paga.
--
-- Va en su propia migracion en vez de retocar la 20260908204751, que ya estaba
-- aplicada: una migracion aplicada no se reescribe, se completa con otra.
--
-- `tarjetas_regalo_movimientos` no lo necesita y no lo lleva: no tiene negocio_id
-- (cuelga de la tarjeta) y las dos RPC escriben SIEMPRE la tarjeta en la misma
-- transaccion --vender inserta, aplicar hace update--, asi que el gate de arriba
-- ya cubre los dos caminos antes de que se toque un movimiento.

drop trigger if exists trg_gate_suscripcion_exige_acceso on public.tarjetas_regalo;
create trigger trg_gate_suscripcion_exige_acceso
  before insert or delete or update on public.tarjetas_regalo
  for each statement execute function public.exige_negocio_con_acceso();
