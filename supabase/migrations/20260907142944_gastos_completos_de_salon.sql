-- GASTOS: los campos que de verdad usa un salon, y los que NO se ponen todavia.
--
-- Peticion 14 de Jose (6 sep 2026): "un apartado de gastos muy mejorado, es
-- decir, anadiendole muchos mas parametros, todo lo que necesite un salon de
-- peluquerias para agregar un gasto".
--
-- DE DONDE SE PARTIA: 8 columnas y 5 filas en toda la base de datos.
--   id, negocio_id, concepto, categoria, importe_cents, fecha, es_recurrente, created_at
-- Sin proveedor, sin metodo de pago, sin notas, sin a quien se le imputa. Y
-- cuatro categorias fijas (alquiler, suministros, producto, otros) que no
-- alcanzan ni para el mes de un salon pequeno: no habia donde poner una nomina,
-- un seguro, la gestoria ni una formacion.
--
-- ============================================================================
-- LO QUE NO SE ANADE, Y ES LA DECISION IMPORTANTE DE ESTA MIGRACION
-- ============================================================================
-- NO hay base imponible. NO hay IVA. NO hay numero de factura.
--
-- No es un olvido ni falta de tiempo. Un campo de IVA mal modelado es PEOR que
-- no tenerlo: hace que la pantalla parezca contabilidad, el salon se fia, y lo
-- que sale no vale para presentar nada. El CLAUDE.md ya lo dice de la caja
-- fiscal M-CJ -- "NO improvisar, requiere fiscalista" -- y esto es el mismo
-- terreno: IVA deducible, prorrata, criterio de caja y retenciones no se
-- deducen leyendo el codigo.
--
-- Entran cuando lo confirme Jose o un fiscalista. Mientras tanto el numero de
-- factura cabe en `notas`, que es honesto sobre lo que es: una nota.

-- ---------------------------------------------------------------------------
-- 1. Los campos nuevos
-- ---------------------------------------------------------------------------

alter table public.gastos
  add column if not exists proveedor      text,
  add column if not exists metodo_pago    text,
  add column if not exists notas          text,
  add column if not exists profesional_id uuid references public.profesionales(id) on delete set null;

comment on column public.gastos.proveedor is
  'A quien se le pago. Texto libre a proposito: un salon no mantiene un maestro de proveedores, y obligar a crearlos antes de apuntar un gasto es como se consigue que no se apunte ninguno.';
comment on column public.gastos.metodo_pago is
  'De donde salio el dinero. Sirve para cuadrar con el banco y con la caja; NO tiene efecto fiscal.';
comment on column public.gastos.notas is
  'Cualquier cosa que haga falta recordar. Aqui es donde va hoy el numero de factura: la columna fiscal de verdad NO existe todavia a proposito (ver el comentario de la tabla).';
comment on column public.gastos.profesional_id is
  'A quien se le imputa el gasto, si es de alguien en concreto (formacion, material de su puesto). Nullable: la mayoria de los gastos son del salon.';

-- Todas nullable a proposito: las 5 filas que ya existen siguen leyendose y
-- editandose sin tener que inventarles un proveedor.

alter table public.gastos drop constraint if exists gastos_metodo_pago_check;
alter table public.gastos
  add constraint gastos_metodo_pago_check
  check (metodo_pago is null or metodo_pago in ('efectivo','tarjeta','transferencia','domiciliado','otro'));

-- ---------------------------------------------------------------------------
-- 2. Categorias que cubren un salon de verdad
-- ---------------------------------------------------------------------------
-- Las cuatro de antes se conservan TODAS: hay filas usandolas y un CHECK mas
-- estrecho las habria roto. Las nueve nuevas son clasificacion, no fiscalidad --
-- sirven para que el desglose de Informes diga algo util, y nada mas.

alter table public.gastos drop constraint if exists gastos_categoria_check;
alter table public.gastos
  add constraint gastos_categoria_check
  check (categoria in (
    'alquiler','suministros','producto','otros',
    'personal','formacion','marketing','mantenimiento',
    'seguros','impuestos','software','gestoria','equipamiento'
  ));

comment on table public.gastos is
  'Gastos del salon. AVISO DELIBERADO (7 sep 2026): aqui NO hay base imponible, ni IVA, ni numero de factura. No es un olvido -- un campo de IVA mal modelado es peor que no tenerlo, porque parece contabilidad y no lo es, y la caja fiscal M-CJ del CLAUDE.md no se improvisa. Esas columnas entran cuando lo confirme un fiscalista. Mientras tanto, el numero de factura cabe en notas.';

