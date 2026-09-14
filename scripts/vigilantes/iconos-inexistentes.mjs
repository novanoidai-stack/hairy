// UN ICONO QUE NO EXISTE NO DA ERROR: PINTA UN HUECO.
//
// En la web cada pantalla se dibuja sus propios iconos. No hay un componente
// compartido: hay DIECINUEVE, uno por fichero, y todos con la misma forma --un
// `Record<string, string>` con las rutas SVG y un render que hace
//
//     dangerouslySetInnerHTML={{ __html: `<svg ...>${paths[name] || ''}</svg>` }}
//
// Ese `|| ''` es el problema. Si alguien escribe `<Icon name="calendar" />` en
// una pantalla cuyo mapa no tiene `calendar`, no salta nada: ni un error de
// TypeScript (la prop es `string`), ni un aviso en consola, ni un fallo de red.
// Se pinta un <svg> vacio del tamano pedido y en pantalla queda un hueco.
//
// LO QUE SE ENCONTRO AL ESTRENARLO (9 sep 2026), cuatro huecos en produccion:
//   caja.web.tsx        name="calendar"  -> junto a "Cobros Pendientes"
//   clientes.web.tsx    name="copy"      -> menu "Fusionar dupl."
//   equipo.web.tsx      name="star"      -> ficha del profesional
//   inventario.web.tsx  name="settings"  -> cabecera de un modal
// El de caja se confirmo ademas en el DOM de produccion: un <svg> de 18x18 sin
// un solo hijo.
//
// POR QUE ES UN VIGILANTE Y NO UN ARREGLO Y YA
// Mientras cada pantalla tenga su mapa, esto vuelve a pasar en cuanto alguien
// copie un bloque de una pantalla a otra --que es exactamente como se cuelan los
// cuatro de arriba: el nombre existia en el fichero de origen. Es el invariante
// repartido de la decision 10 del CLAUDE.md, en su version mas barata de cazar.
//
// NIVEL: aviso, no bloqueante. Un icono que falta es feo, no rompe nada ni
// ensena un dato falso; tumbar la CI por esto seria desproporcionado.

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

// Donde se buscan pantallas con mapa de iconos propio.
const CARPETAS = ['app', 'components'];

/**
 * Claves de primer nivel del literal de objeto que abre en `desde`.
 * Solo primer nivel: dentro de cada valor hay SVG con `:` por todas partes.
 */
function clavesDelObjeto(src, desde) {
  let prof = 0;
  let fin = -1;
  for (let i = desde; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') {
      prof--;
      if (prof === 0) {
        fin = i;
        break;
      }
    }
  }
  if (fin < 0) return [];
  const cuerpo = src.slice(desde + 1, fin);
  const claves = new Set();
  const re = /(^|[,{\n])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:/g;
  let m;
  while ((m = re.exec(cuerpo))) {
    const antes = cuerpo.slice(0, m.index);
    // solo cuenta si estamos a nivel 0 del literal
    if ((antes.match(/\{/g) || []).length === (antes.match(/\}/g) || []).length) {
      claves.add(m[2] || m[3] || m[4]);
    }
  }
  return [...claves];
}

/** Todas las claves de los mapas de iconos declarados en el fichero. */
export function mapaDeIconos(src) {
  const re = /const\s+(icons|paths|ICONS|ICONOS)\s*(?::[^=]+)?=\s*\{/g;
  const claves = new Set();
  let encontrado = false;
  let m;
  while ((m = re.exec(src))) {
    encontrado = true;
    const abre = src.indexOf('{', m.index + m[0].length - 1);
    clavesDelObjeto(src, abre).forEach((k) => claves.add(k));
  }
  return { claves, encontrado };
}

/** Nombres de icono pedidos en el fichero, con su linea. */
export function nombresUsados(src) {
  const usos = new Map();
  const anota = (n, linea) => {
    if (!usos.has(n)) usos.set(n, []);
    if (!usos.get(n).includes(linea)) usos.get(n).push(linea);
  };
  src.split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(/<Icon\b[^>]*?\bname=\{?\s*['"]([^'"]+)['"]/g)) {
      anota(m[1], i + 1);
    }
    // name={cond ? 'a' : 'b'}
    for (const m of linea.matchAll(
      /<Icon\b[^>]*?\bname=\{[^}]*?\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g,
    )) {
      anota(m[1], i + 1);
      anota(m[2], i + 1);
    }
    // arrays de configuracion: { l: '...', icon: 'x', ... }
    for (const m of linea.matchAll(/\bicon:\s*['"]([^'"]+)['"]/g)) {
      anota(m[1], i + 1);
    }
  });
  return usos;
}

