-- PASO 3 de la reparacion del 30 ago 2026: devolver el reposo a las citas.
--
-- El backfill de cita_fases (migracion 20260830152807) colapso 2.009 citas:
-- les puso fin = fin_espera = fin_activa, o sea que a cada cita con reposo se
-- le quedo solo su PRIMERA fase activa. Medido: "Color Raiz + Peinado" 90 -> 30
-- min en 156 citas, "Mechas Balayage + Matiz" 120 -> 40 en 148. En la cartera
-- real (florent_surez_peluqueros_15004) son 43 citas, 16 de ellas FUTURAS: en
-- la agenda se veian cortas y se podia reservar encima del reposo.
--
-- citas_historial no guardo nada (el trigger hacia UPDATE directo), asi que no
-- hay valores originales que copiar. Se reconstruye con la MISMA regla que usa
-- el sistema para calcularlos al crear la cita (crear_cita_publica):
--   fin_espera = fin_activa + espera_efectiva
--   fin        = fin_espera + extra_efectiva
-- con duracion_efectiva_profesional(), que es la que manda (override del
-- profesional por encima del catalogo).
--
-- Se ancla en fin_activa, que SOBREVIVIO intacto y es un dato real por cita, en
-- vez de recalcularlo: asi se respeta cualquier ajuste manual del salon sobre
-- la fase activa. Solo se tocan las filas colapsadas de esa ventana concreta.
--
-- El respaldo va a un esquema propio (no `public`): no es dato de producto, no
-- debe salir por PostgREST y no tiene por que arrastrar RLS ni advisors.
--
-- Para deshacer:
--   update public.citas c set fin = r.fin, fin_espera = r.fin_espera
--     from respaldos.citas_antes_del_backfill_fases r where r.id = c.id;

create schema if not exists respaldos;
revoke all on schema respaldos from public, anon, authenticated;

create table if not exists respaldos.citas_antes_del_backfill_fases (
  id           uuid primary key,
  negocio_id   text,
  inicio       timestamptz,
  fin          timestamptz,
  fin_activa   timestamptz,
  fin_espera   timestamptz,
  guardado_en  timestamptz not null default now()
);

insert into respaldos.citas_antes_del_backfill_fases (id, negocio_id, inicio, fin, fin_activa, fin_espera)
select c.id, c.negocio_id, c.inicio, c.fin, c.fin_activa, c.fin_espera
from public.citas c
where c.updated_at >= '2026-08-30 15:00:00+00' and c.updated_at < '2026-08-30 15:30:00+00'
on conflict (id) do nothing;

with objetivo as (
  select c.id,
         c.fin_activa + make_interval(mins => d.espera)             as nueva_espera,
         c.fin_activa + make_interval(mins => d.espera + d.extra)   as nuevo_fin
  from public.citas c
  join public.servicios s on s.id = c.servicio_id
  cross join lateral public.duracion_efectiva_profesional(
       c.servicio_id, c.profesional_id,
       s.duracion_activa_min,
       coalesce(s.duracion_espera_min, 0),
       coalesce(s.duracion_activa_extra_min, 0)) d
  where c.updated_at >= '2026-08-30 15:00:00+00'
    and c.updated_at <  '2026-08-30 15:30:00+00'
    and c.fin_activa is not null
    and c.fin        = c.fin_activa
    and c.fin_espera = c.fin_activa
    and (d.espera + d.extra) > 0
)
update public.citas c
   set fin_espera = o.nueva_espera,
       fin        = o.nuevo_fin
  from objetivo o
 where c.id = o.id;
