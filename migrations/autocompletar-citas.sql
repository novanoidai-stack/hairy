-- Auto-completado de citas: si el salon NO usa cierre manual (config.completarManual != true,
-- que es el DEFAULT), las citas confirmadas que acaban de terminar pasan solas a 'completada'.
-- Ventana de 6h: solo citas recien terminadas (evita barrer el historico y soltar una rafaga de
-- peticiones de resena al activar el cron). El motor de notificaciones manda la resena igual que
-- cuando se completa a mano. Lo llama un workflow n8n dedicado cada ~15 min. service_role only.
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-06-21.

create or replace function public.autocompletar_citas()
 returns jsonb language sql security definer set search_path to 'public' as $function$
  with upd as (
    update public.citas c
      set estado = 'completada', modificado_at = now()
    where c.estado = 'confirmada'
      and c.fin < now()
      and c.fin > now() - interval '6 hours'
      and coalesce((select (nc.config->>'completarManual')::boolean
                    from public.negocio_config nc where nc.negocio_id = c.negocio_id), false) = false
    returning c.id
  )
  select jsonb_build_object('ok', true, 'completadas', coalesce(jsonb_agg(id), '[]'::jsonb)) from upd;
$function$;

revoke execute on function public.autocompletar_citas() from public, anon, authenticated;
grant execute on function public.autocompletar_citas() to service_role;
