-- El descuadre de caja necesitaba trinquete, no un bloqueante eterno.
--
-- El vector 3 de vigilancia_bd_invariantes() marcaba BLOQUEANTE todo cobro que
-- no cumpliera el invariante de caja. Daba 7, y los 7 eran irreparables:
--
--   * No se pueden ARREGLAR: cobros_prevent_financial_updates() prohibe tocar
--     los importes de un cobro registrado (Ley Antifraude 11/2021).
--   * No se pueden BORRAR: cobros_prevent_delete_trigger.
--
-- Un bloqueante sin accion posible tumba la CI para siempre, y eso es
-- exactamente como se consigue que se deje de mirar el panel (la leccion que ya
-- documenta la decision 10 del CLAUDE.md sobre la deuda heredada y el trinquete).
--
-- QUE ERAN ESOS 7, que es lo que hacia que valiera la pena mirarlos
--
-- No eran datos historicos sucios: los fabricaba `resembrar_demo()` a razon de
-- UNO AL DIA, siempre a las 20:00 UTC, del 24 al 31 de agosto. Metia la propina
-- dentro de `datafono_cents` pero no dentro de `total_cents`, asi que el cobro
-- no sumaba (total 1800, propina 200, datafono 2000). El generador se arreglo en
-- 20260831205630_resembrar_demo_cobro_con_propina_cuadrado.
--
-- EL TRINQUETE
--
-- Corte en el momento del arreglo del generador. Lo anterior es deuda congelada
-- y sale como aviso agregado por negocio; lo posterior bloquea, porque ya solo
-- puede venir de codigo nuevo. Y si el numero de historicos SUBE, el aviso lo
-- dice: significaria que alguien esta insertando cobros con fecha antigua.

CREATE OR REPLACE FUNCTION public.vigilancia_bd_invariantes()
RETURNS TABLE (clave text, nivel text, ambito text, titulo text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Momento en que se arreglo el generador de la demo (migracion
  -- 20260831205630_resembrar_demo_cobro_con_propina_cuadrado). Todo cobro
  -- anterior es deuda CONGELADA e irreparable; todo cobro posterior que no
  -- cuadre es una regresion de verdad.
  k_corte constant timestamptz := '2026-08-31 21:00:00+00';
BEGIN
  -- ---- VECTOR 1: citas solapadas del mismo profesional ----
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
  -- total_cents YA INCLUYE la propina.
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
    || 'y la base imponible de VeriFactu. Es POSTERIOR al arreglo del generador, '
    || 'asi que viene de codigo nuevo: mirar quien inserto ese cobro.'
  FROM public.cobros c
  WHERE c.created_at >= k_corte
    AND abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
          + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
          - c.total_cents) > 1;

  RETURN QUERY
  SELECT
    'bd-invariantes/caja-descuadrada-historica:' || s.negocio_id,
    'aviso',
    'coherencia',
    s.negocio_id || ': ' || s.n || ' cobro(s) descuadrado(s) anteriores al 31 ago 2026',
    'Hay ' || s.n || ' cobros que no cumplen el invariante de caja y son ANTERIORES al arreglo '
    || 'del generador de la demo (31 ago 2026). No se pueden corregir ni borrar: '
    || 'cobros_prevent_financial_updates lo impide (Ley Antifraude 11/2021), y esta bien que lo '
    || 'impida. Quedan como deuda congelada: el trinquete solo puede bajar. Si este numero SUBE, '
    || 'es que alguien ha insertado cobros con fecha antigua.'
  FROM (
    SELECT c.negocio_id, count(*) AS n
    FROM public.cobros c
    WHERE c.created_at < k_corte
      AND abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
            + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
            - c.total_cents) > 1
    GROUP BY c.negocio_id
  ) s;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.vigilancia_bd_invariantes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vigilancia_bd_invariantes() TO authenticated;

COMMENT ON FUNCTION public.vigilancia_bd_invariantes() IS
  'Invariantes de datos en reposo: solapes de agenda, saldos de bonos imposibles y arqueo de caja. El dinero y el tiempo de las clientas, no el esquema. El descuadre de caja lleva trinquete por fecha: lo anterior al 31 ago 2026 es deuda congelada e irreparable (los cobros son inmutables por ley), lo posterior bloquea.';
