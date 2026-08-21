// Comprueba que los capitulos de cada recorrido de la demo CUBREN todos sus
// pasos, sin huecos ni solapes. Es facil descuadrarlo: añadir un paso a mitad
// de un recorrido deja los `desde`/`hasta` de los capitulos siguientes
// apuntando a otro sitio, y entonces la cortinilla de capitulo sale a destiempo
// (o el ultimo capitulo no se marca nunca como acabado).
//
//   node scripts/verificar-recorridos-demo.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/demo.html', import.meta.url), 'utf8');

function bloque(nombre) {
  const ini = html.indexOf(`var ${nombre}=[`);
  if (ini < 0) throw new Error(`No encuentro ${nombre} en web/demo.html`);
  const fin = html.indexOf('\n  ];', ini);
  return html.slice(ini, fin);
}

const contarPasos = (n) => [...bloque(n).matchAll(/\{ic:'[a-z]+',\s*route:/g)].length;
const rangos = (n) =>
  [...bloque(n).matchAll(/desde:(\d+),\s*hasta:(\d+)/g)].map((m) => [+m[1], +m[2]]);

const RECORRIDOS = [
  ['TUT_PILARES', 'ACTS_PILARES'],
  ['TUT_ADVANCED', 'ACTS_ADVANCED'],
  ['TUT_CONFIG', 'ACTS_CONFIG'],
];

let fallos = 0;
for (const [pasosVar, actsVar] of RECORRIDOS) {
  const n = contarPasos(pasosVar);
  const r = rangos(actsVar);
  const problemas = [];
  if (r[0][0] !== 0) problemas.push(`el primer capitulo empieza en ${r[0][0]}, no en 0`);
  if (r[r.length - 1][1] !== n - 1)
    problemas.push(`el ultimo capitulo acaba en ${r[r.length - 1][1]}, y hay ${n} pasos (deberia ser ${n - 1})`);
  for (let i = 1; i < r.length; i++) {
    if (r[i][0] !== r[i - 1][1] + 1)
      problemas.push(`hueco o solape entre el capitulo ${i} y el ${i + 1}: ${r[i - 1][1]} -> ${r[i][0]}`);
  }
  if (problemas.length) {
    fallos++;
    console.error(`✗ ${pasosVar}: ${n} pasos`);
    problemas.forEach((p) => console.error(`    ${p}`));
  } else {
    console.log(`✓ ${pasosVar}: ${n} pasos, ${r.length} capitulos, rangos cuadrados`);
  }
}

process.exit(fallos ? 1 : 0);
