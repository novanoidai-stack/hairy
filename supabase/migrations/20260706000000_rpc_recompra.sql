-- Función para obtener clientes que toca que vuelvan (oportunidades de recompra)
-- Consideramos clientes con al menos 2 visitas y cuya última visita fue hace más de 45 días (o un margen determinado).

CREATE OR REPLACE FUNCTION rpc_clientes_toca_recompra(p_negocio_id uuid)
RETURNS TABLE (
  id uuid,
  nombre text,
  telefono text,
  email text,
  ultima_visita timestamp with time zone,
  visitas bigint,
  dias_desde_ultima_visita int,
  servicio_habitual text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    c.id,
    c.nombre,
    c.telefono,
    c.email,
    MAX(ci.inicio) as ultima_visita,
    COUNT(ci.id) as visitas,
    EXTRACT(DAY FROM (NOW() - MAX(ci.inicio)))::int as dias_desde_ultima_visita,
    (
       SELECT s.nombre 
       FROM citas ci_sub 
       JOIN servicios s ON s.id = ci_sub.servicio_id 
       WHERE ci_sub.cliente_id = c.id 
       GROUP BY s.nombre 
       ORDER BY count(ci_sub.id) DESC 
       LIMIT 1
    ) as servicio_habitual
  FROM clientes c
  JOIN citas ci ON ci.cliente_id = c.id
  WHERE c.negocio_id = p_negocio_id
    AND ci.estado IN ('confirmada', 'completada')
  GROUP BY c.id, c.nombre, c.telefono, c.email
  HAVING EXTRACT(DAY FROM (NOW() - MAX(ci.inicio))) >= 40 
     AND COUNT(ci.id) >= 2
  ORDER BY dias_desde_ultima_visita DESC;
$$;
