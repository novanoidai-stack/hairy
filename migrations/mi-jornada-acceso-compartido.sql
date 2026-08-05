-- "Mi jornada" en un salon con acceso compartido (un solo correo).
--
-- mi_jornada_resumen resolvia SIEMPRE la ficha del profesional por la cuenta
-- (profesionales.profile_id = auth.uid()). En un salon donde todos entran con
-- el correo del jefe eso da siempre la misma persona: Marta veia la jornada del
-- jefe, y sus citas y sus cobros no se los apuntaba nadie.
--
-- Ahora la ficha puede venir del cliente (p_profesional_id), que es quien sabe
-- QUIEN se identifico en el dispositivo. El servidor no se fia: solo la acepta
-- si esa ficha existe, es de ESTE salon y el salon esta de verdad en modo
-- compartido. En un salon normal el parametro se ignora y todo sigue igual.
--
-- La funcion es larga y viva en produccion, asi que en vez de reescribirla
-- entera (y arriesgarse a perder por el camino algo que se hubiera tocado sin
-- pasar por el repo) se opera sobre la definicion REAL que hay en la base de
-- datos: se lee con pg_get_functiondef, se le aplican los cuatro cambios y se
-- vuelve a crear. Cada reemplazo comprueba que ha encajado; si alguno no
-- encuentra su texto, la migracion falla en vez de dejar la funcion a medias.
--
-- Es idempotente: si ya tiene el parametro, no hace nada.

do $mig$
declare
  def   text;
  nueva text;
begin
  -- Ya migrada?
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'mi_jornada_resumen'
       and pg_get_function_identity_arguments(p.oid) like '%uuid%'
  ) then
    return;
  end if;

  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mi_jornada_resumen'
     and pg_get_function_identity_arguments(p.oid) = 'p_desde timestamp with time zone, p_hasta timestamp with time zone';
  if def is null then raise exception 'no se encuentra mi_jornada_resumen de 2 argumentos'; end if;

  -- 1) El parametro nuevo, con DEFAULT para que las llamadas de siempre sigan valiendo.
  nueva := replace(def,
    'mi_jornada_resumen(p_desde timestamp with time zone, p_hasta timestamp with time zone)',
    'mi_jornada_resumen(p_desde timestamp with time zone, p_hasta timestamp with time zone, p_profesional_id uuid DEFAULT NULL::uuid)');
  if nueva = def then raise exception 'no se pudo anadir el parametro'; end if;
  def := nueva;

  -- 2) La variable donde cae la ficha pedida (solo si pasa los controles).
  nueva := replace(def, '  v_prof_id uuid;', '  v_prof_id uuid;' || chr(10) || '  v_prof_pedido uuid;');
  if nueva = def then raise exception 'no se pudo declarar v_prof_pedido'; end if;
  def := nueva;

  -- 3) Los controles, justo despues de saber de que salon hablamos.
  nueva := replace(def,
    'if v_negocio is null then raise exception ''sin_perfil''; end if;',
    'if v_negocio is null then raise exception ''sin_perfil''; end if;' || chr(10) || chr(10) ||
    '  -- Acceso compartido (un salon, un correo): la ficha no se puede deducir de' || chr(10) ||
    '  -- la cuenta, porque la cuenta es la del jefe. La dice el cliente y aqui se' || chr(10) ||
    '  -- comprueba que existe, que es de ESTE salon y que el salon esta en ese modo.' || chr(10) ||
    '  if p_profesional_id is not null and exists (' || chr(10) ||
    '    select 1 from salon_acceso sa where sa.negocio_id = v_negocio and sa.modo = ''compartido''' || chr(10) ||
    '  ) then' || chr(10) ||
    '    select pr.id into v_prof_pedido from profesionales pr' || chr(10) ||
    '     where pr.id = p_profesional_id and pr.negocio_id = v_negocio;' || chr(10) ||
    '  end if;');
  if nueva = def then raise exception 'no se pudo insertar la resolucion de identidad'; end if;
  def := nueva;

  -- 4) La ficha: la pedida si es valida; si no, la de siempre (por cuenta).
  nueva := replace(def,
    'where profile_id = v_uid and negocio_id = v_negocio',
    'where negocio_id = v_negocio and ((v_prof_pedido is not null and id = v_prof_pedido) or (v_prof_pedido is null and profile_id = v_uid))');
  if nueva = def then raise exception 'no se pudo cambiar la resolucion de la ficha'; end if;
  def := nueva;

  execute 'drop function public.mi_jornada_resumen(timestamptz, timestamptz)';
  execute def;
  -- Los permisos se pierden al soltar la funcion: se reponen tal cual estaban.
  execute 'grant execute on function public.mi_jornada_resumen(timestamptz, timestamptz, uuid) to authenticated';
  execute 'grant execute on function public.mi_jornada_resumen(timestamptz, timestamptz, uuid) to service_role';
end $mig$;

notify pgrst, 'reload schema';
