// supabase/functions/shared/chispa-auditoria.ts
//
// Registro de consumo de IA en la tabla `chispa_auditoria`.
// Los precios NO viven aqui: salen de `modelos.ts`, que es lo unico verificado
// contra el catalogo real de OpenRouter. Tener dos tablas de precios fue
// exactamente el problema anterior (la de aqui subestimaba el coste hasta 3x).

import { calcularCoste } from './modelos.ts';
import type { ResultadoIA } from './openrouterClient.ts';

export interface DatosAuditoria {
  negocioId: string;
  usuarioId: string;
  funcionIA: string;
  modelo: string;
  tokensInput: number;
  tokensOutput: number;
  superficie?: string;
  exito?: boolean;
  errorMensaje?: string;
  latenciaMs?: number;
  contexto?: Record<string, unknown>;
}

/** Coste en USD segun el catalogo verificado. Modelo desconocido -> estimacion alta. */
export function calcularCosteTokens(modelo: string, tokensInput: number, tokensOutput: number): number {
  return calcularCoste(modelo, tokensInput, tokensOutput);
}

export async function registrarAuditoriaIA(
  supabase: any,
  params: DatosAuditoria,
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const costeUsd = calcularCoste(params.modelo, params.tokensInput, params.tokensOutput);

    const { data, error } = await supabase.rpc('registrar_auditoria_ia', {
      p_negocio_id: params.negocioId,
      p_usuario_id: params.usuarioId,
      p_funcion_ia: params.funcionIA,
      p_modelo: params.modelo,
      p_tokens_input: params.tokensInput,
      p_tokens_output: params.tokensOutput,
      p_coste_usd: costeUsd,
      p_superficie: params.superficie ?? null,
      p_exito: params.exito !== false,
      p_error_mensaje: params.errorMensaje ?? null,
      p_latencia_ms: params.latenciaMs ?? null,
      p_contexto: params.contexto ?? {},
    });

    if (error) {
      console.error('[auditoria] no se pudo registrar:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true, id: data };
  } catch (err) {
    console.error('[auditoria] excepcion:', err instanceof Error ? err.message : err);
    return { success: false, error: err instanceof Error ? err.message : 'error desconocido' };
  }
}

/**
 * Atajo para el caso normal: acabas de recibir un ResultadoIA y quieres dejarlo
 * registrado. NUNCA lanza ni bloquea la respuesta al usuario: si la auditoria
 * falla, el peluquero igual recibe su respuesta.
 */
export function auditar(
  supabase: any,
  resultado: ResultadoIA,
  datos: { negocioId: string; usuarioId: string; funcionIA: string; superficie?: string; contexto?: Record<string, unknown> },
): void {
  registrarAuditoriaIA(supabase, {
    negocioId: datos.negocioId,
    usuarioId: datos.usuarioId,
    funcionIA: datos.funcionIA,
    modelo: resultado.modelo,
    tokensInput: resultado.tokensIn,
    tokensOutput: resultado.tokensOut,
    superficie: datos.superficie,
    exito: true,
    latenciaMs: resultado.latenciaMs,
    contexto: {
      ...datos.contexto,
      // Deja rastro de la degradacion: si esto se llena, un modelo esta caido.
      intentos_fallidos: resultado.intentosFallidos,
    },
  }).catch(() => { /* ya se ha logueado dentro */ });
}

/** Registra un fallo total de IA (ningun modelo respondio). */
export function auditarFallo(
  supabase: any,
  datos: { negocioId: string; usuarioId: string; funcionIA: string; superficie?: string; error: string; latenciaMs?: number },
): void {
  registrarAuditoriaIA(supabase, {
    negocioId: datos.negocioId,
    usuarioId: datos.usuarioId,
    funcionIA: datos.funcionIA,
    modelo: 'ninguno',
    tokensInput: 0,
    tokensOutput: 0,
    superficie: datos.superficie,
    exito: false,
    errorMensaje: datos.error.slice(0, 500),
    latenciaMs: datos.latenciaMs,
  }).catch(() => { /* ya se ha logueado dentro */ });
}
