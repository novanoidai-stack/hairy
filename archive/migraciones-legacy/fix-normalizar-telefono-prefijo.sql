-- normalizar_telefono no normalizaba el prefijo del pais.
--
-- La funcion quitaba lo que no fueran digitos y el "00" de delante, y ya. Con
-- eso, el MISMO telefono daba dos resultados distintos:
--
--   '+34 611 22 33 44'  ->  '34611223344'
--   '611223344'         ->  '611223344'
--
-- Y esa comparacion es la que usan TODAS las pantallas publicas para saber que
-- una cita es tuya: ver tu cita, cancelarla, cambiarla, confirmar una oferta,
-- pagar. El resultado es el peor posible para un cliente final: guarda su
-- telefono el salon con el +34 (que es lo que produce el selector de pais del
-- formulario), la clienta teclea sus nueve digitos de siempre en el enlace que
-- le ha llegado, y el portal le contesta que esa cita no existe.
--
-- En la base de datos habia de las dos formas a la vez (26 con +34 y 3 pelados
-- cuando se escribio esto), asi que el fallo saltaba de verdad, no en teoria.
--
-- Se canoniza a numero nacional: fuera los no-digitos, fuera el 00 de delante y
-- fuera el 34 de España cuando lo que queda son los nueve digitos de un numero
-- español. Los numeros de otros paises se quedan como estan (no se les puede
-- quitar el prefijo sin saber cual es).
--
-- Al hacer que coincidan mas numeros, ademas, deja de crear clientas duplicadas
-- cada vez que la misma persona reserva escribiendo el telefono de otra forma.

create or replace function public.normalizar_telefono(p text)
returns text
language sql
immutable
as $$
  with limpio as (
    select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', ''), '') as t
  )
  select case
    -- España: 34 + nueve digitos -> los nueve digitos.
    when t ~ '^34[6-9][0-9]{8}$' then substring(t from 3)
    else t
  end
  from limpio;
$$;

notify pgrst, 'reload schema';
