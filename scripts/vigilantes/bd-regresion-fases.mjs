// Puente a regresion_citas_fases_v2(): la foto del paso 3 de la spec 1 contra
// la realidad.
//
// POR QUE EXISTE (4 sep 2026)
// El 30 de agosto un backfill colapso 2.009 citas reales y las duraciones
// originales se perdieron para siempre: la foto de respaldo se empezo a guardar
// DESPUES del desastre. Este vigilante es la comprobacion que faltaba aquel dia
// -- "cuento las citas cuya duracion cambio y tiene que dar 0" -- y vive ANTES
// de invertir el sentido de la sincronizacion (paso 4), que es el unico paso
// peligroso del plan.
//
// Se retira cuando el paso 5 este dentro: mientras tanto, nivel bloqueante a
// proposito. Una cita que cambio de duracion porque la duena la edito a mano
// aparece aqui con su id en el detalle: se comprueba una a una y NO se silencia
// el vigilante.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-regresion-fases/sin-credencial',
        'base-de-datos',
        'El vigilante de regresion de fases',
      ),
    ];
  }

  const filas = await llamarRpc('regresion_citas_fases_v2');
  if (!Array.isArray(filas)) {
    throw new Error(
      `regresion_citas_fases_v2() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: `regresion-fases/duraciones`,
      nivel: f.nivel,
      ambito: 'base-de-datos',
      titulo: f.titulo,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-regresion-fases',
  ambito: 'base-de-datos',
  descripcion:
    'La foto del paso 3 de la spec 1 (respaldos.citas_antes_de_fases_v2) contra la realidad: ' +
    'cuenta las citas que cambiaron de duracion. La comprobacion que habria cazado el backfill ' +
    'del 30 ago en el minuto uno',
  necesitaRed: true,
  ejecutar,
};
