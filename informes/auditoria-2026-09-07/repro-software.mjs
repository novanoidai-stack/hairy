// Evidencia de auditoría: ejecuta funciones del código real con transporte simulado.
// No importa la aplicación, no abre red y no escribe datos del producto.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { strict as assert } from 'node:assert';
import ts from 'typescript';

function extraer(ruta, nombre) {
  const texto = readFileSync(ruta, 'utf8');
  const ast = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let encontrado;
  function visitar(nodo) {
    if (ts.isVariableDeclaration(nodo) && nodo.name.getText(ast) === nombre) encontrado = nodo.initializer.getText(ast);
    if (ts.isFunctionDeclaration(nodo) && nodo.name?.text === nombre) encontrado = nodo.getText(ast);
    ts.forEachChild(nodo, visitar);
  }
  visitar(ast);
  assert.ok(encontrado, `No existe ${nombre} en ${ruta}`);
  return ts.transpile(`globalThis.fn = (${encontrado});`, { target: ts.ScriptTarget.ES2022 });
}

const pos = 'components/pos/CobroSheet.tsx';
function contextoCobro(citaIds = ['cita-a']) {
  const llamadas = [];
  const estado = { completado: false, error: '', ids: [] };
  const contexto = {
    props: { mode: 'cita', citaIds },
    isWalkin: false,
    lineas: [],
    totalCents: 3600,
    usarBono: false,
    bonoDisponible: null,
    trAplicadoCents: 0,
    enviandoRef: { current: false },
    metodo: 'efectivo', propinaCents: 100, descuentoCents: 500,
    basesPorCita: {},
    setError: x => { estado.error = x; },
    setEnviando() {},
    setUltimoCobroIds: x => { estado.ids = x; },
    setCobroCompletado: x => { estado.completado = x; },
    aplicarTarjetaRegalo: async () => {},
    mensajeDeError: e => e.message,
    aEntero: x => Number(x.replace(',', '.')),
    supabase: { rpc: async (nombre, args) => { llamadas.push({ nombre, args }); return { data: `cobro-${llamadas.length}`, error: null }; } },
  };
  return { contexto, llamadas, estado };
}

{
  const { contexto, llamadas, estado } = contextoCobro(['cita-a', 'cita-b']);
  runInNewContext(extraer(pos, 'confirmar'), contexto);
  await contexto.fn();
  assert.equal(estado.completado, true);
  const descuentoEnviado = llamadas.reduce((s, x) => s + x.args.p_descuento_cents, 0);
  const propinaEnviada = llamadas.reduce((s, x) => s + x.args.p_propina_cents, 0);
  assert.equal(descuentoEnviado, 1000);
  assert.equal(propinaEnviada, 200);
  console.log('S01: 2 citas de 20 EUR; UI 36 EUR; RPCs suman 32 EUR (descuento 10 EUR y propina 2 EUR).');
}

{
  const { contexto, llamadas, estado } = contextoCobro();
  contexto.totalCents = 1000;
  contexto.trAplicadoCents = 2000;
  contexto.propinaCents = contexto.descuentoCents = 0;
  contexto.trUsarSaldo = true;
  contexto.trTarjeta = { id: 'regalo-a', saldo_actual_cents: 2000 };
  const escrituras = [];
  contexto.supabase.from = tabla => ({
    update: payload => ({ eq: async () => { escrituras.push({ tabla, payload }); return { error: { message: 'Fallo simulado' } }; } }),
    insert: async payload => { escrituras.push({ tabla, payload }); return { error: { message: 'Fallo simulado' } }; },
  });
  runInNewContext(extraer(pos, 'aplicarTarjetaRegalo'), contexto);
  contexto.aplicarTarjetaRegalo = contexto.fn;
  runInNewContext(extraer(pos, 'confirmar'), contexto);
  await contexto.fn();
  assert.equal(estado.completado, true);
  assert.equal(estado.error, '');
  assert.equal(escrituras.length, 2);
  assert.equal(Object.keys(llamadas[0].args).some(x => /tarjeta|regalo/i.test(x)), false);
  console.log('S02: tarjeta de 20 EUR aplicada a servicio de 30 EUR: RPC sin importe de tarjeta; ambas escrituras de saldo fallan y la UI declara éxito.');
}

{
  const { contexto, llamadas } = contextoCobro();
  contexto.qrBusyRef = { current: false };
  contexto.setQrBusy = () => {};
  contexto.setQrEnlace = () => {};
  contexto.lineas = [{ nombre: 'Champú', precio: '15', cantidad: '1', tipo: 'producto' }];
  contexto.propinaCents = contexto.descuentoCents = 0;
  contexto.totalCents = 4500;
  contexto.supabase.rpc = async (nombre, args) => { llamadas.push({ nombre, args }); return { data: { token: 'simulado' }, error: null }; };
  runInNewContext(extraer(pos, 'generarQr'), contexto);
  await contexto.fn();
  assert.equal(Object.hasOwn(llamadas[0].args, 'p_lineas_extra'), false);
  console.log('S03: servicio 30 EUR + champú 15 EUR; total UI 45 EUR; QR no recibe el producto extra.');
}

{
  const { contexto, estado } = contextoCobro(['cita-a', 'cita-b']);
  let intentos = 0;
  contexto.supabase.rpc = async () => ++intentos === 1
    ? { data: 'cobro-a', error: null }
    : { data: null, error: { message: 'Fallo de red simulado' } };
  runInNewContext(extraer(pos, 'confirmar'), contexto);
  await contexto.fn();
  assert.equal(estado.completado, false);
  assert.equal(estado.ids.length, 0);
  assert.match(estado.error, /1 de 2/);
  console.log('S04: lote parcialmente cobrado: primer cobro persistido, error en el segundo, cero IDs de éxito retenidos por la UI.');
}

{
  const operaciones = [];
  const estado = { editorCerrado: false, recargado: false };
  const contexto = {
    selected: 'prof-a', editDias: [0], horarios: [{ id: 'horario-previo', dia_semana: 0 }],
    editHasPausa: false, editJornadaIni: '09:00', editJornadaFin: '18:00',
    setSavingHorario() {}, setEditDias: () => { estado.editorCerrado = true; },
    cargarPanelDerecho: async () => { estado.recargado = true; },
    supabase: { from: tabla => ({
      delete: () => ({ eq: async () => { operaciones.push(`${tabla}:DELETE OK`); return { error: null }; } }),
      insert: async () => { operaciones.push(`${tabla}:INSERT ERROR`); return { error: { message: 'Fallo simulado' } }; },
    }) },
  };
  runInNewContext(extraer('app/(tabs)/equipo.web.tsx', 'guardarHorario'), contexto);
  await contexto.fn();
  assert.equal(estado.editorCerrado, true);
  assert.equal(estado.recargado, true);
  assert.equal(operaciones.length, 2);
  console.log('S08: horario borrado, nuevo INSERT rechazado; editor se cierra y recarga sin informar del fallo.');
}

console.log('5 reproducciones locales confirmadas; cero conexiones a Supabase.');
