// Puente a vigilancia_bd_sobrecargas_rpc(): detecta funciones publicas con
// multiples sobrecargas que PostgREST no puede desambiguar.
//
// POR QUE EXISTE (30 ago 2026)
// Una migracion recreo crear_cita_publica con los parametros en otro orden,
// creando dos sobrecargas. PostgREST devolvio HTTP 300 PGRST203: "Could not
// choose the best candidate function". El portal publico de reservas roto.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-sobrecargas-rpc/sin-credencial',
        'base-de-datos',
        'El vigilante de sobrecargas RPC',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_sobrecargas_rpc');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_sobrecargas_rpc() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  return filas.map((f) =>
    hallazgo({
      clave: `sobrecargas-rpc/${f.tipo}-${f.funcion}`,
      nivel: f.nivel || 'bloqueante',
      ambito: 'base-de-datos',
      titulo: f.titulo || `public.${f.funcion} tiene ${f.sobrecargas || 'varias'} sobrecargas`,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );
}

export default {
  nombre: 'bd-sobrecargas-rpc',
  ambito: 'base-de-datos',
  descripcion:
    'Funciones con multiples sobrecargas que PostgREST no desambigua (HTTP 300 PGRST203)',
  necesitaRed: true,
  ejecutar,
};
