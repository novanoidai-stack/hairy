-- Planes generativos de Chispa — F1 del motor generativo (ago-2026).
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- Diseño: docs/INFORME-MOTOR-GENERATIVO-PROPUESTAS-IA.md (§6)
--
-- Hasta hoy la capa de IA del organizador devolvia TEXTO: recomendaciones sin
-- movimientos, sin boton y sin rastro. Esta tabla guarda la otra cosa: planes
-- EJECUTABLES que el modelo invento y que el validador determinista
-- (lib/organizador/planIA.ts) ya recomprobo contra la geometria real de la
-- agenda. Lo que se guarda aqui es post-validacion, nunca la salida cruda.
--
-- Tres decisiones que no son obvias:
--   1. Se guardan TAMBIEN los movimientos podados y por que. Sin eso nadie
--      puede auditar si el modelo esta proponiendo basura, ni graduar un
--      patron a detector determinista (§5 del informe).
--   2. Se guardan el impacto MEDIDO por el validador y el DECLARADO por el
--      modelo, por separado. Comparar los dos es el ciclo de aprendizaje (F4).
--   3. La tabla no la escribe ningun cliente: solo el edge con service_role.
--      Los unicos cambios que puede hacer el salon son de ESTADO, y van por
--      RPC con el guard de negocio (regla del parametro, CLAUDE.md §4).
--
-- Idempotente: se puede volver a aplicar sin romper nada.

begin;

-- ─────────────────────────────────────────────────────────────────
-- 1) Tabla
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.planes_ia (
  id uuid primary key default gen_random_uuid(),
  -- negocio_id es text en TODO el esquema (no hay tabla `negocios`: el tenant
  -- vive en profiles.negocio_id). No hay FK que poner.
  negocio_id text not null,
  -- Quien lo disparo. null = lo generaron los ojos continuos, sin humano.
  generado_por uuid references auth.users(id) on delete set null,
  disparador text not null default 'panel'
    check (disparador in ('ojo', 'latido', 'panel', 'manual')),

  -- Vocabulario ABIERTO a proposito (§5 del informe): el modelo puede inventar
  -- un tipo que nadie programo ('cadena_fragil', 'reposo_alineable'...). Se
  -- guarda tal cual; los que se repiten se gradúan al catalogo.
  tipo_problema text not null,
  titulo text not null,
  diagnostico text not null default '',
  razonamiento text not null default '',
  confianza text not null default 'media' check (confianza in ('alta', 'media', 'baja')),

  -- Minutos que el VALIDADOR mide (suma de adelantos reales).
  impacto_min integer not null default 0,
  -- Minutos que el MODELO dijo. Se guardan los dos: la diferencia es la señal
  -- de si el modelo se cree mas listo de lo que es.
  impacto_declarado_min integer not null default 0,
  -- Score con la misma tabla de penalizaciones que el motor determinista.
  score integer not null default 0,

  -- El plan ya validado y podado: array de movimientos listos para
  -- ejecutarAccion('optimizar_agenda').
  movimientos jsonb not null default '[]'::jsonb,
  -- Lo que el validador tumbo, con su motivo. Es la mitad util del registro.
  movimientos_podados jsonb not null default '[]'::jsonb,
  requiere_consentimiento boolean not null default false,
  -- Origen y destino de cada movimiento, para "Enséñamelo".
  zonas jsonb not null default '[]'::jsonb,
  riesgos jsonb not null default '[]'::jsonb,

  -- Coste real de generar este plan (shared/modelos.ts pone el precio).
  modelo text,
  coste_usd numeric(12, 6),
  tokens_in integer,
  tokens_out integer,

  -- F4: marca de que este plan describe un patron que el motor barato podria
  -- resolver solo. Se rellena cuando se revisa; null = sin revisar.
  graduable_a_determinista boolean,

  estado text not null default 'propuesto'
    check (estado in ('propuesto', 'aplicado', 'parcial', 'esperando_clientes',
                      'podado', 'rechazado', 'expirado', 'fallido')),
  -- Que paso de verdad al aplicarlo (mensaje del ejecutor o del usuario).
  resultado text,

  creado_en timestamptz not null default now(),
  -- Un plan calculado sobre una agenda de hace 2 h esta caducado: lo que vio
  -- el modelo ya no existe. La UI no lo ofrece y el job lo marca 'expirado'.
  expira_en timestamptz not null default (now() + interval '2 hours'),
  aplicado_en timestamptz
);

comment on table public.planes_ia is
  'Planes ejecutables generados por Chispa y ya validados contra la geometria real de la agenda (lib/organizador/planIA.ts). Solo los escribe el edge agenda-optimizador con service_role.';
comment on column public.planes_ia.movimientos_podados is
  'Movimientos que el validador rechazo, con motivo. Sirve para auditar al modelo y para graduar patrones a detectores deterministas.';
