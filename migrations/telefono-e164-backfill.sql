-- Backfill de datos: normaliza las columnas de telefono de personas a E.164.
-- Criterio (documentado en el spec): nacionales sueltos de 9 digitos -> asumir Espana (+34);
-- numeros ya internacionales (+/00) se respetan limpiando espacios/guiones; datos no
-- telefonicos (longitudes raras / texto) se dejan intactos. Cubre clientes y lista_espera.
-- El helper normalizar_telefono se endurece aqui con search_path='' (hygiene advisor).
-- Spec: docs/superpowers/specs/2026-06-22-telefono-internacional-design.md

create or replace function public.normalizar_telefono(p text)
returns text language sql immutable parallel safe
set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', ''), '');
$$;

update public.clientes
set telefono = case
    when telefono like '+%'  then '+' || regexp_replace(telefono, '\D', '', 'g')
    when telefono like '00%' then '+' || regexp_replace(regexp_replace(telefono, '\D', '', 'g'), '^00', '')
    when regexp_replace(telefono, '\D', '', 'g') ~ '^34[0-9]{9}$' then '+' || regexp_replace(telefono, '\D', '', 'g')
    when length(regexp_replace(telefono, '\D', '', 'g')) = 9 then '+34' || regexp_replace(telefono, '\D', '', 'g')
    else telefono
  end
where telefono is not null and btrim(telefono) <> '';

update public.lista_espera
set telefono = case
    when telefono like '+%'  then '+' || regexp_replace(telefono, '\D', '', 'g')
    when telefono like '00%' then '+' || regexp_replace(regexp_replace(telefono, '\D', '', 'g'), '^00', '')
    when regexp_replace(telefono, '\D', '', 'g') ~ '^34[0-9]{9}$' then '+' || regexp_replace(telefono, '\D', '', 'g')
    when length(regexp_replace(telefono, '\D', '', 'g')) = 9 then '+34' || regexp_replace(telefono, '\D', '', 'g')
    else telefono
  end
where telefono is not null and btrim(telefono) <> '';
