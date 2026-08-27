-- Migracion: lista de espera (waitlist) — C2
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Cuando un cliente quiere un hueco que esta lleno, recepcion lo apunta aqui.
-- Al liberarse un hueco (cancelacion), el equipo ve a quien avisar y lo marca.
-- v1: gestion interna (authenticated por negocio_id). El auto-apuntado del
-- cliente desde el portal publico y el aviso automatico quedan para mas adelante
-- (el aviso real por SMS/WhatsApp es de Alexandro).

create table if not exists public.lista_espera (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null,
  cliente_id     uuid references public.clientes(id) on delete set null,
  nombre         text,
  telefono       text,
  servicio_id    uuid references public.servicios(id) on delete set null,
  profesional_id uuid references public.profesionales(id) on delete set null,
  desde          date,
  hasta          date,
  franja         text not null default 'cualquiera' check (franja in ('manana','tarde','cualquiera')),
  nota           text,
  estado         text not null default 'esperando' check (estado in ('esperando','avisado','resuelta','cancelada')),
  prioridad      smallint not null default 0,
  created_at     timestamptz not null default now(),
  avisado_at     timestamptz
);

alter table public.lista_espera enable row level security;

-- El equipo del negocio (autenticado, mismo negocio_id) gestiona su lista.
drop policy if exists lista_espera_negocio_all on public.lista_espera;
create policy lista_espera_negocio_all on public.lista_espera
  for all to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()))
  with check (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

create index if not exists lista_espera_negocio_estado_idx
  on public.lista_espera (negocio_id, estado, prioridad desc, created_at);
