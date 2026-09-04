-- Spec 1, paso 3 del plan (informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §7):
-- la FOTO y el vigilante de regresion, ANTES de invertir el sentido (paso 4).
--
-- Esto es la comprobacion que no existia el 30 de agosto y que habria cazado el
-- desastre en el minuto uno: aquel backfill colapso 2.009 citas reales y los
-- valores originales NO se pudieron recuperar, porque la foto se empezo a
-- guardar DESPUES. Aqui va ANTES, a proposito.
--
-- Que entra aqui:
--   1. respaldos.citas_antes_de_fases_v2: la foto de las 4 marcas de TODAS las
--      citas vivas en el momento de aplicar. Igual que la foto de emergencia del
--      30 ago (respaldos.citas_antes_del_backfill_fases): esquema propio, sin
--      RLS, revocada a anon/authenticated.
--   2. public.regresion_citas_fases_v2(): cuenta cuantas citas de la foto han
--      cambiado de DURACION. Es la RPC del vigilante bd-regresion-fases.mjs.
--      La llama el panel de staff (clave de servicio) y la edge de vigilancia.
--
-- Que NO entra, a proposito: el paso 4. Invertir el sentido de la
-- sincronizacion va en su propia migracion, con esta foto ya guardada y este
-- vigilante ya corriendo. Se retira cuando el paso 5 este dentro.

-- ---------------------------------------------------------------------------
-- 1. La foto
-- ---------------------------------------------------------------------------

create table respaldos.citas_antes_de_fases_v2 as
select id, negocio_id, inicio, fin, fin_activa, fin_espera, profesional_id,
       now() as guardado_en
  from public.citas;

comment on table respaldos.citas_antes_de_fases_v2 is
  'Foto del paso 3 de la spec 1 (4 sep 2026): las 4 marcas de todas las citas vivas justo antes de tocar la proyeccion de fases. La lees con regresion_citas_fases_v2(). No se escribe nunca mas.';

create index if not exists citas_antes_de_fases_v2_id_idx
  on respaldos.citas_antes_de_fases_v2 (id);

revoke all on respaldos.citas_antes_de_fases_v2 from anon, authenticated;

-- Cierra el esquema entero en la misma migracion (regla del vigilante de
-- esquema abierto): la foto no es dato de producto y no debe salir de PostgREST
-- aunque alguien manana anada el esquema a los expuestos.
revoke all on schema respaldos from public, anon, authenticated;
revoke all on all tables in schema respaldos from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. La RPC del vigilante
-- ---------------------------------------------------------------------------
--
-- Solo compara citas que YA estaban en la foto: las citas nuevas (posteriores a
-- la foto) no son regresion, son vida normal. Y compara DURACION (fin - inicio)
-- porque es el invariante que el desastre del 30 ago rompio: una cita que hoy
-- dura lo mismo que en la foto puede haberse MOVIDO -- eso es vida normal del
-- salon -- pero una que cambio de duracion sin que nadie la tocara a mano es
-- la senal de que un trigger o un backfill esta reescribiendo debajo.
--
-- Nivel BLOQUEANTE a proposito: este vigilante es el tripwire del paso 4 y se
-- retira con el paso 5. Si el salon acorta o alarga una cita a mano, aparecer'a
-- aqui con su id en el detalle: se mira, se ve que es edicion legitima, y no se
-- silencia el vigilante por eso -- se comprueba una a una.

create or replace function public.regresion_citas_fases_v2()
returns table (
  nivel    text,
  titulo   text,
  detalle  text
)
language plpgsql
security definer
set search_path to 'public', 'respaldos'
as $function$
declare
  v_cambiadas int;
  v_ejemplos  text;
begin
  select count(*) into v_cambiadas
    from public.citas c
    join respaldos.citas_antes_de_fases_v2 f on f.id = c.id
   where c.inicio is not null and c.fin is not null
     and f.inicio is not null and f.fin is not null
     and (c.fin - c.inicio) is distinct from (f.fin - f.inicio);

  select coalesce(string_agg(
           format('%s %s: %s -> %s min',
                  left(e.negocio_id, 22),
                  e.id,
                  (extract(epoch from (e.fin_foto - e.inicio_foto)) / 60)::int,
                  (extract(epoch from (e.fin - e.inicio)) / 60)::int),
           ' | '), '')
    into v_ejemplos
    from (
      select c.id, c.negocio_id, c.inicio, c.fin, f.inicio as inicio_foto, f.fin as fin_foto
        from public.citas c
        join respaldos.citas_antes_de_fases_v2 f on f.id = c.id
       where c.inicio is not null and c.fin is not null
         and f.inicio is not null and f.fin is not null
         and (c.fin - c.inicio) is distinct from (f.fin - f.inicio)
       order by c.id
       limit 5
    ) e;

  if v_cambiadas > 0 then
    return query select
      'bloqueante'::text,
      'Regresion de fases: ' || v_cambiadas || ' cita(s) de la foto han cambiado de duracion',
      'Paso 3 de la spec 1. La foto respaldos.citas_antes_de_fases_v2 ('
        || (select min(guardado_en)::date::text from respaldos.citas_antes_de_fases_v2)
        || ') tenia estas citas con otra duracion y nada deberia haberlas reescrito: '
        || v_ejemplos
        || '. Si son ediciones a mano del salon, comprobarlas una a una y NO silenciar el vigilante.';
  end if;
  -- 0 filas = foto intacta. El verde es silencio, como en el resto de
  -- vigilancia de BD.
  return;
end;
$function$;

revoke all on function public.regresion_citas_fases_v2() from public, anon, authenticated;
grant execute on function public.regresion_citas_fases_v2() to service_role;

comment on function public.regresion_citas_fases_v2() is
  'Vigilante del paso 3 de la spec 1: cuenta cuantas citas de la foto respaldos.citas_antes_de_fases_v2 han cambiado de DURACION. La comprobacion que habria cazado el backfill del 30 ago en el minuto uno. Solo service_role (panel de staff y edge de vigilancia).';
