-- Aplicada en remoto: 20260817113xxx_rendimiento_indice_directorio_salones_externos
-- El listado publico de salones que aun no usan Mecha (salones_externos_publico)
-- filtra siempre por visible + sin reclamar y ordena por nombre. Sin indice eso
-- era un escaneo secuencial de la tabla entera mas una ordenacion completa para
-- devolver 12 filas. Hoy son 2.388 filas y el importador de OSM sigue anadiendo,
-- asi que el coste crece con el catalogo. Con este indice parcial el orden ya
-- viene dado y el LIMIT puede parar pronto.
--
-- Medido: la RPC pasa de 24,9 ms a 7,5 ms (en caliente).
--
-- NOTA: el filtro por ciudad NO necesita indice nuevo — ya existe
-- salones_externos_ciudad_idx sobre lower(ciudad) con el mismo WHERE parcial.
CREATE INDEX IF NOT EXISTS salones_externos_directorio_idx
  ON public.salones_externos (nombre)
  WHERE visible AND reclamado_por IS NULL;

ANALYZE public.salones_externos;
