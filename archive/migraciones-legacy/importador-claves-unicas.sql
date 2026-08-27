-- La Migracion Magica no importaba NADA, y fallaba en silencio.
--
-- components/config/TabMigracionMagica.tsx mete lo que extrae la IA con:
--
--   upsert(..., { onConflict: 'negocio_id,telefono' })   -- clientes
--   upsert(..., { onConflict: 'negocio_id,nombre'   })   -- servicios
--
-- ...pero esos indices unicos NO EXISTIAN. Postgres contesta 42P10 ("there is no
-- unique or exclusion constraint matching the ON CONFLICT specification") a cada
-- fila, la pantalla las mete todas en la lista de errores y el salon se queda
-- con cero clientes y cero servicios importados. Es decir: la funcion que sirve
-- para que un salon TRAIGA SUS DATOS de Booksy/Fresha el primer dia no traia
-- nada, y es de lo peor que puede fallar, porque falla justo al empezar.
--
-- Aqui se crean las claves que faltaban. De paso son la garantia que hacia falta
-- de todas formas: dos clientas con el mismo telefono en el mismo salon son la
-- misma clienta, y dos servicios con el mismo nombre son el mismo servicio.
--
-- OJO CON LOS INDICES PARCIALES: la primera version llevaba un
-- `where telefono is not null` y seguia fallando con 42P10. Postgres solo usa un
-- indice parcial para ON CONFLICT si la sentencia repite su WHERE, y eso el
-- cliente (PostgREST) no lo puede expresar. Van sin WHERE: los NULL no chocan
-- entre si, asi que las fichas sin telefono siguen conviviendo sin problema.
--
-- Comprobado tras aplicarlo: reinsertar la misma clienta la ACTUALIZA en vez de
-- fallar, dos fichas sin telefono conviven, y reinsertar un servicio actualiza
-- su precio.

-- Clientes: un telefono, una clienta (por salon).
create unique index if not exists clientes_negocio_telefono_uq
  on public.clientes (negocio_id, telefono);

-- Servicios y productos: un nombre, una cosa (por salon).
create unique index if not exists servicios_negocio_nombre_uq
  on public.servicios (negocio_id, nombre);

create unique index if not exists productos_negocio_nombre_uq
  on public.productos (negocio_id, nombre);
