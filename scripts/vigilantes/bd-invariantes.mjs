// Puente a vigilancia_bd_invariantes(): invariantes de DATOS EN REPOSO.
// No mira el esquema (eso hacen las demas): mira que los datos cuadren —
// solapes de agenda, saldos de bonos imposibles y arqueo de caja.
//
// POR QUE EXISTE (30 ago 2026)
// En su primera corrida contra produccion cazo dos cosas que nadie veia:
// 108 pares de citas solapadas (la carrera del portal, sin constraint que la
// cierre) y DOS convenciones coexistes de propina en cobros: en 161 el total
// la incluye, en 6 el desglose la suma fuera. El dinero, no el esquema.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-invariantes/sin-credencial',
        'base-de-datos',
        'El vigilante de invariantes de datos',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_invariantes');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_invariantes() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: f.clave,
      nivel: f.nivel || 'bloqueante',
      ambito: f.ambito || 'coherencia',
      titulo: f.titulo,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-invariantes',
  ambito: 'coherencia',
  descripcion:
    'Invariantes de datos en reposo: solapes de agenda, bonos imposibles y arqueo de caja',
  necesitaRed: true,
  ejecutar,
};
