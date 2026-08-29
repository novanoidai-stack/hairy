import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { revisarFuente, comparar, medir, TIPOS } from './errores-tragados.mjs';

const tipos = (codigo) =>
  revisarFuente('app/prueba.web.tsx', codigo)
    .hallazgos.map((h) => h.tipo)
    .sort();

// --- El estado real del repo ------------------------------------------------

test('el repo esta exactamente en su linea base', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

// El ancla de este vigilante es "he visto handlers". Si un dia mira cero, es que
// se ha quedado ciego y `ejecutar()` lanza AnclaPerdida. Aqui solo se comprueba
// que sigue viendo una cantidad de handlers propia de este repo: si cayera a un
// puñado, algo se ha movido de sitio aunque no llegue a cero.
test('sigue viendo los handlers del software', async () => {
  const { handlers } = await medir();
  assert.ok(handlers > 500, `solo ha visto ${handlers} handlers: el vigilante esta medio ciego`);
});

// --- Las tres formas del bug ------------------------------------------------

test('caza el fuego-y-olvido sobre una funcion que puede rechazar', () => {
  const codigo = `
    const guardar = async () => { await fetch('/x'); };
    export const P = () => <button onClick={() => { guardar(); }} />;
  `;
  assert.deepEqual(tipos(codigo), ['fuego-y-olvido']);
});

test('caza el handler async que espera algo sin try/catch', () => {
  const codigo = `export const P = () => <button onClick={async () => { await fetch('/x'); }} />;`;
  assert.deepEqual(tipos(codigo), ['handler-async-sin-catch']);
});

test('caza la consulta a supabase cuyo error no mira nadie', () => {
  const codigo = `
    export const P = () => (
      <button onClick={async () => { await supabase.from('citas').delete().eq('id', 1); }} />
    );
  `;
  assert.deepEqual(tipos(codigo), ['supabase-sin-comprobar']);
});

test('la mira tambien dentro de la funcion local que llama el boton', () => {
  const codigo = `
    const aprobar = async (id) => { await supabase.from('x').update({ a: 1 }).eq('id', id); };
    export const P = () => <button onClick={() => aprobar(1)} />;
  `;
  assert.deepEqual(tipos(codigo), ['supabase-sin-comprobar']);
});

test('el hallazgo apunta a la linea del problema, no a la del boton', () => {
  const codigo = [
    `const guardar = async () => { await fetch('/x'); };`,
    `export const P = () => (`,
    `  <button`,
    `    onClick={() => { guardar(); }}`,
    `  />`,
    `);`,
  ].join('\n');
  const [h] = revisarFuente('app/prueba.web.tsx', codigo).hallazgos;
  assert.equal(h.linea, 4);
});

// --- Lo que NO se toca ------------------------------------------------------

test('una funcion que se guarda a si misma puede llamarse a fuego y olvido', () => {
  const codigo = `
    const guardar = async () => {
      try { await fetch('/x'); } catch (e) { setError(mensajeDeError(e)); }
    };
    export const P = () => <button onClick={() => { guardar(); }} />;
  `;
  assert.deepEqual(tipos(codigo), []);
});

test('un .catch() encadenado basta', () => {
  const codigo = `
    const guardar = async () => { await fetch('/x'); };
    export const P = () => <button onClick={() => { guardar().catch(avisar); }} />;
  `;
  assert.deepEqual(tipos(codigo), []);
});

test('mirar el error de supabase es exactamente lo que hay que hacer', () => {
  const codigo = `
    export const P = () => (
      <button onClick={async () => {
        const { error } = await supabase.from('clientes').delete().eq('id', 1);
        if (error) alert('No se pudo eliminar al cliente.');
      }} />
    );
  `;
  assert.deepEqual(tipos(codigo), []);
});

// Los dos falsos positivos encontrados al estrenarlo. Estan aqui para que no
// vuelvan: los dos venian de suponer que un `await` cualquiera puede lanzar.

test('regresion: supabase no rechaza, asi que esperarla no vuelve peligrosa a quien la llama', () => {
  // La forma de eliminarClienteDirecto en clientes.web.tsx: mira el error y
  // avisa. El primer diseño lo marcaba por tener await fuera de try/catch.
  const codigo = `
    const cargar = async () => { await supabase.from('clientes').select('id'); };
    const eliminar = async (c) => {
      const { error } = await supabase.from('clientes').delete().eq('id', c.id);
      if (error) alert('No se pudo eliminar al cliente.');
      else await cargar();
    };
    export const P = ({ c }) => <button onClick={() => eliminar(c)} />;
  `;
  assert.deepEqual(tipos(codigo), []);
});

test('el barrido llega al handler y a lo que llama, no mas hondo', () => {
  // Limite deliberado: `cargar()` esta a dos saltos del boton. Se vera cuando
  // algun boton la llame directamente -- y en clientes.web.tsx lo hacen varios.
  // Ir mas hondo acaba señalando codigo que el boton solo toca de refilon.
  const codigo = `
    const cargar = async () => { await supabase.from('clientes').select('id'); };
    const eliminar = async () => { await cargar(); };
    export const P = () => <button onClick={() => eliminar()} />;
  `;
  assert.deepEqual(tipos(codigo), []);

  const directo = `
    const cargar = async () => { await supabase.from('clientes').select('id'); };
    export const P = () => <button onClick={() => cargar()} />;
  `;
  assert.deepEqual(tipos(directo), ['supabase-sin-comprobar']);
});

test('regresion: useCallback tambien declara una funcion local', () => {
  // La forma de SugerenciasServicios.web.tsx. Sin desenvolver useCallback,
  // `await cargar()` parecia una llamada desconocida y marcaba a alternar().
  const codigo = `
    const cargar = useCallback(async () => {
      const { error } = await supabase.from('x').select('id');
      if (error) setError(error.message);
    }, []);
    const alternar = async (f) => {
      const { error } = await supabase.from('x').update({ a: !f.a }).eq('id', f.id);
      if (error) setError(error.message);
      else await cargar();
    };
    export const P = ({ f }) => <button onClick={() => alternar(f)} />;
  `;
  assert.deepEqual(tipos(codigo), []);
});

test('un handler sincrono y corriente no es un hallazgo', () => {
  const codigo = `export const P = () => <button onClick={() => setAbierto(true)} />;`;
  assert.deepEqual(tipos(codigo), []);
});

test('la recursion mutua no cuelga ni inventa hallazgos', () => {
  const codigo = `
    const a = async () => { await b(); };
    const b = async () => { await a(); };
    export const P = () => <button onClick={() => { a(); }} />;
  `;
  assert.deepEqual(tipos(codigo), []);
});

// --- El trinquete -----------------------------------------------------------

test('solo grita cuando sube, y pide bajar la base cuando baja', () => {
  const base = { 'app/x.tsx': { 'fuego-y-olvido': 2 } };

  assert.deepEqual(comparar(base, { 'app/x.tsx': { 'fuego-y-olvido': 2 } }), []);

  const sube = comparar(base, { 'app/x.tsx': { 'fuego-y-olvido': 3 } });
  assert.equal(sube.length, 1);
  assert.equal(sube[0].nivel, 'aviso');
  assert.match(sube[0].titulo, /suben/);

  const baja = comparar(base, { 'app/x.tsx': { 'fuego-y-olvido': 1 } });
  assert.equal(baja.length, 1);
  assert.match(baja[0].titulo, /Baja la linea base/);
});

test('un fichero nuevo con deuda tambien cuenta, aunque el total no se mueva', () => {
  // Este es el motivo de que la linea base sea POR FICHERO: limpiar un caso
  // viejo aqui y meter uno nuevo alla sale a cero en un contador global.
  const base = { 'app/viejo.tsx': { 'fuego-y-olvido': 1 } };
  const hoy = { 'app/nuevo.tsx': { 'fuego-y-olvido': 1 } };
  const claves = comparar(base, hoy).map((h) => h.clave).sort();
  assert.deepEqual(claves, [
    'errores-tragados/fuego-y-olvido:app/nuevo.tsx',
    'errores-tragados/mejora-fuego-y-olvido:app/viejo.tsx',
  ]);
});

test('los tres tipos estan declarados y con etiqueta', () => {
  assert.deepEqual(Object.keys(TIPOS).sort(), [
    'fuego-y-olvido',
    'handler-async-sin-catch',
    'supabase-sin-comprobar',
  ]);
  for (const t of Object.values(TIPOS)) assert.ok(t.length > 10, 'etiqueta demasiado corta');
});
