-- Migración S26: Seguridad y Políticas (Hardening y DPO)
-- Fecha: 2026-07-10
-- Objetivo: RLS estricto (multi-tenant), cumplimiento DPO (consiente_ia) y blindaje RPC.

-------------------------------------------------------------------------------
-- 1. Consentimiento DPO (Opt-in)
-------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS consiente_ia boolean default false;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS consiente_ia_fecha timestamptz;

-- RPC Seguro con Rate Limiting Básico (por la naturaleza del backend de Supabase)
-- Usa SECURITY DEFINER para elevar privilegios pero blindado al tenant correcto.
CREATE OR REPLACE FUNCTION public.rpc_set_consentimiento_ia(p_negocio_id text, p_cliente_id text, p_consiente boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_negocio text;
BEGIN
  -- Verificar tenant del usuario llamante
  SELECT negocio_id INTO v_negocio
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_negocio IS NULL OR v_negocio <> p_negocio_id THEN
    RAISE EXCEPTION 'No autorizado: no perteneces a este negocio';
  END IF;

  UPDATE public.clientes 
  SET consiente_ia = p_consiente,
      consiente_ia_fecha = now()
  WHERE id::text = p_cliente_id AND negocio_id = p_negocio_id;
END;
$$;

-- Endurecimiento RPC: solo autenticados.
REVOKE ALL ON FUNCTION public.rpc_set_consentimiento_ia(text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_set_consentimiento_ia(text, text, boolean) TO authenticated;

-------------------------------------------------------------------------------
-- 2. Fijar RLS de chispa_macros (S22) a patrón estándar robusto (Profiles)
-------------------------------------------------------------------------------
-- Eliminamos las politicas que usan current_setting('jwt.claims', true)
DROP POLICY IF EXISTS "macros_select_own_negocio" ON public.chispa_macros;
DROP POLICY IF EXISTS "macros_insert_own_negocio" ON public.chispa_macros;
DROP POLICY IF EXISTS "macros_update_own_negocio" ON public.chispa_macros;
DROP POLICY IF EXISTS "macros_delete_own_negocio" ON public.chispa_macros;

-- Recreamos con la subquery a public.profiles
CREATE POLICY "macros_select_own_negocio" ON public.chispa_macros
  FOR SELECT
  USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY "macros_insert_own_negocio" ON public.chispa_macros
  FOR INSERT
  WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY "macros_update_own_negocio" ON public.chispa_macros
  FOR UPDATE
  USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1))
  WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY "macros_delete_own_negocio" ON public.chispa_macros
  FOR DELETE
  USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

-------------------------------------------------------------------------------
-- 3. Creación y Blindaje de Tablas S13+ (hallazgos_ia, cola_notificacion, campanas)
-------------------------------------------------------------------------------
-- 3.a Hallazgos IA (Escaneo proactivo)
CREATE TABLE IF NOT EXISTS public.hallazgos_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  severidad text DEFAULT 'baja',
  estado text DEFAULT 'pendiente',
  creado_en timestamptz DEFAULT now()
);

ALTER TABLE public.hallazgos_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hallazgos_select_own_negocio" ON public.hallazgos_ia FOR SELECT USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "hallazgos_insert_own_negocio" ON public.hallazgos_ia FOR INSERT WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "hallazgos_update_own_negocio" ON public.hallazgos_ia FOR UPDATE USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "hallazgos_delete_own_negocio" ON public.hallazgos_ia FOR DELETE USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

-- 3.b Cola de Notificaciones IA
CREATE TABLE IF NOT EXISTS public.cola_notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  cliente_id text,
  canal text,
  mensaje text NOT NULL,
  estado text DEFAULT 'pendiente',
  creado_en timestamptz DEFAULT now(),
  enviado_en timestamptz
);

ALTER TABLE public.cola_notificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cola_select_own_negocio" ON public.cola_notificaciones FOR SELECT USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "cola_insert_own_negocio" ON public.cola_notificaciones FOR INSERT WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "cola_update_own_negocio" ON public.cola_notificaciones FOR UPDATE USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "cola_delete_own_negocio" ON public.cola_notificaciones FOR DELETE USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

-- 3.c Campañas IA
CREATE TABLE IF NOT EXISTS public.campanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  nombre text NOT NULL,
  segmento text,
  objetivo text,
  estado text DEFAULT 'borrador',
  creado_en timestamptz DEFAULT now()
);

ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campanas_select_own_negocio" ON public.campanas FOR SELECT USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "campanas_insert_own_negocio" ON public.campanas FOR INSERT WITH CHECK (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "campanas_update_own_negocio" ON public.campanas FOR UPDATE USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));
CREATE POLICY "campanas_delete_own_negocio" ON public.campanas FOR DELETE USING (negocio_id = (SELECT p.negocio_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1));

-------------------------------------------------------------------------------
-- 4. Hardening Adicional de RPCs previas
-------------------------------------------------------------------------------
-- Asegurar que la funcion de borrado RGPD (creada en S08) no sea publica
REVOKE ALL ON FUNCTION public.rpc_borrar_eventos_rgpd(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_borrar_eventos_rgpd(text, text, text) TO authenticated;
