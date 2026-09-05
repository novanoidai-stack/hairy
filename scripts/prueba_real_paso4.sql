-- Prueba real del paso 4 en produccion (commiteada; se borra la cita al final):
-- criterios 1, 2 y 3 de aceptacion del §9 del plan.

create temp table _informe (paso text, detalle text);

do $block$
declare
  v_cita uuid;
  v_ini timestamptz; v_fin timestamptz; v_fe timestamptz;
  v_ini2 timestamptz; v_fin2 timestamptz; v_fe2 timestamptz;
  v_r1_ini timestamptz; v_r1_fin timestamptz;
  v_r2_ini timestamptz; v_r2_fin timestamptz;
  v_huecos_en_r2 text;
  v_marca jsonb;
begin
  insert into public.citas (negocio_id, servicio_id, profesional_id, inicio, fin, estado, canal)
  values ('florent_surez_peluqueros_15004',
          '75c7c691-15b9-4f1d-8efe-bd630f82ca29',  -- Mechas Balayage (5 fases, 2 reposos)
          'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3',
          timezone('Europe/Madrid', '2026-09-08 12:30:00'),
          timezone('Europe/Madrid', '2026-09-08 14:40:00'),
          'confirmada', 'manual')
  returning id into v_cita;

  select jsonb_object_agg(orden, tipo || ' [' || inicio::time || ',' || fin::time || ')') into v_marca
    from public.cita_fases where cita_id = v_cita;

  insert into _informe values ('criterio1_cita_creada', 'cita=' || v_cita || ' fases=' || coalesce(v_marca::text, 'NINGUNA'));

  select inicio, fin into v_r1_ini, v_r1_fin
    from public.cita_fases where cita_id = v_cita and tipo = 'reposo' order by orden limit 1;
  select inicio, fin into v_r2_ini, v_r2_fin
    from public.cita_fases where cita_id = v_cita and tipo='reposo' and inicio > v_r1_fin;

  select inicio, fin, fin_espera into v_ini, v_fin, v_fe from public.citas where id = v_cita;

  -- CRITERIO 2: estirar el primer reposo +10 min moviendo solo la frontera
  -- (fin del reposo 1 e inicio de la fase que sigue).
  update public.cita_fases set fin = fin + interval '10 minutes'
   where cita_id = v_cita and tipo = 'reposo' and fin = v_r1_fin;
  update public.cita_fases set inicio = inicio + interval '10 minutes'
   where cita_id = v_cita and orden = (select min(orden) from public.cita_fases
                                       where cita_id = v_cita and orden > (select min(orden) from public.cita_fases
                                                                          where cita_id = v_cita and tipo = 'reposo'));

  select inicio, fin, fin_espera into v_ini2, v_fin2, v_fe2 from public.citas where id = v_cita;
  insert into _informe values ('criterio2_estirar',
    'inicio_estable=' || (v_ini = v_ini2) || ' fin_estable=' || (v_fin = v_fin2)
    || ' fe_sigue_al_reposo=' || (v_fe2 = v_fe + interval '10 minutes'));

  -- CRITERIO 3: disponibilidad publica dentro del SEGUNDO reposo
  select string_agg(slot::time || '', ',') into v_huecos_en_r2
    from public.disponibilidad_publica('florentsuarez', '7a62301f-55af-47c8-bae1-63fc939b0498'::uuid, '2026-09-08', 'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3'::uuid) h
    where slot >= v_r2_ini and slot + interval '15 minutes' <= v_r2_fin;

  insert into _informe values ('criterio3_disponibilidad',
    'reposo2=[' || v_r2_ini::time || ',' || v_r2_fin::time || ') huecos_15min_dentro=' || coalesce(v_huecos_en_r2, 'NINGUNO'));

  insert into _informe values ('huecos_del_dia',
    (select string_agg(slot::time || '', ',') from public.disponibilidad_publica('florentsuarez', '7a62301f-55af-47c8-bae1-63fc939b0498'::uuid, '2026-09-08', 'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3'::uuid) h));

  delete from public.citas where id = v_cita;
  insert into _informe values ('limpieza',
    'cita_borrada=' || (not exists (select 1 from public.citas where id = v_cita))
    || ' fases_restantes=' || (select count(*) from public.cita_fases where cita_id = v_cita));
end;
$block$;

select paso, detalle from _informe;
