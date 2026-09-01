-- P6 del informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31: 8 claves foraneas sin
-- indice. Borrar o actualizar una fila padre (un cliente, un profesional, un
-- servicio) obliga a la BD a leer la tabla hija ENTERA para comprobar
-- referencias. Hoy no se nota; con 50.000 citas, cada baja de cliente es un
-- barrido completo. Los cazo vigilancia_bd_profunda (vector fk-sin-indice).
--
-- CONCURRENTLY no puede ir dentro de una transaccion y las migraciones van en
-- transaccion: como las tablas son hoy pequenas, se crean normales
-- (IF NOT EXISTS para que sea re-ejecutable).

create index if not exists idx_cita_fases_profesional_id      on public.cita_fases (profesional_id);
create index if not exists idx_pruebas_alergia_cliente_id    on public.pruebas_alergia (cliente_id);
create index if not exists idx_pruebas_alergia_producto_id   on public.pruebas_alergia (producto_id);
create index if not exists idx_pruebas_alergia_profesional_id on public.pruebas_alergia (profesional_id);
create index if not exists idx_cola_dia_cliente_id           on public.cola_dia (cliente_id);
create index if not exists idx_cola_dia_profesional_id       on public.cola_dia (profesional_id);
create index if not exists idx_cola_dia_servicio_id          on public.cola_dia (servicio_id);
create index if not exists idx_vigilancia_diagnosticos_ia_ejecucion_id on public.vigilancia_diagnosticos_ia (ejecucion_id);
