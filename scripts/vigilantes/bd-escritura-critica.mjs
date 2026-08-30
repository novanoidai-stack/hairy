// Puente a vigilancia_bd_escritura_critica(): prueba que INSERT INTO citas
// funciona de verdad, disparando todos los triggers. Hace rollback automatico.
//
// POR QUE EXISTE (30 ago 2026)
// Todos los vigilantes existentes eran de LECTURA: leian esquema, leian texto,
// leian pantallas. Ningun vigilante hacia una escritura real. Cuando un trigger
// nuevo (trg_seed_fases_from_cita) rompio la ruta de escritura de citas, los
// vigilantes dieron verde: "npm run vigilar → 0 bloqueantes, 43 avisos".
//
// Este vigilante hace lo unico que puede cerrar ese hueco: un INSERT de verdad,
// dentro de un bloque EXCEPTION que hace rollback del subtransaction. Si el
// INSERT o cualquiera de sus triggers revientan, se entera.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-escritura-critica/sin-credencial',
        'base-de-datos',
        'El vigilante de escritura critica',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_escritura_critica');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_escritura_critica() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: `escritura-critica/${f.tipo}${f.funcion ? `-${f.funcion}` : ''}`,
      nivel: f.nivel || 'bloqueante',
      ambito: 'base-de-datos',
      titulo: f.titulo || `Escritura critica: ${f.tipo}`,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-escritura-critica',
  ambito: 'base-de-datos',
  descripcion:
    'Prueba que INSERT INTO citas funciona con todos sus triggers. Hace rollback: no deja datos.',
  necesitaRed: true,
  ejecutar,
};
