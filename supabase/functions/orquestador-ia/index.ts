// supabase/functions/orquestador-ia/index.ts
//
// Cerebro Central y Orquestador Autónomo de Diagnósticos IA para MECHA OS.
// Consolida incidencias de todas las capas de vigilancia, analiza las causas
// raíz y genera diagnósticos detallados con parches y prompts ejecutables
// de auto-reparación para el panel de Staff (web/admin.html) y agentes IA.
//
// Autenticación dual (verify_jwt = false en config.toml):
//  1. Servicio/Cron/CI: autorizarVigilancia(req) o peticionDeServicio(req)
//  2. Panel de Staff: token JWT de sesión con verificación de public.is_staff()

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claveServicio, peticionDeServicio } from '../shared/claveServicio.ts';
import { autorizarVigilancia } from '../shared/tokenVigilancia.ts';
import { llamarIAJson, ErrorIA, type MensajeIA } from '../shared/openrouterClient.ts';
import { auditar, auditarFallo } from '../shared/chispa-auditoria.ts';

const QUIEN = 'orquestador-ia';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vigilancia-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface HallazgoEntrada {
  clave?: string;
  ambito?: string;
  nivel?: string;
  titulo?: string;
  detalle?: string;
  fichero?: string | null;
  linea?: number | null;
}

interface DiagnosticoSalida {
  hallazgo_clave?: string;
  ambito: string;
  nivel: 'critico' | 'bloqueante' | 'aviso' | 'sugerencia';
  titulo: string;
  diagnostico: string;
  causa_raiz?: string;
  fichero?: string;
  linea?: number;
  codigo_antes?: string;
  codigo_despues?: string;
  prompt_autorreparacion: string;
}

interface RespuestaModelo {
  sintesis_salud: string;
  estado_general: 'optimo' | 'degradado' | 'critico';
  diagnosticos: DiagnosticoSalida[];
}

