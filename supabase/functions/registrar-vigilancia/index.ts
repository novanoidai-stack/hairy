// Recibe el informe de una corrida de vigilancia (la CI o el canario horario) y
// lo guarda, para que salga en la pestaña Salud del panel de staff.
//
// POR QUE NO USA peticionDeServicio()
// Quien llama es un workflow de GitHub Actions, no la propia base de datos. Si
// autorizara con la clave de servicio, esa clave tendria que vivir en los
// secrets de GitHub: una credencial que abre TODA la base de datos, guardada en
// un sitio mas, para hacer una sola cosa. El 28 ago 2026 se sacaron cinco claves
// de servicio del repositorio; no tiene sentido meter otra por la puerta de al
// lado.
//
// En su lugar autoriza con VIGILANCIA_TOKEN, un secreto propio que solo sirve
// para escribir en vigilancia_*. Si se filtra, lo peor que se puede hacer con el
// es ensuciar el panel.
//
// Por eso lleva `verify_jwt = false` en supabase/config.toml (GitHub Actions no
// tiene JWT) y por eso comprueba por su cuenta: regla 9 de CLAUDE.md, si una
// funcion entra en esa lista, o autoriza ella o queda abierta al mundo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claveServicio } from '../shared/claveServicio.ts';

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

// Un token no se compara con ===: eso filtra su contenido midiendo cuanto tarda
// en decir que no.
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);

  const esperado = Deno.env.get('VIGILANCIA_TOKEN');
  if (!esperado) {
    // Fallo ruidoso. Sin token configurado NO se acepta nada: un valor por
    // defecto silencioso es exactamente como se cuelan estos agujeros (regla 9).
    console.error('[registrar-vigilancia] falta VIGILANCIA_TOKEN en el entorno');
    return json({ error: 'sin_configurar', porque: 'falta VIGILANCIA_TOKEN' }, 500);
  }

  const recibido = req.headers.get('x-vigilancia-token') ?? '';
  if (!igualesEnTiempoConstante(recibido, esperado)) {
    console.warn(
      '[registrar-vigilancia] rechazada. x-vigilancia-token:',
      recibido ? `len=${recibido.length}` : 'AUSENTE',
    );
    return json({ error: 'no_autorizado', porque: 'x-vigilancia-token no coincide' }, 401);
  }

  let informe: Record<string, unknown>;
  try {
    informe = await req.json();
  } catch {
    return json({ error: 'json_invalido' }, 400);
  }

  if (!Array.isArray((informe as { hallazgos?: unknown }).hallazgos)) {
    return json({ error: 'informe_invalido', porque: 'falta el array hallazgos' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) {
    console.error('[registrar-vigilancia] falta SUPABASE_URL');
    return json({ error: 'sin_configurar', porque: 'falta SUPABASE_URL' }, 500);
  }

  const supabase = createClient(url, claveServicio());
  const { data, error } = await supabase.rpc('registrar_vigilancia', { p_informe: informe });

  if (error) {
    console.error('[registrar-vigilancia] fallo al guardar:', error.message);
    return json({ error: 'fallo_al_guardar', detalle: error.message }, 500);
  }

  return json(data ?? { ok: true });
});
