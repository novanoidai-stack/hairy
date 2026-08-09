-- ─────────────────────────────────────────────────────────────────────────────
-- CONTROL HORARIO LEGAL (registro de jornada) — Mecha
-- Carlos + Claude, 9 ago 2026. Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Objetivo: que `fichajes` deje de ser una lista de marcas sueltas y pase a ser
-- un REGISTRO DE JORNADA valido frente a la Inspeccion de Trabajo en España.
--
-- Marco legal que se persigue (art. 34.9 ET, redaccion del RD-ley 8/2019, mas
-- los requisitos del proyecto de Real Decreto de registro de jornada que a
-- fecha de hoy sigue en tramitacion — se implementa el escenario exigente para
-- no tener que rehacerlo cuando se publique en el BOE):
--
--   1. Registro DIARIO con hora real de inicio y de finalizacion.        -> marcado_at (hora del servidor, no del cliente)
--   2. Identificacion exacta de la persona trabajadora.                   -> profesional_id obligatorio + user_id
--   3. Pausas no computables como trabajo efectivo.                       -> tipo pausa_inicio/pausa_fin, excluidas de horas_trabajadas
--   4. Diferenciar trabajo presencial y remoto.                           -> modalidad
--   5. Totalizacion diaria y mensual.                                     -> jornada_totales()
--   6. Inalterabilidad e integridad del asiento.                          -> trigger + cadena de hash SHA-256
--   7. Trazabilidad de cualquier modificacion: quien, cuando y por que,
--      con autorizacion de empresa Y de la persona trabajadora, dejando
--      constancia indeleble de autoria, motivo y discrepancias.           -> jornada_correcciones (nunca se borra nada)
--   8. Conservacion 4 años y disponibilidad permanente.                   -> sin purga (ver gdpr-anonimizacion-y-retencion.sql) + jornada_registro()
--   9. Acceso y copia inmediata por la persona trabajadora y sus
--      representantes, y acceso de la Inspeccion.                         -> jornada_registro() self-service + exportacion
--
-- NO se implementa biometria (huella/facial): el borrador la prohibe salvo
-- casos excepcionales. NO se implementa geolocalizacion continua (la AEPD solo
-- admite la puntual y justificada). Se guarda dispositivo/IP como dato tecnico
-- de objetividad del asiento, que es el minimo defendible.
--
-- Esta migracion es idempotente: se puede reaplicar sin romper nada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. AMPLIACION DE `fichajes`
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.fichajes add column if not exists modalidad text not null default 'presencial';
alter table public.fichajes add column if not exists origen text not null default 'app';
alter table public.fichajes add column if not exists dispositivo text;
alter table public.fichajes add column if not exists ip text;
alter table public.fichajes add column if not exists estado text not null default 'valido';
alter table public.fichajes add column if not exists anulado_at timestamptz;
alter table public.fichajes add column if not exists anulado_por uuid;
alter table public.fichajes add column if not exists correccion_id uuid;
-- Asiento que este registro corrige (cadena de correcciones; el original NUNCA se borra).
alter table public.fichajes add column if not exists corrige_a uuid references public.fichajes(id);
-- Numero de asiento correlativo por negocio + cadena de integridad tipo VeriFactu.
alter table public.fichajes add column if not exists secuencia bigint;
alter table public.fichajes add column if not exists hash text;
alter table public.fichajes add column if not exists hash_anterior text;

alter table public.fichajes drop constraint if exists fichajes_modalidad_check;
alter table public.fichajes add constraint fichajes_modalidad_check
  check (modalidad in ('presencial', 'remoto'));

alter table public.fichajes drop constraint if exists fichajes_origen_check;
alter table public.fichajes add constraint fichajes_origen_check
  check (origen in ('app', 'movil', 'quiosco', 'correccion', 'importado', 'automatico'));

alter table public.fichajes drop constraint if exists fichajes_estado_check;
alter table public.fichajes add constraint fichajes_estado_check
  check (estado in ('valido', 'anulado'));

create index if not exists fichajes_profesional_fecha_idx
  on public.fichajes (negocio_id, profesional_id, marcado_at);
create index if not exists fichajes_secuencia_idx
  on public.fichajes (negocio_id, secuencia);

-- Las reparaciones de esquema de esta migracion (backfill + sellado) tienen que
-- poder escribir aunque el trigger de inalterabilidad ya exista (reaplicacion).
select set_config('app.jornada_correccion', 'migracion', true);

-- Backfill: los asientos historicos se crearon sin profesional_id (la ficha se
-- deducia del user_id). Sin identificacion exacta del trabajador el registro no
-- vale, asi que se resuelve por la vinculacion cuenta -> ficha de profesional.
update public.fichajes f
   set profesional_id = pr.id
  from public.profesionales pr
 where f.profesional_id is null
   and pr.profile_id = f.user_id
   and pr.negocio_id = f.negocio_id;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. INTEGRIDAD: numeracion correlativa + cadena de hash
