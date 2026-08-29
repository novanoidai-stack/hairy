import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, {
  analizarMigracion,
  cuerposDeFuncion,
  nombresRevocados,
  sinComentarios,
  HEREDADO,
} from './migraciones.mjs';

const claves = (sql, revocadas) =>
  analizarMigracion('x.sql', sql, revocadas).map((h) => h.clave.replace('migraciones/', ''));

// --- utilidades --------------------------------------------------------------

test('los comentarios no cuentan, pero las lineas no se mueven', () => {
  const sql = 'select 1;\n-- create policy "p" on t for insert with check (true);\nselect 2;';
  const limpio = sinComentarios(sql);
  assert.equal(limpio.split('\n').length, 3);
  assert.equal(analizarMigracion('x.sql', sql).length, 0);
});

test('encuentra el cuerpo de una funcion y su firma', () => {
  const fns = cuerposDeFuncion(`
create or replace function public.foo(p_negocio_id text)
returns void language plpgsql security definer as $$
begin
  perform 1;
end;
$$;`);
  assert.equal(fns.length, 1);
  assert.equal(fns[0].nombre, 'public.foo');
  assert.match(fns[0].argumentos, /p_negocio_id/);
  assert.match(fns[0].cuerpo, /perform 1/);
});

test('lee los nombres revocados, tambien los del array del bucle', () => {
  const n = nombresRevocados(`
revoke execute on function public.uno(text) from anon, authenticated;
do $$ declare v_nombres text[] := array['dos','tres']; begin end $$;
`);
  assert.deepEqual([...n].sort(), ['dos', 'tres', 'uno']);
});

// --- 1. tabla sin RLS --------------------------------------------------------

test('una tabla nueva sin RLS es bloqueante', () => {
  assert.deepEqual(claves('create table public.notas (id uuid);'), ['tabla-sin-rls-notas']);
});

test('con su enable row level security, no', () => {
  assert.deepEqual(
    claves('create table public.notas (id uuid);\nalter table public.notas enable row level security;'),
    [],
  );
});

// --- 2. politica de escritura abierta ---------------------------------------

test('una politica de escritura con check (true) es bloqueante', () => {
  assert.deepEqual(
    claves('create policy "p" on t for insert to authenticated with check (true);'),
    ['politica-abierta-p'],
  );
});

test('una de solo lectura con using (true) no lo es', () => {
  // Un catalogo publico legible por todos es una decision legitima; lo que
  // prohibe la decision 4 es ESCRIBIR sin filtro.
  assert.deepEqual(claves('create policy "p" on t for select using (true);'), []);
});

test('una politica de escritura atada al negocio no lo es', () => {
  assert.deepEqual(
    claves(
      'create policy "p" on t for insert with check (negocio_id = (select my_negocio_id_text()));',
    ),
    [],
  );
});

// --- 3. la regla del parametro ----------------------------------------------

const definer = (cuerpo, args = 'p_negocio_id text') => `
create or replace function public.tocar(${args})
returns void language plpgsql security definer as $$
begin
${cuerpo}
end;
$$;`;

test('definer que recibe negocio_id y se fia de el', () => {
  assert.deepEqual(claves(definer('  update t set x = 1 where negocio_id = p_negocio_id;')), [
    'parametro-sin-atar-public.tocar',
  ]);
});

test('con exige_mi_negocio, no', () => {
  assert.deepEqual(claves(definer('  perform public.exige_mi_negocio(p_negocio_id, true);')), []);
});

test('con auth.uid() tambien vale', () => {
  assert.deepEqual(claves(definer('  select 1 from profiles where id = auth.uid();')), []);
});

test('otros ids de los que se deduce el negocio cuentan igual', () => {
  for (const arg of ['p_cliente_id uuid', 'p_cobro_id uuid', 'p_factura_id uuid']) {
    assert.deepEqual(
      claves(definer('  update t set x = 1;', arg)),
      ['parametro-sin-atar-public.tocar'],
      `deberia marcar ${arg}`,
    );
  }
});

test('un definer sin id de negocio no se mira', () => {
  assert.deepEqual(claves(definer('  update t set x = 1;', 'p_texto text')), []);
});

test('security invoker no se mira: ahi manda RLS', () => {
  assert.deepEqual(
    claves(`
create or replace function public.tocar(p_negocio_id text)
returns void language plpgsql as $$
begin
  update t set x = 1;
end;
$$;`),
    [],
  );
});

test('defensa valida 2: revocada de anon y authenticated', () => {
  const sql = definer('  update t set x = 1;');
  assert.deepEqual(claves(sql, new Set(['tocar'])), []);
});

test('defensa valida 3: el portal deriva el negocio del slug y exige un secreto', () => {
  // cita_publica y familia: anonimas a proposito, no pueden usar auth.uid().
  const sql = `
create or replace function public.cita_publica(p_slug text, p_cita_id uuid, p_telefono text)
returns jsonb language plpgsql security definer as $$
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug;
  select 1 from citas c join clientes cl on cl.id = c.cliente_id
   where c.id = p_cita_id and cl.telefono = trim(p_telefono);
end;
$$;`;
  assert.deepEqual(claves(sql), []);
});

test('pero el portal sin secreto sigue siendo un hallazgo', () => {
  const sql = `
create or replace function public.fuga(p_slug text, p_cita_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug;
  select 1 from citas where id = p_cita_id;
end;
$$;`;
  assert.deepEqual(claves(sql), ['parametro-sin-atar-public.fuga']);
});

// --- 4. grant a anon sin motivo ---------------------------------------------

test('abrir a anon sin comentario encima es bloqueante', () => {
  assert.deepEqual(claves('grant execute on function public.foo(text) to anon;'), [
    'grant-anon-sin-motivo-public.foo',
  ]);
});

test('con un comentario que lo explique, no', () => {
  assert.deepEqual(
    claves('-- Publica: la usa el portal de reserva, con limites por IP.\ngrant execute on function public.foo(text) to anon;'),
    [],
  );
});

test('un grant a authenticated no necesita justificarse', () => {
  assert.deepEqual(claves('grant execute on function public.foo(text) to authenticated;'), []);
});

// --- 5. exec_sql -------------------------------------------------------------

test('una funcion tipo exec_sql es bloqueante', () => {
  assert.deepEqual(claves('create function public.exec_sql(q text) returns void as $$ begin end $$;'), [
    'exec-sql-exec_sql',
  ]);
});

// --- el estado de hoy --------------------------------------------------------

test('hoy las migraciones activas estan limpias', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('la linea base heredada es la que se congelo el 29 ago 2026', () => {
  assert.deepEqual([...HEREDADO].sort(), [
    'migraciones/parametro-sin-atar-rpc_clientes_toca_recompra',
    'migraciones/politica-abierta-Service',
  ]);
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'migraciones');
  assert.equal(vigilante.ambito, 'seguridad');
});
