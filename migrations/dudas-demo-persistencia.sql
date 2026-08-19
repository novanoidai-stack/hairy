-- Persistencia de dudas de la demo (chispa-dudas-demo).
-- Antes la duda vivia SOLO en el correo SMTP al equipo: si el SMTP fallaba
-- (o faltaban credenciales), el lead se perdia para siempre sin rastro.
-- La escribe la edge function con service_role; RLS activo y sin politicas
-- publicas para que nadie mas pueda leer ni escribir.
create table if not exists public.dudas_demo (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  modo text not null default 'duda',
  duda text not null,
  respuesta text,
  email text,
  telefono text,
  tipo_contacto text,
  ip text,
  emailed boolean not null default false,
  email_error text
);

-- Ninguna politica: solo service_role (la edge function) toca esta tabla.
alter table public.dudas_demo enable row level security;

-- Indice para revisar las dudas recientes de un vistazo.
create index if not exists dudas_demo_created_at_idx on public.dudas_demo (created_at desc);

-- El panel de staff (admin.html) lee las dudas de la demo con la sesion del
-- usuario, igual que hace con solicitudes: SELECT solo para staff.
drop policy if exists dudas_demo_select_staff on public.dudas_demo;
create policy dudas_demo_select_staff on public.dudas_demo
  for select to authenticated using (public.is_staff());

grant select on public.dudas_demo to authenticated;
