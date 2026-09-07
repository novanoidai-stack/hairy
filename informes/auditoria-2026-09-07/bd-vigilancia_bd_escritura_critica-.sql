CREATE OR REPLACE FUNCTION public.vigilancia_bd_escritura_critica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  hallazgos jsonb := '[]'::jsonb;
  rec         record;
  v_negocio    text;
  v_profesional uuid;
  v_servicio   uuid;
  v_error      text;
  v_detail     text;
  v_sqlstate   text;
  v_context    text;
BEGIN
  -- Prefiere la DEMO a proposito: es el escaparate publico y el tenant disennado
  -- para que se le toque. Si no existiera, cualquier tenant con servicio activo.
  SELECT negocio_id INTO v_negocio
  FROM public.servicios
  WHERE negocio_id = 'demo_salon_001' AND activo = true
  LIMIT 1;

  IF v_negocio IS NULL THEN
    SELECT negocio_id INTO v_negocio
    FROM public.servicios
    WHERE activo = true
    LIMIT 1;
  END IF;

  IF v_negocio IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'tipo', 'sin-datos-para-probar', 'nivel', 'aviso', 'ambito', 'base-de-datos',
      'titulo', 'Escritura critica sin probar: no hay ningun servicio activo',
      'detalle', 'No hay ningun servicio activo en la base para construir la cita de prueba.'
    ));
  END IF;

  SELECT id INTO v_profesional
  FROM public.profesionales WHERE negocio_id = v_negocio AND activo = true LIMIT 1;
  SELECT id INTO v_servicio
  FROM public.servicios WHERE negocio_id = v_negocio AND activo = true LIMIT 1;

  IF v_profesional IS NULL OR v_servicio IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'tipo', 'sin-datos-para-probar', 'nivel', 'aviso', 'ambito', 'base-de-datos',
      'titulo', 'Escritura critica sin probar: falta profesional o servicio activo',
      'detalle', format('El negocio %s no tiene profesional o servicio activo para construir la cita de prueba.', v_negocio)
    ));
  END IF;

  -- ---- PRUEBA 1: INSERT directo en citas ----
  -- 400 dias en el futuro para no chocar con nada real; canal 'web' y estado
  -- 'pendiente' son valores validos de los CHECK de la tabla.
  BEGIN
    INSERT INTO public.citas (
      negocio_id, profesional_id, servicio_id,
      inicio, fin, estado, canal
    ) VALUES (
      v_negocio, v_profesional, v_servicio,
      now() + interval '400 days',
      now() + interval '400 days' + interval '30 minutes',
      'pendiente', 'web'
    );
    -- Exito: forzar rollback de la subtransaccion (BEGIN/EXCEPTION no tiene
    -- "rollback on success", asi que se provoca a proposito y se atrapa).
    RAISE EXCEPTION USING ERRCODE = 'VG001';
  EXCEPTION
    WHEN SQLSTATE 'VG001' THEN
      -- INSERT funciono y todos los triggers se dispararon sin error. Todo bien.
      NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_sqlstate = RETURNED_SQLSTATE,
        v_error    = MESSAGE_TEXT,
        v_detail   = PG_EXCEPTION_DETAIL,
        v_context  = PG_EXCEPTION_CONTEXT;
      hallazgos := hallazgos || jsonb_build_object(
        'tipo',     'escritura-cita-rota',
        'nivel', 'bloqueante', 'ambito', 'base-de-datos',
        'sqlstate', v_sqlstate,
        'error',    v_error,
        'titulo',   format('INSERT INTO citas falla con %s: no se puede crear NINGUNA cita', v_sqlstate),
        'detalle',  format(
          'INSERT INTO citas falla con %s: %s. Detalle: %s. Contexto: %s. Esto tumba el alta ' ||
          'de citas en TODOS los canales (agenda, portal publico, WhatsApp, agente de voz). ' ||
          'Casi siempre es un trigger que referencia una columna que no existe.',
          v_sqlstate, v_error,
          coalesce(v_detail, '(sin detalle)'),
          coalesce(left(v_context, 300), '(sin contexto)')
        )
      );
  END;

  -- ---- PRUEBA 2: las RPC del portal publico concedidas a anon ----
  -- La otra mitad del 30 ago: la firma recreada no llevaba grant a anon y el
  -- portal no podia reservar aunque la logica estuviera bien.
  FOR rec IN
    SELECT f.rpc,
           EXISTS (
             SELECT 1 FROM pg_proc p
             JOIN pg_namespace ns ON p.pronamespace = ns.oid
             WHERE ns.nspname = 'public' AND p.proname = f.rpc
               AND has_function_privilege('anon', p.oid, 'execute')
           ) AS anon_puede
    FROM unnest(array['crear_cita_publica', 'portal_info', 'disponibilidad_publica']) AS f(rpc)
  LOOP
    IF NOT rec.anon_puede THEN
      hallazgos := hallazgos || jsonb_build_object(
        'tipo',    'rpc-sin-grant-anon',
        'nivel', 'bloqueante', 'ambito', 'base-de-datos',
        'funcion', rec.rpc,
        'titulo',  format('public.%s no tiene GRANT EXECUTE a anon: el portal publico roto', rec.rpc),
        'detalle', format(
          '%s no es ejecutable por anon en ninguna de sus firmas. El portal publico (/r/<slug>) ' ||
          'llama a esta RPC sin sesion: sin el grant, reservar rompe con 403/404 aunque la ' ||
          'logica de la funcion este perfecta. Desde el round 4 de seguridad los grants a anon ' ||
          'son explicitos: toda recreacion de la funcion tiene que repetir el grant.',
          rec.rpc
        )
      );
    END IF;
  END LOOP;

  RETURN hallazgos;
END;
$function$