comment on column public.planes_ia.impacto_declarado_min is
  'Lo que el modelo estimo, frente a impacto_min que es lo que el validador mide. La diferencia es la señal de calibracion.';

-- Lo que consulta el panel: los planes vivos de un negocio, por recencia.
create index if not exists planes_ia_negocio_estado_idx
  on public.planes_ia (negocio_id, estado, creado_en desc);
-- Lo que barre el job de caducidad.
create index if not exists planes_ia_expira_idx
  on public.planes_ia (expira_en)
  where estado in ('propuesto', 'esperando_clientes');

-- ─────────────────────────────────────────────────────────────────
-- 2) RLS: lee la direccion del salon; no escribe nadie desde el cliente
-- ─────────────────────────────────────────────────────────────────

alter table public.planes_ia enable row level security;

-- Un plan enseña nombres de clientas y como se reorganiza el salon: es
-- informacion de direccion, no de toda la plantilla (misma linea que cobros y
-- gastos). is_staff() = equipo de Mecha, para soporte.
-- Las llamadas van envueltas en (select ...) por la regla del InitPlan
-- (CLAUDE.md §6): sueltas se evaluarian una vez POR FILA.
drop policy if exists planes_ia_select_direccion on public.planes_ia;
create policy planes_ia_select_direccion on public.planes_ia
  for select to authenticated
  using (
    (select public.is_staff())
    or (
      negocio_id = (select public.my_negocio_id_text())
      and (select public.my_app_role()) in ('owner', 'admin', 'recepcion')
    )
  );

-- Escritura: NUNCA desde el cliente. El edge usa service_role (que se salta
-- RLS) y el salon solo cambia el ESTADO, via planes_ia_marcar().
drop policy if exists planes_ia_insert_none on public.planes_ia;
create policy planes_ia_insert_none on public.planes_ia
  for insert to authenticated with check (false);
drop policy if exists planes_ia_update_none on public.planes_ia;
create policy planes_ia_update_none on public.planes_ia
  for update to authenticated using (false) with check (false);
drop policy if exists planes_ia_delete_none on public.planes_ia;
create policy planes_ia_delete_none on public.planes_ia
  for delete to authenticated using (false);

revoke all on public.planes_ia from anon;

-- ─────────────────────────────────────────────────────────────────
-- 3) Cambiar el estado de un plan (aplicar / rechazar / fallar)
-- ─────────────────────────────────────────────────────────────────

-- REGLA DEL PARAMETRO (CLAUDE.md §4): recibe un id del que se deduce el
-- negocio, asi que se ata a quien llama con exige_mi_negocio. Sin eso bastaria
-- cambiar un uuid para tocar el registro de otro salon.
create or replace function public.planes_ia_marcar(
  p_plan_id   uuid,
  p_estado    text,
  p_resultado text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_previo  text;
begin
  select negocio_id, estado into v_negocio, v_previo
    from public.planes_ia where id = p_plan_id;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Ese plan no existe.');
  end if;

  perform public.exige_mi_negocio(v_negocio, true);

  -- Estados que puede fijar el salon. 'propuesto' no esta: un plan no vuelve
  -- atras, se regenera. 'expirado' lo pone el job, no una persona.
  if p_estado not in ('aplicado', 'parcial', 'esperando_clientes', 'rechazado', 'fallido') then
    return jsonb_build_object('ok', false, 'error', 'Estado no permitido: ' || p_estado);
  end if;
  -- Un plan ya cerrado no se re-marca (evita que dos pestañas se pisen).
  if v_previo in ('aplicado', 'rechazado', 'expirado') then
    return jsonb_build_object('ok', false, 'error', 'Ese plan ya estaba ' || v_previo || '.', 'estado', v_previo);
  end if;

  update public.planes_ia
     set estado      = p_estado,
         resultado   = coalesce(p_resultado, resultado),
         aplicado_en = case when p_estado in ('aplicado', 'parcial') then now() else aplicado_en end
   where id = p_plan_id;

  return jsonb_build_object('ok', true, 'estado', p_estado);
end;
$$;

revoke all on function public.planes_ia_marcar(uuid, text, text) from public, anon;
grant execute on function public.planes_ia_marcar(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4) Caducidad
-- ─────────────────────────────────────────────────────────────────

-- La llama el modo 'ojo' del edge (service_role) y puede llamarla la direccion
-- del salon para su propio negocio. Con p_negocio null solo pasa el uid nulo
-- (service_role / otra funcion definer), como el resto de guards del proyecto.
create or replace function public.planes_ia_expirar(p_negocio text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.exige_mi_negocio(p_negocio, false);

  update public.planes_ia
     set estado = 'expirado'
   where estado in ('propuesto', 'esperando_clientes')
     and expira_en < now()
     and (p_negocio is null or negocio_id = p_negocio);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.planes_ia_expirar(text) from public, anon;
grant execute on function public.planes_ia_expirar(text) to authenticated;

commit;
