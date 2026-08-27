-- Sesion 2 (capa IA "Chispa"): consentimiento por cliente al tratamiento por IA.
--
-- Modelo OPT-OUT para datos OPERATIVOS (nombre, telefono, historial de citas,
-- servicios, gasto): la base legal es la ejecucion del contrato + aviso de
-- privacidad, por lo que el valor por defecto es TRUE. El cliente puede
-- oponerse en cualquier momento -> se pone en FALSE.
--
-- Cuando consiente_ia = FALSE, la capa de IA (edge agenda-asistente) trata al
-- cliente como INEXISTENTE: queda excluido de todo el contexto ensamblado para
-- el LLM y de los resultados de las tools del asistente.
--
-- REGLA DURA DE SALUD (independiente de este flag): los datos de salud
-- (alergias, sensibilidades del cuero cabelludo, notas medicas) NUNCA viajan al
-- LLM. Se aplica en el edge por LISTA BLANCA de campos, no por lista negra.
--
-- Pendiente EXTERNO: visto bueno DPO/abogado del modelo de consentimiento
-- antes de clientes reales (ver informes/PLAN-IA-CHISPA.md, Sesion 10).
--
-- No crea tabla ni RPC nuevas: columna sobre una tabla ya multi-tenant
-- (negocio_id) y con RLS. No requiere grant a anon.

alter table public.clientes
  add column if not exists consiente_ia boolean not null default true;

comment on column public.clientes.consiente_ia is
  'RGPD: no-oposicion al tratamiento por la capa de IA (Chispa). FALSE = la IA excluye a este cliente de todo contexto/resultado de tools. Opt-out (default true) para datos operativos; salud SIEMPRE fuera del LLM (lista blanca en el edge). Pendiente visto bueno DPO.';
