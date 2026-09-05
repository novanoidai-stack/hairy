-- Paso 4, alcance real: la costura (marcas) libera el PRIMER reposo. El segundo
-- queda para el paso 5, que es cuando ventanas_activas_cita mira cita_fases.
create temp table _informe (paso text, detalle text);

do $block$
declare
  v_cita uuid;
  v_r1_ini timestamptz; v_r1_fin timestamptz;
begin
  insert into public.citas (negocio_id, servicio_id, profesional_id, inicio, fin, estado, canal)
  values ('florent_surez_peluqueros_15004',
          '75c7c691-15b9-4f1d-8efe-bd630f82ca29',
          'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3',
          timezone('Europe/Madrid', '2026-09-15 12:30:00'),
          timezone('Europe/Madrid', '2026-09-15 14:40:00'),
          'confirmada', 'manual')
  returning id into v_cita;

  select inicio, fin into v_r1_ini, v_r1_fin
    from public.cita_fases where cita_id = v_cita and tipo = 'reposo' order by orden limit 1;

  insert into _informe values ('reposo1',
    'reposo1=[' || to_char(v_r1_ini at time zone 'UTC', 'HH24:MI') || ',' || to_char(v_r1_fin at time zone 'UTC','HH24:MI') || ') UTC');

  insert into _informe values ('huecos_dentro_de_reposo1',
    coalesce((select string_agg(to_char(slot at time zone 'UTC','HH24:MI'), ',')
      from public.disponibilidad_publica('florentsuarez', '7a62301f-55af-47c8-bae1-63fc939b0498'::uuid, '2026-09-15', 'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3'::uuid) h
      where h.slot::timestamptz >= v_r1_ini and h.slot::timestamptz + interval '15 minutes' <= v_r1_fin), 'NINGUNO'));

  insert into _informe values ('huecos_dentro_de_reposo2',
    coalesce((select string_agg(to_char(slot at time zone 'UTC','HH24:MI'), ',')
      from public.disponibilidad_publica('florentsuarez', '7a62301f-55af-47c8-bae1-63fc939b0498'::uuid, '2026-09-15', 'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3'::uuid) h
      where h.slot::timestamptz >= v_r1_fin and h.slot::timestamptz < (select inicio from public.cita_fases where cita_id=v_cita and tipo='reposo' order by orden offset 1 limit 1)), 'NINGUNO (esperado: espera al paso 5)'));

  delete from public.citas where id = v_cita;
  insert into _informe values ('limpieza',
    'cita_borrada=' || (not exists (select 1 from public.citas where id = v_cita)));
end;
$block$;

select paso, detalle from _informe;
