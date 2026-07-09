-- Migracion S09: Memoria a corto y largo plazo de Chispa (chispa_memoria).
-- Guarda hilos de sesión, hechos aprendidos y resúmenes por negocio (+usuario).

CREATE TABLE IF NOT EXISTS public.chispa_memoria (
    id uuid primary key default gen_random_uuid(),
    negocio_id text not null,
    usuario_id text not null default '', -- userId de auth; vacío si es global del negocio.
    tipo text not null check (tipo in ('hilo', 'hecho', 'resumen')),
    clave text not null,
    valor jsonb not null,
    confianza numeric default 1.0 check (confianza >= 0 and confianza <= 1),
    origen text,
    actualizado_en timestamptz default now(),
    created_at timestamptz default now(),
    UNIQUE (negocio_id, tipo, clave, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_chispa_memoria_negocio_tipo ON public.chispa_memoria(negocio_id, tipo);
CREATE INDEX IF NOT EXISTS idx_chispa_memoria_negocio_clave ON public.chispa_memoria(negocio_id, clave);

-- RLS con el patrón estándar (profiles WHERE id = auth.uid()), coherente con
-- eventos_negocio y chispa_acciones. Evita el frágil current_setting(jwt.claims).
ALTER TABLE public.chispa_memoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura memoria negocio_id" ON public.chispa_memoria;
DROP POLICY IF EXISTS "Insercion memoria negocio_id" ON public.chispa_memoria;
DROP POLICY IF EXISTS "Actualizacion memoria negocio_id" ON public.chispa_memoria;
DROP POLICY IF EXISTS "Borrado memoria negocio_id" ON public.chispa_memoria;

CREATE POLICY "chismem_select_own_negocio" ON public.chispa_memoria
  FOR SELECT TO public
  USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY "chismem_insert_own_negocio" ON public.chispa_memoria
  FOR INSERT TO public
  WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY "chismem_update_own_negocio" ON public.chispa_memoria
  FOR UPDATE TO public
  USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1))
  WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY "chismem_delete_own_negocio" ON public.chispa_memoria
  FOR DELETE TO public
  USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

-- Trigger de actualizado_en (SET search_path por seguridad de función).
CREATE OR REPLACE FUNCTION public.set_actualizado_en_chispa_memoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_actualizado_en_chispa_memoria ON public.chispa_memoria;
CREATE TRIGGER trigger_actualizado_en_chispa_memoria
BEFORE UPDATE ON public.chispa_memoria
FOR EACH ROW
EXECUTE FUNCTION public.set_actualizado_en_chispa_memoria();
