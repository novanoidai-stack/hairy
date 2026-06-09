-- Migracion: etiquetas/segmentos manuales de clientes — C6
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Etiquetas libres por cliente (ademas de la clasificacion automatica
-- VIP/Habitual/Nuevo). Sirven para segmentar la cartera (p. ej. "solo color",
-- "fieles", "novia 2026"). El uso para campanas masivas sera de Alexandro.

alter table public.clientes add column if not exists etiquetas text[] not null default '{}';
