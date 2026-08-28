// Contrato comun de los vigilantes.
//
// Un vigilante es un modulo que exporta por defecto:
//   { nombre, ambito, descripcion, ejecutar() -> Promise<hallazgo[]> }
//
// La regla que sostiene todo esto: si un vigilante NO encuentra su ancla, FALLA.
// Un regex que deja de casar porque alguien reescribio la seccion no puede pasar
// en verde -- asi es exactamente como estas herramientas se pudren en silencio y
// acaban dando una falsa sensacion de seguridad, que es peor que no tenerlas.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const NIVELES = ['bloqueante', 'aviso'];

// El ancla ya no esta donde estaba: el vigilante se ha quedado ciego.
export class AnclaPerdida extends Error {
  constructor(mensaje, { fichero, ancla } = {}) {
    super(mensaje);
    this.name = 'AnclaPerdida';
    this.fichero = fichero ?? null;
    this.ancla = ancla ?? null;
  }
}

export function leer(rel) {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) {
    throw new AnclaPerdida(`No existe el fichero ${rel}`, { fichero: rel, ancla: 'fichero' });
  }
  return readFileSync(abs, 'utf8');
}

export function lineaDe(texto, indice) {
  let n = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto[i] === '\n') n++;
  return n;
}

// Busca `re` en `texto` y devuelve { valor, linea }. `re` DEBE tener un grupo 1.
export function capturar(texto, re, { fichero, ancla }) {
  const m = re.exec(texto);
  if (!m) {
    throw new AnclaPerdida(
      `El ancla "${ancla}" ya no aparece en ${fichero}. O se ha reescrito esa parte ` +
      '(y hay que actualizar el vigilante) o se ha borrado. Un vigilante ciego no vale ' +
      'para nada, asi que esto falla a proposito.',
      { fichero, ancla },
    );
  }
  return { valor: m[1], linea: lineaDe(texto, m.index) };
}

// Igual que capturar pero para anclas que solo tienen que EXISTIR.
export function exigir(texto, re, { fichero, ancla }) {
  const m = re.exec(texto);
  if (!m) {
    throw new AnclaPerdida(`El ancla "${ancla}" ya no aparece en ${fichero}.`, { fichero, ancla });
  }
  return { linea: lineaDe(texto, m.index) };
}

export function hallazgo({ clave, nivel, ambito, titulo, detalle, fichero = null, linea = null }) {
  if (!NIVELES.includes(nivel)) throw new Error(`Nivel no valido: ${nivel}`);
  if (!clave || !titulo) throw new Error('Un hallazgo necesita clave y titulo');
  return { clave, nivel, ambito, titulo, detalle: detalle || '', fichero, linea };
}

// Azucar para el caso comun: dos valores que TIENEN que ser iguales. Compara
// como texto a proposito, para que 39 y "39" cuadren sin castings por todas partes.
export function debenCuadrar({ clave, ambito, que, esperado, encontrado, fichero = null, linea = null, porque = '' }) {
  if (String(esperado) === String(encontrado)) return null;
  return hallazgo({
    clave,
    nivel: 'bloqueante',
    ambito,
    titulo: `${que}: se esperaba ${esperado} y hay ${encontrado}`,
    detalle: porque,
    fichero,
    linea,
  });
}
