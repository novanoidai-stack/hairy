-- S4.2 — Propinas en el pago del total (QR de mostrador / enlace). Aplicado al remoto via MCP
-- como `s4_pago_info_publica_propinas`.
--
-- El backend de propina ya existia: requerir_pago_total_cita(cita, propina, descuento, metodo)
-- suma la propina al total y la guarda en pagos.metadata.propina_cents; registrar_cobro_online
-- la concilia en cobros.propina_cents (atribuida al profesional de la cita via cobros.profesional_id).
--
-- Lo unico nuevo en BD: pago_info_publica devuelve la config de propinas del salon para que la
-- pagina publica ofrezca propina al cliente (activo + % sugeridos).
create or replace function public.pago_info_publica(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cita_id uuid;
  v_tipo text;
  v_cita public.citas;
  v_importe int;
  v_salon text;
  v_servicio text;
  v_requiere_datos boolean;
  v_cli public.clientes;
  v_prop_activo boolean;
  v_prop_sug jsonb;
begin
  select cita_id, tipo into v_cita_id, v_tipo
    from public.cita_pago_enlaces
    where token = p_token and expira_at > now()
    limit 1;
  if v_cita_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select * into v_cita from public.citas where id = v_cita_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select coalesce(np.nombre_publico, '') into v_salon
    from public.negocio_portal np where np.negocio_id = v_cita.negocio_id;
  select coalesce(s.nombre, '') into v_servicio
    from public.servicios s where s.id = v_cita.servicio_id;

  select importe_cents into v_importe
    from public.pagos
    where cita_id = v_cita_id and tipo = v_tipo and estado = 'pendiente'
    order by created_at desc limit 1;

  select * into v_cli from public.clientes where id = v_cita.cliente_id;
  v_requiere_datos := (v_cli.id is null)
    or coalesce(length(trim(v_cli.nombre)), 0) < 2
    or coalesce(length(public.normalizar_telefono(v_cli.telefono)), 0) < 7;

  select coalesce((config->>'propinasActivo')::boolean, false),
         coalesce(config->'propinasSugeridas', '[5,10,15]'::jsonb)
    into v_prop_activo, v_prop_sug
    from public.negocio_config where negocio_id = v_cita.negocio_id;

  return jsonb_build_object(
    'ok', true,
    'tipo', v_tipo,
    'salon', v_salon,
    'servicio', v_servicio,
    'inicio', v_cita.inicio,
    'importe_cents', coalesce(v_importe, 0),
    'moneda', 'EUR',
    'estado', v_cita.estado,
    'cobrada', coalesce(v_cita.cobrada, false),
    'requiere_datos', v_requiere_datos,
    'propinas_activo', coalesce(v_prop_activo, false),
    'propinas_sugeridas', coalesce(v_prop_sug, '[5,10,15]'::jsonb)
  );
end;
$function$;
