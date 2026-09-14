import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { mapaDeIconos, nombresUsados, nombresSinRuta } from './iconos-inexistentes.mjs';

// Un mapa como los de verdad: `paths` con las rutas SVG dentro de comillas
// simples, que llevan `:` y llaves por todas partes.
const MAPA = `
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/>',
  };
  return <span dangerouslySetInnerHTML={{ __html: \`<svg>\${paths[name] || ''}</svg>\` }} />;
}
`;

test('lee las claves del mapa sin colarse dentro de las rutas SVG', () => {
  const { claves, encontrado } = mapaDeIconos(MAPA);
  assert.equal(encontrado, true);
  assert.deepEqual([...claves].sort(), ['clock', 'plus', 'x']);
});

test('un nombre que no esta en el mapa es un hallazgo', () => {
  // Exactamente el caso de caja.web.tsx el 9 sep 2026.
  const src = MAPA + `\n<Icon name="calendar" size={18} />`;
  const fuera = nombresSinRuta(src);
  assert.equal(fuera.length, 1);
  assert.equal(fuera[0].nombre, 'calendar');
});

test('un nombre que SI esta no es un hallazgo', () => {
  assert.deepEqual(nombresSinRuta(MAPA + `\n<Icon name="clock" />`), []);
});

test('coge los dos lados de un ternario en la prop name', () => {
  const src = MAPA + `\n<Icon name={abierto ? 'clock' : 'campana'} size={14} />`;
  const fuera = nombresSinRuta(src).map((f) => f.nombre);
  assert.deepEqual(fuera, ['campana']);
});

test('coge los iconos declarados en arrays de configuracion', () => {
  // Asi se colo el de clientes.web.tsx: no era un <Icon>, era { icon: 'copy' }
  // dentro de la lista de acciones del menu.
  const src = MAPA + `\nconst acciones = [{ l: 'Fusionar', icon: 'copy' }];`;
  assert.deepEqual(nombresSinRuta(src).map((f) => f.nombre), ['copy']);
});

test('apunta la linea donde se pide el icono', () => {
  const src = MAPA + `\n\n<Icon name="calendar" />`;
  const [f] = nombresSinRuta(src);
  assert.equal(src.split('\n')[f.linea - 1].includes('calendar'), true);
});

test('varios nombres rotos en el mismo fichero salen todos', () => {
  const src = MAPA + `\n<Icon name="uno" />\n<Icon name="dos" />`;
  assert.deepEqual(nombresSinRuta(src).map((f) => f.nombre).sort(), ['dos', 'uno']);
});

test('tambien entiende el mapa escrito como `icons` y como `ICONS`', () => {
  for (const nombreVar of ['icons', 'ICONS']) {
    const src = `const ${nombreVar} = { search: '<circle/>' };\n<Icon name="filtro" />`;
    assert.deepEqual(nombresSinRuta(src).map((f) => f.nombre), ['filtro'], nombreVar);
  }
});

test('el mismo nombre pedido dos veces no se cuenta dos veces por linea', () => {
  const src = MAPA + `\n<Icon name="calendar" /><Icon name="calendar" />`;
  assert.equal(nombresSinRuta(src).length, 1);
});

test('nombresUsados devuelve las lineas de cada nombre', () => {
  const usos = nombresUsados(`<Icon name="a" />\n<Icon name="b" />\n<Icon name="a" />`);
  assert.deepEqual(usos.get('a'), [1, 3]);
  assert.deepEqual(usos.get('b'), [2]);
});

// CONTROL POSITIVO del propio test: si `mapaDeIconos` dejara de leer nada,
// TODOS los nombres saldrian como rotos y los tests de arriba que esperan cero
// hallazgos fallarian. Este lo dice explicito, que es mas facil de diagnosticar.
test('sin mapa reconocible, `encontrado` es false y no se finge que esta limpio', () => {
  const { claves, encontrado } = mapaDeIconos('const rutasDeIcono = { a: 1 };');
  assert.equal(encontrado, false);
  assert.equal(claves.size, 0);
});

test('el vigilante declara su contrato', () => {
  assert.equal(vigilante.nombre, 'iconos-inexistentes');
  assert.equal(vigilante.necesitaRed, false);
  assert.equal(typeof vigilante.ejecutar, 'function');
  assert.ok(vigilante.descripcion.length > 20);
});

test('sobre el arbol real no quedan iconos sin ruta', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(
    hallazgos.map((h) => `${h.fichero}:${h.linea}`),
    [],
    'Hay <Icon name="..."> pidiendo nombres que su pantalla no tiene: pintan un hueco.',
  );
});
