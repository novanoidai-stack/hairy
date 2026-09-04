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

  const comoHallazgo = (h: Hallazgo, ambitoPorDefecto: string) => ({
    clave: h.clave,
    nivel: h.nivel,
    ambito: h.ambito ?? ambitoPorDefecto,
    titulo: h.titulo,
    detalle: h.detalle ?? '',
    fichero: 'base de datos',
    linea: null as number | null,
  });

  const hallazgos = (data as Hallazgo[]).map((h) => comoHallazgo(h, 'base-de-datos'));

  // --- Cuellos de botella -----------------------------------------------
  //
  // Va en la MISMA corrida a proposito. Medir estaba hecho desde el 29 ago,
  // pero solo corria cuando alguien lanzaba `npm run vigilar:bd` a mano -- que
  // es exactamente el agujero que este workflow venia a tapar, un nivel mas
  // abajo. Una medida que depende de que alguien se acuerde no es una medida.
  //
  // Todo lo que devuelve es `aviso` salvo los locks: son datos para priorizar,
  // no fallos. Si tumbaran la CI, alguien acabaria quitando el paso.
  const { data: rend, error: eRend } = await supabase.rpc('vigilancia_bd_rendimiento');
  if (eRend) {
    // No poder medir NO es "todo bien": se dice en voz alta (regla del ancla).
    console.error(`[${QUIEN}] vigilancia_bd_rendimiento() ha fallado:`, eRend.message);
    hallazgos.push({
      clave: 'bd/rendimiento-sin-medir',
      nivel: 'aviso',
      ambito: 'rendimiento',
      titulo: 'No se han podido medir los cuellos de botella de la base',
      detalle:
        `vigilancia_bd_rendimiento() ha devuelto: ${eRend.message}. Si dice que no existe, ` +
        'falta aplicar 20260829120000_vigilancia_bd_rendimiento.sql. Si se queja de ' +
        'pg_stat_statements, recordar que vive en el esquema `extensions`, no en `public`, ' +
        'y esta funcion fija search_path a public: hay que nombrarla con esquema.',
      fichero: 'base de datos',
      linea: null,
    });
  } else if (Array.isArray(rend)) {
    hallazgos.push(...(rend as Hallazgo[]).map((h) => comoHallazgo(h, 'rendimiento')));
  }

  // --- Ecosistema de cuentas ------------------------------------------------
  //
  // Salones sin titular, modo de acceso que contradice a las cuentas, topes que
  // el cliente se puede subir solo y -- la que justifica la familia entera -- el
  // guarda de identidad de `profiles` comprobado palabra por palabra.
  //
  // Esa ultima nace de lo peor que se encontro el 30 ago 2026: la version
  // DESPLEGADA de guard_profile_identity_columns() no era la del repo. Alguien
  // habia reescrito a mano cambiando `new.plan := old.plan` por
  // `COALESCE(new.plan, old.plan)`, que no congela nada, y con eso cualquier
  // usuario con sesion podia darse role='owner' y cambiarse el negocio_id -- o
  // sea, entrar en el salon de otro. Ningun vigilante lo vio porque ninguno
  // comparaba CUERPOS de funcion: bd-migraciones.mjs compara versiones.
  const { data: eco, error: eEco } = await supabase.rpc('vigilancia_bd_ecosistema');
  if (eEco) {
    // No poder mirar NO es "todo bien" (regla del ancla perdida).
    console.error(`[${QUIEN}] vigilancia_bd_ecosistema() ha fallado:`, eEco.message);
    hallazgos.push({
      clave: 'bd/ecosistema-sin-comprobar',
      nivel: 'bloqueante',
      ambito: 'cuentas',
      titulo: 'No se ha podido comprobar el ecosistema de cuentas',
      detalle:
        `vigilancia_bd_ecosistema() ha devuelto: ${eEco.message}. Si dice que no existe, falta ` +
        'aplicar 20260830104500_vigilancia_ecosistema_cuentas.sql. Mientras no corra, nadie ' +
        'esta mirando si el guarda de identidad de profiles sigue congelando role y negocio_id, ' +
        'que es lo que impide que un empleado se ascienda a Propietario o se cambie de salon. ' +
        'Es bloqueante a proposito: esta comprobacion no puede quedarse muda en silencio.',
      fichero: 'base de datos',
      linea: null,
    });
  } else if (Array.isArray(eco)) {
    hallazgos.push(...(eco as Hallazgo[]).map((h) => comoHallazgo(h, 'cuentas')));
  }

  // --- Suite de Salud Profunda (10 vectores) --------------------------------
  //
  // Vector 1: Claves foraneas sin indice en columnas hijas.
  // Vector 2: Contencion de locks y deadlocks (>5s).
  // Vector 3: Tuplas muertas y bloat de tablas (>1000 y >20%).
  // Vector 4: Riesgo de desborde de secuencias numericas (>75% / >90%).
  // Vector 5: Cobertura 100% RLS en esquema public y definers con search_path.
  // Vector 6: Saturacion del pool de conexiones (>75% / >90%).
  // Vector 7: Estado y fallos en jobs de pg_cron.
  // Vector 8: Privacidad de buckets de Storage (cliente-fotos) y RLS en storage.objects.
  // Vector 9: Continuidad criptografica SHA-256 de VeriFactu y correlatividad.
  // Vector 10: Deteccion de registros huerfanos relacionales.
  const { data: prof, error: eProf } = await supabase.rpc('vigilancia_bd_profunda');
  if (eProf) {
    console.error(`[${QUIEN}] vigilancia_bd_profunda() ha fallado:`, eProf.message);
    hallazgos.push({
      clave: 'bd/profunda-sin-comprobar',
      nivel: 'bloqueante',
      ambito: 'base-de-datos',
      titulo: 'No se ha podido ejecutar la suite de salud profunda de base de datos',
      detalle:
        `vigilancia_bd_profunda() ha devuelto: ${eProf.message}. Si dice que no existe, falta ` +
        'aplicar 20260830210000_vigilancia_bd_suite_profunda.sql. La vigilancia profunda ' +
        'comprueba 10 vectores criticos (FKs, locks >5s, bloat, secuencias, RLS 100%, ' +
        'pool, crons, storage, VeriFactu SHA-256 y huerfanos) y no puede quedarse muda.',
      fichero: 'base de datos',
      linea: null,
    });
  } else if (Array.isArray(prof)) {
    hallazgos.push(...(prof as Hallazgo[]).map((h) => comoHallazgo(h, 'base-de-datos')));
  }

  // --- Vigilancia de sistema (30 ago 2026) ----------------------------------
  //
  // Las tres clases de fallo que el 30 ago tumbaron produccion sin que ninguna
  // capa dijera nada: triggers que referencian columnas inexistentes (ninguna
  // cita se podia crear), sobrecargas de RPC que PostgREST no desambigua (el
  // portal devolvia HTTP 300) y una escritura real que nadie probaba nunca.
  // Migracion: 20260830220000_vigilancia_bd_sistema.sql. Puentes en Node para
  // `npm run vigilar:bd`: bd-triggers-ciegos / bd-sobrecargas-rpc /
  // bd-escritura-critica.
  const vigilanciaSistema: Array<[string, string]> = [
    ['vigilancia_bd_triggers_ciegos', 'triggers ciegos'],
    ['vigilancia_bd_sobrecargas_rpc', 'sobrecargas de RPC'],
    ['vigilancia_bd_escritura_critica', 'escritura critica'],
    ['vigilancia_bd_invariantes', 'invariantes de datos'],
    // Paso 3 de la spec 1 (20260904190000): la foto de respaldos contra la
    // realidad. Tripwire del paso 4; se retira con el paso 5.
    ['regresion_citas_fases_v2', 'regresion de fases'],
  ];

  for (const [rpc, nombre] of vigilanciaSistema) {
    const { data: sis, error: eSis } = await supabase.rpc(rpc);
    if (eSis) {
      console.error(`[${QUIEN}] ${rpc}() ha fallado:`, eSis.message);
      hallazgos.push({
        clave: `bd/${rpc}-sin-comprobar`,
        nivel: 'bloqueante',
        ambito: 'base-de-datos',
        titulo: `No se ha podido ejecutar la vigilancia de ${nombre}`,
        detalle:
          `${rpc}() ha devuelto: ${eSis.message}. Si dice que no existe, falta aplicar ` +
          '20260830220000_vigilancia_bd_sistema.sql. Esta vigilancia es la que caza triggers ' +
          'ciegos (columnas inexistentes que tumban escrituras), sobrecargas de RPC que ' +
          'PostgREST no desambigua (HTTP 300 en el portal) y la prueba real de INSERT en ' +
          'citas; no puede quedarse muda.',
        fichero: 'base de datos',
        linea: null,
      });
    } else if (Array.isArray(sis)) {
      hallazgos.push(...(sis as Hallazgo[]).map((h) => comoHallazgo(h, 'base-de-datos')));
    }
  }

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
    // Se declaran por separado para que el panel pueda decir cual de
    // ellos encontro que, en vez de atribuirlo todo a "base-de-datos".
    vigilantes: [
      {
        nombre: 'base-de-datos',
        ambito: 'base-de-datos',
        ms: duracion,
        ok: !hallazgos.some((h) => h.ambito === 'base-de-datos' && !h.clave.startsWith('bd-profunda/')),
      },
      {
        nombre: 'bd-profunda',
        ambito: 'base-de-datos',
        ms: null,
        ok: !hallazgos.some((h) => h.clave.startsWith('bd-profunda/')),
      },
      {
        nombre: 'bd-rendimiento',
        ambito: 'rendimiento',
        ms: null,
        ok: !hallazgos.some((h) => h.ambito === 'rendimiento'),
      },
      {
        nombre: 'bd-ecosistema',
        ambito: 'cuentas',
        ms: null,
        ok: !hallazgos.some((h) => h.ambito === 'cuentas'),
      },
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
