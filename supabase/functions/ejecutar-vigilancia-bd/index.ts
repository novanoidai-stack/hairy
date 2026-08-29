// Dispara los vigilantes que viven DENTRO de Postgres (public.vigilancia_bd()),
// guarda el resultado en la pestaña Salud y devuelve el veredicto.
//
// POR QUE HACE FALTA ESTO
//
// El diseño de vigilantes tiene tres capas. La 1 (invariantes estaticos) corre
// en cada PR y la 3 (smoke de pantallas) tambien. La 2 -- `vigilancia_bd()`, la
// que comprueba lo que solo se puede ver dentro de la base de datos: la regla
// del parametro, RLS sin InitPlan, ayudantes volatiles, grants a `anon` -- solo
// corria si alguien la llamaba a mano.
//
// Y eso importa porque la auditoria del 29 ago 2026 encontro cuatro cosas
// criticas y la CI no vio NINGUNA: 29 RPC definer abiertas a `anon`, `profiles`
// legible entre salones, un trigger que tumbaba el guardado de horarios y un
// cron mirando un tenant vacio. Las cuatro viven donde la CI no mira, porque las
// politicas y los grants no se crean por pull request sino por migracion
// aplicada en remoto. `vigilancia_bd()` las detecta hoy. Lo unico que faltaba
// era que alguien la llamara sola.
//
// POR QUE ES UNA EDGE FUNCTION Y NO UN PASO DE CI CON UNA CLAVE
//
// Regla 4 del diseño: GitHub Actions JAMAS ve una clave de Supabase. Un paso de
// CI que llamara a la RPC necesitaria la clave de servicio en los secrets del
// repositorio -- una credencial que abre toda la base de datos, guardada en un
// sitio mas, para hacer una sola cosa. El 28 ago 2026 se sacaron cinco claves de
// servicio del repositorio; no se mete otra por la puerta de al lado.
//
// Asi que Actions solo tiene VIGILANCIA_TOKEN, cuyo peor uso posible es ensuciar
// el panel, y la clave de servicio no sale de aqui. Por eso lleva
// `verify_jwt = false` en config.toml (Actions no tiene JWT) y por eso autoriza
// por su cuenta con la puerta compartida (regla 9).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claveServicio } from '../shared/claveServicio.ts';
import { autorizarVigilancia } from '../shared/tokenVigilancia.ts';

const QUIEN = 'ejecutar-vigilancia-bd';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-vigilancia-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

