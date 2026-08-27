-- migrations/fiscal-a6-test-cadena.sql
-- Script de prueba unitaria/integracion para la cadena completa (A0-A5).
-- Ejecutar en un entorno de desarrollo para validar la maquina de estados e inmutabilidad.
begin;
do $$
declare
  c_id1 uuid; c_id2 uuid; c_id3 uuid;
  f_id1 uuid; f_id2 uuid; f_id3 uuid; a_id2 uuid;
  h1 text; h2 text; h3 text; ha2 text;
  n1 int; n2 int; n3 int;
begin
  -- 1. Setup Negocio
  select public.upsert_config_fiscal('test_chain', '11111111A', 'Test Chain SL', null, 'general', 21, 'comun', 'A', 'verifactu', true, null) into c_id1;
  insert into public.cobros (negocio_id, total_cents, metodo, estado) values
    ('test_chain', 1210, 'efectivo', 'completado'),
    ('test_chain', 2420, 'tarjeta', 'completado'),
    ('test_chain', 3630, 'bizum', 'completado');

  -- 2. Factura 1
  select id into c_id1 from public.cobros where negocio_id='test_chain' and total_cents=1210 limit 1;
  f_id1 := public.crear_factura_borrador(c_id1);
  select huella, numero into h1, n1 from public.generar_registro_alta(f_id1);

  -- 3. Factura 2
  select id into c_id2 from public.cobros where negocio_id='test_chain' and total_cents=2420 limit 1;
  f_id2 := public.crear_factura_borrador(c_id2);
  select huella, numero into h2, n2 from public.generar_registro_alta(f_id2);

  -- 4. Anular Factura 2
  a_id2 := public.generar_registro_anulacion(f_id2);
  select huella_anterior into ha2 from public.facturas where id=a_id2;

  -- 5. Factura 3
  select id into c_id3 from public.cobros where negocio_id='test_chain' and total_cents=3630 limit 1;
  f_id3 := public.crear_factura_borrador(c_id3);
  select huella, numero into h3, n3 from public.generar_registro_alta(f_id3);

  -- 6. Verificaciones
  if n1 <> 1 then raise exception 'Error num 1'; end if;
  if n2 <> 2 then raise exception 'Error num 2'; end if;
  if n3 <> 3 then raise exception 'Error num 3'; end if;

  if (select huella_anterior from public.facturas where id=f_id2) <> h1 then
    raise exception 'Cadena rota F1 -> F2'; end if;
  if ha2 <> h2 then
    raise exception 'Cadena rota F2 -> A2'; end if;
  if (select huella_anterior from public.facturas where id=f_id3) <> (select huella from public.facturas where id=a_id2) then
    raise exception 'Cadena rota A2 -> F3'; end if;

  raise notice 'TEST CADENA COMPLETADO CON EXITO';
end;
$$;
rollback;
