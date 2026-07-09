// Manifiesto legible por maquina de la capa de IA de Mecha (Chispa).
// SESION S01 - informes/plan-ia-chispa-v3 (plan V3, arbol).
//
// FUENTE DE VERDAD de la ARQUITECTURA de la capa IA: enumera cada modulo por
// capa (que hace, donde vive, su contrato) y las superficies de cara al usuario.
// Documento hermano legible por humanos: informes/plan-ia-chispa-v3/ARQUITECTURA.md.
//
// UNA SOLA FUENTE DE VERDAD catalogo<->manifiesto: las SUPERFICIES de usuario se
// DERIVAN de lib/iaCatalogo.ts (CATALOGO_IA). No se duplican aqui: si una funcion
// esta en el catalogo, esta en el manifiesto. La coherencia la garantiza el test
// lib/ia/manifiestoIA.test.ts. Los MODULOS de arquitectura (piezas internas que no
// son funciones de cara al usuario) se enumeran aparte, cada uno verificado como
// REAL (estado 'activo') o marcado 'planificado' si aun no existe (memoria/registro,
// Fase C del plan V3).
//
// NUNCA incluye secretos ni claves: solo nombres de modulo, rutas y descripciones.

import { CATALOGO_IA, type FuncionIA } from '@/lib/iaCatalogo';

// Capa arquitectonica a la que pertenece un modulo de la IA.
export type CapaIA =
  | 'ui' // panel, renderer de bloques, tarjetas, coach
  | 'orquestacion' // hooks + ejecutores deterministas en el cliente
  | 'edge-llm' // el cerebro: agenda-asistente (tools, prompt, propuestas)
  | 'datos' // tablas, RLS, RPCs
  | 'voz' // STT/TTS y su cadena de respaldo
  | 'catalogo' // descubribilidad y auto-conocimiento
  | 'memoria'; // memoria/registro durable (Fase C, aun por construir)

// 'activo' = existe y esta verificado en el repo/BD. 'planificado' = contrato
// definido aqui pero implementado en una sesion posterior (no inventar como real).
export type EstadoModulo = 'activo' | 'planificado';

// Quien puede usar/ver el modulo. Coherente con soloGestor del catalogo.
export type RolIA = 'todos' | 'gestor' | 'profesional' | 'sistema';

export interface ModuloIA {
  id: string;
  titulo: string;
  // Que hace, en una frase util para que Chispa se explique a si misma.
  queHace: string;
  // Donde vive: archivo real del repo o ruta de la app (verificable con grep).
  donde: string;
  capa: CapaIA;
  // Contrato de entrada/salida (tipos, firma, evento). Opcional para superficies simples.
  entradas?: string;
  salidas?: string;
  rol: RolIA;
  estado: EstadoModulo;
}

