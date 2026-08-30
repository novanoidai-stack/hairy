// Puente a public.vigilancia_bd_ecosistema(): el ecosistema de cuentas de los
// salones, comprobado dentro de Postgres.
//
// POR QUE ES UNA FAMILIA APARTE Y NO UNA COMPROBACION MAS DE bd.mjs
// Lo que mira no es "seguridad" ni "rendimiento" en general: es la coherencia
// del modelo de cuentas, que es donde el 30 ago 2026 se encontro de golpe un
// salon sin propietario (cinco, en realidad), un salon con dos modelos de
// identidad encendidos a la vez, un tope que el propio cliente se podia subir
// y -- lo peor -- el guarda de identidad de `profiles` reescrito en produccion
// para que no congelara nada.
//
// Ese ultimo es el que justifica la familia. La version DESPLEGADA de
// guard_profile_identity_columns() no era la del repo: alguien la habia
// cambiado desde el editor SQL poniendo `COALESCE(new.plan, old.plan)` donde el
// repo decia `new.plan := old.plan`. COALESCE solo rellena nulos, asi que
// cualquier UPDATE pasaba: un empleado se ponia role='owner' y negocio_id de
// OTRO salon en una sola llamada REST.
//
// LA LECCION GENERALIZABLE, que es lo que hay que recordar de aqui:
// bd-migraciones.mjs compara VERSIONES de migracion, no CUERPOS de funcion. Una
// funcion critica reescrita a mano en produccion era invisible para toda la
// vigilancia. De las funciones que SON un control de seguridad no basta con
// saber que existen: hay que comprobar que siguen diciendo lo que tienen que
// decir. Eso solo se puede hacer dentro de la base, y por eso vive en la capa 2.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'cuentas/sin-credencial',
        'cuentas',
        'El vigilante del ecosistema de cuentas',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_ecosistema');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_ecosistema() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: f.clave,
      nivel: f.nivel,
      ambito: f.ambito ?? 'cuentas',
      titulo: f.titulo,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-ecosistema',
  ambito: 'cuentas',
  descripcion:
    'Guarda de identidad de profiles intacto, salones con titular, modo de acceso coherente ' +
    'con las cuentas y topes fuera del alcance del cliente',
  necesitaRed: true,
  ejecutar,
};
