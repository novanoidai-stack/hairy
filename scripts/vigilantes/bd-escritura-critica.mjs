// Puente a vigilancia_bd_escritura_critica(): prueba que INSERT INTO citas
// funciona de verdad, disparando todos sus triggers. Hace rollback automatico.
//
// POR QUE EXISTE (30 ago 2026)
// Todos los vigilantes existentes eran de LECTURA: leian esquema, leian texto,
// leian pantallas. Ningun vigilante hacia una escritura real. Cuando un trigger
// nuevo (trg_seed_fases_from_cita) rompio la ruta de escritura de citas, los
// vigilantes dieron verde: "npm run vigilar → 0 bloqueantes, 43 avisos".
//
// Este vigilante hace lo unico que puede cerrar ese hueco: un INSERT de verdad,
// dentro de un bloque EXCEPTION que hace rollback del subtransaction. Si el
// INSERT o cualquiera de sus triggers revientan, se entera.
//
// LA PATA DE USUARIO (8 sep 2026)
// El INSERT de arriba corre con la clave de servicio. El 8 sep el boton de
// cambiar el estado de una cita (y TODA escritura de citas con sesion de
// peluquero) devolvia 42501 "permission denied for function
// ventanas_activas_cita": el sello trg_citas_sellar_ventanas es SECURITY
// INVOKER y pide permisos de authenticated que nadie le habia concedido
// (arreglado en 20260908155046). La pata de servicio seguia verde porque el
// service_role no pide esos grants: el vigilante decia que la escritura
// funcionaba mientras ningun usuario podia escribir una cita. Esta segunda pata
// hace el mismo recorrido CON LA SESION del usuario E2E: un PATCH real de una
// cita de su negocio escribiendo su propio estado (no cambia nada, pero pasa
// por todos los BEFORE triggers y el candado). Coste: la cita de QA tocada
// marca updated_at en cada pasada. Aceptable en un negocio de pruebas.

