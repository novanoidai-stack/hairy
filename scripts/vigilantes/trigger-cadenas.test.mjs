// Tests del vigilante de cadenas de triggers. Validan la logica pura
// (inventarioDesde / analizarInventario) con SQL sintetico, sin BD.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { inventarioDesde, analizarInventario } from './trigger-cadenas.mjs';

const FASES_VIEJAS = `
create function public.sync_citas_from_fases() returns trigger as $$
begin
  update public.citas set fin = greatest(new.fin, fin) where id = new.cita_id;
  return null;
end;
$$;

create trigger trg_sync_citas_from_fases
after insert on public.cita_fases
for each row execute function public.sync_citas_from_fases();

create trigger trg_seed_fases_from_cita
after insert on public.citas
for each row execute function public.seed_fases_from_cita();

create trigger trg_shift_fases_on_cita_move
after update on public.citas
for each row execute function public.shift_fases_on_cita_move();
`;

const FASES_NUEVAS = `
drop trigger if exists trg_sync_citas_from_fases on public.cita_fases;
drop function if exists public.sync_citas_from_fases();
`;

describe('inventarioDesde', () => {
  it('los DROP TRIGGER sacan el trigger del inventario (las migraciones son historia)', () => {
    const inv = inventarioDesde([['vieja.sql', FASES_VIEJAS], ['nueva.sql', FASES_NUEVAS]]);
    assert.equal(inv.triggers.has('trg_sync_citas_from_fases'), false);
    assert.equal(inv.triggers.has('trg_seed_fases_from_cita'), true);
  });

  it('la ultima definicion de una funcion gana', () => {
    const v1 = 'create function public.f() returns trigger as $$ begin null; end; $$;';
    const v2 = 'create or replace function public.f() returns trigger as $$ begin update public.citas set fin = fin; end; $$;';
    const inv = inventarioDesde([['a.sql', v1], ['b.sql', v2]]);
    assert.match(inv.funciones.get('f'), /update public\.citas/);
  });
});

describe('analizarInventario', () => {
  it('caza la cascada mutua INSERT<->UPDATE que destruyo los reposos', () => {
    const sql = `
create function public.seed_f() returns trigger as $$
begin
  update public.citas set fin_espera = new.fin_espera where id = new.id;
  return null;
end;
$$;
create trigger trg_seed after insert on public.citas
for each row execute function public.seed_f();

create function public.shift_f() returns trigger as $$
begin
  update public.citas set fin = new.fin where id = new.id;
  return null;
end;
$$;
create trigger trg_shift after update on public.citas
for each row execute function public.shift_f();
`;
    const inv = inventarioDesde([['x.sql', sql]]);
    const h = analizarInventario(inv);
    const cascada = h.find((x) => x.clave.includes('cascada-mutua'));
    assert.ok(cascada, 'deberia detectar la cascada mutua');
    assert.equal(cascada.nivel, 'bloqueante');
  });

  it('cascada con guardas que cortan la recursion queda en aviso', () => {
    const sql = `
create function public.seed_g() returns trigger as $$
begin
  if new.fin is not distinct from old.fin then return null; end if;
  update public.citas set notas = new.notas where id = new.id;
  return null;
end;
$$;
create trigger trg_seed_g after insert on public.citas
for each row execute function public.seed_g();

create function public.shift_g() returns trigger as $$
begin
  if exists (select 1 from public.citas where id = new.id and notas = new.notas) then return null; end if;
  update public.citas set notas = new.notas where id = new.id;
  return null;
end;
$$;
create trigger trg_shift_g after update on public.citas
for each row execute function public.shift_g();
`;
    const inv = inventarioDesde([['y.sql', sql]]);
    const h = analizarInventario(inv, 'y.sql');
    const cascada = h.find((x) => x.clave.includes('cascada-mutua'));
    assert.ok(cascada);
    assert.equal(cascada.nivel, 'aviso');
  });

  it('el diseno actual (fases como proyeccion, un solo sentido) no se flaggea', () => {
    // trg_seed (AFTER INSERT en citas) escribe en cita_fases, no en citas:
    // no hay bucle. Es la forma del arreglo del 30 ago 2026.
    const sql = `
create function public.sembrar(p_cita uuid) returns void as $$ begin delete from public.cita_fases where cita_id = p_cita; end; $$;
create function public.seed_fases() returns trigger as $$
begin
  perform public.sembrar(new.id);
  return null;
end;
$$;
create trigger trg_seed_fases after insert on public.citas
for each row execute function public.seed_fases();

create function public.resync_fases() returns trigger as $$
begin
  perform public.sembrar(new.id);
  update public.cita_fases f set iniciada_at = now() where f.cita_id = new.id;
  return null;
end;
$$;
create trigger trg_resync_fases after update on public.citas
for each row execute function public.resync_fases();
`;
    const inv = inventarioDesde([['z.sql', sql]]);
    const h = analizarInventario(inv, 'z.sql');
    assert.equal(h.length, 0);
  });
});
