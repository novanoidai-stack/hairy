// supabase/functions/shared/openrouterClient.ts
// Helper centralizado para invocar modelos en OpenRouter con reintentos y fallback automático.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | any[];
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenRouterOptions {
  modelChain: string[];
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: 'json_object' } | any;
  tools?: any[];
  toolChoice?: string | any;
  appName?: string;
}

export async function callOpenRouterWithFallback(
  apiKey: string,
  options: OpenRouterOptions
): Promise<{ content: string; toolCalls?: any[]; modelUsed: string }> {
  let lastError: Error | null = null;

  for (const model of options.modelChain) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const body: Record<string, unknown> = {
          model,
          messages: options.messages,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature ?? 0.2,
        };

        if (options.responseFormat) body.response_format = options.responseFormat;
        if (options.tools && options.tools.length > 0) {
          body.tools = options.tools;
          body.tool_choice = options.toolChoice ?? 'auto';
        }

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://www.novanoidai.com',
            'X-Title': options.appName || 'Hairy AI',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errTxt = await res.text();
          const isNotFound = res.status === 404 || errTxt.toLowerCase().includes('no endpoints found') || errTxt.toLowerCase().includes('model_not_found');
          console.warn(`[openrouterClient] Error en modelo ${model} (status ${res.status}):`, errTxt);

          if (isNotFound) break; // saltar inmediatamente al siguiente modelo
          if ((res.status === 429 || res.status >= 500) && attempt === 0) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          break;
        }

        const json = await res.json();
        const choice = json.choices?.[0]?.message;
        if (!choice) throw new Error(`OpenRouter (${model}) devolvió payload sin mensaje`);

        return {
          content: choice.content || '',
          toolCalls: choice.tool_calls,
          modelUsed: model,
        };
      } catch (err: any) {
        lastError = err;
        console.warn(`[openrouterClient] Excepción con modelo ${model}:`, err?.message || err);
      }
    }
  }

  throw lastError ?? new Error(`Todos los modelos configurados fallaron: ${options.modelChain.join(', ')}`);
}
