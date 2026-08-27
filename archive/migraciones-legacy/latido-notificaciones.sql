-- Latido del envio de avisos (WhatsApp).
--
-- Las confirmaciones, los recordatorios, los avisos de retraso y las peticiones
-- de reseña NO las manda Mecha: las sirve la RPC notificaciones_pendientes() y
-- las envia un n8n que vive fuera, que ademas es quien llama despues a
-- marcar_notificacion_enviada().
--
-- El contrato esta bien. El agujero es que NO HAY LATIDO: si ese n8n se para un
-- martes por la noche, las clientas dejan de recibir confirmaciones y
-- recordatorios, suben los no-shows... y aqui no salta nada. Nos enterariamos
-- por un salon enfadado, que es la peor forma de enterarse. Y "recordatorios
-- automaticos" se vende dentro del plan Esencial.
--
-- Esto no cambia el contrato con n8n: marcar_notificacion_enviada() hace
-- exactamente lo que hacia y ademas deja constancia de que ha pasado. Con eso,
-- el panel de staff puede decir "hay 12 avisos esperando y no se manda ninguno
-- desde hace 5 horas".

create table if not exists public.latido_envios (
  id         boolean primary key default true check (id),  -- una sola fila
  ultimo_en  timestamptz not null default now(),
  ultimo_tipo text,
  total      bigint not null default 0
);

insert into public.latido_envios (id) values (true) on conflict (id) do nothing;

alter table public.latido_envios enable row level security;
-- Sin politicas: se escribe desde la RPC de marcado y se lee desde la de staff.

create or replace function public.marcar_notificacion_enviada(p_cita_id uuid, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo = 'confirmacion' then
    update public.citas set confirmacion_enviada = true where id = p_cita_id;
  elsif p_tipo = 'recordatorio' then
    update public.citas set recordatorio_enviado = true where id = p_cita_id;
  elsif p_tipo = 'resena' then
    update public.citas set resena_enviada = true where id = p_cita_id;
  elsif p_tipo = 'senal' then
    update public.citas set senal_enviada = true where id = p_cita_id;
  elsif p_tipo = 'retraso' then
    update public.citas set retraso_aviso_pendiente = false where id = p_cita_id;
  else
    raise exception 'Tipo de notificacion no valido: %', p_tipo;
  end if;

  -- El latido. Va al final y sin poder tumbar el marcado: si esto fallara,
  -- lo importante (que el aviso no se repita) ya esta hecho.
  begin
    update public.latido_envios
       set ultimo_en = now(), ultimo_tipo = p_tipo, total = total + 1
     where id;
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'tipo', p_tipo);
end;
$$;

-- Salud del envio, para el panel de staff.
create or replace function public.staff_salud_envios()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultimo timestamptz;
  v_tipo   text;
  v_total  bigint;
  v_pend   int;
  v_horas  numeric;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  select ultimo_en, ultimo_tipo, total into v_ultimo, v_tipo, v_total
    from public.latido_envios where id;

  v_pend := coalesce(jsonb_array_length(public.notificaciones_pendientes(200, 24)), 0);
  v_horas := round(extract(epoch from (now() - v_ultimo)) / 3600.0, 1);

  return jsonb_build_object(
    'ultimo_envio', v_ultimo,
    'ultimo_tipo', v_tipo,
    'envios_totales', v_total,
    'pendientes', v_pend,
    'horas_sin_enviar', v_horas,
    -- Alarma: hay cola y hace mas de dos horas que no sale nada.
    'alarma', (v_pend > 0 and v_horas > 2)
  );
end;
$$;

grant execute on function public.staff_salud_envios() to authenticated;

notify pgrst, 'reload schema';
