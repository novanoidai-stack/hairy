import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { PENDIENTES, consultasQueIgnoranLosGlobales } from './addons-cargador.mjs';

test('caza la consulta que estaba copiada en los modales de cita', () => {
  // Literalmente lo que habia en NewCitaModal.web.tsx antes del 6 sep 2026.
  const codigo = `
    supabase
      .from("service_addons")
      .select("id, nombre, duracion_min, precio")
      .eq("servicio_id", selectedServicio)
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setAddonsDisponibles(data ?? []));`;
  const c = consultasQueIgnoranLosGlobales(codigo);
  assert.equal(c.length, 1);
  assert.match(c[0].fragmento, /service_addons/);
});

test('con .or(...servicio_id.is.null) no es un hallazgo', () => {
  const codigo = `
    await supabase
      .from('service_addons')
      .select(COLUMNAS)
      .eq('negocio_id', negocioId)
      .eq('servicio_id', servicioId)
      .or('servicio_id.eq.' + id + ',servicio_id.is.null');`;
  assert.deepEqual(consultasQueIgnoranLosGlobales(codigo), []);
});

test('con .is("servicio_id", null) tampoco', () => {
  const codigo = `
    await supabase.from('service_addons').select('*').eq('servicio_id', x).is('servicio_id', null);`;
  assert.deepEqual(consultasQueIgnoranLosGlobales(codigo), []);
});

test('una consulta que no filtra por servicio_id no es un hallazgo', () => {
  // Listar todos los add-ons del salon es legitimo: no deja fuera a nadie.
  const codigo = `
    await supabase.from('service_addons').select('*').eq('negocio_id', n).eq('activo', true);`;
  assert.deepEqual(consultasQueIgnoranLosGlobales(codigo), []);
});

test('cita_addons con join a service_addons NO es un cargador', () => {
  // Es otra cosa: los add-ons YA enganchados a una cita, filtrados por cita_id.
  // El plan de bloques daba esto por cuarto cargador y no lo es.
  const codigo = `
    await supabase
      .from('cita_addons')
      .select('service_addons(nombre, precio)')
      .in('cita_id', citaIds);`;
  assert.deepEqual(consultasQueIgnoranLosGlobales(codigo), []);
});

test('dos consultas rotas en el mismo fichero salen las dos', () => {
  const codigo = `
    const a = supabase.from('service_addons').select('*').eq('servicio_id', x);
    const b = supabase.from('service_addons').select('*').eq('servicio_id', y);`;
  assert.equal(consultasQueIgnoranLosGlobales(codigo).length, 2);
});

test('la linea que devuelve apunta al .from, que es donde se lee', () => {
  const codigo = ['', '', "supabase.from('service_addons').select('*').eq('servicio_id', x);"].join('\n');
  assert.equal(consultasQueIgnoranLosGlobales(codigo)[0].linea, 3);
});

test('el vigilante corre sobre el repo real y no revienta', async () => {
  // Ademas comprueba su propia ancla: si lib/datos/addons.ts desapareciera o
  // dejara de admitir el null, `ejecutar` lanzaria AnclaPerdida.
  const hallazgos = await vigilante.ejecutar();
  assert.ok(Array.isArray(hallazgos));
  for (const h of hallazgos) {
    assert.equal(h.ambito, 'coherencia');
    assert.ok(h.clave.startsWith('addons/'));
  }
});

test('la deuda conocida avisa y lo demas bloquea', async () => {
  const hallazgos = await vigilante.ejecutar();
  for (const h of hallazgos.filter((x) => x.clave.startsWith('addons/cargador-suelto-'))) {
    const esperado = PENDIENTES.has(h.fichero) ? 'aviso' : 'bloqueante';
    assert.equal(h.nivel, esperado, `${h.fichero} deberia ser ${esperado}`);
  }
});

test('hoy no hay ninguna exencion caducada', async () => {
  // Si esto falla es buena noticia: el bloque E ya cambio su llamada. Quita esa
  // linea de PENDIENTES en addons-cargador.mjs y este test vuelve a verde.
  const hallazgos = await vigilante.ejecutar();
  const caducadas = hallazgos.filter((h) => h.clave.startsWith('addons/exencion-caducada-'));
  assert.deepEqual(
    caducadas.map((h) => h.fichero),
    [],
  );
});
