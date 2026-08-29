-- Guardia de migraciones: que ficheros de supabase/migrations/ NO constan
-- aplicados en el historial remoto.
--
-- "El historial remoto manda" es la norma del proyecto, y hasta hoy no la
-- vigilaba nadie: un fichero sin aplicar no rompe nada hasta que alguien
-- depende de lo que traia, y a las dos semanas nadie recuerda si fue a
-- proposito.
--
-- ESTA FUNCION YA ESTABA APLICADA EN REMOTO cuando se escribio este fichero,
-- desde una sesion que no llego a commitear. Se reconstruye LEYENDO
-- pg_get_functiondef() de produccion, no de memoria, y se deja idempotente
-- (`create or replace` con la MISMA firma y el MISMO tipo de retorno: cambiar
-- el retorno exigiria un DROP, y un DROP de algo que ya usa el vigilante es
-- justo el tipo de cambio que no se hace "de paso").
--
-- POR QUE UNA RPC Y NO CONSULTAR LA TABLA DIRECTAMENTE
-- PostgREST NO expone el esquema `supabase_migrations`: ni `anon` ni
-- `authenticated` tienen `USAGE` sobre el. Un `.schema('supabase_migrations')`
-- desde el cliente falla en produccion, asi que la comparacion tiene que pasar
-- por una funcion `security definer` que si lo alcance.
--
-- SE RECIBEN LAS VERSIONES Y SE DEVUELVEN LAS QUE FALTAN, en vez de devolver el
-- historial entero: son ~230 filas que no le importan a nadie, y asi el que
-- pregunta no tiene que saber nada del esquema interno de Supabase.
--
-- OJO AL FALSO POSITIVO QUE TRAE DE SERIE, que casi la deja inservible el
-- primer dia: el editor SQL del dashboard aplica el SQL pero registra la
-- version con SU PROPIO timestamp, no con el del fichero. Asi que una migracion
-- aplicada por ahi sale como "sin aplicar" para siempre. "La version no consta"
-- NO es "no se aplico". Por eso el vigilante que la consume lleva una lista de
-- conocidas CON LA PRUEBA de cada una -- no "seguro que se aplico", sino que se
-- miro para saberlo. Ver scripts/vigilantes/migraciones-conocidas.json.

create or replace function public.migraciones_sin_aplicar(p_versiones text[])
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_faltan text[];
begin
  -- Misma puerta que el resto de la capa 2. No es informacion sensible, pero
  -- tampoco tiene por que verla cualquiera con sesion.
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  select coalesce(array_agg(v order by v), '{}')
    into v_faltan
  from unnest(coalesce(p_versiones, '{}')) as v
  where not exists (
    select 1 from supabase_migrations.schema_migrations m where m.version = v
  );

  return v_faltan;
end;
$function$;

revoke all on function public.migraciones_sin_aplicar(text[]) from public, anon;
grant execute on function public.migraciones_sin_aplicar(text[]) to authenticated, service_role;
