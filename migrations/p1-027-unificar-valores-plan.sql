-- P1-027 · Unificar los valores de profiles.plan con los planes que se venden
--
-- La tarea del tracker decia "la BD usa free/full/estudio y la landing vende
-- Esencial/Estudio". Matiz importante: lib/planes.ts YA normaliza, y mapea
-- 'full' -> 'estudio' (no a 'esencial'), para que las cuentas antiguas no
-- pierdan nada. Por eso esta migracion pasa los 'full' a 'estudio': es
-- SEMANTICAMENTE IDENTICO a lo que esas cuentas tienen hoy. Nadie pierde
-- funciones y nadie gana ninguna.
--
-- Reparto actual: full=9, free=7, estudio=1.
--
-- NO APLICADA TODAVIA. Revisar y aplicar con Alexandro.

begin;

-- IMPRESCINDIBLE. El trigger guard_profile_identity_columns revierte cualquier
-- cambio de plan salvo que el contexto de servidor este puesto. Sin esta linea
-- el UPDATE de abajo se ejecuta sin error y NO CAMBIA NADA.
select set_config('mecha.identity_ctx', '1', true);

update public.profiles
   set plan = 'estudio'
 where plan = 'full';

-- A partir de aqui solo existen los tres valores canonicos.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_chk') then
    alter table public.profiles
      add constraint profiles_plan_chk
      check (plan is null or plan in ('free', 'esencial', 'estudio'));
  end if;
end $$;

commit;

-- Comprobacion:
--   select plan, count(*) from public.profiles group by plan;
--   -> debe devolver solo free / esencial / estudio, y 'estudio' = 10.
--
-- Despues de aplicar, se puede quitar la entrada 'full' del mapa VALOR_A_PLAN
-- de lib/planes.ts y la comparacion "planCuenta === 'full'" de
-- supabase/functions/agenda-asistente/index.ts (linea ~860). Dejarlas de momento
-- no rompe nada: son compatibilidad hacia atras.
--
-- OJO ANTES DE CONECTAR STRIPE: de las 10 cuentas que quedaran en 'estudio', la
-- mayoria son demo o internas. Hay que decidir cuales son clientes de verdad
-- antes de que el gate de suscripcion empiece a cortar accesos (P0-004).
