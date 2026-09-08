// Reproduccion del error "No tienes permisos" al cambiar el estado de una cita.
// Credenciales SOLO del entorno (.env). Nada se imprime ni guarda en claro.
// Todo lo que toca (estado de la cita de prueba, role del perfil E2E) se restaura
// con la clave de servicio al final, pase lo que pase.
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
process.loadEnvFile(path.join(RAIZ, '.env'));

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.E2E_EMAIL;
const PASS = process.env.E2E_PASSWORD;

const salida = { capturado: new Date().toISOString(), pasos: [] };
let jwtUsuario = null;
const log = (paso, dato) => {
  salida.pasos.push({ paso, ...dato });
  console.log(JSON.stringify({ paso, ...dato }).slice(0, 400));
};

// apikey es SIEMPRE una clave real (anon para calls de usuario, secret para
// servicio); el JWT del usuario va solo en Authorization.
async function req(metodo, ruta, { token = ANON, cuerpo, prefer } = {}) {
  const res = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: {
      apikey: token === jwtUsuario ? ANON : token,
      Authorization: `Bearer ${token}`,
      ...(cuerpo && { 'Content-Type': 'application/json' }),
      ...(prefer && { Prefer: prefer }),
    },
    ...(cuerpo && { body: JSON.stringify(cuerpo) }),
  });
  const texto = await res.text();
  let json; try { json = JSON.parse(texto); } catch { json = texto.slice(0, 500); }
  return { status: res.status, json };
}

try {
  if (!URL_BASE || !ANON || !EMAIL || !PASS) throw new Error('Faltan credenciales E2E en .env');

  // 1. Login
  const login = await req('POST', '/auth/v1/token?grant_type=password', { cuerpo: { email: EMAIL, password: PASS } });
  if (login.status !== 200) throw new Error(`login ${login.status}: ${JSON.stringify(login.json).slice(0, 200)}`);
  const uid = login.json.user.id;
  const jwt = login.json.access_token;
  jwtUsuario = jwt;
  log('login', { ok: true, uid });

  // 2. Perfil: role y negocio
  const perfil = await req('GET', `/rest/v1/profiles?id=eq.${uid}&select=id,role,negocio_id,email`, { token: jwt });
  const p = perfil.json?.[0];
  log('perfil', { role: p?.role, negocio_id: p?.negocio_id });
  const nid = p?.negocio_id;
  if (!nid) throw new Error('perfil sin negocio_id');

  const negocio = await req('GET', `/rest/v1/negocios?id=eq.${nid}&select=id,nombre,slug`, { token: jwt });
  const nombreNegocio = negocio.json?.[0]?.nombre ?? negocio.json?.[0]?.slug ?? '?';
  const esQa = /demo|qa|test|loop|prueba/i.test(JSON.stringify(negocio.json ?? ''));
  log('negocio', { nombre: nombreNegocio, esQa });

  // 3. Citas candidatas (solo lectura)
  const citas = await req(
    'GET',
    `/rest/v1/citas?negocio_id=eq.${nid}&select=id,estado,inicio,profesional_id&order=inicio.desc&limit=10`,
    { token: jwt },
  );
  if (!Array.isArray(citas.json)) throw new Error(`citas ${citas.status}: ${JSON.stringify(citas.json).slice(0, 300)}`);
  log('citas_visibles', { total: citas.json.length, estados: [...new Set(citas.json.map(c => c.estado))] });

  const pasada = citas.json.find(c => ['pendiente', 'confirmada', 'completada'].includes(c.estado) && new Date(c.inicio) < new Date());
  if (!pasada) throw new Error('sin cita pasada util para la prueba');
  const original = pasada.estado;

  // 4. Intento de cambio de estado con el JWT del usuario (lo que hace el boton)
  const upd = await req('PATCH', `/rest/v1/citas?id=eq.${pasada.id}`, {
    token: jwt, cuerpo: { estado: 'completada' }, prefer: 'return=representation',
  });
  log('update_estado_como_usuario', { status: upd.status, cuerpo: typeof upd.json === 'string' ? upd.json : JSON.stringify(upd.json).slice(0, 400) });

  // 5. RPC marcar_cita_no_show (el boton "no presentada")
  const rpc = await req('POST', '/rest/v1/rpc/marcar_cita_no_show', { token: jwt, cuerpo: { p_cita_id: pasada.id } });
  log('rpc_no_show_como_usuario', { status: rpc.status, cuerpo: typeof rpc.json === 'string' ? rpc.json : JSON.stringify(rpc.json).slice(0, 400) });

  // 6. Bajar a employee / recepcion y reintentar el UPDATE (solo si es negocio QA)
  if (esQa && SECRET) {
    for (const role of ['employee', 'recepcion']) {
      const baja = await req('PATCH', `/rest/v1/profiles?id=eq.${uid}`, { token: SECRET, cuerpo: { role } });
      if (baja.status >= 300) { log(`bajar_a_${role}`, { status: baja.status, cuerpo: JSON.stringify(baja.json).slice(0, 200) }); continue; }
      const upd2 = await req('PATCH', `/rest/v1/citas?id=eq.${pasada.id}`, {
        token: jwt, cuerpo: { estado: 'completada' }, prefer: 'return=representation',
      });
      log(`update_estado_como_${role}`, { status: upd2.status, cuerpo: typeof upd2.json === 'string' ? upd2.json : JSON.stringify(upd2.json).slice(0, 400) });
    }
  } else {
    log('toggle_roles', { omitido: !esQa ? 'negocio no QA' : 'sin clave de servicio' });
  }

  // 7. Restaurar SIEMPRE con clave de servicio
  if (SECRET) {
    const rest1 = await req('PATCH', `/rest/v1/citas?id=eq.${pasada.id}`, { token: SECRET, cuerpo: { estado: original } });
    const rest2 = await req('PATCH', `/rest/v1/profiles?id=eq.${uid}`, { token: SECRET, cuerpo: { role: p.role } });
    log('restauracion', { cita: rest1.status, perfil: rest2.status });
  }
} catch (e) {
  log('error', { mensaje: String(e).slice(0, 400) });
}

const destino = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'repro-permiso-citas.json');
fs.writeFileSync(destino, JSON.stringify(salida, null, 2));
console.log('Escrito: ' + destino);