const SYSTEM_PROMPT = `Eres el Orquestador Autónomo y Cerebro de Diagnóstico de MECHA OS (SaaS multi-tenant para salones de peluquería y belleza, stack React/Expo Web, Node.js, Postgres RLS, Supabase Edge Functions en Deno).

Tu objetivo es analizar los hallazgos de la suite de auto-observabilidad y vigilancia profunda, determinar con máxima precisión técnica la CAUSA RAÍZ de cada problema y proporcionar:
1. Diagnóstico técnico claro y conciso.
2. Identificación exacta del archivo y línea afectada cuando aplique.
3. Propuesta de código limpio (código antes vs código después o parche sugerido).
4. Un PROMPT DE AUTO-REPARACIÓN ejecutable, autónomo y autocontenido que un desarrollador o agente IA pueda copiar y pegar directamente para solucionar la incidencia sin ambigüedad.

Reglas del sistema MECHA:
- Multi-tenant estricto: toda consulta o RPC debe aislar por negocio_id.
- Cero claves expuestas: ninguna clave de Supabase o Stripe en código cliente ni en GitHub Actions.
- Invariantes de precios, referidos y planes sincronizados.
- Ninguna política RLS abierta de escritura (USING true).
- Edge Functions con verify_jwt = false deben implementar peticionDeServicio(req) o autorizarVigilancia(req).

Devuelve SIEMPRE un objeto JSON válido con esta estructura:
{
  "sintesis_salud": "Resumen ejecutivo del estado del sistema...",
  "estado_general": "optimo" | "degradado" | "critico",
  "diagnosticos": [
    {
      "hallazgo_clave": "slug/clave",
      "ambito": "seguridad" | "precios" | "fiscal" | "rendimiento" | "pantallas" | "codigo-muerto" | "errores-tragados" | "landing" | "base-de-datos" | "vigilancia" | "cuentas" | "otros",
      "nivel": "critico" | "bloqueante" | "aviso" | "sugerencia",
      "titulo": "Título descriptivo de la incidencia",
      "diagnostico": "Explicación técnica detallada...",
      "causa_raiz": "Causa raíz identificada...",
      "fichero": "ruta/al/fichero.ts",
      "linea": 42,
      "codigo_antes": "código actual...",
      "codigo_despues": "código corregido...",
      "prompt_autorreparacion": "Prompt estructurado para que un agente IA repare el archivo..."
    }
  ]
}`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) {
    console.error(`[${QUIEN}] falta SUPABASE_URL`);
    return json({ error: 'sin_configurar', porque: 'falta SUPABASE_URL' }, 500);
  }

  // --- Autorización Dual ---
  let esLlamadaServicio = false;
  let usuarioId = 'sistema';
  let emailUsuario = 'orquestador-ia@mechaa.es';

  const permisoToken = autorizarVigilancia(req, QUIEN);
  if (permisoToken.ok || peticionDeServicio(req)) {
    esLlamadaServicio = true;
  } else {
    // Verificación de sesión de usuario (Staff)
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!jwt) {
      return json({ error: 'unauthorized', porque: 'Falta cabecera de autorizacion' }, 401);
    }

    const supabaseAuth = createClient(url, jwt);
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return json({ error: 'unauthorized', porque: 'Sesion invalida o caducada' }, 401);
    }

    usuarioId = userData.user.id;
    emailUsuario = userData.user.email ?? usuarioId;

    // Verificar permiso de staff mediante cliente de servicio
    const supabaseAdmin = createClient(url, claveServicio());
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', usuarioId)
      .maybeSingle();

    const rolesStaff = ['staff', 'admin', 'superadmin'];
    if (!profile || !rolesStaff.includes(profile.role)) {
      return json({ error: 'forbidden', porque: 'Requiere rol staff' }, 403);
    }
  }

  const supabaseAdmin = createClient(url, claveServicio());

  // --- Lectura de parámetros y hallazgos ---
  let cuerpo: {
    hallazgos?: HallazgoEntrada[];
    ejecucion_id?: number;
    ambito?: string;
  } = {};

  try {
    cuerpo = await req.json();
  } catch {
    // Si viene vacío se procede con los hallazgos recientes de la base
  }

  let hallazgosParaAnalizar: HallazgoEntrada[] = Array.isArray(cuerpo.hallazgos) && cuerpo.hallazgos.length > 0
    ? cuerpo.hallazgos
    : [];

  // Si no se proporcionaron en el body, consultar hallazgos activos de la base de datos
  if (hallazgosParaAnalizar.length === 0) {
    const { data: dbHallazgos, error: errDB } = await supabaseAdmin.rpc('staff_vigilancia_hallazgos', {
      p_dias: 7,
      p_estado: 'nuevo',
      p_ambito: cuerpo.ambito || null,
      p_nivel: null,
      p_limit: 30,
    });

    if (!errDB && Array.isArray(dbHallazgos)) {
      hallazgosParaAnalizar = dbHallazgos.map((h) => ({
        clave: h.clave,
        ambito: h.ambito,
        nivel: h.nivel,
        titulo: h.titulo,
        detalle: h.detalle,
        fichero: h.fichero,
        linea: h.linea,
      }));
    }
  }

  // Si el sistema no tiene hallazgos, emitir veredicto óptimo
  if (hallazgosParaAnalizar.length === 0) {
    return json({
      ok: true,
      sintesis_salud: 'El sistema se encuentra en estado óptimo. Todas las comprobaciones estáticas y de base de datos están en verde.',
      estado_general: 'optimo',
      diagnosticos: [],
      coste_usd: 0,
      latencia_ms: 0,
      modelo_ia: 'none',
    });
  }

  // --- Consulta al LLM vía OpenRouter ---
  const apiKey = Deno.env.get('OPENROUTER_API_KEY') || '';
  if (!apiKey) {
    console.warn(`[${QUIEN}] OPENROUTER_API_KEY ausente en el entorno`);
    return json({
      ok: false,
      error: 'sin_api_key',
      porque: 'Falta OPENROUTER_API_KEY en los secretos de Supabase',
    }, 500);
  }

  const promptUsuario = `Analiza los siguientes ${hallazgosParaAnalizar.length} hallazgos activos del sistema Mecha OS y genera diagnósticos detallados, causas raíz y prompts de auto-reparación:\n\n${JSON.stringify(hallazgosParaAnalizar, null, 2)}`;

  const mensajes: MensajeIA[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: promptUsuario },
  ];

  const t0 = Date.now();
  let resultadoIA: any = null;
  let datosParsed: RespuestaModelo | null = null;

  try {
    const res = await llamarIAJson<RespuestaModelo>(apiKey, {
      funcion: QUIEN,
      mensajes,
      perfil: 'calidad',
      json: true,
      maxTokens: 3500,
    });

    resultadoIA = res;
    datosParsed = res.datos;

    // Auditar llamada exitosa
    auditar(supabaseAdmin, res, {
      negocioId: '00000000-0000-0000-0000-000000000000',
      usuarioId,
      funcionIA: QUIEN,
      superficie: esLlamadaServicio ? 'servicio_cron' : 'panel_staff',
      contexto: {
        total_hallazgos: hallazgosParaAnalizar.length,
        ejecucion_id: cuerpo.ejecucion_id,
      },
    });
  } catch (err) {
    const errObj = err as Error;
    console.error(`[${QUIEN}] Error al llamar OpenRouter:`, errObj.message);

    auditarFallo(supabaseAdmin, {
      negocioId: '00000000-0000-0000-0000-000000000000',
      usuarioId,
      funcionIA: QUIEN,
      superficie: esLlamadaServicio ? 'servicio_cron' : 'panel_staff',
      error: errObj.message,
      latenciaMs: Date.now() - t0,
    });

    return json({
      ok: false,
      error: 'fallo_ia',
      detalle: errObj.message,
    }, 502);
  }

  // --- Persistencia en public.vigilancia_diagnosticos_ia ---
  if (datosParsed && Array.isArray(datosParsed.diagnosticos) && datosParsed.diagnosticos.length > 0) {
    const costeIndividual = resultadoIA.costeUsd / Math.max(datosParsed.diagnosticos.length, 1);

    const paraGuardar = datosParsed.diagnosticos.map((d) => ({
      ejecucion_id: cuerpo.ejecucion_id ?? null,
      hallazgo_clave: d.hallazgo_clave ?? null,
      ambito: d.ambito || 'otros',
      nivel: d.nivel || 'sugerencia',
      titulo: d.titulo || 'Diagnóstico IA',
      diagnostico: d.diagnostico || '',
      causa_raiz: d.causa_raiz ?? null,
      fichero: d.fichero ?? null,
      linea: d.linea ?? null,
      codigo_antes: d.codigo_antes ?? null,
      codigo_despues: d.codigo_despues ?? null,
      prompt_autorreparacion: d.prompt_autorreparacion || '',
      modelo_ia: resultadoIA.modelo,
      coste_usd: costeIndividual,
      latencia_ms: resultadoIA.latenciaMs,
    }));

    const { error: errGuardar } = await supabaseAdmin.rpc('guardar_diagnosticos_ia', {
      p_diagnosticos: paraGuardar,
    });

    if (errGuardar) {
      console.error(`[${QUIEN}] No se pudieron persistir los diagnósticos:`, errGuardar.message);
    }
  }

  return json({
    ok: true,
    sintesis_salud: datosParsed?.sintesis_salud ?? '',
    estado_general: datosParsed?.estado_general ?? 'optimo',
    diagnosticos: datosParsed?.diagnosticos ?? [],
    modelo_ia: resultadoIA?.modelo,
    coste_usd: resultadoIA?.costeUsd,
    latencia_ms: resultadoIA?.latenciaMs,
  });
});