/**
 * Los nombres que un fichero PIDE y su propio mapa no tiene. Es la unidad
 * comprobable del vigilante: el resto es recorrer carpetas.
 * @param {string} src codigo de la pantalla
 * @returns {{nombre: string, linea: number}[]}
 */
export function nombresSinRuta(src) {
  const { claves } = mapaDeIconos(src);
  const fuera = [];
  for (const [nombre, lineas] of nombresUsados(src)) {
    if (!claves.has(nombre)) fuera.push({ nombre, linea: lineas[0] });
  }
  return fuera;
}

function ficherosCandidatos() {
  const salida = [];
  const recorrer = (dir) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith('.tsx')) salida.push(p);
    }
  };
  for (const c of CARPETAS) recorrer(path.join(RAIZ, c));
  return salida;
}

async function ejecutar() {
  const hallazgos = [];
  let pantallasConMapa = 0;

  for (const abs of ficherosCandidatos()) {
    const rel = path.relative(RAIZ, abs).split(path.sep).join('/');
    const src = leer(rel);

    // Solo interesan los ficheros que usan el patron del `|| ''`: es el que
    // falla en silencio. Un `<Icon>` de una libreria que avisa no es asunto suyo.
    if (!/\$\{(?:paths|icons|ICONS|ICONOS)\[name\]\s*\|\|\s*['"]{2}\}|(?:paths|icons|ICONS|ICONOS)\[name\]\s*\|\|\s*['"]{2}/.test(src)) {
      continue;
    }

    const { claves, encontrado } = mapaDeIconos(src);
    if (!encontrado || claves.size === 0) {
      throw new AnclaPerdida(
        `${rel} pinta iconos con el patron "mapa[name] || ''" pero no se ha podido leer su mapa. Mientras este vigilante no sepa leerlo, no esta comprobando esa pantalla y su verde no significa nada.`,
        { fichero: rel, ancla: "const icons = { ... }" },
      );
    }
    pantallasConMapa++;

    for (const { nombre, linea } of nombresSinRuta(src)) {
      hallazgos.push(
        hallazgo({
          clave: 'iconos-inexistentes/nombre-sin-ruta',
          nivel: 'aviso',
          ambito: 'pantallas',
          titulo: `${rel}: se pide el icono "${nombre}" y no esta en el mapa de esa pantalla`,
          detalle:
            `El render hace \`mapa[name] || ''\`, asi que un nombre que no existe no da error: pinta un <svg> VACIO y en pantalla queda un hueco del tamano del icono. ` +
            `Anade "${nombre}" al mapa de ${rel}, o usa uno de los que ya tiene (${[...claves].sort().join(', ')}).`,
          fichero: rel,
          linea,
        }),
      );
    }
  }

  // CONTROL POSITIVO. Si un dia el patron de render cambia (otro nombre de
  // variable, un componente compartido, otra plantilla), el bucle de arriba no
  // entraria en ningun fichero y esto saldria en verde sin haber mirado NADA,
  // que es el modo de fallo que este repo trata como hallazgo y no como exito.
  if (pantallasConMapa === 0) {
    throw new AnclaPerdida(
      'No se ha encontrado ni una sola pantalla con mapa de iconos propio. O se han unificado todos en un componente compartido (entonces este vigilante sobra y hay que retirarlo a conciencia) o el patron ha cambiado y esto lleva sin comprobar nada desde entonces.',
      { fichero: 'app/(tabs)', ancla: "mapa[name] || ''" },
    );
  }

  return hallazgos;
}

export default {
  nombre: 'iconos-inexistentes',
  ambito: 'pantallas',
  descripcion:
    'Ningun <Icon name="..."> pide un nombre que no este en el mapa de su pantalla (pintaria un hueco en silencio)',
  necesitaRed: false,
  ejecutar,
};