-- ═════════════════════════════════════════════════════════════════════════════
-- El hash encadena cada asiento con el anterior DEL MISMO NEGOCIO. Alterar o
-- eliminar un asiento por detras (p.ej. con la service_role key, que se salta
-- RLS) rompe la cadena y `jornada_verificar_integridad()` lo detecta.

create or replace function public.fichajes_sellar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prev_hash text;
  v_seq bigint;
begin
  -- Numero de asiento correlativo por negocio. El lock evita dos asientos con
  -- la misma secuencia si dos personas fichan a la vez.
  perform pg_advisory_xact_lock(hashtext('fichajes:' || new.negocio_id));

  select f.secuencia, f.hash
    into v_seq, v_prev_hash
  from public.fichajes f
  where f.negocio_id = new.negocio_id and f.secuencia is not null
  order by f.secuencia desc
  limit 1;

  new.secuencia := coalesce(v_seq, 0) + 1;
  new.hash_anterior := v_prev_hash;
  new.hash := encode(
    extensions.digest(
      coalesce(v_prev_hash, '') || '|' ||
      new.negocio_id || '|' ||
      new.secuencia::text || '|' ||
      coalesce(new.profesional_id::text, '') || '|' ||
      coalesce(new.user_id::text, '') || '|' ||
      new.tipo || '|' ||
      to_char(new.marcado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
      new.modalidad,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

drop trigger if exists fichajes_sellar_trg on public.fichajes;
create trigger fichajes_sellar_trg
  before insert on public.fichajes
  for each row execute function public.fichajes_sellar();

-- Sellar los asientos historicos que aun no tienen hash, en orden cronologico.
do $$
declare
  r record;
  v_prev text;
  v_neg text := null;
  v_seq bigint := 0;
begin
  for r in
    select id, negocio_id, profesional_id, user_id, tipo, marcado_at, modalidad, estado
      from public.fichajes
     where hash is null
     order by negocio_id, marcado_at, created_at, id
  loop
    if v_neg is distinct from r.negocio_id then
      v_neg := r.negocio_id;
      select coalesce(max(secuencia), 0) into v_seq from public.fichajes where negocio_id = v_neg;
      select hash into v_prev from public.fichajes
        where negocio_id = v_neg and secuencia = v_seq;
    end if;

    v_seq := v_seq + 1;
    update public.fichajes
       set secuencia = v_seq,
           hash_anterior = v_prev,
           hash = encode(extensions.digest(
             coalesce(v_prev, '') || '|' || r.negocio_id || '|' || v_seq::text || '|' ||
             coalesce(r.profesional_id::text, '') || '|' || coalesce(r.user_id::text, '') || '|' ||
             r.tipo || '|' ||
             to_char(r.marcado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
             r.modalidad, 'sha256'), 'hex')
     where id = r.id;

    select hash into v_prev from public.fichajes where id = r.id;
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. INALTERABILIDAD: ni UPDATE libre ni DELETE
-- ═════════════════════════════════════════════════════════════════════════════
-- Un asiento no se edita ni se borra JAMAS. Corregir = anular el asiento (que
-- se queda visible y trazable) y crear uno nuevo que apunta al anterior.
-- El unico UPDATE permitido es la anulacion, y solo la hace la RPC de
-- correcciones (marcada con el flag de sesion `app.jornada_correccion`).

create or replace function public.fichajes_bloquear_cambios()
returns trigger
language plpgsql
as $$
declare
  v_flag text := coalesce(current_setting('app.jornada_correccion', true), '');
begin
  -- 'migracion' solo puede activarlo una migracion ejecutada con la clave de
  -- servicio; sirve para reparaciones de esquema (backfill, resellado), no para
  -- el uso diario de la aplicacion.
  if v_flag = 'migracion' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Los fichajes no se pueden borrar: el registro de jornada debe conservarse 4 años (art. 34.9 ET). Usa una correccion para anularlo.'
      using errcode = 'check_violation';
  end if;

  if v_flag <> 'on' then
    raise exception 'Los fichajes no se pueden modificar directamente: usa "solicitar correccion" para dejar constancia de quien, cuando y por que.'
      using errcode = 'check_violation';
  end if;

  -- Ni siquiera la correccion puede reescribir el asiento: solo anularlo.
  if new.negocio_id is distinct from old.negocio_id
     or new.profesional_id is distinct from old.profesional_id
     or new.user_id is distinct from old.user_id
     or new.tipo is distinct from old.tipo
     or new.marcado_at is distinct from old.marcado_at
     or new.modalidad is distinct from old.modalidad
     or new.secuencia is distinct from old.secuencia
     or new.hash is distinct from old.hash
     or new.hash_anterior is distinct from old.hash_anterior then
    raise exception 'Un asiento de jornada es inalterable: solo puede anularse y sustituirse por otro.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists fichajes_bloquear_update_trg on public.fichajes;
create trigger fichajes_bloquear_update_trg
  before update on public.fichajes
  for each row execute function public.fichajes_bloquear_cambios();

drop trigger if exists fichajes_bloquear_delete_trg on public.fichajes;
create trigger fichajes_bloquear_delete_trg
  before delete on public.fichajes
  for each row execute function public.fichajes_bloquear_cambios();

-- RLS: se retiran UPDATE y DELETE directos desde el cliente. INSERT solo de uno
-- mismo y con hora del servidor (ver RPC). SELECT sigue como en
-- security-round3-rls-cobros-fichajes.sql (owner/admin todo, resto lo suyo).
drop policy if exists "fichajes_update_own" on public.fichajes;
drop policy if exists "fichajes_delete_own" on public.fichajes;
drop policy if exists "fichajes_insert_own" on public.fichajes;

create policy "fichajes_insert_propio" on public.fichajes for insert
  to authenticated
  with check (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and user_id = auth.uid()
    -- Antiretroactividad: no se puede colar un asiento con fecha inventada.
    and marcado_at between now() - interval '2 minutes' and now() + interval '2 minutes'
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. CORRECCIONES CON DOBLE CONFORMIDAD (empresa + persona trabajadora)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.jornada_correcciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  profesional_id uuid,
  -- Asiento afectado. NULL cuando se pide AÑADIR un fichaje que falta.
  fichaje_id uuid references public.fichajes(id),
  tipo_solicitud text not null check (tipo_solicitud in ('anadir', 'corregir', 'anular')),
  -- Lo que se propone: {tipo, marcado_at, modalidad}
  propuesta jsonb not null default '{}'::jsonb,
  motivo text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  -- Doble conformidad. Quien inicia queda conforme de oficio; falta la otra parte.
  solicitada_por uuid not null,
  solicitada_por_nombre text,
  solicitada_por_rol text not null check (solicitada_por_rol in ('empresa', 'trabajador')),
  conforme_empresa boolean not null default false,
  conforme_trabajador boolean not null default false,
  resuelta_por uuid,
  resuelta_por_nombre text,
  resuelta_at timestamptz,
  resolucion_nota text,
  -- Discrepancia: si una parte no acepta, queda escrita (lo exige el borrador de RD).
  discrepancia text,
  fichaje_nuevo_id uuid references public.fichajes(id),
  created_at timestamptz not null default now()
);

create index if not exists jornada_correcciones_negocio_idx
  on public.jornada_correcciones (negocio_id, estado, created_at desc);
create index if not exists jornada_correcciones_prof_idx
  on public.jornada_correcciones (profesional_id, created_at desc);

alter table public.jornada_correcciones enable row level security;

drop policy if exists "jornada_correcciones_select" on public.jornada_correcciones;
create policy "jornada_correcciones_select" on public.jornada_correcciones for select
  to authenticated
  using (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
      or solicitada_por = auth.uid()
      or exists (select 1 from public.profesionales pr
                  where pr.profile_id = auth.uid() and pr.id = jornada_correcciones.profesional_id)
    )
  );

-- Escritura solo por las RPC (security definer). Sin politicas de insert/update
-- el cliente no puede tocar la tabla directamente.

-- Una correccion tampoco se borra.
create or replace function public.jornada_correcciones_no_borrar()
returns trigger language plpgsql as $$
begin
  raise exception 'El historial de correcciones de jornada es indeleble.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists jornada_correcciones_no_borrar_trg on public.jornada_correcciones;
create trigger jornada_correcciones_no_borrar_trg
  before delete on public.jornada_correcciones
  for each row execute function public.jornada_correcciones_no_borrar();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. AJUSTES DE CONTROL HORARIO POR NEGOCIO
-- ═════════════════════════════════════════════════════════════════════════════
-- Viven en negocio_config.config (jsonb), como el resto de ajustes:
--   control_horario_exigir_fichaje  bool   pedir fichar entrada al abrir la app
--   control_horario_bloquear        bool   ademas de pedirlo, impedir seguir sin fichar
--   control_horario_jornada_semanal number horas semanales de referencia
--   control_horario_zona            text   zona horaria del centro (default Europe/Madrid)

create or replace function public.jornada_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exigir_fichaje', coalesce((c.config->>'control_horario_exigir_fichaje')::boolean, false),
    'bloquear', coalesce((c.config->>'control_horario_bloquear')::boolean, false),
    'jornada_semanal', coalesce((c.config->>'control_horario_jornada_semanal')::numeric, 40),
    'zona', coalesce(c.config->>'control_horario_zona', 'Europe/Madrid')
  )
  from public.profiles p
  left join public.negocio_config c on c.negocio_id = p.negocio_id
  where p.id = auth.uid();
$$;

revoke execute on function public.jornada_config() from public, anon;
grant execute on function public.jornada_config() to authenticated;
