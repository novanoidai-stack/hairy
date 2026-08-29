// Dispara los vigilantes que viven DENTRO de Postgres (public.vigilancia_bd()),
// guarda el resultado en la pestana Salud y devuelve el veredicto.
//
// El diseno de vigilantes tiene tres capas. La 1 (invariantes estaticos) corre
// en cada PR y la 3 (smoke de pantallas) tambien. La 2 -- vigilancia_bd(), la
// que comprueba lo que solo se puede ver dentro de la base de datos -- solo
// corria si alguien la llamaba a mano.
//
// Regla 4 del diseno: GitHub Actions JAMAS ve una clave de Supabase. Actions
// solo tiene VIGILANCIA_TOKEN, cuyo peor uso posible es ensuciar el panel, y la
// clave de servicio no sale de aqui. Por eso lleva verify_jwt = false y por eso
// autoriza por su cuenta con la puerta compartida (regla 9).

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
  // de migraciones del repo para la guardia de abajo.
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
    linea: null as number | null,
  }));

  // --- Guardia de migraciones ----------------------------------------------
  //
  // OJO CON LA TRAMPA: que una version NO este en schema_migrations no significa
  // que no se haya aplicado. Lo aplicado por el editor SQL del dashboard no queda
  // registrado. Por eso quien llama manda tambien la lista `ignorar`, congelada
  // en scripts/vigilantes/migraciones-conocidas.json con la prueba de cada una.
  if (Array.isArray(cuerpo.migraciones) && cuerpo.migraciones.length > 0) {
    const ignorar = new Set(cuerpo.ignorar ?? []);
    const versiones = cuerpo.migraciones
      .map((f) => (f.match(/^(\d{14})/) ?? [])[1])
      .filter((v): v is string => Boolean(v) && !ignorar.has(v));

    // Un fichero sin prefijo de version no se puede cruzar con el historial: es
    // un punto ciego. Se dice en voz alta en vez de saltarselo en silencio.
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
      // expone PostgREST (anon no tiene ni USAGE), asi que un .schema(...) fallaria.
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
            'la migracion 20260829160000_migraciones_sin_aplicar.sql, que es la que la crea. ' +
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
    // `bd` es un origen propio a proposito, no `ci`: mezcladas con las corridas
    // de los pull requests, nadie podria contestar cuando se vigilo la base por
    // ultima vez.
    origen: 'bd',
    commit: cuerpo.commit ?? null,
    rama: cuerpo.rama ?? null,
    ejecutado_en: new Date().toISOString(),
    duracion_ms: duracion,
    vigilantes: [
      { nombre: 'base-de-datos', ambito: 'base-de-datos', ms: duracion, ok: hallazgos.length === 0 },
    ],
    hallazgos,
  };

  const { error: eGuardar } = await supabase.rpc('registrar_vigilancia', { p_informe: informe });
  if (eGuardar) {
    // Que no se pueda GUARDAR no anula el veredicto: se devuelve igual.
    console.error(`[${QUIEN}] fallo al guardar el informe:`, eGuardar.message);
    return json(
      {
        ok: false,
        guardado: false,
        porque: eGuardar.message,
        bloqueantes,
        avisos: hallazgos.length - bloqueantes,
        hallazgos,
      },
      200,
    );
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
