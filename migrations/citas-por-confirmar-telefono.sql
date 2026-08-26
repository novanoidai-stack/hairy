-- =====================================================================
-- Mecha · Buscar las citas por confirmar de un telefono, sin saber el salon
-- =====================================================================
-- Complemento de `citas-confirmacion-por-whatsapp.sql`. Aquella dejo el backend
-- listo (`confirmar_cita_cliente`), pero al ir a engancharlo en n8n aparecio un
-- problema de fondo:
--
--   El motor manda los mensajes de TODOS los salones desde UN SOLO numero
--   (`WHATSAPP_PHONE_NUMBER_ID`), asi que todas las respuestas caen en el mismo
--   buzon -> el agente entrante -> que esta fijado a `p_slug: "demo"` en sus
--   ocho herramientas. Una clienta de un salon real que responda "si" seria
--   atendida por un agente que se cree del salon demo, y su `mis_citas` no
--   encontraria la cita.
--
-- Esta funcion es la via proporcionada para arreglarlo SIN reescribir el agente:
-- localiza la cita por TELEFONO, que es la identidad real de quien escribe, sin
-- necesidad de saber de que salon es. Asi la confirmacion funciona para todos
-- los salones tocando una sola herramienta nueva en vez de las ocho.
--
-- POR QUE ES SEGURO QUE CRUCE SALONES
--   Mismo modelo de confianza que `confirmar_cita_oferta`: la llave es el
--   telefono del titular. Solo la llama n8n con service_role -- NO se concede a
--   `anon` ni a `authenticated`, asi que ningun cliente puede preguntarle por el
--   telefono de otro. Devuelve unicamente lo que esa persona ya sabe: sus
--   propias citas y donde las tiene.
-- =====================================================================

create or replace function public.citas_por_confirmar_telefono(p_telefono text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'cita_id',     x.id,
    'salon',       x.salon,
    'servicio',    x.servicio,
    'profesional', x.profesional,
    'fecha',       to_char(x.inicio at time zone 'Europe/Madrid', 'DD/MM'),
    'hora',        to_char(x.inicio at time zone 'Europe/Madrid', 'HH24:MI')
  ) order by x.inicio), '[]'::jsonb)
  from (
    select c.id, c.inicio,
           coalesce(np.nombre_publico, '')  as salon,
           coalesce(s.nombre, '')           as servicio,
           coalesce(pr.nombre, '')          as profesional
    from public.citas c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.negocio_portal np on np.negocio_id = c.negocio_id
    left join public.servicios s       on s.id  = c.servicio_id
    left join public.profesionales pr  on pr.id = c.profesional_id
    -- El filtro por fecha va primero a proposito: acota la tabla antes de
    -- normalizar telefonos, que no puede usar indice.
    where c.inicio > now()
      and c.inicio < now() + interval '60 days'
      and coalesce(c.confirmada_cliente, false) = false
      and c.estado in ('pendiente', 'confirmada')
      -- Las que esperan senal no se confirman por mensaje: se confirman pagando.
      and not (coalesce(c.deposito_requerido, false) and not coalesce(c.deposito_pagado, false))
      and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono)
    order by c.inicio
    limit 5
  ) x;
$$;

comment on function public.citas_por_confirmar_telefono(text) is
  'Citas pendientes de confirmar de un telefono, sin filtrar por salon. La usa el agente de WhatsApp (service_role) para localizar la cita antes de llamar a confirmar_cita_cliente.';

-- Round 4: no nace ejecutable, y aqui importa mas que de costumbre porque cruza
-- salones. Solo service_role.
revoke all on function public.citas_por_confirmar_telefono(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
