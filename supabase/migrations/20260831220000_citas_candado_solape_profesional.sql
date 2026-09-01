-- P3 del informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31: el candado de verdad.
--
-- Hasta hoy el solape de citas (mismo profesional, mismo hueco) se vigilaba
-- como DATO (vigilancia_bd_invariantes, vector 1) porque habia 108 pares
-- historicos que un constraint duro habria reventado. El 1 sep 2026 los 77 de
-- la demo se limpiaron (20260901113000) y los 31 restantes (30 del salon real
-- + 1 de pruebas) se dejaron vivos con su aviso por decision de Carlos, asi
-- que el candado arranca con una FECHA DE CORTE y protege lo nuevo. Da igual
-- por que puerta entre un solape a partir de hoy (carrera del portal, drag de
-- la vista semanal, UPDATE a mano): la BD lo rechaza con 23P01, que
-- lib/errores.ts:183 ya traduce como "Ese horario se solapa con otra reserva".
--
-- La BD es el candado; la UI es la educacion (validacion previa amable).
--
-- Excluye:
--   estado = 'cancelada'  -> una cita cancelada no ocupa nada.
--   grupo_id is not null  -> las citas de GRUPO comparten profesional a proposito.
--   profesional_id null   -> sin profesional no hay a quien doblar.
--   inicio < 2026-09-01   -> FECHA DE CORTE (decision de Carlos, 1 sep 2026):
--     los 31 pares historicos vivos (30 del salon real florent_surez... --
--     25 citas anonimas del 08-ago, SUSANA, cobros a 0 -- y 1 de
--     salon_pruebas_mecha) se quedan COMO ESTAN con su aviso del vigilante,
--     porque es un salon real y no se quiere tocar su historico. El candado
--     protege todo lo que nazca o se mueva a partir de la fecha de corte.
--     Si algun dia se limpian, quitar el termino de la clausula WHERE (y solo
--     entonces la consulta del vigilante podra dar 0).

create extension if not exists btree_gist;

-- Guardia: si al aplicar esto hay solapes vivos NUEVOS (>= fecha de corte),
-- mejor fallar AQUI con un mensaje claro que dejar la migracion a medias en
-- un 23P01 criptico. Los historicos (< corte) estan exentos a proposito.
do $$
declare v_pares integer;
begin
  select count(*) into v_pares
  from public.citas a
  join public.citas b
    on a.profesional_id = b.profesional_id
   and a.id < b.id
   and a.estado <> 'cancelada' and b.estado <> 'cancelada'
   and a.grupo_id is null and b.grupo_id is null
   and a.inicio >= timestamptz '2026-09-01 00:00:00+02'
   and b.inicio >= timestamptz '2026-09-01 00:00:00+02'
   and tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin);

  if v_pares > 0 then
    raise exception 'Hay % pares de citas solapadas vivas NUEVAS (inicio >= 2026-09-01): el constraint no se puede crear. Limpiar primero (ver informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31, P3).', v_pares;
  end if;
end
$$;

alter table public.citas
  add constraint citas_solape_profesional_excl
  exclude using gist (
    profesional_id with =,
    tstzrange(inicio, fin) with &&
  )
  where (estado <> 'cancelada' and grupo_id is null and profesional_id is not null
         and inicio >= timestamptz '2026-09-01 00:00:00+02');

comment on constraint citas_solape_profesional_excl on public.citas is
  'Candado P3: un profesional no puede tener dos citas vivas (no canceladas, no grupo) solapadas en el tiempo. Cualquier puerta de escritura (portal, agenda, drag) recibe 23P01, ya traducido en lib/errores.ts. Fecha de corte 2026-09-01: los 31 pares historicos anteriores quedan exentos por decision de producto (salon real, no se toca) y los sigue vigilando vigilancia_bd_invariantes.';
