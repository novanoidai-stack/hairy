-- Vigilancia de invariantes de DATOS EN REPOSO (1 nov vector: negocio, no esquema).
--
-- POR QUE EXISTE (30 ago 2026)
-- Todos los vigilantes de BD miraban el ESQUEMA (columnas, grants, RLS, triggers).
-- Ninguno miraba si los DATOS cuadran: solapes de agenda, bonos en negativo,
-- arqueos de caja que no suman. Son los fallos que no rompen nada visible y que
-- una clienta descubre con su dinero o su tiempo.
--
-- DECISION de diseno sobre la doble reserva: existe un EXCLUDE USING gist que
-- impidiria el solape en la base de datos, pero hoy hay 108 solapes historicos
-- (demo y datos de prueba) y las citas de GRUPO comparten profesional a proposito.
-- Un constraint duro romperia datos y producto. Se vigila como DATO: deuda
-- agregada por negocio en aviso; cuando los solapes reales sean cero y la
-- semantica de grupos este confirmada, se sube a constraint y este vector
-- sobra.
--
-- Todos los vectores devuelven filas (clave, nivel, ambito, titulo, detalle),
-- como vigilancia_bd_profunda(). Ambito 'coherencia': es el estado de los datos,
-- no del rendimiento ni de la seguridad.

CREATE OR REPLACE FUNCTION public.vigilancia_bd_invariantes()
RETURNS TABLE (clave text, nivel text, ambito text, titulo text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ---- VECTOR 1: citas solapadas del mismo profesional ----
  -- Excluye canceladas y grupos (compartir profesional es su razon de ser).
  -- Deuda historica: aviso agregado por negocio, no un hallazgo por solape.
  RETURN QUERY
  SELECT
    'bd-invariantes/agenda-solapada:' || s.negocio_id,
    'aviso',
    'coherencia',
    s.negocio_id || ': ' || s.pares || ' par(es) de citas solapadas del mismo profesional',
    'Hay ' || s.pares || ' pares de citas vivas que se solapan en el tiempo con el mismo profesional. '
    || 'La causa habitual es la carrera del portal (dos clientas eligen el mismo hueco a la vez) o '
    || 'migraciones a mano. El arreglo de fondo es un constraint de exclusion temporal (EXCLUDE USING '
    || 'gist) cuando el dato historico este limpio y las citas de grupo esten fuera de duda.'
  FROM (
    SELECT a.negocio_id, count(*) AS pares
    FROM public.citas a
    JOIN public.citas b
      ON a.profesional_id = b.profesional_id
     AND a.id < b.id
     AND a.estado <> 'cancelada' AND b.estado <> 'cancelada'
     AND a.grupo_id IS NULL AND b.grupo_id IS NULL
     AND tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin)
    GROUP BY a.negocio_id
  ) s;

  -- ---- VECTOR 2: bonos imposibles ----
  -- sesiones_disponibles < 0: se consumio mas de lo vendido. Dinero real.
  RETURN QUERY
  SELECT
    'bd-invariantes/bono-negativo:' || b.id::text,
    'bloqueante',
    'coherencia',
    'Bono con ' || b.sesiones_disponibles || ' sesiones disponibles (' || b.negocio_id || ')',
    'El bono ' || b.id || ' tiene sesiones_disponibles=' || b.sesiones_disponibles
    || ' sobre ' || b.sesiones_totales || ' vendidas. Se consumieron mas sesiones de las que habia: '
    || 'una clienta pago por sesiones que el sistema conto por debajo de cero. Hay que reconstruir '
    || 'el saldo desde bono_sesiones y auditar las consumiciones.'
  FROM public.bonos b
  WHERE b.sesiones_disponibles < 0;

  RETURN QUERY
  SELECT
    'bd-invariantes/bono-sobrado:' || b.id::text,
    'aviso',
    'coherencia',
    'Bono con mas disponibles (' || b.sesiones_disponibles || ') que vendidas (' || b.sesiones_totales || ')',
    'El bono ' || b.id || ' tiene mas sesiones disponibles que totales: alguien edito a mano o el '
    || 'regalo de sesiones no paso por la columna total. Inofensivo para la clienta, pero el dato '
    || 'no cuadra y los informes de bonos vendidos mienten.'
  FROM public.bonos b
  WHERE b.sesiones_disponibles > b.sesiones_totales;

  -- ---- VECTOR 3: arqueo de caja ----
  -- efectivo + datafono + online + bizum = total_cents (tolerancia 1 cent).
  -- OJO CON LA CONVENCION, verificada contra CobroSheet.tsx y contra los datos:
  -- total_cents YA INCLUYE la propina (el cliente calcula base + propina y el
  -- desglose suma ese total). El comentario de 20260830210025 que dice
  -- "= total + propina" esta equivocado: con esa formula, los 161 cobros
  -- historicos con propina darian descuadre cuando suman perfectamente.
  RETURN QUERY
  SELECT
    'bd-invariantes/caja-descuadrada:' || c.id::text,
    'bloqueante',
    'coherencia',
    'Cobro ' || c.id || ' descuadrado por ' ||
      abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
        + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
        - c.total_cents) || ' cent',
    'El cobro ' || c.id || ' (' || c.negocio_id || ') no cumple el invariante de caja: '
    || 'efectivo + datafono + online + bizum = total_cents (el total ya incluye la '
    || 'propina; tolerancia 1 cent). Un cobro que no suma malmete el arqueo del dia '
    || 'y la base imponible de VeriFactu.'
  FROM public.cobros c
  WHERE abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
          + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
          - c.total_cents) > 1;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.vigilancia_bd_invariantes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vigilancia_bd_invariantes() TO authenticated;

COMMENT ON FUNCTION public.vigilancia_bd_invariantes() IS
  'Invariantes de datos en reposo: solapes de agenda, saldos de bonos imposibles y arqueo de caja. El dinero y el tiempo de las clientas, no el esquema.';
