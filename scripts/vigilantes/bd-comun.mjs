// Lo que comparten los vigilantes que hablan con Postgres: de donde sale la
// credencial y como se llama a una RPC.
//
// Vive aparte porque estaba escrito una vez y se iba a escribir la tercera. Un
// "lee la clave del entorno y si no esta avisa" copiado y pegado es el
// invariante repartido de manual: el dia que cambie el nombre de la variable
// -- y ya cambio una vez, de SUPABASE_SERVICE_ROLE_KEY a SUPABASE_SECRET_KEY --
// se arregla en un sitio y se queda roto en los otros dos, en silencio.

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ, hallazgo } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

export const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

// Regla 9: se prefiere la clave NUEVA y se cae a la heredada solo por
// compatibilidad. Nunca un valor por defecto -- asi fue como una clave filtrada
// paso meses sin que nadie lo notara.
export const CLAVE = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hayCredencial = () => Boolean(URL_BASE && CLAVE);

/**
 * Que falte una credencial en el .env de alguien NO es un defecto del producto:
 * es un aviso. Pero tampoco se calla, porque un vigilante que no corre y no lo
 * dice es peor que no tenerlo -- el panel se veria en verde por ausencia de
 * datos, que es la ceguera de siempre.
 */
export function sinCredencial(clave, ambito, queSeQueda) {
  return hallazgo({
    clave,
    nivel: 'aviso',
    ambito,
    titulo: `${queSeQueda} NO se ha ejecutado`,
    detalle:
      'Faltan EXPO_PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY (o la heredada ' +
      'SUPABASE_SERVICE_ROLE_KEY) en el entorno. Ponlas en .env, o mira la pestaña Salud ' +
      'del panel de staff, que llama a las mismas funciones con la sesion del propio staff ' +
      'y no necesita ninguna clave suelta. ' +
      'Trampa de Windows: `echo "X=y" >> .env` en PowerShell escribe UTF-16 y deja el ' +
      'fichero ilegible; hay que editarlo a mano.',
    fichero: '.env',
  });
}

/**
 * Llama a una RPC con la clave de servicio.
 *
 * Una secret key (sb_secret_...) NO es un JWT y viaja en la cabecera `apikey`;
 * la heredada va en `Authorization: Bearer`. Se mandan las dos para que esto
 * siga funcionando antes y despues de desactivar la heredada.
 */
export async function llamarRpc(nombre, cuerpo = {}) {
  const r = await fetch(`${URL_BASE.replace(/\/$/, '')}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: CLAVE,
      Authorization: `Bearer ${CLAVE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });

  if (!r.ok) {
    throw new Error(`${nombre}() ha devuelto ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }
  return r.json();
}
