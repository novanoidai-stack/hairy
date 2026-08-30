-- La anonimizacion dejaba atras EXACTAMENTE el dato del art. 9 del RGPD.
--
-- `anonimizar_cliente` borraba fotos, conversaciones de IA y consentimientos, y
-- vaciaba `clientes.alergias` y `clientes.sensibilidades_cuero`. Pero no tocaba:
--
--   fichas_tecnicas_color   la ficha clinico-capilar entera: formula (jsonb),
--                           nivel_dano, porcentaje_canas, incidencias e
--                           incidencias_tags -- que es donde una estilista
--                           escribe "reaccion alergica, se suspendio el servicio".
--   notas_internas_cliente  texto libre sobre la clienta.
--   citas.notas             el mismo texto libre, por cita. El fixture del propio
--                           repo (lib/agenda/citasRealtime.test.ts) escribe ahi
--                           literalmente "alergia PPD".
--   citas.formula_*         la formula copiada en la cita.
--
-- Resultado: una clienta que ejercia el derecho de supresion quedaba anonimizada
-- en la ficha y con su historial de salud intacto, enlazado por cliente_id. El
-- dato de categoria especial sobrevivia justo a la operacion que existe para
-- borrarlo.
--
-- Por que se BORRA la ficha de color y no se anonimiza: una vez desligada de la
-- persona no tiene finalidad legitima ninguna (no es un registro fiscal, que si
-- hay que conservar y por eso la FILA de la cita se mantiene). Lo que se conserva
-- de la cita es su geometria y su vinculo con el cobro; lo que se va es el texto.
--
-- Ojo con los triggers de `citas` al leer esto: ninguno de los que hay se dispara
-- con este update. `trg_citas_normalizar_fases` y `trg_ojos_citas` van por
-- `UPDATE OF inicio, fin, fin_activa, fin_espera, ...` y `citas_audit_cambio_estado`
-- / `citas_sync_noshows` por `UPDATE OF estado`. Aqui no se toca ninguna de esas
-- columnas a proposito.
create or replace function public.anonimizar_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_negocio_id text;
  v_role text;
  v_fotos text[];
  v_pdfs text[];
  v_fichas int;
  v_notas int;
  v_citas int;
begin
  select negocio_id, role into v_negocio_id, v_role from profiles where id = auth.uid();
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario no valido');
  end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede anonimizar clientas');
  end if;

  if not exists (select 1 from clientes where id = p_cliente_id and negocio_id = v_negocio_id) then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  select coalesce(array_agg(storage_path), '{}'::text[]) into v_fotos
  from cliente_fotos
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and storage_path is not null;

  select coalesce(array_agg(pdf_path), '{}'::text[]) into v_pdfs
  from presupuestos
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and pdf_path is not null;

  delete from cliente_fotos where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  delete from conversaciones_ia where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  delete from consentimientos_cliente where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  -- Datos de salud (art. 9 RGPD). Lo que faltaba.
  delete from fichas_tecnicas_color where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  get diagnostics v_fichas = row_count;

  delete from notas_internas_cliente where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  get diagnostics v_notas = row_count;

  -- La cita se conserva (vinculo con el cobro, que es registro fiscal); su texto
  -- libre y su formula, no.
  update citas set
    notas = null,
    formula_producto = null,
    formula_tono = null,
    formula_tiempo_min = null,
    formula_resultado = null,
    formula_notas = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id
    and (notas is not null or formula_producto is not null or formula_tono is not null
         or formula_tiempo_min is not null or formula_resultado is not null
         or formula_notas is not null);
  get diagnostics v_citas = row_count;

  update lista_espera set nombre = 'Cliente anonimizado', telefono = null, nota = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  update resenas set autor_nombre = 'Anonimo', ip_origen = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  update presupuestos set contacto_nombre = 'Cliente anonimizado', contacto_telefono = null,
    contacto_email = null, pdf_path = null
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  update clientes set
    nombre = 'Cliente anonimizado',
    telefono = null, email = null, fecha_nacimiento = null,
    notas = null, alergias = null, bebida_preferida = null,
    sensibilidades_cuero = null, canal_preferido = null, idioma = null,
    bloqueo_motivo = null, etiquetas = '{}', updated_at = now()
  where id = p_cliente_id and negocio_id = v_negocio_id;

  return jsonb_build_object(
    'ok', true,
    'fotos_paths', to_jsonb(v_fotos),
    'pdf_paths', to_jsonb(v_pdfs),
    -- Se devuelve el recuento para que la UI pueda decir QUE se ha borrado: una
    -- supresion silenciosa no vale como prueba de que se atendio la solicitud.
    'fichas_color_borradas', v_fichas,
    'notas_internas_borradas', v_notas,
    'citas_limpiadas', v_citas
  );
end;
$function$;

comment on function public.anonimizar_cliente(uuid) is
  'Derecho de supresion (RGPD). Borra tambien los datos de salud: fichas_tecnicas_color, notas_internas_cliente y el texto libre/formula de citas. La FILA de la cita se conserva por su vinculo fiscal con el cobro.';
