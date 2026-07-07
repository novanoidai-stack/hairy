-- Rate limiting para la función pública chispa-landing

CREATE TABLE IF NOT EXISTS public.chispa_landing_rate_limit (
    ip text PRIMARY KEY,
    last_request timestamp with time zone DEFAULT now(),
    request_count int DEFAULT 1
);

-- Habilitar RLS pero no requerir autenticación para que funcione con IPs
ALTER TABLE public.chispa_landing_rate_limit ENABLE ROW LEVEL SECURITY;

-- Solo el service role puede tocar esto (Edge Function con adminClient)
CREATE POLICY "Service Role Full Access" 
ON public.chispa_landing_rate_limit 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- RPC security definer para gestionar el conteo
CREATE OR REPLACE FUNCTION public.check_landing_rate_limit(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last_request timestamp with time zone;
    v_request_count int;
    v_limit int := 15; -- 15 peticiones
    v_window interval := '1 hour'; -- por hora
BEGIN
    -- Limpiar registros viejos esporádicamente para no llenar la tabla
    IF random() < 0.01 THEN
        DELETE FROM public.chispa_landing_rate_limit WHERE last_request < now() - interval '24 hours';
    END IF;

    SELECT last_request, request_count INTO v_last_request, v_request_count 
    FROM public.chispa_landing_rate_limit 
    WHERE ip = p_ip;

    IF NOT FOUND THEN
        INSERT INTO public.chispa_landing_rate_limit (ip, request_count, last_request) 
        VALUES (p_ip, 1, now());
        RETURN true;
    END IF;

    IF now() - v_last_request > v_window THEN
        UPDATE public.chispa_landing_rate_limit 
        SET request_count = 1, last_request = now() 
        WHERE ip = p_ip;
        RETURN true;
    ELSE
        IF v_request_count >= v_limit THEN
            RETURN false;
        ELSE
            UPDATE public.chispa_landing_rate_limit 
            SET request_count = request_count + 1, last_request = now() 
            WHERE ip = p_ip;
            RETURN true;
        END IF;
    END IF;
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.check_landing_rate_limit(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_landing_rate_limit(text) TO anon, authenticated;
