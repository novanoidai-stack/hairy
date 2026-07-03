-- Mapa pagina_key -> timestamp ISO de cuando el usuario vio el aviso/manual de esa
-- pagina por primera vez. Reutiliza la policy "Users can update own profile" (UPDATE,
-- auth.uid() = id) que ya existe: no hace falta RPC ni policy nueva, igual que se hizo
-- con privacy_accepted_at en politica-privacidad-consentimiento.sql.
alter table public.profiles
  add column if not exists paginas_manual_vistas jsonb not null default '{}'::jsonb;

comment on column public.profiles.paginas_manual_vistas is
  'Mapa pagina_key -> timestamp ISO de cuando el usuario vio el aviso/manual de esa pagina
  por primera vez. Vacio = no ha visto ninguna. No confundir con privacy_accepted_at.';