type Hallazgo = {
  clave: string;
  nivel: string;
  ambito: string;
  titulo: string;
  detalle: string | null;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);

  const permiso = autorizarVigilancia(req, QUIEN);
  if (!permiso.ok) return json(permiso.cuerpo, permiso.status);

  // El cuerpo es opcional: ata la corrida a un commit y, si viene, trae la lista
  // de migraciones del repo para la guardia de abajo. Un JSON roto no es motivo
  // para no vigilar la base.
  let cuerpo: { commit?: string; rama?: string; migraciones?: string[]; ignorar?: string[] } = {};
  try {
    cuerpo = await req.json();
  } catch {
    // error-ignorado: sin cuerpo se vigila igual, solo que sin atribucion.
  }

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) {
    console.error(`[${QUIEN}] falta SUPABASE_URL`);
    return json({ error: 'sin_configurar', porque: 'falta SUPABASE_URL' }, 500);
  }

  const supabase = createClient(url, claveServicio());

  const t0 = Date.now();
  const { data, error } = await supabase.rpc('vigilancia_bd');
  const duracion = Date.now() - t0;

  if (error) {
    console.error(`[${QUIEN}] vigilancia_bd() ha fallado:`, error.message);
    return json({ error: 'fallo_al_vigilar', detalle: error.message }, 500);
  }
  if (!Array.isArray(data)) {
    console.error(`[${QUIEN}] vigilancia_bd() no ha devuelto una lista`);
    return json({ error: 'respuesta_invalida' }, 500);
  }

  const hallazgos = (data as Hallazgo[]).map((h) => ({
    clave: h.clave,
    nivel: h.nivel,
    ambito: h.ambito ?? 'base-de-datos',
    titulo: h.titulo,
    detalle: h.detalle ?? '',
    fichero: 'base de datos',
    linea: null,
  }));

  // --- Guardia de migraciones ----------------------------------------------
  //
  // "El historial remoto manda" es la norma del repo, y no la vigilaba nadie: un
  // fichero en supabase/migrations/ que nunca se aplico se queda ahi, y dentro
  // de dos semanas nadie recuerda si fue a proposito.
  //
  // OJO CON LA TRAMPA: que una version NO este en schema_migrations no
  // significa que no se haya aplicado. Lo aplicado por el editor SQL del
  // dashboard no queda registrado. El 29 ago 2026 habia dos asi -- y su efecto
  // SI estaba en produccion (chispa_tts_keepwarm ya llevaba la publishable, y 5
  // crons ya mandaban la cabecera apikey). Por eso quien llama manda tambien la
  // lista `ignorar`, congelada en scripts/vigilantes/migraciones-conocidas.json
  // con la prueba de cada una. Sin eso, esta guardia naceria gritando en falso,
  // y una guardia que grita en falso el primer dia acaba apagada.
  if (Array.isArray(cuerpo.migraciones) && cuerpo.migraciones.length > 0) {
    const ignorar = new Set(cuerpo.ignorar ?? []);
    const versiones = cuerpo.migraciones
      .map((f) => (f.match(/^(\d{14})/) ?? [])[1])
      .filter((v): v is string => Boolean(v) && !ignorar.has(v));

    // Un fichero sin prefijo de version no se puede cruzar con el historial: es
    // un punto ciego. Se dice en voz alta en vez de saltarselo en silencio, que
    // es como estas herramientas se pudren (misma regla que el ancla perdida).
    const sinVersion = cuerpo.migraciones.filter((f) => !/^\d{14}/.test(f));
    if (sinVersion.length > 0) {
      hallazgos.push({
        clave: 'bd/migraciones-sin-version',
        nivel: 'aviso',
        ambito: 'base-de-datos',
        titulo: `${sinVersion.length} fichero(s) de migracion sin prefijo de version`,
        detalle:
          `${sinVersion.join(', ')}. Sin el sello de 14 digitos no se pueden cruzar con ` +
          'supabase_migrations.schema_migrations, asi que esta guardia no puede decir si estan ' +
          'aplicados: son un punto ciego. Renombrarlos con su fecha, o moverlos a ' +
          'archive/migraciones-legacy/ si ya no son migraciones vivas.',
        fichero: 'supabase/migrations',
        linea: null,
      });
    }

    if (versiones.length > 0) {
      // Via RPC y no consultando la tabla: el esquema supabase_migrations no lo
      // expone PostgREST (anon no tiene ni USAGE), asi que un .schema(...)
      // fallaria. La RPC vive en la migracion, donde el SQL se revisa.
      const { data: faltanRpc, error: eMig } = await supabase.rpc('migraciones_sin_aplicar', {
        p_versiones: versiones,
      });

      if (eMig) {
        console.error(`[${QUIEN}] migraciones_sin_aplicar() ha fallado:`, eMig.message);
        hallazgos.push({
          clave: 'bd/migraciones-sin-comprobar',
          nivel: 'aviso',
          ambito: 'base-de-datos',
          titulo: 'No se ha podido comprobar que migraciones estan aplicadas',
          detalle:
            `migraciones_sin_aplicar() ha devuelto: ${eMig.message}. Si dice que no existe, falta aplicar ` +
            'la migracion 20260829120000_vigilancia_bd_rendimiento.sql, que es la que la crea. ' +
            'La guardia de migraciones no ha mirado nada en esta corrida.',
          fichero: 'base de datos',
          linea: null,
        });
      } else {
        const faltan: string[] = Array.isArray(faltanRpc) ? faltanRpc : [];
        if (faltan.length > 0) {
          hallazgos.push({
            clave: 'bd/migraciones-sin-aplicar',
            nivel: 'aviso',
            ambito: 'base-de-datos',
            titulo: `${faltan.length} migracion(es) del repo no constan aplicadas`,
            detalle:
              `Versiones: ${faltan.join(', ')}. El historial remoto manda, asi que o falta aplicarlas ` +
              '(supabase db push) o se aplicaron por el editor SQL y no quedo registro. Si es lo segundo, ' +
              'COMPRUEBA EL EFECTO en produccion y anadelas a scripts/vigilantes/migraciones-conocidas.json ' +
              'con la prueba de que miraste; no las des por buenas de memoria.',
            fichero: 'supabase/migrations',
            linea: null,
          });
        }
      }
    }
  }

  const bloqueantes = hallazgos.filter((h) => h.nivel === 'bloqueante').length;

  const informe = {
    version: 1,
    // `bd` es un origen propio a proposito, no `ci`. Si estas corridas se
    // mezclaran con las de los pull requests, nadie podria contestar "¿cuando
    // fue la ultima vez que se vigilo la base?" -- y un panel en verde porque
    // nadie esta mirando es peor que uno en rojo.
    origen: 'bd',
    commit: cuerpo.commit ?? null,
    rama: cuerpo.rama ?? null,
    ejecutado_en: new Date().toISOString(),
    duracion_ms: duracion,
    vigilantes: [{ nombre: 'base-de-datos', ambito: 'base-de-datos', ms: duracion, ok: hallazgos.length === 0 }],
    hallazgos,
  };

  const { error: eGuardar } = await supabase.rpc('registrar_vigilancia', { p_informe: informe });
  if (eGuardar) {
    // Que no se pueda GUARDAR no anula el veredicto: se devuelve igual, con el
    // fallo dentro, para que el workflow pueda ponerse rojo si hay bloqueantes.
    console.error(`[${QUIEN}] fallo al guardar el informe:`, eGuardar.message);
    return json({ ok: false, guardado: false, porque: eGuardar.message, bloqueantes, avisos: hallazgos.length - bloqueantes, hallazgos }, 200);
  }

  return json({
    ok: true,
    guardado: true,
    duracion_ms: duracion,
    bloqueantes,
    avisos: hallazgos.length - bloqueantes,
    hallazgos,
  });
});
