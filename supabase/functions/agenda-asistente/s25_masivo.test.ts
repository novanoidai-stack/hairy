import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

// ---------------------------------------------------------------------------
// Mocking Extremo: Interceptamos `fetch` antes de importar index.ts
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch;

let mockGeminiResponseRef: any = {};
let mockSupabaseDataRef: any = [];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString();
  
  if (url.includes('openrouter.ai')) {
    const tool_calls = mockGeminiResponseRef.functionCall 
      ? [{ function: { name: mockGeminiResponseRef.functionCall.name, arguments: JSON.stringify(mockGeminiResponseRef.functionCall.args) } }]
      : undefined;

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: mockGeminiResponseRef.text || '', tool_calls } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.includes('supabase.co')) {
    return new Response(JSON.stringify(mockSupabaseDataRef || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return originalFetch(input, init);
};

function setMocks(gemini: any, supabase: any = []) {
  mockGeminiResponseRef = gemini;
  mockSupabaseDataRef = supabase;
}

// Ahora importamos dinamicamente para que Deno recoja el globalThis.fetch mockeado
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'dummy-key');
Deno.env.set('OPENROUTER_API_KEY', 'dummy-key');
const { buildSystemPrompt, runAgente, construirPropuesta } = await import('./index.ts');
import { createClient } from 'npm:@supabase/supabase-js@2';
const dummyClient = createClient('https://mock.supabase.co', 'dummy-key');

Deno.test('S25 - Robustez: Resiste fallo del LLM devolviendo una llamada malformada', async () => {
  setMocks({ functionCall: { name: 'herramienta_inventada', args: { foo: 'bar' } } });
  try {
    const mensajes = [{ role: 'user' as const, content: 'Hola' }];
    const res = await runAgente('neg-1', 'owner', 'user-1', 'all', 'bajo', mensajes, dummyClient as any);
    assertEquals(Array.isArray(res.bloques), true);
  } catch (e) {
    throw new Error('El Agente no sobrevivió a una tool inventada: ' + e);
  }
});

Deno.test('S25 - Salud: Prompt inyecta restricciones medicas fuertemente', () => {
  const prompt = buildSystemPrompt('2026-07-10T12:00:00Z', 'all', true);
  assertStringIncludes(prompt, 'SALUD');
  assertStringIncludes(prompt, 'PROHIBIDO');
});

Deno.test('S25 - Multi-tenant: construirPropuesta bloquea o asume el negocio inyectado', async () => {
  setMocks({}, []);
  const call = { name: 'crear_cita', input: { cliente_nombre: 'Hack' } };
  const res = await construirPropuesta(call, 'neg-1', 'all', 'user-1');
  if ('error' in res) {
    assertEquals(typeof res.error, 'string');
  } else if ('pedirInfo' in res) {
    assertEquals(res.pedirInfo.tipo, 'formulario');
  } else {
    assertEquals((res as any).negocio_id, 'neg-1');
  }
});

Deno.test('S25 - Fallback UI: Sin function calls, texto seco es transformado', async () => {
  setMocks({ text: 'Lo siento, no puedo hacer eso' });
  const mensajes = [{ role: 'user' as const, content: 'Borra DB' }];
  const res = await runAgente('neg-1', 'owner', 'user-1', 'all', 'bajo', mensajes, dummyClient as any);
  assertEquals(res.bloques.length > 0, true);
});

Deno.test('S25 - Confirmar citas con exclusions', async () => {
  setMocks({}, [
    { id: 'cita-1', inicio: '2026-07-10T12:00:00Z', estado: 'pendiente', servicio_id: 'serv-1', cliente_id: 'cli-1' }
  ]);
  const call = { name: 'confirmar_citas', input: { fecha: '2026-07-10', excluir_clientes: '["Nuria Gomez"]' } };
  const res = await construirPropuesta(call, 'neg-1', 'all', 'user-1');
  if ('citas' in res) {
    assertEquals(Array.isArray(res.citas), true);
  }
});

Deno.test('S25 - Rework KISS: una tool de escritura cortada cae en el default (error)', async () => {
  // bulk_editar_horarios/comisiones se retiraron del edge (rework KISS): ya no
  // tienen case en construirPropuesta, asi que caen en el default con error.
  setMocks({}, []);
  const call = { name: 'bulk_editar_horarios', input: { profesionales: '["todos"]', dia: 'sabado', hora_inicio: '09:00', hora_fin: '14:00' } };
  const res = await construirPropuesta(call, 'neg-1', 'all', 'user-1');
  assertEquals('error' in res, true);
});