// ---------------------------------------------------------------------------
// MODULOS DE ARQUITECTURA (piezas internas; verificadas una a una con grep/BD)
// ---------------------------------------------------------------------------
export const MODULOS_IA: ModuloIA[] = [
  // --- UI ---
  {
    id: 'panel-chispa',
    titulo: 'Panel de Chispa',
    queHace: 'Drawer conversacional (voz/texto) que renderiza bloques tipados y ejecuta propuestas tras confirmacion.',
    donde: 'components/chispa/ChispaPanel.web.tsx (+ ChispaLauncher.web.tsx, montado en app/_layout.tsx)',
    capa: 'ui',
    entradas: 'mensajes del usuario; onRespuestaInteractiva(bloque,payload)',
    salidas: 'Bloque[] renderizados',
    rol: 'todos',
    estado: 'activo',
  },
  {
    id: 'renderer-bloques',
    titulo: 'Renderer de bloques',
    queHace: 'Mapea cada tipo de bloque a un componente reutilizable (texto/enlace/accion/grafica/comparativa/formulario/opciones/progreso).',
    donde: 'components/chispa/BloqueRenderer.web.tsx',
    capa: 'ui',
    entradas: 'Bloque (lib/chispaBloques.ts)',
    salidas: 'nodo React',
    rol: 'todos',
    estado: 'activo',
  },
  {
    id: 'protocolo-bloques',
    titulo: 'Protocolo de bloques tipados',
    queHace: 'Contrato comun: el edge devuelve Bloque[] en vez de texto plano; union EXTENSIBLE.',
    donde: 'lib/chispaBloques.ts',
    capa: 'ui',
    entradas: 'respuesta del edge',
    salidas: 'Bloque[] (normalizarRespuesta)',
    rol: 'sistema',
    estado: 'activo',
  },
  {
    id: 'tarjeta-ayuda-ia',
    titulo: 'Tarjeta de IA por pagina',
    queHace: 'Superficie de IA proactiva embebida en una pantalla, con estados visibles idle/cargando/vacio/error/listo.',
    donde: 'components/chispa/TarjetaAyudaIA.web.tsx',
    capa: 'ui',
    entradas: 'EstadoAyudaIA (useAyudaIA)',
    salidas: 'tarjeta con bloques y reintento',
    rol: 'todos',
    estado: 'activo',
  },
  // --- ORQUESTACION (cliente, determinista) ---
  {
    id: 'hook-ayuda-ia',
    titulo: 'Hook useAyudaIA',
    queHace: 'Estado explicito por el que pasa toda IA por pagina; impide fallos silenciosos.',
    donde: 'lib/hooks/useAyudaIA.ts (patron: informes/PATRON-IA-POR-PAGINA.md)',
    capa: 'orquestacion',
    entradas: 'analizar(prompt, contexto)',
    salidas: 'EstadoAyudaIA + reintentar()',
    rol: 'todos',
    estado: 'activo',
  },
  {
    id: 'ejecutor-chispa-ops',
    titulo: 'Ejecutor general chispaOps',
    queHace: 'Aplica en el cliente las acciones propuestas por el LLM tras confirmacion (nunca las ejecuta el LLM).',
    donde: 'lib/chispaOps.ts (+ lib/agendaOps.ts)',
    capa: 'orquestacion',
    entradas: 'AccionPropuesta',
    salidas: 'escritura en BD + resultado',
    rol: 'sistema',
    estado: 'activo',
  },
  {
    id: 'organizar-agenda',
    titulo: 'Organizador de agenda (determinista)',
    queHace: 'Detecta retrasos/huecos/solapes y calcula movimientos coherentes de las 4 marcas de la cita.',
    donde: 'lib/organizarAgenda.ts (+ lib/retrasos.ts)',
    capa: 'orquestacion',
    entradas: 'citas del dia + config',
    salidas: 'plan de movimientos',
    rol: 'profesional',
    estado: 'activo',
  },
  {
    id: 'onboarding-agent',
    titulo: 'Config guiada (onboardingAgent)',
    queHace: 'Orquesta "configurame el salon" dentro de Chispa; el LLM solo interpreta por tema.',
    donde: 'lib/onboardingAgent.ts',
    capa: 'orquestacion',
    entradas: 'intencion del usuario',
    salidas: 'pasos de formulario + escrituras de config',
    rol: 'gestor',
    estado: 'activo',
  },
  // --- EDGE / LLM ---
  {
    id: 'edge-agenda-asistente',
    titulo: 'Cerebro (edge agenda-asistente)',
    queHace: 'Deriva negocio_id + rol del JWT, arma el prompt, llama al LLM con tools de lectura/escritura y devuelve Bloque[]. IA propone, profesional confirma.',
    donde: 'supabase/functions/agenda-asistente/index.ts (+ permisos.ts, whitelist.ts)',
    capa: 'edge-llm',
    entradas: '{ mensajes } + Authorization',
    salidas: '{ bloques, texto, accion_propuesta? }',
    rol: 'sistema',
    estado: 'activo',
  },
  {
    id: 'razonamiento-universal',
    titulo: 'Marco de razonamiento universal',
    queHace: 'Procedimiento fijo por turno (clasificar intencion -> minima info -> mejor superficie -> proponer -> confirmar) + doctrina "casi nunca texto plano" con red de seguridad determinista que garantiza una superficie util (nunca texto seco ni cuelgue).',
    donde: 'supabase/functions/agenda-asistente/index.ts (PROCEDIMIENTO_UNIVERSAL + garantizarSuperficie) <- informes/plan-ia-chispa-v3/RAZONAMIENTO-UNIVERSAL.md',
    capa: 'edge-llm',
    entradas: 'cualquier mensaje del usuario',
    salidas: 'Bloque[] siempre con una superficie accionable',
    rol: 'sistema',
    estado: 'activo',
  },
  {
    id: 'auto-conocimiento',
    titulo: 'Auto-conocimiento de Chispa',
    queHace: 'Resumen compacto de las superficies de IA inyectado en el prompt para responder "que se hacer / donde configuro X" con enlaces.',
    donde: 'supabase/functions/agenda-asistente/index.ts (AUTOCONOCIMIENTO_IA) <- proyeccion de este manifiesto',
    capa: 'catalogo',
    entradas: 'pregunta del usuario sobre capacidades',
    salidas: 'lista de capacidades + chips sugerir_enlace',
    rol: 'todos',
    estado: 'activo',
  },
  // --- VOZ ---
  {
    id: 'voz-cadena',
    titulo: 'Voz neural (TTS) con respaldo',
    queHace: 'Lee las respuestas: Kokoro-FastAPI (VPS) -> ElevenLabs -> speechSynthesis del navegador (con aviso honesto).',
    donde: 'supabase/functions/chispa-tts + lib/hooks/useChispaVoz.web.ts',
    capa: 'voz',
    entradas: 'texto',
    salidas: 'audio (o fallback navegador)',
    rol: 'todos',
    estado: 'activo',
  },
  {
    id: 'voz-stt',
    titulo: 'Dictado (STT)',
    queHace: 'Transcribe la voz del usuario para hablarle a Chispa.',
    donde: 'supabase/functions/chispa-stt + Web Speech',
    capa: 'voz',
    entradas: 'audio',
    salidas: 'texto',
    rol: 'todos',
    estado: 'activo',
  },
  // --- CATALOGO / DESCUBRIBILIDAD ---
  {
    id: 'hub-ia',
    titulo: 'Hub "Que hace la IA"',
    queHace: 'Catalogo discoverible de todas las funciones de IA, agrupado por categoria, con enlace a cada pantalla.',
    donde: 'components/config/HubIA.tsx <- lib/iaCatalogo.ts',
    capa: 'catalogo',
    entradas: 'rol del usuario',
    salidas: 'listado navegable',
    rol: 'todos',
    estado: 'activo',
  },
  // --- DATOS ---
  {
    id: 'conversaciones-ia',
    titulo: 'Registro de conversaciones de canal',
    queHace: 'Log de conversaciones de los agentes de canal (WhatsApp/voz): resumen + transcripcion por cliente/cita.',
    donde: 'tabla public.conversaciones_ia (RLS por negocio_id)',
    capa: 'datos',
    entradas: 'canal, telefono, cliente_id, cita_id',
    salidas: 'resumen (text), transcripcion (jsonb)',
    rol: 'sistema',
    estado: 'activo',
  },
  // --- MEMORIA (Fase C, aun por construir: contrato definido, no inventar como real) ---
  {
    id: 'memoria-corto-plazo',
    titulo: 'Memoria de corto plazo (sesion)',
    queHace: 'Hilo de la conversacion actual del panel; hoy solo en localStorage, sin persistencia durable.',
    donde: 'localStorage (ChispaPanel) -> Fase C: tabla durable propuesta',
    capa: 'memoria',
    entradas: 'turnos de la sesion',
    salidas: 'contexto reciente',
    rol: 'sistema',
    estado: 'planificado',
  },
  {
    id: 'memoria-largo-plazo',
    titulo: 'Memoria durable del negocio (largo plazo)',
    queHace: 'Hechos aprendidos del salon y de cada ficha, con RLS por negocio_id, retencion definida y borrable (RGPD). Salud NUNCA.',
    donde: 'Fase C (S09/S10): tabla propuesta ia_memoria (negocio_id, ambito, clave, valor, vigencia)',
    capa: 'memoria',
    entradas: 'hechos consolidados',
    salidas: 'contexto de largo plazo para el prompt',
    rol: 'sistema',
    estado: 'planificado',
  },
  {
    id: 'registro-universal',
    titulo: 'Registro universal de acciones (episodica)',
    queHace: 'Bitacora "todo queda registrado" sobre la que se apoya el recuerdo temporal ("hace 4 meses").',
    donde: 'Fase C (S08/S11): tabla propuesta ia_registro (negocio_id, actor, accion, entidad, ts, meta jsonb)',
    capa: 'memoria',
    entradas: 'evento de accion',
    salidas: 'historial consultable e indexado por fecha',
    rol: 'sistema',
    estado: 'planificado',
  },
];

