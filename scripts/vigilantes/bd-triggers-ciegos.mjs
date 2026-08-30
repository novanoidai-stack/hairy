// Puente a vigilancia_bd_triggers_ciegos(): detecta triggers que referencian
// columnas inexistentes. Un trigger ciego no revienta al crearse, sino cuando
// se dispara (INSERT/UPDATE), por lo que pasa todas las validaciones estaticas
// y de esquema.
//
// POR QUE EXISTE (30 ago 2026)
// trg_seed_fases_from_cita hacia SELECT fases FROM public.servicios. La columna
// "fases" nunca ha existido. Resultado: NINGUNA cita se podia crear.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-triggers-ciegos/sin-credencial',
        'base-de-datos',
        'El vigilante de triggers ciegos',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_triggers_ciegos');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_triggers_ciegos() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: `triggers-ciegos/${f.tipo}-${f.columna}-${f.trigger || f.funcion}`,
      nivel: f.nivel || 'bloqueante',
      ambito: 'base-de-datos',
      titulo: f.titulo || `Trigger "${f.trigger}" referencia una columna que no existe`,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-triggers-ciegos',
  ambito: 'base-de-datos',
  descripcion:
    'Triggers que referencian columnas inexistentes: pasan todas las validaciones estaticas ' +
    'y revientan en tiempo de ejecucion (42703)',
  necesitaRed: true,
  ejecutar,
};
