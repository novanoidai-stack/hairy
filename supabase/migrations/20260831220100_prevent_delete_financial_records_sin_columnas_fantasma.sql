-- P4 del informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31: la mina de
-- prevent_delete_financial_records.
--
-- La funcion es compartida por cobros y cobro_lineas y se ramifica con
-- TG_TABLE_NAME: la rama de cobros lee OLD.cobro_id (que NO existe en cobros)
-- y la rama de lineas lee OLD.negocio_id (que NO existe en cobro_lineas). Hoy
-- no explota porque cada tabla ejecuta solo su rama, pero es la trampa exacta
-- del 30 ago: reordena el IF o renombra una tabla y borrar un cobro empieza a
-- fallar con 42703 sin que nadie haya tocado esa logica.
--
-- Se reescribe con la tecnica segura del repo (documentada en CLAUDE.md y ya
-- usada por 20260828230547): to_jsonb(old) ->> 'campo' devuelve null si la
-- columna no existe, en vez de reventar. Con eso sobra TG_TABLE_NAME y las dos
-- tablas comparten funcion sin ramas cruzadas.
--
-- Comportamiento conservado (documentado en archive/ migraciones legacy
-- demo-resembrar-con-cobros.sql y demo-resiembra-respeta-horario.sql):
--   - cobros: el negocio se lee de la propia fila.
--   - cobro_lineas: el negocio se lee saltando a su cobro (porque en el
--     cascade el cobro ya no existe cuando llega el delete).
--   - la demo (demo_salon_001) esta exenta: se re-siembra cada 2 h y su
--     "historico" no es real. El resto de cobros son inmutables
--     (Ley Antifraude 11/2021).

create or replace function public.prevent_delete_financial_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v         jsonb;
  v_negocio text;
begin
  v := to_jsonb(old);

  -- cobros tiene negocio_id en la fila; cobro_lineas no: salta a su cobro.
  v_negocio := v ->> 'negocio_id';
  if v_negocio is null and v ->> 'cobro_id' is not null then
    select c.negocio_id into v_negocio
      from public.cobros c
     where c.id = (v ->> 'cobro_id')::uuid;
  end if;

  if v_negocio = 'demo_salon_001' then
    return old;  -- la demo se re-siembra cada 2 h; su historico no es real
  end if;

  raise exception 'No se permite eliminar registros financieros del POS (Ley Antifraude 11/2021).';
end;
$$;

comment on function public.prevent_delete_financial_records() is
  'Impide borrar cobros y lineas de cobro (Ley Antifraude 11/2021). Lee la fila por to_jsonb(old) para no referenciar columnas que solo existen en una de las dos tablas (P4, 31 ago 2026). Exento: demo_salon_001, que se re-siembra por cron.';
