import test from 'node:test';
import assert from 'node:assert/strict';

import vigilante, {
  medirProfundidadAnidamiento,
  calcularComplejidadCiclomatica,
  detectarDuplicacion,
  revisarArchivo,
  LIMITE_LINEAS_COMPONENTE,
  LIMITE_PROFUNDIDAD_ANIDAMIENTO,
} from './calidad-codigo.mjs';
import { AnclaPerdida } from './nucleo.mjs';

test('el vigilante calidad-codigo cumple el contrato estándar de núcleo', () => {
  assert.equal(vigilante.nombre, 'calidad-codigo');
  assert.equal(vigilante.ambito, 'rendimiento');
  assert.ok(typeof vigilante.descripcion === 'string');
  assert.equal(typeof vigilante.ejecutar, 'function');
});

test('revisarArchivo detecta componentes gigantes que superan 450 líneas', () => {
  const codigoPequeno = Array(100).fill('const a = 1;').join('\n');
  const resPequeno = revisarArchivo('app/(tabs)/pequeno.web.tsx', codigoPequeno);
  assert.equal(resPequeno.hallazgos.length, 0);

  const codigoMonstruo = Array(500).fill('export const Item = () => <div>item</div>;').join('\n');
  const resMonstruo = revisarArchivo('app/(tabs)/monstruo.web.tsx', codigoMonstruo);
  assert.equal(resMonstruo.hallazgos.length, 1);
  assert.equal(resMonstruo.hallazgos[0].nivel, 'aviso');
  assert.equal(resMonstruo.hallazgos[0].ambito, 'rendimiento');
  assert.ok(resMonstruo.hallazgos[0].clave.includes('componente-monstruo'));
  assert.match(resMonstruo.hallazgos[0].titulo, /supera el límite de tamaño \(500 líneas > 450\)/);
});

test('medirProfundidadAnidamiento ignora llaves en comentarios y cadenas de texto', () => {
  const codigoConStringsYComentarios = `
    function demo() {
      // { { { llaves en comentario } } }
      /* { llaves en bloque } */
      const jsonStr = '{"a": {"b": {"c": {"d": 1}}}}';
      const template = \`\${'{"nested": true}'}\`;
      if (true) {
        return jsonStr;
      }
    }
  `;

  const profundidad = medirProfundidadAnidamiento(codigoConStringsYComentarios);
  // Solo la función (nivel 1) y el if (nivel 2)
  assert.equal(profundidad, 2, `La profundidad medida fue ${profundidad}`);
});

test('revisarArchivo detecta anidamiento y complejidad excesiva (>4 niveles)', () => {
  const codigoProfundo = `
    function procesar(datos) {
      if (datos) {
        for (const item of datos) {
          if (item.activo) {
            try {
              if (item.subitems) {
                while (item.subitems.length > 0) {
                  if (item.subitems[0].valido) {
                    console.log('demasiado anidado');
                  }
                }
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    }
  `;

  const res = revisarArchivo('components/agenda/Procesador.web.tsx', codigoProfundo);
  const hallazgoAnidamiento = res.hallazgos.find((h) => h.clave.includes('anidamiento-profundo'));
  assert.ok(hallazgoAnidamiento, 'Debe emitir aviso por anidamiento profundo');
  assert.equal(hallazgoAnidamiento.nivel, 'aviso');
  assert.ok(res.maxProfundidad >= 6);
});

test('calcularComplejidadCiclomatica cuenta puntos de decisión', () => {
  const codigoSimple = `const x = 1 + 2; return x;`;
  assert.equal(calcularComplejidadCiclomatica(codigoSimple), 1);

  const codigoConRamas = `
    if (a && b) {
      for (let i = 0; i < 10; i++) {
        const res = c ? 1 : 0;
      }
    } else if (d || e) {
      try { x(); } catch (err) { y(); }
    }
  `;
  const complejidad = calcularComplejidadCiclomatica(codigoConRamas);
  assert.ok(complejidad >= 7, `Complejidad calculada fue ${complejidad}`);
});

test('detectarDuplicacion localiza bloques repetidos entre componentes distintos', () => {
  const bloqueComun = [
    'const normalizarDatosCliente = (c) => {',
    '  if (!c) return null;',
    '  const nombre = c.nombre ? c.nombre.trim() : "";',
    '  const telefono = c.telefono ? c.telefono.replace(/\\s+/g, "") : "";',
    '  const email = c.email ? c.email.toLowerCase() : "";',
    '  const notas = c.notas || [];',
    '  return { nombre, telefono, email, notas, actualizado: Date.now() };',
    '};',
  ].join('\n');

  const archivoA = `
    import React from 'react';
    export const CompA = () => {
      ${bloqueComun}
      return <div>A</div>;
    };
  `;

  const archivoB = `
    import React from 'react';
    export const CompB = () => {
      ${bloqueComun}
      return <div>B</div>;
    };
  `;

  const archivos = [
    { rel: 'components/clientes/FichaA.web.tsx', contenido: archivoA },
    { rel: 'components/clientes/FichaB.web.tsx', contenido: archivoB },
  ];

  const hallazgos = detectarDuplicacion(archivos);
  assert.equal(hallazgos.length, 1);
  assert.ok(hallazgos[0].clave.includes('duplicacion'));
  assert.match(hallazgos[0].titulo, /Lógica duplicada/);
  assert.equal(hallazgos[0].nivel, 'aviso');
});

test('ejecutar lanza AnclaPerdida si la lista de archivos está vacía', async () => {
  await assert.rejects(
    async () => {
      await vigilante.ejecutar({ ficheros: [] });
    },
    AnclaPerdida,
    'Debe lanzar AnclaPerdida si no hay archivos a evaluar',
  );
});

test('ejecutar en el repositorio real analiza componentes sin reventar', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.ok(Array.isArray(hallazgos), 'Debe devolver un array de hallazgos');
  for (const h of hallazgos) {
    assert.ok(h.clave);
    assert.equal(h.ambito, 'rendimiento');
    assert.ok(['aviso', 'bloqueante'].includes(h.nivel));
    assert.ok(h.fichero);
  }
});
