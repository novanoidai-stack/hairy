// Puente a los vigilantes que viven DENTRO de Postgres (public.vigilancia_bd()).
//
// Comprueban lo que un vigilante que solo mire el repo no puede ver: funciones
// que tocan el Vault al alcance de cualquiera, la regla del parametro, RLS sin
// InitPlan, ayudantes volatiles, los tipos de solicitud y la tabla de referidos.
//
// NO se cuelga de la CI a proposito. Haria falta meter una clave de Supabase en
// GitHub Actions, y ademas no serviria de nada: las RPC y las politicas no se
// crean por pull request, sino por migracion aplicada en remoto. Se corre en
// local (`npm run vigilar:bd`, leyendo .env), lo enseña el panel de staff, y
// desde el 29 ago 2026 lo dispara solo el workflow vigilancia-bd.yml cada 6 h
// a traves de la edge `ejecutar-vigilancia-bd` -- que es la unica que ve una
// clave de Supabase (regla 4).
//
// Regla 9 de CLAUDE.md: la clave se lee del entorno y si falta se FALLA a
// gritos. Nunca un valor por defecto -- asi fue como una clave filtrada paso
// meses sin que nadie lo notara.

import { hallazgo } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'base-de-datos/sin-credencial',
        'base-de-datos',
        'Los vigilantes de base de datos',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
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
  nombre: 'base-de-datos',
  ambito: 'base-de-datos',
  descripcion:
    'Vault al alcance de cualquiera, la regla del parametro, RLS con InitPlan, ayudantes STABLE, ' +
    'tipos de solicitud y la tabla de referidos',
  necesitaRed: true,
  ejecutar,
};
