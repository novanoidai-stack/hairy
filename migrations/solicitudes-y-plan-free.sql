-- Migracion: bandeja de solicitudes (leads), allowlist de staff y plan free en profiles
-- Proyecto Supabase Hairy: vtrggiogjrhqtwbhbgia

-- profiles: plan + trial para la cuenta gratis limitada
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- staff: allowlist del equipo Mecha que puede ver el panel de solicitudes
create table if not exists public.staff (
  email text primary key,
  nombre text,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
drop policy if exists staff_self_select on public.staff;
create policy staff_self_select on public.staff
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
grant select on public.staff to authenticated;

-- solicitudes: prospectos pre-cuenta (demo, reserva de llamada, signup). No multi-tenant.
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('demo','reserva_llamada','signup')),
  nombre text,
  salon text,
  email text,
  telefono text,
  num_profesionales text,
  herramienta_actual text,
  nota text,
  fecha_preferida text,
  hora_preferida text,
  estado text not null default 'nueva' check (estado in ('nueva','contactada','ganada','descartada')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.solicitudes enable row level security;

-- helper: el usuario autenticado pertenece a staff? (security definer para saltar RLS de staff)
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where lower(s.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- INSERT publico: la web (anon) puede enviar solicitudes
drop policy if exists solicitudes_insert_public on public.solicitudes;
create policy solicitudes_insert_public on public.solicitudes
  for insert to anon, authenticated with check (true);

-- SELECT / UPDATE solo staff
drop policy if exists solicitudes_select_staff on public.solicitudes;
create policy solicitudes_select_staff on public.solicitudes
  for select to authenticated using (public.is_staff());
drop policy if exists solicitudes_update_staff on public.solicitudes;
create policy solicitudes_update_staff on public.solicitudes
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

grant insert on public.solicitudes to anon, authenticated;
grant select, update on public.solicitudes to authenticated;

create index if not exists solicitudes_created_idx on public.solicitudes (created_at desc);
create index if not exists solicitudes_tipo_idx on public.solicitudes (tipo);

-- seed staff inicial
insert into public.staff (email, nombre) values ('carlitosocanamartinez@gmail.com', 'Carlos')
on conflict (email) do nothing;
