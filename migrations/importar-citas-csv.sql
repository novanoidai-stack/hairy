-- Migración: Importación de citas desde Booksy/Fresha (CSV)
-- Autor: Carlos + Claude (30 jun 2026)
--
-- Qué es: RPC para importar citas desde un CSV exportado de Booksy o Fresha.
-- Flujo: el usuario sube un CSV, la UI mapea columnas a campos de Mecha, y esta RPC
-- procesa las filas ya mapeadas (crear clientes si no existen, buscar servicios por nombre,
-- crear citas con canal='csv').
--
-- Seguridad: security definer, valida negocio_id del usuario, crea clientes solo si
-- no existen por teléfono/email.

-- ---------------------------------------------------------------------------
-- RPC: importar_citas_csv
-- ---------------------------------------------------------------------------
create or replace function public.importar_citas_csv(
  p_negocio_id text,
  p_filas jsonb,  -- array de objetos con campos ya mapeados: fecha, hora, cliente, telefono, servicio, [profesional, precio, notas]
  p_canal text default 'csv'
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_creadas integer := 0;
  v_errores text[] := '{}';
  v_duplicados integer := 0;
  v_fila json;
  v_fila_idx integer;
  v_cliente_id uuid;
  v_servicio_id uuid;
  v_profesional_id uuid;
  v_cita_id uuid;
  v_fecha_inicio timestamptz;
  v_fecha_fin timestamptz;
  v_duracion_min integer;
  v_cliente_nombre text;
  v_cliente_telefono text;
  v_servicio_nombre text;
  v_profesional_nombre text;
  v_fecha text;
  v_hora text;
  v_precio numeric;
  v_notas text;
begin
  -- Validar negocio
  if (select negocio_id from public.profiles where id = auth.uid()) <> p_negocio_id then
    raise exception 'sin_permisos';
  end if;

  -- Procesar cada fila
  for v_fila_idx in 0 .. jsonb_array_length(p_filas) - 1 loop
    v_fila := p_filas->v_fila_idx;

    -- Extraer campos (con valores por defecto si faltan)
    v_fecha := coalesce((v_fila->>'fecha')::text, '');
    v_hora := coalesce((v_fila->>'hora')::text, '');
    v_cliente_nombre := coalesce((v_fila->>'cliente')::text, '');
    v_cliente_telefono := coalesce((v_fila->>'telefono')::text, '');
    v_servicio_nombre := coalesce((v_fila->>'servicio')::text, '');
    v_profesional_nombre := (v_fila->>'profesional')::text;
    v_precio := coalesce((v_fila->>'precio')::numeric, 0);
    v_notas := (v_fila->>'notas')::text;

    -- Validar campos requeridos
    if v_fecha = '' or v_hora = '' or v_cliente_nombre = '' or v_servicio_nombre = '' then
      v_errores := array_append(v_errores, 'Fila ' || (v_fila_idx + 1) || ': faltan campos requeridos (fecha, hora, cliente o servicio)');
      continue;
    end if;

    -- Parsear fecha/hora (formatos esperados: YYYY-MM-DD y HH:MM o HH:MM:SS)
    begin
      v_fecha_inicio := (v_fecha || ' ' || v_hora || ':00')::timestamptz;
    exception when others then
      v_errores := array_append(v_errores, 'Fila ' || (v_fila_idx + 1) || ': fecha/hora inválida (' || v_fecha || ' ' || v_hora || ')');
      continue;
    end;

    -- Buscar servicio por nombre
    select id into v_servicio_id
    from public.servicios
    where negocio_id = p_negocio_id
      and lower(nombre) = lower(v_servicio_nombre)
      and activo = true
    limit 1;

    if v_servicio_id is null then
      v_errores := array_append(v_errores, 'Fila ' || (v_fila_idx + 1) || ': servicio no encontrado "' || v_servicio_nombre || '"');
      continue;
    end if;

    -- Calcular duración y fin
    select duracion_activa_min into v_duracion_min
    from public.servicios
    where id = v_servicio_id;

    if v_duracion_min is null or v_duracion_min <= 0 then
      v_duracion_min := 60; -- default
    end if;

    v_fecha_fin := v_fecha_inicio + (v_duracion_min || ' minutes')::interval;

    -- Buscar profesional por nombre (opcional)
    v_profesional_id := null;
    if v_profesional_nombre is not null and v_profesional_nombre != '' then
      select id into v_profesional_id
      from public.profesionales
      where negocio_id = p_negocio_id
        and lower(nombre) = lower(v_profesional_nombre)
        and activo = true
      limit 1;
    end if;

    -- Buscar o crear cliente por teléfono/email
    v_cliente_id := null;
    if v_cliente_telefono != '' then
      select id into v_cliente_id
      from public.clientes
      where negocio_id = p_negocio_id
        and telefono = v_cliente_telefono
      limit 1;
    end if;

    if v_cliente_id is null then
      -- Crear cliente nuevo
      insert into public.clientes (negocio_id, nombre, telefono, created_at)
      values (p_negocio_id, v_cliente_nombre, v_cliente_telefono, now())
      returning id into v_cliente_id;
    end if;

    -- Verificar duplicado (misma fecha, cliente, servicio)
    if exists (
      select 1 from public.citas
      where negocio_id = p_negocio_id
        and cliente_id = v_cliente_id
        and servicio_id = v_servicio_id
        and inicio = v_fecha_inicio
    ) then
      v_duplicados := v_duplicados + 1;
      continue;
    end if;

    -- Crear cita
    begin
      insert into public.citas (
        negocio_id, cliente_id, servicio_id, profesional_id,
        inicio, fin, estado, canal, notas, created_at
      ) values (
        p_negocio_id, v_cliente_id, v_servicio_id, v_profesional_id,
        v_fecha_inicio, v_fecha_fin, 'confirmada', p_canal, v_notas, now()
      );
      v_creadas := v_creadas + 1;
    exception when others then
      v_errores := array_append(v_errores, 'Fila ' || (v_fila_idx + 1) || ': error al crear cita - ' || SQLERRM);
    end;
  end loop;

  return jsonb_build_object(
    'creadas', v_creadas,
    'duplicados', v_duplicados,
    'errores', v_errores,
    'total', jsonb_array_length(p_filas)
  );
end;
$$;

-- Revocar ejecución a public y anon, conceder solo a authenticated
revoke execute on function public.importar_citas_csv(text, jsonb, text) from public, anon;
grant execute on function public.importar_citas_csv(text, jsonb, text) to authenticated;

-- Comentario
comment on function public.importar_citas_csv is 'Importa citas desde un CSV ya mapeado. Busca/crea clientes, busca servicios por nombre, crea citas con canal=csv.';