import { hallazgo } from './nucleo.mjs';
import { URL_BASE, hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

// Puro: clasifica el recorrido de la pata de usuario. Separado del I/O para
// poder testear el mapa de veredictos sin tocar la red.
//   login:  { ok: true } | { ok: false, status: number } | { falta: true }
//   perfil: { negocio_id: string } | null
//   citas:  { total: number } | null
//   update: { status: number, mensaje: string } | null
// Devuelve null (todo bien) o un veredicto { clave, nivel, titulo, detalle }.
export function evaluarPataUsuario({ login, perfil, citas, update }) {
  if (!login || login.falta) {
    return {
      clave: 'escritura-critica/sin-usuario-e2e',
      nivel: 'aviso',
      titulo: 'Sin credenciales E2E para probar la escritura con sesion de usuario',
      detalle:
        'La pata de servicio de este vigilante no ve los grants de authenticated: el 8 sep 2026 ' +
        'la escritura de citas con sesion llevaba rota dias con este vigilante en verde. Pon ' +
        'E2E_EMAIL y E2E_PASSWORD en .env para que se pruebe de verdad.',
    };
  }
  if (!login.ok) {
    return {
      clave: 'escritura-critica/login-e2e',
      nivel: 'aviso',
      titulo: `El login del usuario E2E devolvio ${login.status}`,
      detalle:
        'Sin sesion no se puede probar la escritura de citas como usuario. No es bloqueante ' +
        '(puede ser credencial caducada o un golpe de red), pero mientras dure, la pata de ' +
        'usuario de este vigilante esta ciega.',
    };
  }
  if (!perfil || !perfil.negocio_id) {
    return {
      clave: 'escritura-critica/perfil-e2e-sin-negocio',
      nivel: 'aviso',
      titulo: 'El usuario E2E no tiene perfil con negocio_id',
      detalle:
        'Sin negocio no hay citas que tocar. La cuenta E2E debe ser un usuario con negocio propio ' +
        '(el de pruebas) para que la pata de usuario tenga algo que escribir.',
    };
  }
  if (!citas || citas.total === 0) {
    return {
      clave: 'escritura-critica/sin-citas-prueba',
      nivel: 'aviso',
      titulo: 'El negocio del usuario E2E no tiene citas para la prueba',
      detalle:
        'La pata de usuario escribe el estado ACTUAL de una cita existente (no-op) para recorrer ' +
        'los triggers con la sesion de verdad. Sin citas no hay prueba: crea una cita de prueba ' +
        'en el negocio E2E.',
    };
  }
  if (!update) {
    return {
      clave: 'escritura-critica/escritura-usuario-sin-ejecutar',
      nivel: 'bloqueante',
      titulo: 'La escritura con sesion de usuario no llego a ejecutarse',
      detalle:
        'Habia credencial, perfil y cita, y aun asi no hay veredicto del PATCH. Eso es un bug ' +
        'del propio vigilante, no de la base de datos: revisa el flujo de la pata de usuario.',
    };
  }
  if (update.status < 200 || update.status >= 300) {
    const esPermiso = update.status === 403 || /permission denied|row-level/i.test(update.mensaje);
    return {
      clave: 'escritura-critica/escritura-usuario-citas',
      nivel: 'bloqueante',
      titulo: esPermiso
        ? `Un usuario con sesion no puede escribir citas: ${update.mensaje.slice(0, 120)}`
        : `El PATCH de una cita con sesion de usuario devolvio ${update.status}`,
      detalle:
        'La pata de servicio puede estar verde y esta rota: los triggers de citas (sello de ' +
        'ventanas, resumen de fases) corren como SECURITY INVOKER y necesitan que authenticated ' +
        'tenga EXECUTE en toda su cadena. Si el mensaje nombra una funcion, el arreglo es un ' +
        'grant explicito a authenticated en una migracion, con comentario (ver 20260908155046).',
    };
  }
  return null;
}

// El recorrido real: login REST, elegir cita del propio negocio, PATCH con su
// propio estado. Devuelve las piezas crudas para que decida evaluarPataUsuario.
async function recorrerPataUsuario() {
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!anon || !email || !password) return { login: { falta: true } };

  const loginRes = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) return { login: { ok: false, status: loginRes.status } };
  const { access_token: jwt, user } = await loginRes.json();

  // El JWT del usuario va SOLO en Authorization; apikey es siempre la clave
  // anon. Confundirlas da un 401 "Invalid API key" que nada tiene que ver con
  // lo que se esta probando.
  const headers = { apikey: anon, Authorization: `Bearer ${jwt}` };
  const perfilRes = await fetch(
    `${URL_BASE}/rest/v1/profiles?id=eq.${user.id}&select=negocio_id`,
    { headers },
  );
  const perfil = (await perfilRes.json())[0] ?? null;
  if (!perfil?.negocio_id) return { login: { ok: true }, perfil: null };

  const citasRes = await fetch(
    `${URL_BASE}/rest/v1/citas?negocio_id=eq.${perfil.negocio_id}&select=id,estado&order=inicio.desc&limit=1`,
    { headers },
  );
  const citas = await citasRes.json();
  if (!Array.isArray(citas) || citas.length === 0)
    return { login: { ok: true }, perfil, citas: { total: 0 } };

  const cita = citas[0];
  const updateRes = await fetch(`${URL_BASE}/rest/v1/citas?id=eq.${cita.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    // Su propio estado: no-op de datos pero viaje completo por los triggers.
    body: JSON.stringify({ estado: cita.estado }),
  });
  const cuerpo = updateRes.headers.get('content-type')?.includes('json')
    ? JSON.stringify(await updateRes.json())
    : '';
  return {
    login: { ok: true },
    perfil,
    citas: { total: citas.length },
    update: { status: updateRes.status, mensaje: (cuerpo || '').slice(0, 300) },
  };
}

async function ejecutar() {
  if (!hayCredencial()) {
    return [
      sinCredencial(
        'bd-escritura-critica/sin-credencial',
        'base-de-datos',
        'El vigilante de escritura critica',
      ),
    ];
  }

  const filas = await llamarRpc('vigilancia_bd_escritura_critica');
  if (!Array.isArray(filas)) {
    throw new Error(
      `vigilancia_bd_escritura_critica() no ha devuelto una lista: ${JSON.stringify(filas).slice(0, 300)}`,
    );
  }

  const hallazgos = filas.map((f) =>
    hallazgo({
      clave: `escritura-critica/${f.tipo}${f.funcion ? `-${f.funcion}` : ''}`,
      nivel: f.nivel || 'bloqueante',
      ambito: 'base-de-datos',
      titulo: f.titulo || `Escritura critica: ${f.tipo}`,
      detalle: f.detalle,
      fichero: 'base de datos',
    }),
  );

  const piezas = await recorrerPataUsuario();
  const veredicto = evaluarPataUsuario(piezas);
  if (veredicto) {
    hallazgos.push(hallazgo({ ambito: 'base-de-datos', fichero: 'base de datos', ...veredicto }));
  }

  return hallazgos;
}

export default {
  nombre: 'bd-escritura-critica',
  ambito: 'base-de-datos',
  descripcion:
    'Prueba que INSERT INTO citas funciona con todos sus triggers (con rollback) Y que un usuario con sesion de verdad puede escribir una cita: la pata de servicio no ve los grants de authenticated.',
  necesitaRed: true,
  ejecutar,
};
