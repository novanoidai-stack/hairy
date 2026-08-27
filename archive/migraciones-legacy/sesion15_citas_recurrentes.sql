-- Sesion 15 · Citas recurrentes (serie): vincula las citas de una misma serie
-- ("cada N semanas, M veces"). Nullable: no afecta a las citas existentes.
-- La generacion de la serie (validando bloqueo/horario/solape por ocurrencia y
-- omitiendo/reportando las conflictivas) y el cancelado "esta y las siguientes"
-- viven en components/agenda/AgendaCalendar.web.tsx (NewCitaModal + DetalleCitaModal).
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) el 2026-07-07 via Supabase MCP.
alter table public.citas add column if not exists serie_id uuid;
create index if not exists idx_citas_serie on public.citas (serie_id) where serie_id is not null;
