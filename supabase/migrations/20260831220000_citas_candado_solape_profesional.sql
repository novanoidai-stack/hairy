-- P3 del informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31: el candado de verdad.
--
-- Hasta hoy el solape de citas (mismo profesional, mismo hueco) se vigilaba
-- como DATO (vigilancia_bd_invariantes, vector 1) porque habia 108 pares
-- historicos que un constraint duro habria reventado. Esos 108 ya no existen:
-- los 77 de la demo se fueron con la re-siembra y los 30 del salon real se
-- limpiaron. Hoy la consulta del vigilante da 0, asi que se sube a constraint
-- y da igual por que puerta entre un solape (carrera del portal, drag de la
-- vista semanal, UPDATE a mano): la BD lo rechaza con 23P01, que
-- lib/errores.ts:183 ya traduce como "Ese horario se solapa con otra reserva".
--
-- La BD es el candado; la UI es la educacion (validacion previa amable).
--
-- Excluye:
--   estado = 'cancelada'  -> una cita cancelada no ocupa nada.
--   grupo_id is not null  -> las citas de GRUPO comparten profesional a proposito.
--   profesional_id null   -> sin profesional no hay a quien doblar.

create extension if not exists btree_gist;

-- Guardia: si al aplicar esto vuelve a haber solapes vivos, mejor fallar AQUI
-- con un mensaje claro que dejar la migracion a medias en un 23P01 criptico.
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
   and tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin);

  if v_pares > 0 then
    raise exception 'Hay % pares de citas solapadas vivas: el constraint no se puede crear. Limpiar primero (ver informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31, P3).', v_pares;
  end if;
end
$$;

alter table public.citas
  add constraint citas_solape_profesional_excl
  exclude using gist (
    profesional_id with =,
    tstzrange(inicio, fin) with &&
  )
  where (estado <> 'cancelada' and grupo_id is null and profesional_id is not null);

comment on constraint citas_solape_profesional_excl on public.citas is
  'Candado P3: un profesional no puede tener dos citas vivas (no canceladas, no grupo) solapadas en el tiempo. Cualquier puerta de escritura (portal, agenda, drag) recibe 23P01, ya traducido en lib/errores.ts.';
