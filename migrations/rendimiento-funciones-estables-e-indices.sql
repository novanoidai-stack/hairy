-- Aplicada en remoto: 20260817112500_rendimiento_funciones_estables_e_indices
-- ============================================================================
-- RENDIMIENTO (1/2): volatilidad de los ayudantes de RLS + indices que faltan
--
-- Sintoma medido en pg_stat_user_tables: la tabla `staff` (3 filas) acumulaba
-- 24 MILLONES de seq scans y `citas` 456 M tuplas leidas por escaneo secuencial.
-- Causa: is_staff() / is_team_member() estaban declaradas VOLATILE. Postgres no
-- puede cachear una funcion volatil, asi que la ejecutaba UNA VEZ POR FILA en
-- cada politica RLS que la usa; y dentro cada llamada hacia otro seq scan de
-- `staff`, porque el unico indice esta sobre email tal cual y la funcion compara
-- lower(email). El resultado es cuadratico y no depende del tamano del negocio.
--
-- El cuerpo de las funciones no cambia: solo pasan a STABLE (que es lo correcto,
-- su resultado no varia dentro de una misma sentencia) y se les da un indice
-- que puedan usar.
-- ============================================================================

-- 1. Ayudantes de RLS: VOLATILE -> STABLE (mismo cuerpo, misma seguridad).
CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT exists (
    SELECT 1 FROM public.staff s
    WHERE lower(s.email) = lower(coalesce(
      auth.jwt() ->> 'email',
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    ))
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_team_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT exists (
    SELECT 1 FROM public.staff s
    WHERE lower(s.email) = lower(coalesce(
      auth.jwt() ->> 'email',
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    ))
  );
$function$;

-- 2. Indice que hace que is_staff() deje de escanear la tabla entera.
CREATE INDEX IF NOT EXISTS staff_email_lower_idx ON public.staff (lower(email));

-- 3. Indices duplicados: dos definiciones identicas del mismo indice cuestan el
--    doble en cada escritura y no aportan nada en lectura.
--    En bloqueos_profesional ademas sobra el de una sola columna: ya existe
--    idx_bloqueos_profesional_rango (profesional_id, inicio, fin), que sirve
--    igual para filtrar solo por profesional_id.
DROP INDEX IF EXISTS public.idx_bloqueos_profesional_profesional;
DROP INDEX IF EXISTS public.idx_bloqueos_profesional_profesional_id;
DROP INDEX IF EXISTS public.cobros_idempotency_key_uidx;

-- 4. Claves ajenas sin indice de cobertura. Sin esto, cada borrado o cambio de
--    clave en la tabla padre obliga a Postgres a escanear entera la tabla hija
--    para comprobar la restriccion, y los JOIN por esa columna tampoco tienen
--    por donde entrar.
CREATE INDEX IF NOT EXISTS chispa_acciones_usuario_id_idx ON public.chispa_acciones (usuario_id);
CREATE INDEX IF NOT EXISTS cita_addons_addon_id_idx ON public.cita_addons (addon_id);
CREATE INDEX IF NOT EXISTS cita_productos_producto_id_idx ON public.cita_productos (producto_id);
CREATE INDEX IF NOT EXISTS citas_variante_id_idx ON public.citas (variante_id);
CREATE INDEX IF NOT EXISTS citas_cobro_id_idx ON public.citas (cobro_id);
CREATE INDEX IF NOT EXISTS citas_creado_por_idx ON public.citas (creado_por);
CREATE INDEX IF NOT EXISTS citas_modificado_por_idx ON public.citas (modificado_por);
CREATE INDEX IF NOT EXISTS citas_presupuesto_id_idx ON public.citas (presupuesto_id);
CREATE INDEX IF NOT EXISTS citas_servicio_id_idx ON public.citas (servicio_id);
CREATE INDEX IF NOT EXISTS clientes_profesional_habitual_id_idx ON public.clientes (profesional_habitual_id);
CREATE INDEX IF NOT EXISTS clientes_nivel_fidelizacion_override_idx ON public.clientes (nivel_fidelizacion_override);
CREATE INDEX IF NOT EXISTS comisiones_profesional_id_idx ON public.comisiones (profesional_id);
CREATE INDEX IF NOT EXISTS conversaciones_ia_cita_id_idx ON public.conversaciones_ia (cita_id);
CREATE INDEX IF NOT EXISTS conversaciones_ia_cliente_id_idx ON public.conversaciones_ia (cliente_id);
CREATE INDEX IF NOT EXISTS facturas_factura_rectificada_id_idx ON public.facturas (factura_rectificada_id);
CREATE INDEX IF NOT EXISTS facturas_factura_anulada_id_idx ON public.facturas (factura_anulada_id);
CREATE INDEX IF NOT EXISTS fichajes_corrige_a_idx ON public.fichajes (corrige_a);
CREATE INDEX IF NOT EXISTS fichas_tecnicas_color_profesional_id_idx ON public.fichas_tecnicas_color (profesional_id);
CREATE INDEX IF NOT EXISTS fuga_clientas_avisos_recompensa_sugerida_id_idx ON public.fuga_clientas_avisos (recompensa_sugerida_id);
CREATE INDEX IF NOT EXISTS fuga_clientas_avisos_cliente_id_idx ON public.fuga_clientas_avisos (cliente_id);
CREATE INDEX IF NOT EXISTS grupo_familiar_miembros_cliente_id_idx ON public.grupo_familiar_miembros (cliente_id);
CREATE INDEX IF NOT EXISTS grupos_familiares_responsable_id_idx ON public.grupos_familiares (responsable_id);
CREATE INDEX IF NOT EXISTS inventario_modificado_por_idx ON public.inventario (modificado_por);
CREATE INDEX IF NOT EXISTS jornada_correcciones_fichaje_id_idx ON public.jornada_correcciones (fichaje_id);
CREATE INDEX IF NOT EXISTS jornada_correcciones_fichaje_nuevo_id_idx ON public.jornada_correcciones (fichaje_nuevo_id);
CREATE INDEX IF NOT EXISTS lista_espera_cliente_id_idx ON public.lista_espera (cliente_id);
CREATE INDEX IF NOT EXISTS lista_espera_profesional_id_idx ON public.lista_espera (profesional_id);
CREATE INDEX IF NOT EXISTS lista_espera_servicio_id_idx ON public.lista_espera (servicio_id);
CREATE INDEX IF NOT EXISTS movimientos_inventario_creado_por_idx ON public.movimientos_inventario (creado_por);
CREATE INDEX IF NOT EXISTS notas_internas_cliente_autor_id_idx ON public.notas_internas_cliente (autor_id);
CREATE INDEX IF NOT EXISTS pagos_cliente_id_idx ON public.pagos (cliente_id);
CREATE INDEX IF NOT EXISTS presupuesto_lineas_concepto_id_idx ON public.presupuesto_lineas (concepto_id);
CREATE INDEX IF NOT EXISTS presupuestos_cobro_id_idx ON public.presupuestos (cobro_id);
CREATE INDEX IF NOT EXISTS presupuestos_profesional_id_idx ON public.presupuestos (profesional_id);
CREATE INDEX IF NOT EXISTS presupuestos_cita_id_idx ON public.presupuestos (cita_id);
CREATE INDEX IF NOT EXISTS profesional_categorias_historial_profesional_id_idx ON public.profesional_categorias_historial (profesional_id);
CREATE INDEX IF NOT EXISTS professional_service_overrides_service_id_idx ON public.professional_service_overrides (service_id);
CREATE INDEX IF NOT EXISTS profiles_referido_por_idx ON public.profiles (referido_por);
CREATE INDEX IF NOT EXISTS recompensas_canjeadas_cita_id_idx ON public.recompensas_canjeadas (cita_id);
CREATE INDEX IF NOT EXISTS recompensas_canjeadas_cliente_id_idx ON public.recompensas_canjeadas (cliente_id);
CREATE INDEX IF NOT EXISTS resenas_cita_id_idx ON public.resenas (cita_id);
CREATE INDEX IF NOT EXISTS resenas_servicio_id_idx ON public.resenas (servicio_id);
CREATE INDEX IF NOT EXISTS resenas_profesional_id_idx ON public.resenas (profesional_id);
CREATE INDEX IF NOT EXISTS resenas_cliente_id_idx ON public.resenas (cliente_id);
CREATE INDEX IF NOT EXISTS service_variants_servicio_id_idx ON public.service_variants (servicio_id);
CREATE INDEX IF NOT EXISTS servicios_categoria_id_idx ON public.servicios (categoria_id);
CREATE INDEX IF NOT EXISTS servicios_combinables_servicio_destino_id_idx ON public.servicios_combinables (servicio_destino_id);

-- 5. servicios se consultaba SIEMPRE por negocio_id y solo tenia el unico
--    (negocio_id, nombre): 4 M de seq scans y 406 M de tuplas leidas.
CREATE INDEX IF NOT EXISTS servicios_negocio_id_idx ON public.servicios (negocio_id);

ANALYZE public.staff;
ANALYZE public.servicios;
ANALYZE public.citas;
ANALYZE public.profiles;
ANALYZE public.profesionales;
