-- 29 ago 2026. Los "ojos continuos" de la agenda rompian el guardado de horarios.
--
-- agenda_ojos_notify() resuelve el salon con `coalesce(new.negocio_id,
-- old.negocio_id)`. Vale para citas, bloqueos_profesional y cierres_negocio,
-- que tienen esa columna. NO vale para horarios_profesional, que se llega por
-- profesional_id -- la misma trampa del commit 17a1103f, que ya la habia pisado
-- una vez en el cliente. En PL/pgSQL leer un campo que no existe en un record no
-- devuelve null: LANZA 42703, y como el trigger es AFTER ... FOR EACH ROW, se
-- lleva por delante la escritura entera.
--
-- COMPROBADO en produccion, con la transaccion revertida:
--   update public.horarios_profesional set hora_fin = hora_fin where id = <uno real>
--   -> 42703: record "new" has no field "negocio_id"
--
-- QUE ROMPIA, de cara al salon:
--   - Equipo -> horario de un trabajador. app/(tabs)/equipo.web.tsx hace
--     delete + insert sobre horarios_profesional: las dos ramas fallaban.
--   - El ALTA de un salon nuevo. lib/onboardingAgent.ts monta las jornadas con
--     delete + insert sobre la misma tabla. Un salon nuevo no podia terminar de
--     configurarse.
--
-- Arreglo: leer la fila como jsonb en vez de por campo. `to_jsonb(record)->>'x'`
-- devuelve null si el campo no esta, no lanza. Y si no hay negocio_id pero si
-- profesional_id, se deduce el salon por la ficha. Asi la funcion sirve para
-- cualquier tabla que se le cuelgue despues sin volver a pisar esto.
create or replace function public.agenda_ojos_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_fila jsonb := to_jsonb(coalesce(new, old));
  v_negocio text;
  v_prof text;
  v_ultimo timestamptz;
begin
  v_negocio := v_fila->>'negocio_id';

  -- Tablas que cuelgan del profesional y no llevan el salon encima
  -- (horarios_profesional). Si algun dia se anaden mas, ya estan cubiertas.
  if v_negocio is null then
    v_prof := v_fila->>'profesional_id';
    if v_prof is not null then
      select p.negocio_id into v_negocio
        from public.profesionales p
       where p.id = v_prof::uuid;
    end if;
  end if;

  if v_negocio is null or v_negocio = 'demo_salon_001' then
    return coalesce(new, old);
  end if;

  -- Latido: como maximo un aviso por salon y minuto. Arrastrar diez citas
  -- seguidas no puede disparar diez invocaciones de la edge.
  select ultimo_aviso into v_ultimo
    from public.agenda_ojos_latido
   where negocio_id = v_negocio;
  if v_ultimo is not null and v_ultimo > now() - interval '60 seconds' then
    return coalesce(new, old);
  end if;

  insert into public.agenda_ojos_latido (negocio_id, ultimo_aviso)
  values (v_negocio, now())
  on conflict (negocio_id) do update set ultimo_aviso = now();

  -- Un fallo del aviso NUNCA puede tumbar la escritura del salon. Los ojos son
  -- una mejora; guardar el horario de una trabajadora es el producto. Si el
  -- vault no responde o net.http_post falla, se pierde ese aviso y el cron de
  -- vigilar-agenda lo recoge en la siguiente pasada.
  begin
    perform net.http_post(
      url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/agenda-optimizador',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := jsonb_build_object('ojo', true, 'negocio_id', v_negocio)
    );
  exception when others then
    null;
  end;

  return coalesce(new, old);
end;
$fn$;
