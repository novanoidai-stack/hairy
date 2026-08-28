// Puente a los vigilantes que viven DENTRO de Postgres (public.vigilancia_bd()).
//
// Comprueban lo que un vigilante que solo mire el repo no puede ver: funciones
// que tocan el Vault al alcance de cualquiera, la regla del parametro, RLS sin
// InitPlan, ayudantes volatiles, los tipos de solicitud y la tabla de referidos.
//
// NO se cuelga de la CI a proposito. Haria falta meter una clave de Supabase en
// GitHub Actions, y ademas no serviria de nada: las RPC y las politicas no se
// crean por pull request, sino por migracion aplicada en remoto. Se corre en
// local (`npm run vigilar:bd`, leyendo .env) y lo enseña el panel de staff, que
// llama a la misma funcion con la sesion del propio staff.
//
// Regla 9 de CLAUDE.md: la clave se lee del entorno y si falta se FALLA a
// gritos. Nunca un valor por defecto -- asi fue como una clave filtrada paso
// meses sin que nadie lo notara.

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ, hallazgo } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function ejecutar() {
  if (!URL_BASE || !CLAVE) {
    // Que falte una credencial en el .env de alguien NO es un defecto del
    // producto: es un aviso. Pero tampoco se calla, porque un vigilante que no
    // corre y no lo dice es peor que no tenerlo -- el panel se veria en verde
    // por ausencia de datos.
    //
    // Donde de verdad corren estas comprobaciones es en el panel de staff, que
    // llama a public.vigilancia_bd() con su propia sesion y no necesita ninguna
    // clave suelta.
    return [
      hallazgo({
        clave: 'base-de-datos/sin-credencial',
        nivel: 'aviso',
        ambito: 'base-de-datos',
        titulo: 'Los vigilantes de base de datos NO se han ejecutado',
        detalle:
          'Faltan EXPO_PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY (o la heredada ' +
          'SUPABASE_SERVICE_ROLE_KEY) en el entorno. Ponlas en .env, o mira la ' +
          'pestaña Salud del panel de staff, que llama a vigilancia_bd() con la ' +
          'sesion del propio staff y no necesita ninguna clave suelta. ' +
          'Trampa de Windows: `echo "X=y" >> .env` en PowerShell escribe UTF-16 y ' +
          'deja el fichero ilegible; hay que editarlo a mano.',
        fichero: '.env',
      }),
    ];
  }

  // Una secret key (sb_secret_...) NO es un JWT y viaja en la cabecera `apikey`;
  // la heredada va en `Authorization: Bearer`. Se mandan las dos para que esto
  // siga funcionando antes y despues de desactivar la heredada.
  const r = await fetch(`${URL_BASE.replace(/\/$/, '')}/rest/v1/rpc/vigilancia_bd`, {
    method: 'POST',
    headers: {
      apikey: CLAVE,
      Authorization: `Bearer ${CLAVE}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!r.ok) {
    throw new Error(`vigilancia_bd() ha devuelto ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }

  const filas = await r.json();
  if (!Array.isArray(filas)) {
    throw new Error(`vigilancia_bd() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`);
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
