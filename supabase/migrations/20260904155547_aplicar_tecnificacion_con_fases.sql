-- Mitad (b) del paso 2 de la spec 1 (informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §7):
-- el tecnificador ya PROPONE la secuencia de fases, y esta RPC la guarda junto a
-- los dos numeros de siempre.
--
-- Lo unico que cambia respecto de 20260830120000: el campo `fases` de cada item.
--   - Se valida con public.fases_servicio_validas(), la MISMA funcion del CHECK
--     servicios_fases_forma (migracion 20260904151604). Aqui no se reescribe la
--     regla en paralelo: un espejo SQL se pudre igual que un espejo TypeScript.
--   - Si la secuencia no pasa, se rechaza el item CON MOTIVO pero los demas se
--     aplican: igual que hace la edge, que descarta la secuencia y se queda los
--     numeros -- solo que aqui quien mira es la duenna, y el rechazo se le enseña.
--   - El resumen (duracion_espera_min) se vuelve a derivar del PRIMER reposo de
--     la secuencia, por la misma razon que en la edge: las 4 marcas son un
--     resumen de la plantilla y no pueden contradecirla.
--   - fases = null o ausente = borrar la plantilla que hubiera (vuelta al camino
--     clasico de tres tramos). Es lo que pasa cuando la duena desmarca la
--     secuencia en la pantalla.

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
  v_fases    jsonb;
  v_reposo   int;
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
      -- jsonb 'null' (el modelo a veces manda null explicito) y la ausencia son
      -- lo mismo aqui: sin plantilla.
      v_fases  := case when jsonb_typeof(v_item->'fases') = 'null' then null
                       else v_item->'fases' end;
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

    -- La secuencia, con la MISMA regla que el CHECK de la tabla. La validacion
    -- de forma no la reescribe esta funcion.
    if v_fases is not null then
      if jsonb_typeof(v_fases) <> 'array' or not public.fases_servicio_validas(v_fases) then
        v_rechazados := v_rechazados || jsonb_build_object('id', v_id, 'motivo', 'secuencia de fases ilegal');
        continue;
      end if;
      -- El resumen se deriva de la secuencia: manda la plantilla.
      v_reposo := (
        select (f.valor->>'min')::int
        from jsonb_array_elements(v_fases) with ordinality as f(valor, ord)
        where f.valor->>'tipo' = 'reposo'
        order by ord
        limit 1
      );
      v_espera := coalesce(v_reposo, 0);
      if v_espera > 120 then
        v_rechazados := v_rechazados || jsonb_build_object('id', v_id, 'motivo', 'reposo fuera de rango');
        continue;
      end if;
    end if;

    update public.servicios s set
      duracion_activa_min = v_activa,
      duracion_espera_min = v_espera,
      recurso_tipo = v_tipo,
      -- recurso_fase es NOT NULL con default 'final': sin recurso la fase es
      -- cosmética, y coalesce evita el 23502 que reventaba el item entero.
      recurso_fase = coalesce(v_fase, 'final'),
      fases = v_fases
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
        'con_plantilla', (select count(*) from public.servicios
                          where negocio_id = v_neg and activo and fases is not null),
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
  'Aplica en bloque los tiempos activa/reposo, el recurso y la SECUENCIA de fases (servicios.fases) que el gestor ha revisado (los propone la edge tecnificar-catalogo). Solo gestor, solo su salon, y revalida rangos y forma por su cuenta --la forma de la secuencia con public.fases_servicio_validas, la misma del CHECK--: no se fia de que la entrada venga de la edge.';
