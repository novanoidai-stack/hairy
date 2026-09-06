-- ADD-ONS DE SALON: `service_addons.servicio_id` pasa a admitir NULL.
--
-- POR QUE, que es lo que no se deduce del diff
-- ------------------------------------------------------------------
-- Un add-on colgaba de UN servicio. El catalogo del salon de Jose
-- (florent_surez_peluqueros_15004) se importo con TODO como servicio: lo que el
-- llama extras -- "Espuma" 5,50 EUR, "Mascarilla" 10 EUR, "Secado espres" 15 EUR --
-- son servicios de 15 minutos, y por eso le ocupan agenda y le colisionan citas.
--
-- El motor ya esta bien: los add-ons son SOLO DINERO desde el 1 sep 2026
-- (20260901153000_addons_solo_dinero.sql) y no suman duracion. El problema era
-- que llevar esas lineas a `service_addons` costaba, con el modelo de una fila
-- por servicio, **178 filas por extra**, mantenidas a mano una por una cada vez
-- que cambia el precio. Eso no es un catalogo, es un invariante repartido de
-- manual -- justo la fabrica de regresiones de la decision 10 del CLAUDE.md.
--
-- A partir de aqui:
--
--   servicio_id = <uuid>  ->  add-on de ESE servicio
--   servicio_id = NULL    ->  add-on de SALON, vale para cualquier servicio
--
-- LO QUE HAY QUE SABER ANTES DE TOCAR ESTO
-- ------------------------------------------------------------------
-- 1) Quien lea `service_addons` con `.eq('servicio_id', X)` a secas DEJA DE VER
--    los add-ons de salon y no falla: devuelve menos filas y sigue. Por eso el
--    cliente tiene un cargador unico (`lib/datos/addons.ts`) y un vigilante que
--    comprueba que nadie vuelva a escribir esa consulta suelta
--    (`scripts/vigilantes/addons-cargador.mjs`).
--
-- 2) La RLS NO cambia y sigue atada al llamante. `service_addons_negocio_all`
--    compara `negocio_id` con el del perfil de `auth.uid()`; nunca dependio de
--    `servicio_id`, asi que la columna nullable no le abre nada. Lo unico que se
--    pierde es el anclaje redundante que daba la FK a `servicios` -- que tampoco
--    comprobaba el negocio.
--
-- 3) `duracion_min` nacia con DEFAULT 10 mientras el sistema entero la ignora.
--    Todo add-on creado desde el 1 sep decia durar 10 minutos y nadie le hacia
--    caso. Una columna que miente es una trampa para el que la lea manana, no un
--    detalle: pasa a 0.

-- 1) La columna deja de ser obligatoria ------------------------------------
alter table public.service_addons
  alter column servicio_id drop not null;

comment on column public.service_addons.servicio_id is
  'Servicio al que se ofrece el add-on. NULL = add-on de SALON: aplicable a '
  'cualquier servicio del negocio. Los cargadores piden '
  '(servicio_id = X or servicio_id is null); ver lib/datos/addons.ts.';

comment on column public.service_addons.duracion_min is
  'Historica. Los add-ons son solo dinero desde el 1 sep 2026 y NO ocupan '
  'agenda: nadie la lee. Se deja en 0 para que el dato no mienta.';

-- 2) Y deja de nacer diciendo que dura 10 minutos --------------------------
alter table public.service_addons
  alter column duracion_min set default 0;

update public.service_addons
   set duracion_min = 0
 where duracion_min is distinct from 0;

-- 3) Un add-on de salon por nombre -----------------------------------------
-- Parcial a proposito: solo ata a los globales. Dos add-ons distintos colgados
-- de dos servicios pueden llamarse igual (son cosas distintas con el mismo
-- rotulo), pero dos "Mascarilla" que valen para todo el salon no son dos cosas,
-- son la misma escrita dos veces -- y en pantalla salen como duplicado sin
-- forma de saber cual se cobra.
create unique index if not exists service_addons_salon_nombre_uk
  on public.service_addons (negocio_id, lower(nombre))
  where servicio_id is null;

-- 4) La demo, que es el escaparate, ya tenia el abanico montado a mano ------
-- `Ampolla de brillo` x3, `Tratamiento hidratante` x3 y `Recogido sencillo` x2:
-- no son un bug de siembra, son la MISMA fila copiada a tres servicios porque
-- hasta hoy no habia otra forma de ofrecerla en varios. Se consolidan en un
-- add-on de salon cada una, que es exactamente lo que este cambio viene a
-- permitir, y de paso la demo ensena el modelo nuevo.
--
-- Solo la demo. En un salon real, convertir un add-on de un servicio en global
-- cambia lo que se le ofrece a la clienta en los otros 177: esa es una decision
-- del salon, no de una migracion. Para eso esta el script reversible
-- `scripts/migrar-servicios-a-addons.mjs`.
do $$
declare
  v_grupo record;
  v_superviviente uuid;
  v_con_historia int;
begin
  for v_grupo in
    select negocio_id, lower(nombre) as clave, count(*) as n
      from public.service_addons
     where negocio_id = 'demo_salon_001'
     group by negocio_id, lower(nombre)
    having count(*) > 1
  loop
    -- Guarda: `cobro_lineas.ref_id` apunta a estos ids y los cobros son
    -- inmutables (prevent_delete_financial_records). Si DOS filas del grupo
    -- tuvieran historia fiscal, consolidar dejaria una referencia colgando y
    -- eso no se arregla despues. Se para en vez de romperla en silencio.
    select count(*) into v_con_historia
      from public.service_addons a
     where a.negocio_id = v_grupo.negocio_id
       and lower(a.nombre) = v_grupo.clave
       and exists (select 1 from public.cobro_lineas cl where cl.ref_id = a.id);

    if v_con_historia > 1 then
      raise exception
        'service_addons: % filas de "%" tienen lineas de cobro; consolidarlas dejaria historia fiscal huerfana',
        v_con_historia, v_grupo.clave;
    end if;

    -- Sobrevive la que ya esta referenciada desde un cobro (asi la historia
    -- fiscal sigue apuntando a una fila viva); si ninguna lo esta, la mas
    -- antigua por id, que es estable entre corridas.
    select a.id into v_superviviente
      from public.service_addons a
     where a.negocio_id = v_grupo.negocio_id
       and lower(a.nombre) = v_grupo.clave
     order by (exists (select 1 from public.cobro_lineas cl where cl.ref_id = a.id)) desc, a.id
     limit 1;

    -- Las citas que llevaban una de las copias pasan a la superviviente. El
    -- `not exists` evita chocar con cita_addons_cita_id_addon_id_key cuando una
    -- misma cita tuviera dos copias enlazadas; la que sobre se va con el
    -- cascade del delete de abajo, y la cita se queda con un enlace, que es lo
    -- correcto.
    update public.cita_addons ca
       set addon_id = v_superviviente
      from public.service_addons a
     where ca.addon_id = a.id
       and a.negocio_id = v_grupo.negocio_id
       and lower(a.nombre) = v_grupo.clave
       and a.id <> v_superviviente
       and not exists (
         select 1 from public.cita_addons x
          where x.cita_id = ca.cita_id and x.addon_id = v_superviviente);

    delete from public.service_addons a
     where a.negocio_id = v_grupo.negocio_id
       and lower(a.nombre) = v_grupo.clave
       and a.id <> v_superviviente;

    update public.service_addons
       set servicio_id = null
     where id = v_superviviente;

    raise notice 'service_addons: "%" consolidado en add-on de salon (%)', v_grupo.clave, v_superviviente;
  end loop;
end $$;