-- ---------------------------------------------------------------------------
-- 3. La auditoria deja de nombrar columnas a mano
-- ---------------------------------------------------------------------------
-- EL AGUJERO, que es el motivo de que esto vaya en la misma migracion:
-- `gastos_registrar_cambio()` volcaba cuatro columnas escritas una a una
-- (concepto, categoria, importe_cents, fecha). En cuanto la tabla crece, todo lo
-- nuevo queda FUERA del rastro: se podria cambiar el proveedor o el metodo de
-- pago de un gasto ya registrado y la auditoria diria que no paso nada.
--
-- Es exactamente el mismo fallo que tuvo `cobros` con bizum_cents
-- (20260901183305): un guarda que enumera columnas se queda viejo solo, y en
-- silencio. Se arregla de raiz volcando la fila entera con to_jsonb, que no hay
-- que acordarse de actualizar nunca mas.

create or replace function public.gastos_registrar_cambio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_nombre text;
  v_fila   public.gastos := coalesce(NEW, OLD);
begin
  if v_uid is not null then
    select nombre into v_nombre from public.profiles where id = v_uid;
  end if;

  -- El rastro NO puede tumbar la operacion: si la auditoria falla, el gasto se
  -- guarda igual y queda un warning. Estaba asi antes y se conserva.
  begin
    insert into public.auditoria_registros (
      negocio_id, usuario_id, usuario_nombre, modulo, tipo_evento, detalles
    ) values (
      v_fila.negocio_id,
      v_uid,
      coalesce(v_nombre, 'Sistema'),
      'caja',
      case TG_OP when 'DELETE' then 'gasto_eliminado' else 'gasto_modificado' end,
      case TG_OP
        -- `gasto_id` se mantiene arriba del todo aunque to_jsonb ya traiga `id`:
        -- es la clave por la que busca la pantalla de Auditoria.
        when 'DELETE' then jsonb_build_object('gasto_id', OLD.id) || to_jsonb(OLD)
        else jsonb_build_object(
          'gasto_id', NEW.id,
          'antes',    to_jsonb(OLD),
          'despues',  to_jsonb(NEW))
      end
    );
  exception when others then
    raise warning 'auditoria gastos: no se registro % de % (%)', TG_OP, v_fila.id, sqlerrm;
  end;

  return null;
end;
$function$;

comment on function public.gastos_registrar_cambio() is
  'Traza de cambios y borrados de gastos. Desde el 7 sep 2026 vuelca la fila ENTERA con to_jsonb en vez de nombrar columnas una a una. La version anterior listaba concepto/categoria/importe_cents/fecha y nada mas: al anadir proveedor, metodo de pago o profesional, cambiarlos no habria dejado rastro y la auditoria habria dicho que no paso nada. Es el mismo agujero que tuvo cobros con bizum_cents (20260901183305): un guarda que nombra columnas a mano se queda viejo en cuanto la tabla crece, y en silencio.';

-- ---------------------------------------------------------------------------
-- 4. RLS: nada que tocar, comprobado
-- ---------------------------------------------------------------------------
-- Las cuatro politicas de `gastos` ya estan bien y no las toca esta migracion.
-- Se dejan escritas aqui porque el que venga detras se lo va a preguntar:
--   * Las cuatro atan al llamante -- `profiles.id = (select auth.uid())` con
--     role en (admin, owner) -- y filtran por negocio_id. Cumplen la regla del
--     parametro y la regla del sujeto (decision 4 del CLAUDE.md).
--   * Van con `(select auth.uid())`, o sea InitPlan: se evaluan una vez por
--     consulta y no una vez por fila (decision 6).
-- Las columnas nuevas heredan esas politicas sin cambios: la tenencia se decide
-- por negocio_id, que no se toca.

-- ENSAYO EN PRODUCCION dentro de un bloque que aborta (nada se guardo):
--   proveedor_antes=Proveedor A | proveedor_despues=Proveedor B
--   metodo_despues=tarjeta      | categorias_nuevas aceptadas=9
-- Con la version anterior del trigger, los tres primeros habrian salido como
-- "(NO REGISTRADO)".
