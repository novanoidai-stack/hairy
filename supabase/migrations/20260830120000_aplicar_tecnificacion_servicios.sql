-- Bloque 2 (activacion): aplicar en bloque lo que la duena ha revisado.
--
-- El salon real tiene 81 servicios y SIETE con reposo configurado. El reposo es
-- el diferencial nº1 y funciona -- el 18 % de sus citas ya lo usan, con esos
-- siete--; lo que falla es que nadie va a rellenar 81 formularios. La edge
-- `tecnificar-catalogo` PROPONE y esto APLICA lo aceptado, de una vez.
--
-- Reglas que sostiene esta funcion, y por que:
--
--  1. Se ata al llamante (`exige_mi_negocio(..., true)`): recibe ids de servicio,
--     y sin atadura bastaria cambiar un uuid para reescribir el catalogo de otro
--     salon. Es la regla del parametro del CLAUDE.md.
--  2. Solo gestor. El catalogo es del salon, no de quien esta en el mostrador.
--  3. Los rangos se vuelven a comprobar AQUI. La edge ya sanea, pero esta RPC es
--     una puerta publica por su cuenta: fiarse de que la entrada viene de la edge
--     es fiarse de un cliente.
--  4. NO toca el precio ni el nombre ni nada que no sea la geometria de tiempos y
--     el puesto. Un asistente que ademas retoca precios es un asistente que nadie
--     deja suelto.
--  5. Deja rastro en `eventos_negocio`: quien acepto que, y cuando. Si dentro de
--     tres semanas la agenda va rara, esto es lo primero que hay que poder mirar.
create or replace function public.aplicar_tecnificacion_servicios(p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_neg      text;
  v_uid      uuid := (select auth.uid());
  v_item     jsonb;
  v_id       uuid;
  v_activa   int;
  v_espera   int;
  v_tipo     text;
  v_fase     text;
  v_aplicados int := 0;
  v_rechazados jsonb := '[]'::jsonb;
begin
  select negocio_id into v_neg from public.profiles where id = v_uid;
  if v_neg is null then
    return jsonb_build_object('ok', false, 'error', 'sin_perfil');
  end if;
  perform public.exige_mi_negocio(v_neg, true);

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'formato');
  end if;
  if jsonb_array_length(p_cambios) > 300 then
    return jsonb_build_object('ok', false, 'error', 'demasiados_cambios');
  end if;

  for v_item in select * from jsonb_array_elements(p_cambios) loop
    begin
      v_id     := (v_item->>'id')::uuid;
      v_activa := (v_item->>'duracion_activa_min')::int;
      v_espera := coalesce((v_item->>'duracion_espera_min')::int, 0);
      v_tipo   := nullif(v_item->>'recurso_tipo', '');
      v_fase   := nullif(v_item->>'recurso_fase', '');
    exception when others then
      v_rechazados := v_rechazados || jsonb_build_object('id', v_item->>'id', 'motivo', 'campos ilegibles');
      continue;
    end;

    if v_activa is null or v_activa < 5 or v_activa > 300 then
      v_rechazados := v_rechazados || jsonb_build_object('id', v_id, 'motivo', 'duracion activa fuera de rango');
      continue;
    end if;
    if v_espera < 0 or v_espera > 120 then
      v_rechazados := v_rechazados || jsonb_build_object('id', v_id, 'motivo', 'reposo fuera de rango');
      continue;
    end if;
    if v_tipo is not null and v_tipo not in ('lavacabezas','cabina','sillon','aparatologia') then
      v_tipo := null; v_fase := null;
    end if;
    if v_fase is not null and v_fase not in ('completa','final') then v_fase := null; end if;
    if v_tipo is null then v_fase := null; end if;

    update public.servicios s set
      duracion_activa_min = v_activa,
      duracion_espera_min = v_espera,
      recurso_tipo = v_tipo,
      recurso_fase = v_fase
    where s.id = v_id and s.negocio_id = v_neg;

    if found then
      v_aplicados := v_aplicados + 1;
    else
      -- Un id de otro salon no llega hasta aqui (el update filtra por negocio),
      -- pero se dice en voz alta en vez de contarlo como aplicado.
      v_rechazados := v_rechazados || jsonb_build_object('id', v_id, 'motivo', 'no es un servicio de tu salon');
    end if;
  end loop;

  if v_aplicados > 0 then
    insert into public.eventos_negocio (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos)
    values (
      v_neg, 'catalogo_tecnificado', 'servicios', v_neg, coalesce(v_uid::text, 'sistema'),
      'Catalogo repasado: ' || v_aplicados || ' servicio(s) con sus tiempos de reposo puestos',
      jsonb_build_object(
        'aplicados', v_aplicados,
        'rechazados', jsonb_array_length(v_rechazados),
        'con_reposo', (select count(*) from public.servicios
                        where negocio_id = v_neg and activo and coalesce(duracion_espera_min,0) > 0),
        'en_catalogo', (select count(*) from public.servicios where negocio_id = v_neg and activo)
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'aplicados', v_aplicados, 'rechazados', v_rechazados);
end;
$function$;

revoke all on function public.aplicar_tecnificacion_servicios(jsonb) from public, anon;
grant execute on function public.aplicar_tecnificacion_servicios(jsonb) to authenticated;

comment on function public.aplicar_tecnificacion_servicios(jsonb) is
  'Aplica en bloque los tiempos activa/reposo y el recurso que el gestor ha revisado (los propone la edge tecnificar-catalogo). Solo gestor, solo su salon, y revalida rangos por su cuenta: no se fia de que la entrada venga de la edge.';
