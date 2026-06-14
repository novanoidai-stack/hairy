-- Crear tabla de recomendaciones si no existe
CREATE TABLE IF NOT EXISTS public.recomendaciones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    referente_email text NOT NULL,
    recomendado_email_1 text,
    recomendado_email_2 text,
    recomendado_email_3 text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Habilitar RLS en recomendaciones
ALTER TABLE public.recomendaciones ENABLE ROW LEVEL SECURITY;

-- Crear políticas de RLS para recomendaciones (limpiando previas)
DROP POLICY IF EXISTS "Permitir lectura pública de recomendaciones" ON public.recomendaciones;
CREATE POLICY "Permitir lectura pública de recomendaciones" ON public.recomendaciones
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserción pública de recomendaciones" ON public.recomendaciones;
CREATE POLICY "Permitir inserción pública de recomendaciones" ON public.recomendaciones
    FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualización a staff" ON public.recomendaciones;
CREATE POLICY "Permitir actualización a staff" ON public.recomendaciones
    FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Crear función RPC para que los clientes consulten sus referidos de forma segura
CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS TABLE (
  business_name text,
  created_at timestamp with time zone,
  plan_type text
) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coalesce(p.business_name, 'Nuevo Salón')::text as business_name,
    p.created_at,
    coalesce(p.plan_type, 'trial')::text as plan_type
  FROM public.profiles p
  WHERE p.referido_por = auth.uid()
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Crear función y trigger para evitar fraude de referidos (modificar descuento o referente)
CREATE OR REPLACE FUNCTION public.check_profiles_referral_security()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo comprobar si hay un usuario autenticado (llamadas desde API cliente)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    -- No permitir cambiar descuento_referido_aplicado a true
    IF OLD.descuento_referido_aplicado IS DISTINCT FROM NEW.descuento_referido_aplicado AND NEW.descuento_referido_aplicado = TRUE THEN
      RAISE EXCEPTION 'No tienes permisos para aplicar descuentos de referidos directamente.';
    END IF;

    -- No permitir cambiar referido_por una vez establecido
    IF OLD.referido_por IS NOT NULL AND OLD.referido_por IS DISTINCT FROM NEW.referido_por THEN
      RAISE EXCEPTION 'No se puede cambiar el referente una vez asignado.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profiles_referral_security ON public.profiles;
CREATE TRIGGER trg_profiles_referral_security
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profiles_referral_security();

-- Crear función y trigger para resolución de referidos pendientes (self-healing)
CREATE OR REPLACE FUNCTION public.resolve_pending_referrals()
RETURNS TRIGGER AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  IF NEW.referido_por IS NULL AND (NEW.metrics->>'referido_por_email') IS NOT NULL THEN
    SELECT id INTO v_referrer_id
    FROM public.profiles
    WHERE email = lower(trim(NEW.metrics->>'referido_por_email'));
    
    IF v_referrer_id IS NOT NULL AND v_referrer_id != NEW.id THEN
      NEW.referido_por := v_referrer_id;
      NEW.referido_en := coalesce(NEW.referido_en, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_resolve_pending_referrals ON public.profiles;
CREATE TRIGGER trg_resolve_pending_referrals
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.resolve_pending_referrals();

-- Crear función y trigger para resolución retrospectiva de referidos (self-healing)
CREATE OR REPLACE FUNCTION public.retrospective_referrals_resolve()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.email IS DISTINCT FROM NEW.email) THEN
    UPDATE public.profiles
    SET referido_por = NEW.id,
        referido_en = coalesce(referido_en, now())
    WHERE referido_por IS NULL 
      AND lower(trim(metrics->>'referido_por_email')) = lower(trim(NEW.email))
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_retrospective_referrals_resolve ON public.profiles;
CREATE TRIGGER trg_retrospective_referrals_resolve
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.retrospective_referrals_resolve();

-- Recargar el cache del esquema PostgREST
NOTIFY pgrst, 'reload schema';
