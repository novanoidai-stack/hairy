-- Migración: registro de entregas de WhatsApp (whatsapp_eventos)
--
-- Por qué: hasta ahora nadie sabía si un WhatsApp llegaba. El motor de n8n marcaba
-- confirmacion_enviada = true pasara lo que pasara (neverError en el nodo de envío), y el
-- webhook entrante descartaba los eventos `statuses` de Meta (sent/delivered/read/failed).
-- Con eso, todos los indicadores salían en verde aunque no se entregase un solo mensaje.
--
-- Esta tabla guarda las dos mitades: lo que respondió Graph al enviar, y lo que Meta cuenta
-- después por webhook sobre ese mismo wamid.
--
-- Solo service_role: la escriben los workflows de n8n, no la app.

CREATE TABLE IF NOT EXISTS public.whatsapp_eventos (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  cita_id uuid,
  negocio_id text,
  tipo text,                      -- confirmacion | recordatorio | senal | resena | retraso
  telefono text,
  wamid text,                     -- id del mensaje en Meta; une el envío con sus estados
  evento text NOT NULL,           -- enviado | fallo_envio | sent | delivered | read | failed
  error_code integer,
  error_titulo text,
  detalle jsonb
);

CREATE INDEX IF NOT EXISTS whatsapp_eventos_wamid_idx ON public.whatsapp_eventos (wamid);
CREATE INDEX IF NOT EXISTS whatsapp_eventos_cita_idx ON public.whatsapp_eventos (cita_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_eventos_created_idx ON public.whatsapp_eventos (created_at DESC);

ALTER TABLE public.whatsapp_eventos ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: nadie salvo service_role toca esta tabla.

-- Registrar el resultado de un envío (lo llama el motor de notificaciones tras hablar con Graph).
-- Devuelve cuántos fallos de envío acumula ya esa (cita, tipo), contando el de ahora. El motor
-- lo usa como tope: a partir de cierto número deja de reintentar y marca la notificación como
-- enviada, para no quedarse reintentando cada 2 minutos sobre un fallo que no se va a arreglar.
CREATE OR REPLACE FUNCTION public.registrar_envio_whatsapp(
  p_cita_id uuid,
  p_tipo text,
  p_telefono text,
  p_wamid text DEFAULT NULL,
  p_evento text DEFAULT 'enviado',
  p_error_code integer DEFAULT NULL,
  p_error_titulo text DEFAULT NULL,
  p_detalle jsonb DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallos integer;
BEGIN
  INSERT INTO public.whatsapp_eventos
    (cita_id, negocio_id, tipo, telefono, wamid, evento, error_code, error_titulo, detalle)
  VALUES
    (p_cita_id,
     (SELECT negocio_id FROM public.citas WHERE id = p_cita_id),
     p_tipo, p_telefono, p_wamid, p_evento, p_error_code, p_error_titulo, p_detalle);

  SELECT count(*) INTO v_fallos
  FROM public.whatsapp_eventos
  WHERE cita_id IS NOT DISTINCT FROM p_cita_id
    AND tipo IS NOT DISTINCT FROM p_tipo
    AND evento = 'fallo_envio';

  RETURN COALESCE(v_fallos, 0);
END;
$$;

-- Registrar un estado que manda Meta por webhook. Se engancha a la cita por el wamid del envío.
CREATE OR REPLACE FUNCTION public.registrar_estado_whatsapp(
  p_wamid text,
  p_evento text,
  p_telefono text DEFAULT NULL,
  p_error_code integer DEFAULT NULL,
  p_error_titulo text DEFAULT NULL,
  p_detalle jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cita_id uuid;
  v_negocio_id text;
  v_tipo text;
BEGIN
  SELECT cita_id, negocio_id, tipo
    INTO v_cita_id, v_negocio_id, v_tipo
  FROM public.whatsapp_eventos
  WHERE wamid = p_wamid AND evento = 'enviado'
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.whatsapp_eventos
    (cita_id, negocio_id, tipo, telefono, wamid, evento, error_code, error_titulo, detalle)
  VALUES
    (v_cita_id, v_negocio_id, v_tipo, p_telefono, p_wamid, p_evento, p_error_code, p_error_titulo, p_detalle);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_envio_whatsapp(uuid, text, text, text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_estado_whatsapp(text, text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
