// LA HUELLA SE CALCULA EN DOS SITIOS Y TIENE QUE SALIR IGUAL.
//
// `lib/fiscal/huella.ts` (TypeScript, para el worker y las herramientas) y
// `mint_ticket_verifactu` (SQL, que es quien la emite de verdad en cada cobro)
// construyen la MISMA cadena oficial de la AEAT. Si una se toca y la otra no,
// la cadena se parte y no se entera nadie: los hashes siguen siendo hashes
// validos, siguen encadenando entre si, y solo lo descubre la AEAT al rechazar
// el registro.
//
// Es el invariante repartido de manual, asi que va vigilado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leer } from './nucleo.mjs';

const TS = 'lib/fiscal/huella.ts';
const SQL = 'supabase/migrations/20260830111000_mint_ticket_verifactu_formato_aeat.sql';

// Los campos de la cadena, en orden. Es la especificacion, no un detalle.
const CAMPOS = [
  'IDEmisorFactura',
  'NumSerieFactura',
  'FechaExpedicionFactura',
  'TipoFactura',
  'CuotaTotal',
  'ImporteTotal',
  'Huella',
  'FechaHoraHusoGenRegistro',
];

function plantillaTs() {
  const m = leer(TS).match(/const cadena = `([^`]+)`/);
  assert.ok(m, `Ancla perdida: no aparece la plantilla de cadena en ${TS}`);
  return m[1];
}

function cadenaSql() {
  const src = leer(SQL);
  const i = src.indexOf("'IDEmisorFactura='");
  assert.ok(i > 0, `Ancla perdida: no aparece la cadena oficial en ${SQL}`);
  return src.slice(i, src.indexOf(';', i));
}

test('los dos usan los mismos campos y en el mismo orden', () => {
  const ts = plantillaTs();
  const sql = cadenaSql();
  const enTs = [...ts.matchAll(/([A-Za-z]+)=/g)].map((m) => m[1]);
  // Ojo: TipoFactura lleva el valor DENTRO del literal ('&TipoFactura=F2'), asi
  // que no vale exigir que la comilla vaya justo detras del '='.
  const enSql = [...sql.matchAll(/'&?([A-Za-z]+)=[^']*'/g)].map((m) => m[1]);
  assert.deepEqual(enTs, CAMPOS, `${TS} no construye los campos esperados`);
  assert.deepEqual(enSql, CAMPOS, `${SQL} no construye los campos esperados`);
});

test('dan el mismo hash para la misma factura', async () => {
  const p = {
    idEmisor: 'B5786236',
    numSerieFactura: 'A/2026/000007',
    fechaExpedicion: '30-08-2026',
    tipoFactura: 'F2',
    cuotaTotal: '6.94',
    importeTotal: '40.00',
    huellaAnterior: '',
    fechaHoraRegistro: '2026-08-30T12:34:56+02:00',
  };
  const cadena = plantillaTs().replace(/\$\{params\.(\w+)\}/g, (_, k) => {
    assert.ok(k in p, `la plantilla usa ${k} y el caso de prueba no lo tiene`);
    return p[k];
  });
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cadena))),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  // Calculado con `encode(sha256(convert_to(...,'UTF8')),'hex')` en el Postgres
  // de produccion, sobre esta misma cadena, el 30 ago 2026.
  assert.equal(hash, '2E4E96DF518461C9AC15B7BF917E8ACB6F8075B951CB5918A13D5C5D642FD2DA');
});

test('la huella va en MAYUSCULAS en los dos', () => {
  assert.match(leer(TS), /toUpperCase\(\)/, `${TS} tiene que devolver la huella en mayusculas`);
  assert.match(cadenaSql().length ? leer(SQL) : '', /upper\(encode\(sha256/, `${SQL} idem`);
});

test('el primer registro de un emisor encadena con huella vacia', () => {
  // La AEAT espera Huella= (vacio) en el primero. En SQL eso sale del coalesce
  // sobre el ultimo hash de la cadena, que no existe todavia.
  assert.match(leer(SQL), /v_hash_ant := coalesce\(v_hash_ant, ''\);/);
});

test('la cadena SQL va por emisor, no solo por negocio', () => {
  // Es la decision que no se deshace: (negocio_id, nif_emisor, serie). Si alguien
  // la revierte a (negocio_id, serie), el alquiler de sillon queda cerrado para
  // siempre y dos NIF comparten serie, que es una cadena invalida.
  const sql = leer(SQL);
  const cuenta = (sql.match(/coalesce\(nif_emisor, ''\) = coalesce\(v_nif, ''\)/g) ?? []).length;
  assert.ok(cuenta >= 2, 'la numeracion y el enlace tienen que filtrar los dos por nif_emisor');
});

test('sin NIF valido NUNCA se mete el negocio_id en el hueco del NIF', () => {
  // Es el fallo que dejo 1.600 tickets encadenados contra "demo_salon_001".
  const sql = leer(SQL);
  assert.match(sql, /v_nif !~\* '\^\[A-Z0-9\]\[0-9\]\{7\}\[A-Z0-9\]\$'/, 'falta validar la forma del NIF');
  assert.match(sql, /v_formato := case when v_aeat then 'aeat_v1' else 'interno_v1' end;/);
});
