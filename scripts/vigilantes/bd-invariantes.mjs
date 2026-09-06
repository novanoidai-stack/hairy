// Puente a vigilancia_bd_invariantes(): invariantes de DATOS EN REPOSO.
// No mira el esquema (eso hacen las demas): mira que los datos cuadren —
// solapes de agenda, saldos de bonos imposibles y arqueo de caja.
//
// POR QUE EXISTE (30 ago 2026)
// En su primera corrida contra produccion cazo dos cosas que nadie veia:
// 108 pares de citas solapadas (la carrera del portal, sin constraint que la
// cierre) y DOS convenciones coexistes de propina en cobros: en 161 el total
// la incluye, en 6 el desglose la suma fuera. El dinero, no el esquema.
//
// AQUELLOS 108 YA NO SON EL NUMERO (6 sep 2026)
// Los 108 se midieron sobre el BLOQUE de la cita, y el bloque no es la
// ocupacion: durante el reposo quimico el profesional esta libre y encajar ahi
// a otra clienta es el diferencial nº1 del producto, no una doble reserva.
// Medido de las dos formas contra produccion el 6 sep: 31 pares por bloques,
// 24 por ocupacion real (`citas.ventanas_ocupadas`) -> 7 eran el producto
// funcionando, denunciado por el vigilante que deberia protegerlo.
//
// Desde 20260906205757 el vector 1 mide por ocupacion y va partido en tres,
// asi que estas son las claves que puede emitir:
//
//   agenda-solapada:<negocio>            BLOQUEANTE. Solape de trabajo con al
//                                        menos una cita posterior al candado
//                                        (31 ago 2026). Hoy: 0.
//   agenda-solapada-historica:<negocio>  aviso. Las dos anteriores al candado:
//                                        deuda congelada con trinquete, solo
//                                        puede bajar. Hoy: 24, todas de
//                                        florent_surez_peluqueros_15004.
//   agenda-vigilante-ciego               BLOQUEANTE. Los controles positivos
//                                        han caido: el vector ya no puede
//                                        demostrar que mide contra el candado
//                                        desplegado, asi que su cero no
//                                        significa nada. Se arregla el control,
//                                        no se quita.
//
// Al leer un cero aqui, mira el nivel: un 0 de bloqueantes con el aviso
// historico presente es lo sano. Un 0 de TODO --sin el aviso de los 24-- es
// sospechoso: o alguien limpio la deuda historica, o el puente no esta
// llegando a la funcion.

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
    'Invariantes de datos en reposo: solapes de agenda (por ocupacion real, no por bloque), bonos imposibles y arqueo de caja',
  necesitaRed: true,
  ejecutar,
};
