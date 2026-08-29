-- 29 ago 2026. Tres cosas que quedaban de la auditoria.
--
-- 1. TREINTA Y TRES CLAVES FORANEAS SIN INDICE.
--    Postgres NO indexa el lado hijo de una FK. Cada vez que se borra (o se
--    actualiza la clave de) una fila padre, tiene que comprobar la tabla hija
--    ENTERA -- da igual que la accion sea CASCADE, SET NULL o RESTRICT: en los
--    tres casos hay un escaneo. Hoy las tablas estan casi vacias y no se nota;
--    con datos, borrar un lead o un perfil se vuelve un seq scan por cada hija.
--    Tambien las usan los joins normales del back-office.
--
-- 2. LOS PERMISOS SOBRANTES DE LAS TABLAS DE VIGILANCIA.
--    vigilancia_ejecuciones y vigilancia_hallazgos tienen RLS activa y CERO
--    politicas, que es la postura correcta (nadie entra por REST; se leen por
--    staff_vigilancia_resumen, que es definer). Pero conservan el GRANT a anon y
--    authenticated. Hoy no sirve de nada porque RLS lo tapa; el dia que alguien
--    anada una politica permisiva "para poder depurar", el grant ya esta puesto
--    y la tabla queda abierta. Se quita el grant: que la intencion sea explicita.
--
-- 3. VIGILANTE DE pg_net (comprobacion 11).
--    Todos los crons y triggers que llaman a edge functions usan net.http_post,
--    que es "dispara y olvida": cron.job_run_details dice "succeeded" en cuanto
--    la peticion se encola, mire lo que mire la respuesta. Y la respuesta vive en
--    net._http_response, que no lee nadie.
--    Medido el 28 ago 2026: de 31 respuestas en 24 h, 6 (19,4 %) tenian
--    status_code NULL -- ni llegaron -- y 4 mas eran errores HTTP. O sea que uno
--    de cada cinco latidos se perdia en silencio. Eso muerde justo donde importa:
--    aunque el cron de vigilar-agenda ya mire a toda la cartera, si un quinto de
--    sus disparos no llega, la vigilancia tiene agujeros y nada lo dice.

-- ── 1. Indices de las FK ────────────────────────────────────────────────────
create index if not exists idx_bonos_servicio_id                    on public.bonos (servicio_id);
create index if not exists idx_servicios_sugeridos_sugerido_id      on public.servicios_sugeridos (sugerido_id);
create index if not exists idx_cita_consumos_producto_id            on public.cita_consumos (producto_id);
create index if not exists idx_planes_ia_generado_por               on public.planes_ia (generado_por);
create index if not exists idx_n8n_webhook_config_cliente_id        on public.n8n_webhook_config (cliente_id);

create index if not exists idx_crm_leads_asignado_a                 on public.crm_leads (asignado_a);
create index if not exists idx_crm_leads_created_by                 on public.crm_leads (created_by);
create index if not exists idx_crm_actividades_lead_id              on public.crm_actividades (lead_id);
create index if not exists idx_crm_actividades_usuario_id           on public.crm_actividades (usuario_id);
create index if not exists idx_crm_email_templates_created_by       on public.crm_email_templates (created_by);
create index if not exists idx_crm_emails_lead_id                   on public.crm_emails (lead_id);
create index if not exists idx_crm_emails_remitente                 on public.crm_emails (remitente);
create index if not exists idx_crm_emails_template_id               on public.crm_emails (template_id);
create index if not exists idx_crm_n8n_runs_cliente_id              on public.crm_n8n_runs (cliente_id);
create index if not exists idx_crm_n8n_runs_disparado_por           on public.crm_n8n_runs (disparado_por);
create index if not exists idx_crm_n8n_runs_workflow_id             on public.crm_n8n_runs (workflow_id);
create index if not exists idx_crm_errores_resuelto_por             on public.crm_errores (resuelto_por);

create index if not exists idx_socios_profile_id                    on public.socios (profile_id);
create index if not exists idx_team_tareas_asignado_a               on public.team_tareas (asignado_a);
create index if not exists idx_team_tareas_cliente_id               on public.team_tareas (cliente_id);
create index if not exists idx_team_tareas_completada_por           on public.team_tareas (completada_por);
create index if not exists idx_team_tareas_creado_por               on public.team_tareas (creado_por);
create index if not exists idx_team_tareas_lead_id                  on public.team_tareas (lead_id);
create index if not exists idx_team_hilos_creado_por                on public.team_hilos (creado_por);
create index if not exists idx_team_mensajes_autor_id               on public.team_mensajes (autor_id);
create index if not exists idx_team_mensajes_hilo_uuid              on public.team_mensajes (hilo_uuid);
create index if not exists idx_team_notificaciones_user_id          on public.team_notificaciones (user_id);
create index if not exists idx_team_oauth_tokens_user_id            on public.team_oauth_tokens (user_id);
create index if not exists idx_team_invitaciones_invitado_por       on public.team_invitaciones (invitado_por);

create index if not exists idx_contratos_cliente_id                 on public.contratos (cliente_id);
create index if not exists idx_contratos_partner_socio_id           on public.contratos_partner (socio_id);
create index if not exists idx_contratos_firma_tokens_contrato      on public.contratos_firma_tokens (contrato_partner_id);
create index if not exists idx_facturas_partner_socio_id            on public.facturas_partner (socio_id);

-- ── 2. Permisos sobrantes ───────────────────────────────────────────────────
revoke all on table public.vigilancia_ejecuciones from anon, authenticated;
revoke all on table public.vigilancia_hallazgos   from anon, authenticated;
