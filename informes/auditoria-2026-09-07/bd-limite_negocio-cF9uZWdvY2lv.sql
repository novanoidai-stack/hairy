CREATE OR REPLACE FUNCTION public.limite_negocio(p_negocio_id text, p_clave text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select case p_clave
              when 'profesionales' then l.max_profesionales
              when 'cuentas'       then l.max_cuentas
            end
       from public.negocio_limites l where l.negocio_id = p_negocio_id),
    case p_clave when 'profesionales' then 15 when 'cuentas' then 15 else 15 end
  );
$function$
