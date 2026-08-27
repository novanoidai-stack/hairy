-- Migracion: RGPD operativo — anonimizacion de clienta, export de datos y retencion automatizada
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- Origen: informes/PLAN_BLINDAJE_SEGURIDAD_2026-07-02.md §3.3 y §3.4 (P1).
--
-- Contexto: web/privacidad.html PROMETE borrado de datos en 30 dias, pero no existia
-- ningun mecanismo. Esta migracion lo crea:
--
--   1. anonimizar_cliente(p_cliente_id): owner/admin. Derecho de supresion compatible
--      con la obligacion fiscal: NO borra citas ni cobros (quedan como esqueleto sin
--      identidad) pero elimina toda la PII de la clienta alla donde vive:
--        clientes (nombre/telefono/email/nacimiento/notas/alergias/preferencias),
--        cliente_fotos (filas; las fotos fisicas las borra la UI con las rutas
--        devueltas: las politicas por carpeta de negocio ya permiten DELETE),
--        conversaciones_ia (telefono + transcripciones: se borran),
--        consentimientos_cliente (se borran: sin identidad no tienen objeto),
--        lista_espera (nombre/telefono/nota), resenas (autor_nombre + ip),
--        presupuestos (contacto_* + referencia al PDF, que contiene PII).
--      Residual conocido y aceptado: citas.notas / formula_notas pueden mencionar
--      a la clienta en texto libre; se documenta en el RAT.
--   2. exportar_datos_negocio(): owner/admin. Portabilidad (art. 20): dump JSON de
--      clientas + citas del negocio.
--   3. Retencion automatizada (pg_cron, diaria 04:45 UTC):
--        conversaciones_ia > 12 meses fuera; solicitudes (leads) > 24 meses fuera;
--        ip_origen se anonimiza a los 90 dias en solicitudes y resenas.
--      NO se purgan cobros ni fichajes (retenciones legales: 6 y 4 anos).
--
-- Regla round 4: sin grant a anon (solo authenticated; el chequeo de rol va dentro).

-- ─────────────────────────────────────────────────────────────────
-- 1) Anonimizacion (derecho de supresion RGPD)
-- ─────────────────────────────────────────────────────────────────

create or replace function public.anonimizar_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_negocio_id text;
  v_role text;
  v_fotos text[];
  v_pdfs text[];
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario no valido');
  end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede anonimizar clientas');
  end if;

  if not exists (select 1 from clientes where id = p_cliente_id and negocio_id = v_negocio_id) then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  -- Rutas de archivos con PII: las devuelve para que la UI borre el fichero
  -- fisico via Storage API (el equipo ya tiene politica DELETE por carpeta).
  select coalesce(array_agg(storage_path), '{}'::text[]) into v_fotos
  from cliente_fotos
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and storage_path is not null;

  select coalesce(array_agg(pdf_path), '{}'::text[]) into v_pdfs
  from presupuestos
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and pdf_path is not null;

  delete from cliente_fotos where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  delete from conversaciones_ia where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  delete from consentimientos_cliente where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  update lista_espera set nombre = 'Cliente anonimizado', telefono = null, nota = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  update resenas set autor_nombre = 'Anonimo', ip_origen = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  update presupuestos set contacto_nombre = 'Cliente anonimizado', contacto_telefono = null,
    contacto_email = null, pdf_path = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  -- La ficha queda como esqueleto: estadisticas y vinculos de citas/cobros se
  -- conservan (coherencia de informes + obligacion fiscal), la identidad no.
  update clientes set
    nombre = 'Cliente anonimizado',
    telefono = null, email = null, fecha_nacimiento = null,
    notas = null, alergias = null, bebida_preferida = null,
    sensibilidades_cuero = null, canal_preferido = null, idioma = null,
    bloqueo_motivo = null, etiquetas = '{}', updated_at = now()
  where id = p_cliente_id and negocio_id = v_negocio_id;

  return jsonb_build_object(
    'ok', true,
    'fotos_paths', to_jsonb(v_fotos),
    'pdf_paths', to_jsonb(v_pdfs)
  );
end;
$$;

-- Nota round 4b: estas funciones se crearon con el default PUBLIC=execute aun
-- activo (el fix global de default privileges llego despues), asi que hay que
-- revocar de PUBLIC explicitamente, no solo de anon (anon hereda via PUBLIC).
revoke execute on function public.anonimizar_cliente(uuid) from public;
grant execute on function public.anonimizar_cliente(uuid) to authenticated, service_role;

comment on function public.anonimizar_cliente(uuid) is
  'Derecho de supresion RGPD: anonimiza la PII de una clienta conservando citas/cobros. Solo owner/admin. Devuelve rutas de storage para que la UI borre los ficheros.';

-- ─────────────────────────────────────────────────────────────────
-- 2) Portabilidad (export JSON del negocio)
-- ─────────────────────────────────────────────────────────────────

create or replace function public.exportar_datos_negocio()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_negocio_id text;
  v_role text;
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario no valido');
  end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede exportar los datos');
  end if;

  return jsonb_build_object(
    'ok', true,
    'exportado_at', now(),
    'negocio_id', v_negocio_id,
    'clientes', coalesce((select jsonb_agg(to_jsonb(c)) from clientes c where c.negocio_id = v_negocio_id), '[]'::jsonb),
    'citas', coalesce((select jsonb_agg(to_jsonb(t)) from citas t where t.negocio_id = v_negocio_id), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.exportar_datos_negocio() from public;
grant execute on function public.exportar_datos_negocio() to authenticated, service_role;

comment on function public.exportar_datos_negocio() is
  'Portabilidad RGPD (art. 20): dump JSON de clientas y citas del negocio. Solo owner/admin.';

-- ─────────────────────────────────────────────────────────────────
-- 3) Retencion automatizada (pg_cron ya instalado en el proyecto)
-- ─────────────────────────────────────────────────────────────────

do $$
begin
  perform cron.unschedule('mecha_retencion_diaria');
exception when others then
  null; -- no existia: primera instalacion
end $$;

select cron.schedule('mecha_retencion_diaria', '45 4 * * *', $job$
  delete from public.conversaciones_ia where created_at < now() - interval '12 months';
  delete from public.solicitudes where created_at < now() - interval '24 months';
  update public.solicitudes set ip_origen = null where ip_origen is not null and created_at < now() - interval '90 days';
  update public.resenas set ip_origen = null where ip_origen is not null and created_at < now() - interval '90 days';
$job$);