// ---------------------------------------------------------------------------
// SUPERFICIES DE USUARIO (derivadas de CATALOGO_IA; una sola fuente de verdad)
// ---------------------------------------------------------------------------
// Mapa categoria del catalogo -> capa arquitectonica del manifiesto.
const CAPA_POR_CATEGORIA: Record<FuncionIA['categoria'], CapaIA> = {
  panel: 'ui',
  voz: 'voz',
  migracion: 'datos',
  config: 'orquestacion',
  agenda: 'orquestacion',
  pagina: 'orquestacion',
};

// Convierte una FuncionIA del catalogo en un ModuloIA del manifiesto.
function funcionAModulo(fn: FuncionIA): ModuloIA {
  return {
    id: fn.id,
    titulo: fn.titulo,
    queHace: fn.descripcion,
    donde: fn.ubicacion,
    capa: CAPA_POR_CATEGORIA[fn.categoria],
    entradas: fn.uso,
    rol: fn.soloGestor ? 'gestor' : 'todos',
    estado: 'activo',
  };
}

// Superficies de cara al usuario, SIEMPRE en sync con el Hub y los manuales.
export const SUPERFICIES_IA: ModuloIA[] = CATALOGO_IA.map(funcionAModulo);

// Manifiesto completo: arquitectura interna + superficies de usuario.
export const MANIFIESTO_IA: ModuloIA[] = [...MODULOS_IA, ...SUPERFICIES_IA];

// ---------------------------------------------------------------------------
// Proyeccion compacta para el prompt del edge (auto-conocimiento de Chispa).
// El edge (Deno) no puede importar este modulo (@/), por eso lleva una copia
// compacta hand-maintained en index.ts (AUTOCONOCIMIENTO_IA). Este helper genera
// el MISMO texto para que exista un unico algoritmo de proyeccion consultable.
// ---------------------------------------------------------------------------
export function resumenAutoconocimiento(): string {
  const lineas = SUPERFICIES_IA.map((m) => {
    const rol = m.rol === 'gestor' ? ' [solo gestor]' : '';
    return `- ${m.titulo}${rol}: ${m.queHace} (${m.donde})`;
  });
  return 'CAPACIDADES DE CHISPA (superficies de IA disponibles):\n' + lineas.join('\n');
}
