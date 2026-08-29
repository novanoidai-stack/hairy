import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vigilante, { copiaSinConvertir } from './horarios-convenio.mjs';

test('caza la copia sin convertir de negocio_horarios a horarios_profesional', () => {
  // Este es literalmente el bug que tenia scripts/seed-demo-salon.sql: la
  // disponibilidad de cada profesional en /r/demo iba corrida un dia.
  const sql = `
insert into horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
select p.id, nh.dia_semana, t.ini::time, t.fin::time, t.turno
from profesionales p
join negocio_horarios nh on nh.negocio_id = p.negocio_id;`;
  const c = copiaSinConvertir(sql);
  assert.equal(c.length, 1);
  assert.equal(c[0].destino, 'horarios_profesional');
  assert.equal(c[0].origen, 'negocio_horarios');
});

test('con la conversion puesta, no', () => {
  const sql = `
insert into horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
select p.id, ((nh.dia_semana + 1) % 7)::smallint, t.ini::time, t.fin::time, t.turno
from profesionales p
join negocio_horarios nh on nh.negocio_id = p.negocio_id;`;
  assert.deepEqual(copiaSinConvertir(sql), []);
});

test('tambien en el sentido contrario', () => {
  const sql = `
insert into negocio_horarios (negocio_id, dia_semana, apertura)
select h.negocio_id, h.dia_semana, '09:00'
from horarios_profesional h;`;
  const c = copiaSinConvertir(sql);
  assert.equal(c.length, 1);
  assert.equal(c[0].destino, 'negocio_horarios');
});

test('un insert que no lee de la otra tabla no es una copia', () => {
  const sql = `insert into horarios_profesional (profesional_id, dia_semana) values ('x', 1);`;
  assert.deepEqual(copiaSinConvertir(sql), []);
});

test('leer las dos tablas sin insertar tampoco', () => {
  const sql = `select * from negocio_horarios nh join horarios_profesional h on h.dia_semana = nh.dia_semana;`;
  // Es una comparacion, no una escritura: la vigila la capa 2, no esta.
  assert.deepEqual(copiaSinConvertir(sql), []);
});

test('hoy los scripts de siembra convierten bien', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('regresion: el seed de la demo sigue convirtiendo (dia + 1) % 7', () => {
  const sql = readFileSync('scripts/seed-demo-salon.sql', 'utf8');
  assert.match(
    sql,
    /\(\(nh\.dia_semana \+ 1\) % 7\)/,
    'el seed ha vuelto a copiar el dia sin convertir: /r/demo dara horarios corridos un dia',
  );
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'horarios-convenio');
  assert.equal(vigilante.ambito, 'seguridad');
});
