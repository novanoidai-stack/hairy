// Edge Function: geocodificar-direccion
//
// Convierte una direccion de texto (calle + CP + ciudad + provincia) en
// coordenadas lat/lng usando Nominatim (OpenStreetMap). La usa el salon desde
// Configuracion -> Directorio publico para no tener que buscar las coordenadas
// a mano: escribe su direccion y pulsa "Calcular desde la direccion".
//
// Se hace en el servidor (no en el navegador) para cumplir la politica de uso
// de Nominatim: identificarse con un User-Agent propio y un email de contacto,
// y para no exponer al cliente al posible bloqueo por rate-limit.
//
// Se despliega CON verificacion de JWT (por defecto): solo cuentas logueadas
// pueden llamarla; no hay efectos secundarios ni coste.
//
// Cuerpo (POST JSON): { direccion, codigo_postal, ciudad, provincia }
// Respuesta 200: { lat: number, lng: number, display_name: string }
// Respuesta 404: { error: 'no_encontrada' } si no hay resultado.

const ORIGENES = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];
function esOrigenPermitido(o: string): boolean {
  if (ORIGENES.includes(o)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': esOrigenPermitido(o) ? o : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? cors(req) : {}), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  let body: { direccion?: string; codigo_postal?: string; ciudad?: string; provincia?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400, req);
  }

  const partes = [
    (body.direccion || '').trim(),
    [(body.codigo_postal || '').trim(), (body.ciudad || '').trim()].filter(Boolean).join(' '),
    (body.provincia || '').trim(),
    'España',
  ].filter(Boolean);
  const consulta = partes.join(', ');
  if (consulta.replace(/España|,/g, '').trim().length < 3) {
    return json({ error: 'direccion_insuficiente' }, 400, req);
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', consulta);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'es');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('email', 'contacto@mechaa.es');

  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mecha/1.0 (https://www.mechaa.es; contacto@mechaa.es)',
        'Accept': 'application/json',
        'Accept-Language': 'es',
      },
    });
  } catch {
    return json({ error: 'servicio_no_disponible' }, 502, req);
  }
  if (!resp.ok) return json({ error: 'servicio_no_disponible' }, 502, req);

  let datos: Array<{ lat?: string; lon?: string; display_name?: string }>;
  try {
    datos = await resp.json();
  } catch {
    return json({ error: 'servicio_no_disponible' }, 502, req);
  }

  const primero = Array.isArray(datos) ? datos[0] : undefined;
  const lat = primero ? Number(primero.lat) : NaN;
  const lng = primero ? Number(primero.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'no_encontrada' }, 404, req);
  }

  return json({ lat, lng, display_name: primero?.display_name || consulta }, 200, req);
});
