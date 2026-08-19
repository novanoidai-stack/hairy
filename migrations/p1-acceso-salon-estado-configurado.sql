-- acceso_salon_estado devuelve ademas si el modo se ha ELEGIDO alguna vez.
--
-- Antes solo devolvia `modo`, con coalesce a 'individual' cuando no habia fila en
-- salon_acceso. Con eso es imposible distinguir "el salon eligio individual" de
-- "nadie ha contestado todavia", y la bienvenida de primera vez necesita saberlo
-- para no preguntar algo que ya esta respondido.
--
-- Cambio compatible: solo AÑADE la clave 'configurado'. Ajustes > Accesos y roles
-- sigue leyendo 'modo' y 'tiene_pin' igual que antes.

create or replace function public.acceso_salon_estado()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text := public.my_negocio_id_text();
  v_fila    public.salon_acceso%rowtype;
begin
  if v_negocio is null then
    return jsonb_build_object('modo', 'individual', 'tiene_pin', false, 'configurado', false);
  end if;

  select * into v_fila from public.salon_acceso where negocio_id = v_negocio;

  return jsonb_build_object(
    'modo', coalesce(v_fila.modo, 'individual'),
    'tiene_pin', v_fila.pin_hash is not null,
    'configurado', v_fila.negocio_id is not null
  );
end;
$function$;
