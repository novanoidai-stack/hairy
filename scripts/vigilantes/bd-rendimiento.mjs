// Los cuellos de botella de la base, medidos con pg_stat_statements.
//
// La logica vive en public.vigilancia_bd_rendimiento() (migracion
// 20260829120000): tiene que estar dentro de Postgres porque pg_stat_statements
// y pg_stat_user_tables no se exponen por PostgREST, y porque los umbrales se
// calculan contra el total del periodo, que solo se sabe alli.
//
// Lo que encontro al estrenarse, para que se vea que no es teorico:
//   - notificaciones_pendientes se lleva el 15,4 % de todo el tiempo de la base
//     (52 594 llamadas). Es el cron-pull de n8n cada 2 min y NO es una cola:
//     calcula en vivo desde las banderas de citas. Ese calculo es lo que cuesta.
//   - clientes_en_riesgo_fuga y hallazgos_del_negocio: ~122 000 llamadas cada
//     una. Huelen a "se llama en cada carga de pantalla".
//   - SELECT name FROM pg_timezone_names: 500 ms de media, 1 206 veces. Es una
//     trampa clasica de Postgres (lee la base de zonas horarias entera).
//   - citas: 476 M de filas leidas en recorridos secuenciales, 2 363 por
//     recorrido sobre una tabla de 2 001 filas. Hoy no duele; con salones de
//     verdad crece al cuadrado.
//
// Todo `aviso` salvo los locks: son medidas para priorizar, no fallos. Poner
// esto en bloqueante tumbaria la CI por algo que nadie puede arreglar en el PR.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'rendimiento/bd-sin-credencial',
        'rendimiento',
        'La medida de cuellos de botella de la base',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_rendimiento');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_rendimiento() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: f.clave,
      nivel: f.nivel,
      ambito: f.ambito,
      titulo: f.titulo,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-rendimiento',
  ambito: 'rendimiento',
  descripcion: 'Consultas que se comen la base, tablas que se leen enteras y locks esperando',
  necesitaRed: true,
  ejecutar,
};
