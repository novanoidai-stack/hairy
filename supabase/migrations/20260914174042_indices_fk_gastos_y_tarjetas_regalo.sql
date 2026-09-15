-- 3 claves foraneas sin indice, cazadas por vigilancia_bd_profunda (vector
-- fk-sin-indice): gastos.profesional_id (columna anadida el 7 sep, sin indice),
-- tarjetas_regalo.cliente_comprador_id y tarjetas_regalo_movimientos.cobro_id
-- (backend del 8 sep). Sin indice, borrar o actualizar una fila padre (un
-- profesional, una clienta, un cobro) obliga a un escaneo secuencial de la
-- tabla hija entera.
--
-- Continuacion de 20260831220300_indices_para_ocho_fk_huerfanas, mismo
-- criterio: CONCURRENTLY no puede ir en una transaccion y las migraciones van
-- en transaccion, asi que indices normales e IF NOT EXISTS (re-ejecutable).

create index if not exists idx_gastos_profesional_id
  on public.gastos (profesional_id);
create index if not exists idx_tarjetas_regalo_cliente_comprador_id
  on public.tarjetas_regalo (cliente_comprador_id);
create index if not exists idx_trm_cobro_id
  on public.tarjetas_regalo_movimientos (cobro_id);
