// Utilidad compartida para auditoría de IA (Chispa)
// Calcula costes de tokens y registra en chispa_auditoria
//
// Precios aproximados por 1M tokens (USD, 2026):
// - claude-haiku-4.5: $0.25 input, $1.25 output
// - claude-sonnet-5: $3 input, $15 output
// - claude-opus-4.8: $15 input, $75 output
// - gpt-4o: $2.5 input, $10 output
// - gpt-4o-mini: $0.15 input, $0.6 output

interface CosteModelo {
  inputPorM: number;
  outputPorM: number;
}

const PRECIOS_MODELOS: Record<string, CosteModelo> = {
  'claude-haiku-4.5': { inputPorM: 0.25, outputPorM: 1.25 },
  'claude-haiku': { inputPorM: 0.25, outputPorM: 1.25 },
  'claude-sonnet-5': { inputPorM: 3.0, outputPorM: 15.0 },
  'claude-sonnet-4.5': { inputPorM: 3.0, outputPorM: 15.0 },
  'claude-sonnet': { inputPorM: 3.0, outputPorM: 15.0 },
  'claude-opus-4.8': { inputPorM: 15.0, outputPorM: 75.0 },
  'claude-opus': { inputPorM: 15.0, outputPorM: 75.0 },
  'gpt-4o': { inputPorM: 2.5, outputPorM: 10.0 },
  'gpt-4o-mini': { inputPorM: 0.15, outputPorM: 0.6 },
  'gpt-4-turbo': { inputPorM: 10.0, outputPorM: 30.0 },
  // Por defecto, precio medio
  'default': { inputPorM: 3.0, outputPorM: 15.0 },
};

/**
 * Calcula el coste en USD de una ejecución de IA
 */
export function calcularCosteTokens(
  modelo: string,
  tokensInput: number,
  tokensOutput: number
): number {
  // Normalizar nombre del modelo
  const modeloNormalizado = modelo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const precios = PRECIOS_MODELOS[modeloNormalizado] || PRECIOS_MODELOS['default'];

  const costeInput = (tokensInput / 1_000_000) * precios.inputPorM;
  const costeOutput = (tokensOutput / 1_000_000) * precios.outputPorM;

  return costeInput + costeOutput;
}

/**
 * Registra una ejecución de IA en la tabla chispa_auditoria
 *
 * @param supabase - Cliente Supabase autenticado
 * @param negocioId - ID del negocio
 * @param usuarioId - ID del usuario
 * @param funcionIA - Nombre de la función (ej: 'asistente_agenda', 'organizar_agenda')
 * @param modelo - Modelo usado (ej: 'claude-haiku-4.5')
 * @param tokensInput - Tokens de entrada
 * @param tokensOutput - Tokens de salida
 * @param superficie - Pantalla desde la que se llamó (opcional)
 * @param exito - Si la ejecución fue exitosa
 * @param errorMensaje - Mensaje de error si falló
 * @param latenciaMs - Tiempo de respuesta en ms
 * @param contexto - Contexto adicional (jsonb)
 */
export async function registrarAuditoriaIA(
  supabase: any,
  params: {
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
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const costeUsd = calcularCosteTokens(params.modelo, params.tokensInput, params.tokensOutput);

    const { data, error } = await supabase.rpc('registrar_auditoria_ia', {
      p_negocio_id: params.negocioId,
      p_usuario_id: params.usuarioId,
      p_funcion_ia: params.funcionIA,
      p_modelo: params.modelo,
      p_tokens_input: params.tokensInput,
      p_tokens_output: params.tokensOutput,
      p_coste_usd: costeUsd,
      p_superficie: params.superficie || null,
      p_exito: params.exito !== false,
      p_error_mensaje: params.errorMensaje || null,
      p_latencia_ms: params.latenciaMs || null,
      p_contexto: params.contexto || {},
    });

    if (error) {
      console.error('[ChispaAuditoria] Error registrando auditoría:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data };
  } catch (err) {
    console.error('[ChispaAuditoria] Excepción registrando auditoría:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Wrapper para ejecutar una llamada LLM y registrar automáticamente la auditoría
 *
 * @example
 * const resultado = await ejecutarYRegistrar(supabase, {
 *   negocioId: 'demo_salon_001',
 *   usuarioId: userId,
 *   funcionIA: 'asistente_agenda',
 *   modelo: 'claude-haiku-4.5',
 *   superficie: 'Agenda',
 *   callback: async () => {
 *     // Tu llamada LLM aquí
 *     return await anthropic.messages.create({...});
 *   }
 * });
 */
export async function ejecutarYRegistrar<T extends { usage?: { input_tokens: number; output_tokens: number } }>(
  supabase: any,
  params: {
    negocioId: string;
    usuarioId: string;
    funcionIA: string;
    modelo: string;
    superficie?: string;
    callback: () => Promise<T>;
  }
): Promise<{ resultado?: T; error?: string; auditoriaId?: string }> {
  const inicio = Date.now();

  try {
    const resultado = await params.callback();
    const latenciaMs = Date.now() - inicio;

    const tokensInput = resultado.usage?.input_tokens || 0;
    const tokensOutput = resultado.usage?.output_tokens || 0;

    // Registrar auditoría en background (no bloquear)
    registrarAuditoriaIA(supabase, {
      negocioId: params.negocioId,
      usuarioId: params.usuarioId,
      funcionIA: params.funcionIA,
      modelo: params.modelo,
      tokensInput,
      tokensOutput,
      superficie: params.superficie,
      exito: true,
      latenciaMs,
    }).catch(err => console.error('[ChispaAuditoria] Error en registro asíncrono:', err));

    return { resultado, auditoriaId: 'pending' };
  } catch (err) {
    const latenciaMs = Date.now() - inicio;

    // Registrar error
    registrarAuditoriaIA(supabase, {
      negocioId: params.negocioId,
      usuarioId: params.usuarioId,
      funcionIA: params.funcionIA,
      modelo: params.modelo,
      tokensInput: 0,
      tokensOutput: 0,
      superficie: params.superficie,
      exito: false,
      errorMensaje: err instanceof Error ? err.message : 'Unknown error',
      latenciaMs,
    }).catch(e => console.error('[ChispaAuditoria] Error en registro de error:', e));

    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
