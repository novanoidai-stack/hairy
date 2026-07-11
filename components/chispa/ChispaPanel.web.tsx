import { useState, useRef, useEffect } from 'react';
// @ts-ignore react-dom no tiene @types instalado en este proyecto; createPortal existe en runtime.
import { createPortal } from 'react-dom';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { ejecutarAccion, deshacerAccion, type AccionPropuesta } from '@/lib/agendaOps';
import { normalizarRespuesta, CHISPA_RUTAS, CHISPA_CONFIG_GUIADA_EVENT, CHISPA_ORGANIZAR_EVENT, CHISPA_ORGANIZAR_FLAG, type Bloque } from '@/lib/chispaBloques';
import { estructurarBloques } from '@/lib/chispaEstructura';
import { elegirFormatoDatos } from '@/lib/chispaFormato';
import { lanzarCoach } from '@/lib/coachGuias';
import { TOURS, lanzarTour, reanudarTour, leerProgresoTour, tourPorId } from '@/lib/tours';
import { BloqueRenderer, type AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { ChispaMascota } from '@/components/chispa/ChispaMascota.web';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { MotionStyles } from '@/lib/motion';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { useChispaVoz } from '@/lib/hooks/useChispaVoz.web';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import BriefingAgenda from '@/components/agenda/BriefingAgenda';
import {
  TEMA_ORDEN, TEMA_TITULO_SECCION, TEMA_DESTINO_MANUAL, TEMA_FALLBACK, HORARIO_PRESETS,
  pedirPregunta, ejecutarAccion as ejecutarAccionOnboarding,
  type TemaId, type ContextoEjecucion, type PerfilAgente, type ResultadoAccion,
} from '@/lib/onboardingAgent';
import { BIBLIOTECA_PROMPTS, obtenerTipCarga, normalizarPathname, type PromptBiblioteca } from '@/lib/chispaPrompts';

function triggerHaptic() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(40); } catch (e) {}
  }
}

// Chispa — panel conversacional de la capa de IA (web). Drawer lateral que se
// abre desde una pestana fija en el borde derecho. Renderiza RESPUESTAS por
// BLOQUES TIPADOS (texto / enlace / accion) mediante BloqueRenderer.
// PR-12: el LLM propone; el profesional confirma. En la demo compartida los
// cambios NO se aplican de verdad (guardrail) y hay limite de mensajes.
// Voz (Sesion 5): microfono (Web Speech + fallback STT server-side) y lectura
// en voz alta de las respuestas (ElevenLabs con fallback a speechSynthesis).

// T.fireGradient ahora vive en designTokens.ts como T.fireGradient — UNICA fuente de verdad
const DEMO_LIMITE_MSGS = 15; // rate-limit por sesion en la demo compartida
const DEMO_COUNT_KEY = 'mecha-chispa-demo-msgs';
const FULLSCREEN_KEY = 'mecha-chispa-fullscreen'; // preferencia por navegador (Sesion 1)
// Memoria de sesion (Sesion 2 V2): hilo completo por negocio+usuario. NUNCA en
// demo (tenant compartido: guardar aqui filtraria conversacion entre visitantes).
const HILO_KEY_PREFIX = 'mecha-chispa-hilo:';
// Igual que el antiguo OnboardingAgentOverlay: el asistente de puesta en marcha
// se ofrece una sola vez por navegador mientras el nucleo del negocio no este
// completo. Retirado ese overlay (Sesion 2 V2): el flujo vive dentro de Chispa.
const ONBOARDING_AUTO_KEY_PREFIX = 'mecha-chispa-onboarding-auto:';

const PANEL_STYLES = `
  @keyframes chispaDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes chispaBackdropIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes chispaMsgIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes chispaTabIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes chispaDot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }
  @keyframes chispaTabPulse {
    0%, 100% { box-shadow: 0 8px 24px rgba(192,38,10,0.32); }
    50% { box-shadow: 0 8px 32px rgba(244,80,30,0.52), 0 0 16px rgba(255,140,66,0.3); }
  }
  @keyframes chispaTypewriter { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes chispaStatusPulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(15,157,107,0.14); } 50% { box-shadow: 0 0 0 3px rgba(15,157,107,0.28), 0 0 6px rgba(15,157,107,0.4); } }
  .chispa-status-dot { animation: chispaStatusPulse 2.4s ease-in-out infinite; }
  .chispa-msg { animation: chispaMsgIn 0.3s cubic-bezier(0.16,1,0.3,1); }
  .chispa-drawer { animation: chispaDrawerIn 0.30s cubic-bezier(0.16,1,0.3,1); }
  .chispa-backdrop { animation: chispaBackdropIn 0.25s ease; }
  .chispa-launch-tab { animation: chispaTabIn 0.3s cubic-bezier(0.16,1,0.3,1), chispaTabPulse 3s ease-in-out infinite 0.3s; }
  .chispa-typewriter-word { display: inline; animation: chispaTypewriter 0.18s ease-out both; }
  .chispa-text-bubble strong, .chispa-text-bubble b { font-weight: 700; color: #1c1814; }
  .chispa-text-bubble em, .chispa-text-bubble i { font-style: italic; }
  .chispa-text-bubble code { background: rgba(40,30,24,0.06); padding: 1px 5px; border-radius: 4px; font-size: 12.5px; font-family: monospace; }
  .chispa-text-bubble ul, .chispa-text-bubble ol { margin: 4px 0; padding-left: 18px; }
  .chispa-text-bubble li { margin-bottom: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .chispa-msg, .chispa-drawer, .chispa-backdrop, .chispa-launch-tab, .chispa-typewriter-word, .chispa-status-dot { animation: none !important; }
  }
`;

// ts: momento de creacion del mensaje (epoch ms). Se sella al crearlo para
// mostrar la hora del turno y separar "quien dijo que y cuando" (S03 V3).
// Opcional por retrocompatibilidad con hilos persistidos antes de S03.
type Mensaje =
  | { role: 'user'; content: string; imagenB64?: string; ts?: number }
  | { role: 'assistant'; bloques: Bloque[]; accionEstado: AccionEstado | null; ts?: number };

export interface ChispaPanelProps {
  negocioId: string;
  // nombre: nombre del usuario del equipo, para etiquetar "quien habla" en el
  // hilo (S03 V3). Opcional: si falta se muestra "Tu".
  profile: { id: string; role?: string | null; nombre?: string };
  onAgendaChanged: () => void;
  // Toggle Configuracion > Asistente de agenda (IA) > Briefing proactivo (Sesion 6).
  // Default true: una clave ausente en negocio_config no debe apagar el briefing.
  briefingActivo?: boolean;
  // true cuando el asistente general (asistenteAgendaActivo) esta apagado y el
  // panel se monto SOLO para que un gestor con el nucleo pendiente pueda llegar
  // a "poner en marcha tu salon" (Sesion 2 V2, ver ChispaLauncher.web). En ese
  // caso la pestana flotante permanece oculta mientras el panel esta cerrado.
  soloOnboarding?: boolean;
  // Contexto del negocio para pre-rellenar el formulario de datos_negocio y
  // (via el edge onboarding-agent) enriquecer la pregunta de servicios con una
  // estimacion de precio de mercado si hay codigo postal.
  nombreNegocio?: string;
  codigoPostal?: string;
  chispaVozId?: string;
}

function IconoCerrar({ size = 15, color = T.textSecondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoImagen({ size = 16, color = T.textSecondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function IconoEnviar({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoMicro({ size = 16, color = T.textSecondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke={color} strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconoAltavoz({ size = 15, color = T.textSecondary, activo = false }: { size?: number; color?: string; activo?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {activo
        ? <path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        : <path d="M16 9l5 6M21 9l-5 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function IconoStop({ size = 12, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" fill={color} />
    </svg>
  );
}

function IconoPantallaCompleta({ activo, size = 15, color = T.textSecondary }: { activo: boolean; size?: number; color?: string }) {
  return activo ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sella el momento de creacion de un mensaje. Un solo punto para que TODO
// mensaje nuevo lleve hora (S03 V3), sin repetir Date.now() en cada push.
function ahora(): number { return Date.now(); }

// Hora corta del turno (HH:MM) para la cabecera de cada grupo de mensajes.
function fmtHora(ts?: number): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// --- Config guiada (Sesion 2 V2): Chispa hospeda "configurame el salon". ---
// Deteccion de intencion DETERMINISTA (sin LLM: "Determinista primero" del
// plan V2) para no gastar una llamada al edge solo para clasificar el mensaje.
function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const FRASES_CONFIG_GUIADA = [
  'configurame el salon', 'configurame mi salon', 'configura mi salon', 'configurar mi salon',
  'configurame el negocio', 'configura mi negocio', 'configurar mi negocio', 'configurame todo',
  'ponme en marcha', 'pon en marcha', 'poner en marcha mi salon', 'poner en marcha el salon',
  'quiero configurar mi salon', 'quiero poner en marcha', 'empezar a configurar', 'ayudame a configurar',
];

function detectaIntencionConfigGuiada(texto: string): boolean {
  const t = normalizarTexto(texto.trim());
  return !!t && FRASES_CONFIG_GUIADA.some((f) => t.includes(f));
}

// Intencion de "organizar/optimizar la agenda de hoy": se resuelve con el panel
// determinista (varias estrategias visuales) en vez de con el LLM. Incluye los
// prompts exactos de los chips "Optimizar agenda" y "Verificar retrasos".
const FRASES_ORGANIZAR = [
  'optimiza mi agenda', 'optimizar mi agenda', 'optimiza la agenda', 'optimizar la agenda',
  'optimiza mi dia', 'organiza mi agenda', 'organizar mi agenda', 'organiza mi dia',
  'compactar los huecos', 'compacta mi agenda', 'junta mis citas', 'evitar retrasos',
  'compactar huecos', 'hay retrasos previstos', 'estrategias para mitigarlos',
  'sugerencias para compactar', 'reorganiza mi agenda',
];

function detectaIntencionOrganizar(texto: string): boolean {
  const t = normalizarTexto(texto.trim());
  return !!t && FRASES_ORGANIZAR.some((f) => t.includes(f));
}

// ¿Esta la Agenda montada (unico sitio con los datos de citas) para poder abrir
// el organizador determinista?
function organizadorDisponible(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, boolean>)[CHISPA_ORGANIZAR_FLAG];
}

// Guardrail de demo (Sesion 2 V2): ninguna escritura de onboardingAgent.ejecutarAccion
// se llama de verdad en el tenant compartido. El recibo debe sonar tan real como en
// produccion, asi que se formatea igual que lib/onboardingAgent.ts (sin llamarlo).
function resumenDemoOnboarding(tipo: string, args: Record<string, any>): string {
  switch (tipo) {
    case 'completar_datos_negocio': return `${args.nombre} · ${args.direccion} · ${args.telefono}`;
    case 'crear_servicio': return `${args.nombre} · ${Number(args.precio).toFixed(2)} € · ${args.duracion_min} min`;
    case 'crear_profesional': return `${args.nombre} · ${String(args.categoria).replace('_', ' ')}`;
    case 'fijar_horario_salon': return 'Horario guardado.';
    case 'activar_reserva_online': return args.activar ? 'Reserva online activada.' : 'Reserva online sin activar por ahora.';
    case 'activar_notificaciones': return args.activar ? 'Recordatorios por WhatsApp activados.' : 'Recordatorios sin activar por ahora.';
    default: return 'Hecho.';
  }
}

const CATEGORIAS_EQUIPO = [
  { valor: 'auxiliar', label: 'Auxiliar' },
  { valor: 'oficial', label: 'Oficial' },
  { valor: 'oficial_mayor', label: 'Oficial mayor' },
  { valor: 'estilista_senior', label: 'Estilista senior' },
  { valor: 'direccion', label: 'Dirección artística' },
];

function idPasoOnboarding(tema: TemaId, tag = ''): string {
  return `onb-${tema}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Construye el paso INICIAL (formulario/opciones) de un tema del onboarding
// como bloques tipados de Chispa, en vez del "campo de texto" del antiguo
// overlay. El LLM (via pedirPregunta) solo aporta el titulo/subtitulo
// contextual (p.ej. la estimacion de precio de servicios si hay codigo
// postal) y el nombre del negocio ya conocido se pre-rellena en el acto: el
// ORDEN y la EJECUCION siguen siendo deterministas, igual que antes.
function construirPasoTema(
  tema: TemaId,
  pregunta: { titulo: string; subtitulo?: string; placeholder_ejemplo?: string },
  perfil: PerfilAgente,
): { id: string; previos: Bloque[]; interactivo: Bloque; kind: string } {
  switch (tema) {
    case 'datos_negocio': {
      const id = idPasoOnboarding(tema);
      return {
        id,
        previos: [{ tipo: 'texto', texto: pregunta.titulo }],
        interactivo: {
          tipo: 'formulario', id, titulo: TEMA_TITULO_SECCION[tema], enviarLabel: 'Guardar datos',
          campos: [
            { key: 'nombre', label: 'Nombre del negocio', tipo: 'texto', requerido: true, valor: perfil.nombreNegocio ?? '' },
            { key: 'direccion', label: 'Dirección', tipo: 'texto', requerido: true },
            { key: 'telefono', label: 'Teléfono', tipo: 'tel', requerido: true },
          ],
        },
        kind: 'datos_negocio_form',
      };
    }
    case 'servicios': {
      const id = idPasoOnboarding(tema);
      const previos: Bloque[] = [{ tipo: 'texto', texto: pregunta.titulo }];
      if (pregunta.subtitulo) previos.push({ tipo: 'texto', texto: pregunta.subtitulo });
      return {
        id,
        previos,
        interactivo: {
          tipo: 'formulario', id, titulo: 'Nuevo servicio', enviarLabel: 'Crear servicio',
          campos: [
            { key: 'nombre', label: 'Nombre del servicio', tipo: 'texto', requerido: true },
            { key: 'precio', label: 'Precio', tipo: 'euro', requerido: true },
            { key: 'duracion_min', label: 'Duración (min)', tipo: 'numero', requerido: true },
          ],
        },
        kind: 'servicio_form',
      };
    }
    case 'equipo': {
      const id = idPasoOnboarding(tema);
      return {
        id,
        previos: [{ tipo: 'texto', texto: pregunta.titulo }],
        interactivo: {
          tipo: 'formulario', id, titulo: 'Nuevo profesional', enviarLabel: 'Dar de alta',
          campos: [
            { key: 'nombre', label: 'Nombre del profesional', tipo: 'texto', requerido: true },
            { key: 'categoria', label: 'Categoría', tipo: 'select', opciones: CATEGORIAS_EQUIPO, valor: 'oficial' },
          ],
        },
        kind: 'equipo_form',
      };
    }
    case 'horario_salon': {
      const id = idPasoOnboarding(tema);
      return {
        id,
        previos: [{ tipo: 'texto', texto: 'Elige el horario que más se parezca al tuyo (podrás afinarlo después en Ajustes).' }],
        interactivo: {
          tipo: 'opciones', id, titulo: TEMA_TITULO_SECCION[tema],
          opciones: HORARIO_PRESETS.map((p, i) => ({ valor: String(i), label: p.label })),
        },
        kind: 'horario_opciones',
      };
    }
    case 'reserva_online': {
      const id = idPasoOnboarding(tema);
      return {
        id,
        previos: [{ tipo: 'texto', texto: pregunta.titulo }],
        interactivo: {
          tipo: 'opciones', id,
          opciones: [{ valor: 'si', label: 'Sí, activarla' }, { valor: 'no', label: 'Ahora no' }],
        },
        kind: 'reserva_opciones',
      };
    }
    case 'fotos_servicios': {
      const id = idPasoOnboarding(tema);
      return {
        id,
        previos: [{ tipo: 'texto', texto: 'El portal funciona sin fotos, pero con ellas entra por los ojos y reserva más gente.' }],
        interactivo: {
          tipo: 'opciones', id,
          opciones: [
            { valor: 'ahora', label: 'Ir a subir fotos ahora', descripcion: 'Te llevo a Configuración → Servicios' },
            { valor: 'despues', label: 'Más tarde' },
          ],
        },
        kind: 'fotos_opciones',
      };
    }
    case 'notificaciones': {
      const id = idPasoOnboarding(tema);
      return {
        id,
        previos: [{ tipo: 'texto', texto: pregunta.titulo }],
        interactivo: {
          tipo: 'opciones', id,
          opciones: [{ valor: 'si', label: 'Sí, activarlos' }, { valor: 'no', label: 'Ahora no' }],
        },
        kind: 'notif_opciones',
      };
    }
  }
}

export default function ChispaPanel({
  negocioId, profile, onAgendaChanged, briefingActivo = true,
  soloOnboarding = false, nombreNegocio, codigoPostal, chispaVozId = 'ef_dora'
}: ChispaPanelProps) {
  const { isMobile } = useResponsive();
  // Nombre corto para etiquetar los turnos del usuario en el hilo (S03 V3).
  const nombreUsuario = profile.nombre?.trim().split(/\s+/)[0] || 'Tú';
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [imagenB64, setImagenB64] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Pantalla completa del panel (Sesion 1 V2): preferencia persistida por navegador.
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  // blockId -> payload ya enviado de un bloque 'formulario'/'opciones' (Sesion 1 V2).
  const [respuestasInteractivas, setRespuestasInteractivas] = useState<Record<string, unknown>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stylesInjected = useRef(false);

  // Prompts prefabricados y tips de carga
  const pathname = usePathname();
  const [tipCarga, setTipCarga] = useState('');
  const [promptCat, setPromptCat] = useState<'recomendados' | 'agenda' | 'clientes' | 'gestion' | 'marketing' | 'general' | 'todos'>('recomendados');

  // Voz (Sesion 5): microfono + lectura en voz alta. Todo vive en el hook;
  // aqui solo se conecta a los puntos donde se anaden mensajes.
  const voz = useChispaVoz(chispaVozId);
  // Modo comparacion A/B (solo dev/decision, no para clientas): ?vozab=1 en la
  // URL muestra el selector de motor de voz para decidir si compensa el plan
  // de pago de ElevenLabs frente al speechSynthesis gratis del navegador.
  // ?chispatest=1 (mismo espiritu): manda un bloque de prueba con
  // 'formulario'+'opciones'+'progreso' sin llamar al edge, para verificar el
  // contrato de bloques interactivos end-to-end (Sesion 1 V2).
  // ?onboarding_ia=1: fuerza la config guiada una vez, sin tocar el flag de
  // localStorage (previsualizacion manual, mismo criterio que el antiguo
  // OnboardingAgentOverlay retirado en la Sesion 2 V2).
  const { vozab, chispatest, onboarding_ia } = useGlobalSearchParams<{ vozab?: string; chispatest?: string; onboarding_ia?: string }>();
  const mostrarSelectorVoz = vozab === '1';
  const mostrarArnesPruebas = chispatest === '1';

  // --- Config guiada (Sesion 2 V2): "configurame el salon" dentro de Chispa ---
  const esGestorOnboarding = profile.role === 'owner' || profile.role === 'admin';
  const perfilOnboarding: PerfilAgente = { nombreNegocio, codigoPostal };
  const onbStatus = useOnboardingStatus(esGestorOnboarding ? negocioId : null, esGestorOnboarding);
  const [configGuiada, setConfigGuiada] = useState(false);
  const [temaIdx, setTemaIdx] = useState(0);
  // S05: ultima accion reversible con timestamp para deshacer (ventana de 10s)
  const [ultimaAccion, setUltimaAccion] = useState<{ id: string; label: string; ts: number } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const ctxOnboardingRef = useRef<ContextoEjecucion>({ negocioId, profesionalesCreados: [], serviciosCreados: [], datosNegocioSesion: undefined });
  // blockId -> a que tema/paso pertenece (formulario/opciones de la config
  // guiada usan el MISMO callback onRespuestaInteractiva que el chat normal;
  // este mapa es lo que distingue "hay que ejecutar un paso del onboarding" de
  // "hay que reenviar esto como texto al chat general").
  const bloqueDescriptorRef = useRef<Record<string, { tema: TemaId; kind: string }>>({});
  // S18: snapshot de los temas ya completados en el momento de iniciar la config
  // guiada. Sirve para RETOMAR (saltar lo hecho) en vez de reiniciar desde el
  // primer tema. Congelado al arrancar para no reaccionar a refrescos a mitad.
  const omitidosOnboardingRef = useRef<Record<string, boolean>>({});
  const hiloCargado = useRef(false);

  const amplio = pantallaCompleta && !isMobile;

  const esGestor = profile.role === 'owner' || profile.role === 'admin';
  const pathNormalizado = normalizarPathname(pathname);

  // Filtrar los prompts de la biblioteca que puede ver el usuario
  const promptsVisibles = BIBLIOTECA_PROMPTS.filter(p => {
    if (p.soloGestor && !esGestor) return false;
    return true;
  });

  // Prompts específicos para la página actual
  const promptsDeEstaPagina = promptsVisibles.filter(p => p.paginas && p.paginas.includes(pathNormalizado));

  // Determinar la categoría inicial/defecto de la biblioteca de prompts
  useEffect(() => {
    if (promptsDeEstaPagina.length > 0) {
      setPromptCat('recomendados');
    } else {
      setPromptCat('todos');
    }
  }, [pathname, promptsDeEstaPagina.length]);

  // Sugerencias rápidas arriba del input
  const chipsSugeridos = [
    ...promptsDeEstaPagina,
    ...promptsVisibles.filter(p => !p.paginas || !p.paginas.includes(pathNormalizado))
  ].slice(0, 5);

  useEffect(() => {
    if (cargando) {
      setTipCarga(obtenerTipCarga());
    }
  }, [cargando]);

  useEffect(() => {
    try { setPantallaCompleta(localStorage.getItem(FULLSCREEN_KEY) === '1'); } catch { /* no critico */ }
  }, []);

  function alternarPantallaCompleta() {
    setPantallaCompleta((v) => {
      const nv = !v;
      try { localStorage.setItem(FULLSCREEN_KEY, nv ? '1' : '0'); } catch { /* no critico */ }
      return nv;
    });
  }

  // Rate-limit de la demo: contador por sesion (persistente entre recargas del iframe).
  const demoCount = useRef<number>(0);
  useEffect(() => {
    if (!IS_DEMO_MODE || typeof sessionStorage === 'undefined') return;
    demoCount.current = Number(sessionStorage.getItem(DEMO_COUNT_KEY) || '0') || 0;
  }, []);

  // ¿Hay una accion propuesta sin resolver? Mientras la haya, el input se bloquea
  // (una operacion a la vez, igual que el flujo anterior).
  const hayAccionPendiente = mensajes.some(
    (m) => m.role === 'assistant' && m.accionEstado === 'pendiente',
  );
  // La config guiada tambien bloquea el texto libre: es un asistente paso a
  // paso (formularios/opciones en orden), no tiene sentido mezclar un mensaje
  // suelto a mitad. "Saltar este paso"/"Salir" (mas abajo) son la valvula de
  // escape, no el campo de texto.
  const bloqueado = cargando || hayAccionPendiente || configGuiada;

  useEffect(() => {
    if (stylesInjected.current) return;
    stylesInjected.current = true;
    const el = document.createElement('style');
    el.textContent = PANEL_STYLES;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, abierto]);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 120);
    // Al abrir Chispa con la voz activa, pre-calentar Kokoro en segundo plano:
    // el cold start (~15-20s la 1a vez tras un reinicio) se paga mientras el
    // usuario lee/escribe, no cuando pide oir la respuesta.
    if (abierto && voz.vozActiva) void voz.precalentar();
  }, [abierto, voz.vozActiva]);

  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Primer Escape sale de pantalla completa (sin tocar la preferencia
      // guardada); el siguiente Escape cierra el panel.
      if (pantallaCompleta) { setPantallaCompleta(false); return; }
      setAbierto(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abierto, pantallaCompleta]);

  // Memoria de sesion (S09): restaura el hilo (mensajes + estado de la
  // config guiada) al montar, UNA vez. En demo usa localStorage (para no
  // cruzar conversaciones). En real usa chispa_memoria a largo plazo.
  useEffect(() => {
    if (hiloCargado.current || typeof localStorage === 'undefined') return;
    
    const loadState = async () => {
      let raw: string | null = null;
      try {
        if (IS_DEMO_MODE) {
          raw = localStorage.getItem(`${HILO_KEY_PREFIX}${negocioId}:${profile.id}`);
        } else {
          const { data } = await supabase
            .from('chispa_memoria')
            .select('valor')
            .eq('negocio_id', negocioId)
            .eq('tipo', 'hilo')
            .eq('clave', 'sesion_actual')
            .eq('usuario_id', profile.id)
            .maybeSingle();
          if (data?.valor) {
            raw = typeof data.valor === 'string' ? data.valor : JSON.stringify(data.valor);
          }
        }
      } catch {
        // Fallo de red o storage: empezamos de cero silenciosamente
      }

      hiloCargado.current = true;
      if (!raw) return;

      try {
        const saved = JSON.parse(raw) as {
          mensajes?: Mensaje[]; configGuiada?: boolean; temaIdx?: number;
          ctx?: ContextoEjecucion; respuestas?: Record<string, unknown>;
          descriptores?: Record<string, { tema: TemaId; kind: string }>;
        };
        if (Array.isArray(saved.mensajes) && saved.mensajes.length > 0) setMensajes(saved.mensajes);
        if (saved.descriptores) bloqueDescriptorRef.current = saved.descriptores;
        if (saved.respuestas) setRespuestasInteractivas(saved.respuestas);
        if (saved.ctx) ctxOnboardingRef.current = saved.ctx;
        if (typeof saved.temaIdx === 'number') setTemaIdx(saved.temaIdx);
        if (saved.configGuiada) setConfigGuiada(true);
      } catch { /* hilo invalido, se ignora */ }
    };
    
    loadState();
  }, [negocioId, profile.id]);

  useEffect(() => {
    if (!hiloCargado.current || typeof localStorage === 'undefined') return;
    if (mensajes.length === 0) return;
    
    const saveState = async () => {
      try {
        const payload = {
          mensajes, configGuiada, temaIdx,
          ctx: ctxOnboardingRef.current, respuestas: respuestasInteractivas,
          descriptores: bloqueDescriptorRef.current,
        };
        if (IS_DEMO_MODE) {
          localStorage.setItem(`${HILO_KEY_PREFIX}${negocioId}:${profile.id}`, JSON.stringify(payload));
        } else {
          await supabase.from('chispa_memoria').upsert({
            negocio_id: negocioId,
            usuario_id: profile.id,
            tipo: 'hilo',
            clave: 'sesion_actual',
            valor: payload,
            origen: 'chispa-panel'
          }, { onConflict: 'negocio_id,tipo,clave,usuario_id' });
        }
      } catch { /* error no bloqueante (red, cuota) */ }
    };
    
    saveState();
  }, [mensajes, configGuiada, temaIdx, respuestasInteractivas, negocioId, profile.id]);

  // Apertura desde fuera del panel: boton "Poner en marcha tu salon" de Avisos
  // (evento global, ver CHISPA_CONFIG_GUIADA_EVENT) y previsualizacion manual
  // ?onboarding_ia=1. Sin dependencias: siempre registra el cierre mas
  // reciente para que iniciarConfigGuiada() vea el ultimo estado.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => { setAbierto(true); iniciarConfigGuiada(); };
    window.addEventListener(CHISPA_CONFIG_GUIADA_EVENT, handler);
    // Apertura simple (sin config guiada): el hub "Que hace la IA" abre el chat
    // en su sitio en vez de navegar a una ruta inexistente (?chispa=1).
    const abrirHandler = () => setAbierto(true);
    window.addEventListener('mecha-chispa-open', abrirHandler);
    return () => {
      window.removeEventListener(CHISPA_CONFIG_GUIADA_EVENT, handler);
      window.removeEventListener('mecha-chispa-open', abrirHandler);
    };
  });

  useEffect(() => {
    if (onboarding_ia !== '1' || !esGestorOnboarding || configGuiada) return;
    setAbierto(true);
    iniciarConfigGuiada();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding_ia, esGestorOnboarding]);

  // Disparo automatico UNA vez por navegador (mismo criterio que el antiguo
  // OnboardingAgentOverlay: gestor, negocio real, nucleo pendiente). El guard
  // de localStorage hace que sea seguro que este efecto se re-evalue varias
  // veces mientras onbStatus va cargando.
  useEffect(() => {
    if (IS_DEMO_MODE || typeof window === 'undefined') return;
    if (!esGestorOnboarding || !onbStatus.ready || onbStatus.coreDone) return;
    if (abierto || configGuiada) return;
    // No secuestrar una conversacion ya en curso: si el usuario ya esta hablando
    // con Chispa, no le inyectamos el flujo de onboarding en medio (feedback 11
    // jul: la tarjeta "Retomar / Fotos 86%" se colaba tras un Q&A). No quemamos
    // la key: se ofrecera solo mas adelante, con el panel limpio.
    if (mensajes.length > 0) return;
    const key = `${ONBOARDING_AUTO_KEY_PREFIX}${negocioId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
    setAbierto(true);
    iniciarConfigGuiada();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esGestorOnboarding, onbStatus.ready, onbStatus.coreDone, negocioId, mensajes.length]);

  // S05: ventana temporal para deshacer (10s). Pasado ese tiempo, la opcion desaparece.
  useEffect(() => {
    if (!ultimaAccion) return;
    const timer = setTimeout(() => setUltimaAccion(null), 10000);
    return () => clearTimeout(timer);
  }, [ultimaAccion]);

  // S05: deshacer la ultima accion reversible
  async function deshacerUltimaAccion() {
    if (!ultimaAccion || deshaciendo) return;
    setDeshaciendo(true);
    try {
      const r = await deshacerAccion(ultimaAccion.id, profile.id);
      if (r.ok) {
        setUltimaAccion(null);
        pushAssistantTexto(`Accion deshecha: ${ultimaAccion.label}. ${r.mensaje}`);
        onAgendaChanged();
        triggerHaptic();
      } else {
        pushAssistantTexto(`No se pudo deshacer: ${r.error}`);
      }
    } finally {
      setDeshaciendo(false);
    }
  }

  // Historial en texto plano para dar contexto al edge (los bloques se aplanan).
  function historialParaEdge(msgs: Mensaje[]): { role: 'user' | 'assistant'; content: any }[] {
    return msgs.map((m) => {
      if (m.role === 'user') {
        if (m.imagenB64) {
          return {
            role: 'user' as const,
            content: [
              { type: 'text', text: m.content || 'Imagen adjunta' },
              { type: 'image_url', image_url: { url: m.imagenB64 } }
            ]
          };
        }
        return { role: 'user' as const, content: m.content };
      }
      // Aplana los bloques a texto NEUTRO para dar contexto al edge. Se describe
      // en lenguaje natural (no con sintaxis tipo "[enlace: X]" ni markdown) para
      // no ensenarle al LLM a devolver esos patrones como texto: el modelo tiende
      // a imitar el formato del historial. La superficie visual real la reconstruye
      // el edge (bloques tipados) / la capa de recuperacion del cliente.
      const content = m.bloques
        .map((b) => {
          if (b.tipo === 'texto') return b.texto;
          if (b.tipo === 'enlace') return `(sugeri un acceso a ${b.label})`;
          if (b.tipo === 'accion') return `(propuse una accion: ${b.accion.resumen})`;
          if (b.tipo === 'grafica') return `(mostre una grafica de ${b.titulo})`;
          if (b.tipo === 'comparativa') return `(mostre una comparativa de ${b.titulo})`;
          if (b.tipo === 'kpi') return `(mostre unas cifras${b.titulo ? ` de ${b.titulo}` : ''})`;
          if (b.tipo === 'barras') return `(mostre un desglose de ${b.titulo})`;
          if (b.tipo === 'tabla') return `(mostre una tabla${b.titulo ? ` de ${b.titulo}` : ''})`;
          if (b.tipo === 'formulario') return `(pedi datos con un formulario: ${b.titulo})`;
          if (b.tipo === 'opciones') return `(ofreci opciones para elegir${b.titulo ? `: ${b.titulo}` : ''})`;
          if (b.tipo === 'timeline') return `(mostre una cronologia de ${b.titulo})`;
          if (b.tipo === 'progreso') return `(paso ${b.paso} de ${b.total})`;
          return '';
        })
        .join('\n');
      return { role: 'assistant' as const, content };
    });
  }

  function pushAssistantTexto(t: string) {
    setMensajes((m) => [...m, { role: 'assistant', bloques: [{ tipo: 'texto', texto: t }], accionEstado: null, ts: ahora() }]);
    if (voz.vozActiva) void voz.hablar(t);
  }

  // Concatena los bloques 'texto' de una respuesta (enlaces y tarjetas de
  // accion no se leen en voz alta: se ven, no se narran).
  function textoDeBloques(bloques: Bloque[]): string {
    return bloques.filter((b): b is Extract<Bloque, { tipo: 'texto' }> => b.tipo === 'texto')
      .map((b) => b.texto).join(' ').trim();
  }

  // Voz: no narra la parrafada entera (lenta y pesada). Lee un adelanto de 1-2
  // frases; el detalle se VE en los bloques. Recorta a ~220 caracteres en un
  // limite de frase para que suene natural y llegue rapido.
  function resumenParaVoz(texto: string): string {
    const limpio = texto.replace(/\s+/g, ' ').trim();
    if (limpio.length <= 220) return limpio;
    const corte = limpio.slice(0, 220);
    const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '));
    return (fin > 80 ? corte.slice(0, fin + 1) : corte).trim();
  }

  // Resume el payload de un bloque interactivo respondido en una frase legible
  // para reinyectarla como el siguiente turno del usuario (mismo camino que
  // escribir a mano, sin que el usuario tenga que teclear nada).
  function textoDeRespuestaInteractiva(bloque: Bloque, payload: unknown): string {
    if (bloque.tipo === 'formulario') {
      const vals = payload as Record<string, string | number>;
      return bloque.campos
        .map((c) => `${c.label}: ${vals[c.key] ?? ''}`)
        .join(', ');
    }
    if (bloque.tipo === 'opciones') {
      const sel = payload as string[];
      const labels = bloque.opciones.filter((o) => sel.includes(o.valor)).map((o) => o.label);
      return labels.join(', ');
    }
    return '';
  }

  // Callback unico para bloques 'formulario'/'opciones' (Sesion 1 V2): marca el
  // bloque como respondido (queda fijado en la UI) y convierte el payload en el
  // siguiente turno de la conversacion, igual que si el usuario lo hubiera escrito.
  function manejarRespuestaInteractiva(bloque: Bloque, payload: unknown) {
    if (bloque.tipo !== 'formulario' && bloque.tipo !== 'opciones') return;
    setRespuestasInteractivas((prev) => ({ ...prev, [bloque.id]: payload }));
    const t = textoDeRespuestaInteractiva(bloque, payload);
    if (t) void enviarMensaje(t);
  }

  // Bifurcacion entre los DOS usos de 'formulario'/'opciones': si el bloque
  // pertenece a un paso de la config guiada (registrado en bloqueDescriptorRef
  // al construirlo), ejecuta el paso del onboarding; si no, es un bloque del
  // chat general y se reenvia como texto (comportamiento de la Sesion 1).
  function onRespuestaInteractivaUnificado(bloque: Bloque, payload: unknown) {
    if (bloque.tipo !== 'formulario' && bloque.tipo !== 'opciones') return;
    if (bloqueDescriptorRef.current[bloque.id]) {
      void manejarRespuestaConfigGuiada(bloque, payload);
      return;
    }
    manejarRespuestaInteractiva(bloque, payload);
  }

  async function enviarMensaje(textoOverride?: string) {
    const t = (textoOverride ?? texto).trim();
    if ((!t && !imagenB64) || bloqueado) return;

    // Arnes de pruebas SOLO con ?chispatest=1 en la URL (mismo espiritu que
    // ?vozab=1): simula una respuesta con 'progreso'+'formulario'+'opciones' sin
    // llamar al edge, para verificar el contrato de bloques interactivos de
    // punta a punta (rellenar/pulsar y que el payload vuelva como turno).
    if (mostrarArnesPruebas && t === '/testbloques') {
      setMensajes((m) => [
        ...m,
        { role: 'user', content: t, ts: ahora() },
        {
          role: 'assistant',
          accionEstado: null,
          ts: ahora(),
          bloques: [
            { tipo: 'progreso', paso: 1, total: 2, etiqueta: 'Datos del servicio' },
            {
              tipo: 'formulario', id: `test-form-${Date.now()}`, titulo: 'Nuevo servicio', enviarLabel: 'Crear servicio',
              campos: [
                { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
                { key: 'precio', label: 'Precio', tipo: 'euro', requerido: true },
                { key: 'duracion', label: 'Duracion (min)', tipo: 'numero' },
                { key: 'categoria', label: 'Categoria', tipo: 'select', opciones: [{ valor: 'corte', label: 'Corte' }, { valor: 'color', label: 'Color' }] },
              ],
            },
            {
              tipo: 'opciones', id: `test-opciones-${Date.now()}`, titulo: 'Como se ha reservado',
              opciones: [
                { valor: 'telefono', label: 'Telefono', descripcion: 'Llamada directa' },
                { valor: 'whatsapp', label: 'WhatsApp' },
                { valor: 'presencial', label: 'Presencial' },
              ],
            },
          ],
        },
      ]);
      setTexto('');
      setImagenB64(null);
      return;
    }

    // Arnes S19: '/testdatos' pasa una bateria de descriptores de datos por el
    // selector de formato (elegirFormatoDatos) para verificar de punta a punta
    // que cada clase cae en su bloque (kpi/barras/grafica/comparativa/tabla/
    // timeline) y que los renderers nuevos pintan bien. Datos de ejemplo (no
    // reales): solo prueba el contrato de formato+render, no consulta la BD.
    if (mostrarArnesPruebas && t === '/testdatos') {
      const hoy = new Date();
      const dia = (n: number) => new Date(hoy.getTime() - n * 86400000).toISOString().slice(0, 10);
      const bloques = elegirFormatoDatos([
        { clase: 'cifras', titulo: 'Hoy de un vistazo', tarjetas: [
          { label: 'Caja de hoy', valor: 540.5, unidad: 'eur', deltaPct: 12 },
          { label: 'Citas', valor: 14, unidad: 'citas', deltaPct: -8 },
          { label: 'Ocupacion', valor: 82, unidad: 'pct' },
        ] },
        { clase: 'reparto', titulo: 'Ingresos por servicio (7 dias)', unidad: 'eur', datos: [
          { etiqueta: 'Color', valor: 1240 }, { etiqueta: 'Corte', valor: 860 },
          { etiqueta: 'Mechas', valor: 540 }, { etiqueta: 'Peinado', valor: 210 },
        ] },
        { clase: 'evolucion', titulo: 'Caja ultimos 7 dias', unidad: 'eur', serie: [
          { fecha: dia(6), valor: 320 }, { fecha: dia(5), valor: 410 }, { fecha: dia(4), valor: 380 },
          { fecha: dia(3), valor: 520 }, { fecha: dia(2), valor: 470 }, { fecha: dia(1), valor: 610 }, { fecha: dia(0), valor: 540 },
        ] },
        { clase: 'comparativa', titulo: 'Esta semana vs anterior', unidad: 'eur',
          actual: { label: 'Esta semana', valor: 3250 }, anterior: { label: 'Anterior', valor: 2980 } },
        { clase: 'listado', titulo: 'Top clientas por gasto', columnas: [
          { key: 'cliente', label: 'Clienta', alinear: 'izq' },
          { key: 'visitas', label: 'Visitas', alinear: 'der' },
          { key: 'gasto', label: 'Gasto', alinear: 'der', unidad: 'eur' },
        ], filas: [
          { cliente: 'Ana Ruiz', visitas: 12, gasto: 640 },
          { cliente: 'Marta Gil', visitas: 9, gasto: 520 },
          { cliente: 'Lucia Paz', visitas: 7, gasto: 410 },
        ], total: { cliente: 'Total', visitas: 28, gasto: 1570 } },
        { clase: 'cronologia', titulo: 'Historial de Ana Ruiz', eventos: [
          { id: '1', fecha: dia(90), titulo: 'Color + corte', descripcion: 'Tinte 6.0, 62 EUR' },
          { id: '2', fecha: dia(30), titulo: 'Mechas', descripcion: 'Babylights, 85 EUR' },
        ] },
      ]);
      setMensajes((m) => [
        ...m,
        { role: 'user', content: t, ts: ahora() },
        { role: 'assistant', accionEstado: null, ts: ahora(), bloques },
      ]);
      setTexto('');
      setImagenB64(null);
      return;
    }

    // Deteccion de intencion de config guiada (texto o voz, que tambien pasa
    // por aqui): determinista, sin llamar al edge solo para clasificar. Si ya
    // esta en marcha no puede volver a dispararse (el input esta bloqueado).
    // Gateado por rol igual que el auto-disparo: solo el gestor (owner/admin)
    // configura el negocio; un profesional que lo pida cae al chat normal (que
    // es role-aware en el edge) en vez de entrar a un flujo que RLS le bloquearia.
    if (!imagenB64 && esGestorOnboarding && detectaIntencionConfigGuiada(t)) {
      setMensajes((m) => [...m, { role: 'user', content: t, ts: ahora() }]);
      setTexto('');
      iniciarConfigGuiada();
      return;
    }

    // Intencion de organizar/optimizar agenda: abre el panel determinista con
    // VARIAS estrategias visuales (mejor que una propuesta unica del LLM). Solo
    // si la Agenda esta montada (tiene los datos); si no, cae al chat normal.
    if (!imagenB64 && detectaIntencionOrganizar(t) && organizadorDisponible()) {
      setMensajes((m) => [
        ...m,
        { role: 'user', content: t, ts: ahora() },
        { role: 'assistant', bloques: [{ tipo: 'texto', texto: 'Te abro el organizador de agenda con las opciones de hoy: revisa cada retraso, solape o hueco y aplica la estrategia que prefieras.' }], accionEstado: null, ts: ahora() },
      ]);
      setTexto('');
      window.dispatchEvent(new CustomEvent(CHISPA_ORGANIZAR_EVENT));
      return;
    }

    // Guardrail demo: limite de mensajes por sesion (protege el coste del LLM en
    // la cuenta publica compartida). En cuentas reales no hay limite.
    if (IS_DEMO_MODE) {
      if (demoCount.current >= DEMO_LIMITE_MSGS) {
        setMensajes((m) => [...m, { role: 'user', content: t || 'Imagen adjunta', ts: ahora() }]);
        setTexto('');
        setImagenB64(null);
        pushAssistantTexto('Has alcanzado el limite de mensajes de esta demo. En una cuenta real de Mecha no hay limite: Chispa te acompana todo el dia.');
        return;
      }
      demoCount.current += 1;
      try { sessionStorage.setItem(DEMO_COUNT_KEY, String(demoCount.current)); } catch { /* no critico */ }
    }

    const nuevos: Mensaje[] = [...mensajes, { role: 'user', content: t || 'Imagen adjunta', imagenB64: imagenB64 || undefined, ts: ahora() }];
    setMensajes(nuevos);
    setTexto('');
    setImagenB64(null);
    setCargando(true);
    triggerHaptic();

    try {
      const { data, error } = await supabase.functions.invoke('agenda-asistente', {
        body: { mensajes: historialParaEdge(nuevos) },
      });

      if (error || !data) {
        pushAssistantTexto('Lo siento, hubo un problema al conectar con Chispa. Intentalo de nuevo.');
        return;
      }
      if ((data as { error?: string }).error) {
        pushAssistantTexto(`No pude procesar la solicitud: ${(data as { error?: string }).error}`);
        return;
      }

      const bloques = estructurarBloques(normalizarRespuesta(data));
      const tieneAccion = bloques.some((b) => b.tipo === 'accion');
      setMensajes((m) => [...m, { role: 'assistant', bloques, accionEstado: tieneAccion ? 'pendiente' : null, ts: ahora() }]);
      if (voz.vozActiva) {
        const paraHablar = resumenParaVoz(textoDeBloques(bloques));
        if (paraHablar) void voz.hablar(paraHablar);
      }
    } finally {
      setCargando(false);
    }
  }

  // Click en el boton de microfono: toggle. Si ya esta escuchando/transcribiendo,
  // el mismo boton corta. Si esta hablando, primero corta la voz (no tiene
  // sentido escuchar mientras Chispa habla). El texto reconocido se manda solo
  // (flujo manos libres); PR-12 sigue protegiendo cualquier escritura real con
  // la tarjeta de confirmacion, asi que un fallo de transcripcion no ejecuta nada.
  function manejarClicMicro() {
    if (voz.estado === 'escuchando' || voz.estado === 'transcribiendo') {
      voz.detenerEscucha();
      return;
    }
    if (bloqueado) return;
    if (voz.estado === 'hablando') voz.detenerHabla();
    void voz.iniciarEscucha((textoReconocido: string) => {
      setTexto(textoReconocido);
      void enviarMensaje(textoReconocido);
    });
  }

  async function manejarImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagenB64(reader.result as string);
    reader.readAsDataURL(file);
  }

  function setAccionEstado(msgIndex: number, estado: AccionEstado) {
    setMensajes((m) => m.map((msg, i) =>
      i === msgIndex && msg.role === 'assistant' ? { ...msg, accionEstado: estado } : msg,
    ));
  }

  async function confirmarAccion(msgIndex: number, accion: AccionPropuesta) {
    setAccionEstado(msgIndex, 'aplicando');

    // Guardrail demo: nunca se ejecuta una escritura real sobre el tenant
    // compartido. Se simula el resultado para que el prospecto vea el flujo
    // propone -> confirma completo sin ensuciar los datos de la demo.
    if (IS_DEMO_MODE) {
      setAccionEstado(msgIndex, 'aplicada');
      pushAssistantTexto('Hecho (demostracion). En la demo los cambios no se guardan de verdad; en tu cuenta esta accion se aplicaria al instante.');
      return;
    }

    const r = await ejecutarAccion(accion, profile.id);
    if (r.ok) {
      setAccionEstado(msgIndex, 'aplicada');
      triggerHaptic();
      pushAssistantTexto(r.mensaje);
      onAgendaChanged();
      // S05: registrar accion reversible para deshacer
      if (r.accion_id) {
        setUltimaAccion({ id: r.accion_id, label: accion.resumen, ts: Date.now() });
      }
    } else {
      // Fallo: la tarjeta queda resuelta y se explica; el usuario puede volver a pedirlo.
      setAccionEstado(msgIndex, 'cancelada');
      pushAssistantTexto(`No se pudo aplicar: ${r.error}. Puedes pedirmelo de nuevo si quieres.`);
    }
  }

  function cancelarAccion(msgIndex: number) {
    setAccionEstado(msgIndex, 'cancelada');
    pushAssistantTexto('Accion cancelada.');
  }

  // ---- Config guiada (Sesion 2 V2): "Chispa hospeda configurame el salon" ----
  // Reutiliza EXACTAMENTE los ejecutores de lib/onboardingAgent.ts (misma
  // fuente de verdad que usaba el overlay retirado): el orden de temas, los
  // presets de horario y las escrituras reales no se duplican aqui.

  // pedirPregunta consume una llamada al edge onboarding-agent por tema. En la
  // demo comparte el MISMO contador que el chat general (DEMO_LIMITE_MSGS):
  // sin este guard, "configurame el salon" en la demo abriria una via de coste
  // de LLM que antes no existia (el overlay viejo excluia la demo del todo).
  async function pedirPreguntaConDemoLimite(tema: TemaId, estado: Record<TemaId, boolean>, perfil: PerfilAgente) {
    if (IS_DEMO_MODE) {
      if (demoCount.current >= DEMO_LIMITE_MSGS) return TEMA_FALLBACK[tema];
      demoCount.current += 1;
      try { sessionStorage.setItem(DEMO_COUNT_KEY, String(demoCount.current)); } catch { /* no critico */ }
    }
    return pedirPregunta(tema, estado, perfil);
  }

  // Punto UNICO por el que la config guiada escribe. En demo, guardrail: nunca
  // toca el tenant compartido, simula un recibo con el mismo formato.
  async function ejecutarPasoOnboarding(tipo: string, args: Record<string, any>): Promise<ResultadoAccion> {
    setCargando(true);
    try {
      const resultado: ResultadoAccion = IS_DEMO_MODE
        ? { ok: true, resumen: resumenDemoOnboarding(tipo, args) }
        : await ejecutarAccionOnboarding(tipo, args, ctxOnboardingRef.current);
      if (!IS_DEMO_MODE && tipo === 'completar_datos_negocio' && resultado.ok) {
        ctxOnboardingRef.current.datosNegocioSesion = {
          nombre: String(args.nombre), direccion: String(args.direccion), telefono: String(args.telefono),
        };
      }
      pushAssistantTexto(IS_DEMO_MODE
        ? `Hecho (demostración): ${resultado.resumen} En tu cuenta esto se guardaría de verdad.`
        : resultado.resumen);
      if (!IS_DEMO_MODE) onbStatus.refresh();
      return resultado;
    } finally {
      setCargando(false);
    }
  }

  function iniciarConfigGuiada() {
    if (!esGestorOnboarding) {
      pushAssistantTexto('La puesta en marcha del salón la gestiona la propietaria o dirección de tu salón. Pídeselo a quien tenga ese acceso.');
      return;
    }
    if (configGuiada) return; // ya en marcha: no reiniciar sobre un flujo activo
    ctxOnboardingRef.current = { negocioId, profesionalesCreados: [], serviciosCreados: [], datosNegocioSesion: undefined };
    // S18: RETOMAR, no reiniciar. En un tenant real congelamos el estado real
    // (que temas ya estan hechos) para saltarlos y arrancar en el primer tema
    // pendiente. En la demo las escrituras son simuladas, asi que se muestra
    // siempre el recorrido completo desde el principio (showcase).
    const doneSnapshot: Record<string, boolean> = IS_DEMO_MODE ? {} : { ...onbStatus.done };
    omitidosOnboardingRef.current = doneSnapshot;
    const primerPendiente = TEMA_ORDEN.findIndex((t) => !doneSnapshot[t]);
    if (primerPendiente === -1) {
      pushAssistantTexto('Tu salón ya está configurado al 100%. Si quieres cambiar algo, dime qué y lo ajustamos, o revísalo cuando quieras desde Ajustes.');
      return;
    }
    setConfigGuiada(true);
    const faltan = TEMA_ORDEN.filter((t) => !doneSnapshot[t]).length;
    pushAssistantTexto(primerPendiente === 0
      ? 'Vale, vamos a poner en marcha tu salón. Te iré pidiendo lo básico paso a paso: puedes saltar cualquier paso cuando quieras.'
      : `Retomamos donde lo dejaste: saltaré lo que ya tienes hecho. Te ${faltan === 1 ? 'queda 1 paso' : `quedan ${faltan} pasos`}.`);
    void avanzarTemaGuiado(primerPendiente);
  }

  async function avanzarTemaGuiado(idx: number) {
    // S18: saltar los temas ya completados al arrancar (snapshot congelado), para
    // no repetir lo que el salon ya tiene configurado ("seguir" continua, no repite).
    const omit = omitidosOnboardingRef.current;
    let i = idx;
    while (i < TEMA_ORDEN.length && omit[TEMA_ORDEN[i]]) i++;
    if (i >= TEMA_ORDEN.length) { finalizarConfigGuiada(); return; }
    setTemaIdx(i);
    const tema = TEMA_ORDEN[i];
    setCargando(true);
    const pregunta = await pedirPreguntaConDemoLimite(tema, onbStatus.done, perfilOnboarding);
    setCargando(false);
    const { id, previos, interactivo, kind } = construirPasoTema(tema, pregunta, perfilOnboarding);
    bloqueDescriptorRef.current[id] = { tema, kind };
    setMensajes((m) => [...m, {
      role: 'assistant', accionEstado: null, ts: ahora(),
      bloques: [{ tipo: 'progreso', paso: i + 1, total: TEMA_ORDEN.length, etiqueta: TEMA_TITULO_SECCION[tema] }, ...previos, interactivo],
    }]);
  }

  function finalizarConfigGuiada() {
    setConfigGuiada(false);
    pushAssistantTexto('Tu salón ya está configurado. Puedes revisar y afinar todo esto cuando quieras desde Ajustes.');
    if (!IS_DEMO_MODE) onbStatus.refresh();
  }

  function saltarTema() {
    const tema = TEMA_ORDEN[temaIdx];
    pushAssistantTexto(`Paso omitido. ${TEMA_DESTINO_MANUAL[tema]}.`);
    void avanzarTemaGuiado(temaIdx + 1);
  }

  function salirConfigGuiada() {
    setConfigGuiada(false);
    pushAssistantTexto('De acuerdo. Cuando quieras seguir, dime «configúrame el salón».');
  }

  // "¿Añades otro?" tras crear un servicio/profesional (mismo patron que el
  // overlay retirado: con uno basta para operar, anadir mas es opcional).
  function mostrarOtroPaso(tema: TemaId, kind: string, titulo: string) {
    const id = idPasoOnboarding(tema, '-otro');
    bloqueDescriptorRef.current[id] = { tema, kind };
    setMensajes((m) => [...m, {
      role: 'assistant', accionEstado: null, ts: ahora(),
      bloques: [{ tipo: 'opciones', id, titulo, opciones: [{ valor: 'si', label: 'Sí, añadir otro' }, { valor: 'no', label: 'Continuar' }] }],
    }]);
  }

  // activar_reserva_online(true) hace el salon publico al instante: mismo
  // segundo paso de confirmacion explicita que tenia el overlay retirado.
  function mostrarConfirmReserva() {
    const id = idPasoOnboarding('reserva_online', '-confirm');
    bloqueDescriptorRef.current[id] = { tema: 'reserva_online', kind: 'reserva_confirm' };
    setMensajes((m) => [...m, {
      role: 'assistant', accionEstado: null, ts: ahora(),
      bloques: [{
        tipo: 'opciones', id, titulo: 'Tu salón será visible y reservable públicamente ahora mismo. ¿Confirmas?',
        opciones: [{ valor: 'si', label: 'Sí, adelante' }, { valor: 'no', label: 'Mejor no' }],
      }],
    }]);
  }

  async function manejarRespuestaConfigGuiada(bloque: Bloque, payload: unknown) {
    if (bloque.tipo !== 'formulario' && bloque.tipo !== 'opciones') return;
    const desc = bloqueDescriptorRef.current[bloque.id];
    if (!desc) return;
    setRespuestasInteractivas((prev) => ({ ...prev, [bloque.id]: payload }));

    switch (desc.kind) {
      case 'datos_negocio_form': {
        const v = payload as Record<string, string | number>;
        await ejecutarPasoOnboarding('completar_datos_negocio', {
          nombre: String(v.nombre ?? ''), direccion: String(v.direccion ?? ''), telefono: String(v.telefono ?? ''),
        });
        void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'servicio_form': {
        const v = payload as Record<string, string | number>;
        const r = await ejecutarPasoOnboarding('crear_servicio', {
          nombre: String(v.nombre ?? ''), precio: Number(v.precio), duracion_min: Number(v.duracion_min),
        });
        if (r.ok) mostrarOtroPaso('servicios', 'servicio_otro', '¿Añades otro servicio?');
        else void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'servicio_otro': {
        if ((payload as string[])[0] === 'si') void avanzarTemaGuiado(temaIdx);
        else void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'equipo_form': {
        const v = payload as Record<string, string | number>;
        const r = await ejecutarPasoOnboarding('crear_profesional', {
          nombre: String(v.nombre ?? ''), categoria: String(v.categoria ?? 'oficial'), quiere_invitar: false, email: '',
        });
        if (r.ok) mostrarOtroPaso('equipo', 'equipo_otro', '¿Añades otro profesional? (Podrás invitarles por email después, desde Equipo)');
        else void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'equipo_otro': {
        if ((payload as string[])[0] === 'si') void avanzarTemaGuiado(temaIdx);
        else void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'horario_opciones': {
        const preset = HORARIO_PRESETS[Number((payload as string[])[0])];
        await ejecutarPasoOnboarding('fijar_horario_salon', { dias: preset?.dias ?? [] });
        void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'reserva_opciones': {
        if ((payload as string[])[0] === 'si') { mostrarConfirmReserva(); return; }
        await ejecutarPasoOnboarding('activar_reserva_online', { activar: false });
        void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'reserva_confirm': {
        const activar = (payload as string[])[0] === 'si';
        await ejecutarPasoOnboarding('activar_reserva_online', { activar });
        void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'fotos_opciones': {
        if ((payload as string[])[0] === 'ahora') {
          setMensajes((m) => [...m, {
            role: 'assistant', accionEstado: null, ts: ahora(),
            bloques: [{ tipo: 'enlace', ruta: CHISPA_RUTAS.configuracion.ruta, label: 'Ir a Configuración → Servicios' }],
          }]);
        }
        void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
      case 'notif_opciones': {
        const activar = (payload as string[])[0] === 'si';
        await ejecutarPasoOnboarding('activar_notificaciones', { activar });
        void avanzarTemaGuiado(temaIdx + 1);
        return;
      }
    }
  }

  const drawerWidth = isMobile || amplio ? '100%' : 400;

  const contenido = (
    <>
      {/* Pestana lanzadora (borde derecho) cuando esta cerrado. Oculta si el
          panel solo esta montado para la puesta en marcha (asistente general
          apagado): no anadir una burbuja de chat permanente a un salon que no
          la activo — se llega por el auto-disparo, el boton de Avisos o el
          detector de intencion mientras ya esta abierto por otra via. */}
      {!abierto && !soloOnboarding && (
        <button
          className="chispa-launch-tab"
          onClick={() => setAbierto(true)}
          aria-label="Abrir Chispa, la IA del salon"
          // Ancla para el coach intra-pagina (S16): siempre presente en la app.
          data-coach="chispa-bubble"
          style={{
            position: 'fixed', bottom: isMobile ? 132 : 96, right: 0, top: 'auto',
            zIndex: 2147483000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: T.ia.launcherPadding, border: 'none', borderRadius: '14px 0 0 14px',
            background: T.fireGradient, color: '#fff', boxShadow: T.ia.launcherShadow, cursor: 'pointer',
            transition: 'padding 0.15s ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.paddingRight = '12px'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.paddingRight = '8px'; }}
        >
          <ChispaMascota size={26} showLabel={false} animar={false} />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Chispa
          </span>
        </button>
      )}

      {/* Drawer abierto */}
      {abierto && (
        <>
          {isMobile && (
            <div className="chispa-backdrop" onClick={() => setAbierto(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 2147482999, background: T.ia.drawerBackdrop }} />
          )}

          <div className="chispa-drawer glass-panel" style={{
            position: 'fixed', top: 0, right: 0, height: '100%', width: drawerWidth, zIndex: 2147483000,
            display: 'flex', flexDirection: 'column',
            borderLeft: `1px solid rgba(255, 255, 255, 0.5)`,
            fontFamily: 'Inter, system-ui, sans-serif',
            // Transicion suave al entrar/salir de pantalla completa (desktop).
            transition: isMobile ? undefined : 'width 0.32s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%)', flexShrink: 0 }}>
              <ChispaMascota size={30} showLabel={false} animar />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text, lineHeight: 1.15, letterSpacing: -0.2 }}>Chispa</div>
                <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {/* Punto de estado "en linea" con glow: senal discreta de que la
                      IA esta activa (detalle de producto, no decoracion vacia). */}
                  <span aria-hidden="true" className="chispa-status-dot" style={{ width: 6, height: 6, borderRadius: 999, background: T.success, boxShadow: `0 0 0 2px ${T.successSoft}`, flexShrink: 0 }} />
                  <span>IA de tu salón</span>
                  {/* Voz honesta (Sesion 1 V2): indicador discreto y persistente
                      mientras la voz este degradada a la del navegador. Nunca se
                      finge que es la voz premium de ElevenLabs. */}
                  {voz.vozDegradada && (
                    <span
                      title="ElevenLabs no esta disponible ahora mismo: Chispa usa la voz basica del navegador."
                      style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 999,
                        background: T.warningSoft, border: '1px solid rgba(224,138,0,0.28)',
                        color: T.warning, fontSize: 10, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap',
                      }}
                    >
                      Voz básica del navegador
                    </span>
                  )}
                </div>
              </div>
              {voz.estado === 'hablando' && (
                <button onClick={voz.detenerHabla} aria-label="Detener la voz de Chispa"
                  style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: T.fireGradient, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconoStop size={11} color="#fff" />
                </button>
              )}
              <button
                onClick={() => { const activar = !voz.vozActiva; voz.setVozActiva(activar); if (activar) void voz.precalentar(); }}
                aria-label={voz.vozActiva ? 'Desactivar que Chispa hable' : 'Activar que Chispa hable'}
                aria-pressed={voz.vozActiva}
                title={voz.vozActiva ? 'Chispa lee sus respuestas en voz alta' : 'Chispa solo escribe'}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: `1px solid ${voz.vozActiva ? T.primary : T.border}`,
                  background: voz.vozActiva ? T.primarySoft : T.bgCard,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                <IconoAltavoz size={15} color={voz.vozActiva ? T.primaryHi : T.textSecondary} activo={voz.vozActiva} />
              </button>
              {/* Coach intra-pagina (S16): cierra el panel y resalta los
                  elementos de la pantalla actual explicandolos in-situ. */}
              <button
                onClick={() => { setAbierto(false); setTimeout(() => lanzarCoach(), 60); }}
                aria-label="Ensename esta pantalla"
                title="Que Chispa te ensene esta pantalla"
                style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke={T.textSecondary} strokeWidth="1.7" />
                  <circle cx="12" cy="12" r="3.2" fill={T.primary} />
                </svg>
              </button>
              {!isMobile && (
                <button
                  onClick={alternarPantallaCompleta}
                  aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Ver Chispa a pantalla completa'}
                  aria-pressed={pantallaCompleta}
                  title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconoPantallaCompleta activo={pantallaCompleta} size={15} color={T.textSecondary} />
                </button>
              )}
              <button onClick={() => setAbierto(false)} aria-label="Cerrar Chispa"
                style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconoCerrar size={15} color={T.textSecondary} />
              </button>
            </div>

            {/* Selector de motor de voz (A/B): solo con ?vozab=1 en la URL, para
                decidir internamente si compensa un plan de pago de ElevenLabs. */}
            {mostrarSelectorVoz && (
              <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                {(['elevenlabs', 'navegador'] as const).map((m) => (
                  <button key={m} onClick={() => voz.setMotorVoz(m)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${voz.motorVoz === m ? T.primary : T.border}`,
                      background: voz.motorVoz === m ? T.primarySoft : 'transparent',
                      color: voz.motorVoz === m ? T.primaryHi : T.textTertiary,
                    }}>
                    {m === 'elevenlabs' ? 'Voz IA (ElevenLabs)' : 'Voz del navegador'}
                  </button>
                ))}
              </div>
            )}

            {/* Lista de mensajes. En pantalla completa (desktop) se centra en una
                columna con mas aire para que formularios/graficas no se
                aplasten a lo ancho de todo el viewport. */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: amplio ? '20px 0' : '12px 14px', display: 'flex', flexDirection: 'column', alignItems: amplio ? 'center' : 'stretch' }}>
              <div style={{ width: '100%', maxWidth: amplio ? 760 : undefined, padding: amplio ? '0 32px' : undefined, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {briefingActivo && (
                  <div style={{ marginBottom: 4 }}>
                    <BriefingAgenda negocioId={negocioId} profile={profile} onClose={() => setAbierto(false)} />
                  </div>
                )}
                {/* Tours guiados (S17): entrada determinista a los recorridos
                    multi-pantalla. Solo al inicio de la conversacion, para no
                    estorbar en un chat en curso ni durante la config guiada. */}
                {!configGuiada && !soloOnboarding && mensajes.length <= 2 && (() => {
                  const prog = leerProgresoTour();
                  const tourEnCurso = prog ? tourPorId(prog.id) : undefined;
                  const pill = { padding: '7px 11px', borderRadius: 999, border: `1px solid ${T.border}`, background: T.bgCard, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' } as const;
                  return (
                    <div className="animate-fade-in-up" style={{ marginBottom: 10, padding: '11px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                      <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 8 }}>Tours guiados</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tourEnCurso && (
                          <button type="button" className="btn-interactive" onClick={() => { setAbierto(false); setTimeout(() => reanudarTour(), 60); }}
                            style={{ ...pill, border: 'none', background: T.primary, color: '#fff' }}>
                            Reanudar: {tourEnCurso.titulo}
                          </button>
                        )}
                        {TOURS.map((tr) => (
                          <button key={tr.id} type="button" title={tr.descripcion} className="btn-interactive"
                            onClick={() => { setAbierto(false); setTimeout(() => lanzarTour(tr.id), 60); }} style={pill}>
                            {tr.titulo}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* S23: Empty state con biblioteca de prompts cuando no hay mensajes */}
                {!configGuiada && mensajes.length === 0 && (
                  <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', padding: '16px 4px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
                      <ChispaMascota size={48} showLabel={false} animar={!cargando} />
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginTop: 10 }}>¡Hola! Soy Chispa ✨</div>
                      <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 4, lineHeight: 1.45, maxWidth: 300 }}>
                        Tu asistente inteligente. Selecciona una sugerencia o escribe lo que necesites:
                      </div>
                    </div>

                    {/* Selector de pestañas de la biblioteca */}
                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 12, paddingBottom: 4, scrollbarWidth: 'none' }} className="chispa-scroll-hide">
                      {(
                        [
                          ...(promptsDeEstaPagina.length > 0 ? [{ id: 'recomendados', label: '📍 En esta pantalla' }] : []),
                          { id: 'todos', label: '📖 Todos' },
                          { id: 'agenda', label: '📅 Agenda' },
                          { id: 'clientes', label: '👥 Clientes' },
                          { id: 'gestion', label: '💰 Gestión' },
                          { id: 'marketing', label: '📢 Marketing' },
                        ] as const
                      ).map((cat) => {
                        const activo = promptCat === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setPromptCat(cat.id as 'recomendados' | 'agenda' | 'clientes' | 'gestion' | 'marketing' | 'general' | 'todos')}
                            style={{
                              whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 20,
                              border: `1.5px solid ${activo ? T.primary : T.border}`,
                              background: activo ? T.primarySoft : T.bgCard,
                              color: activo ? T.primaryHi : T.textSecondary,
                              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                              fontFamily: 'Inter, system-ui, sans-serif',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Lista de prompts correspondientes a la pestaña activa */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(() => {
                        const filtrados = promptsVisibles.filter((p) => {
                          if (promptCat === 'todos') return true;
                          if (promptCat === 'recomendados') return p.paginas && p.paginas.includes(pathNormalizado);
                          return p.categoria === promptCat;
                        });

                        if (filtrados.length === 0) {
                          return (
                            <div style={{ padding: '16px', textAlign: 'center', color: T.textTertiary, fontSize: 12.5, fontStyle: 'italic' }}>
                              No hay sugerencias en esta categoría.
                            </div>
                          );
                        }

                        return filtrados.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => enviarMensaje(p.prompt)}
                            className="btn-interactive glass-panel magic-border"
                            style={{
                              textAlign: 'left', padding: '12px 14px', borderRadius: 14,
                              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                              border: `1px solid ${T.border}`, background: '#fff',
                              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              const el = e.currentTarget as HTMLButtonElement;
                              el.style.transform = 'translateY(-1px)';
                              el.style.boxShadow = '0 6px 16px rgba(0,0,0,0.04)';
                            }}
                            onMouseLeave={(e) => {
                              const el = e.currentTarget as HTMLButtonElement;
                              el.style.transform = 'none';
                              el.style.boxShadow = 'none';
                            }}
                          >
                            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{p.icono}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{p.label}</div>
                              <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 2, lineHeight: 1.45 }}>{p.descripcion}</div>
                            </div>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
                {/* Turnos con AUTOR + hora. Mensajes consecutivos del mismo
                    autor se agrupan (avatar y cabecera solo en el primero);
                    entre turnos distintos hay mas aire. Asi se distingue de un
                    vistazo quien dijo que y cuando (S03 V3). */}
                {mensajes.map((msg, i) => {
                  const prev = mensajes[i - 1];
                  const primeroDelGrupo = !prev || prev.role !== msg.role;
                  const margenSup = i === 0 ? 0 : primeroDelGrupo ? 14 : 4;
                  const hora = fmtHora(msg.ts);

                  if (msg.role === 'user') {
                    return (
                      <div key={i} className="chispa-msg animate-pop-in" style={{ marginTop: margenSup, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        {primeroDelGrupo && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingRight: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, letterSpacing: 0.2 }}>{nombreUsuario}</span>
                            {hora ? <span style={{ fontSize: 10, color: T.textMuted }}>{hora}</span> : null}
                          </div>
                        )}
                        <div style={{
                          maxWidth: '80%', padding: '10px 14px',
                          borderRadius: primeroDelGrupo ? '18px 18px 4px 18px' : '18px 4px 4px 18px',
                          background: T.fireGradient, fontSize: 13.5, color: '#fff', lineHeight: 1.5,
                          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                          boxShadow: '0 4px 12px rgba(244, 80, 30, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  }
                  // Chispa: gutter con avatar (solo en el primero del grupo) +
                  // columna con cabecera (autor + hora) y sus bloques.
                  return (
                    <div key={i} className="chispa-msg animate-pop-in" style={{ marginTop: margenSup, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, width: 22 }}>
                        {primeroDelGrupo ? <ChispaMascota size={22} showLabel={false} animar={false} /> : null}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, maxWidth: amplio ? '100%' : '84%' }}>
                        {primeroDelGrupo && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.primaryHi }}>Chispa</span>
                            {hora ? <span style={{ fontSize: 10.5, color: T.textMuted }}>{hora}</span> : null}
                          </div>
                        )}
                        {msg.bloques.map((b, j) => (
                          <BloqueRenderer
                            key={j}
                            bloque={b}
                            accionEstado={msg.accionEstado ?? 'pendiente'}
                            onConfirmar={b.tipo === 'accion' ? () => confirmarAccion(i, b.accion) : undefined}
                            onCancelar={b.tipo === 'accion' ? () => cancelarAccion(i) : undefined}
                            anchoAmplio={amplio}
                            respuestasInteractivas={respuestasInteractivas}
                            onRespuestaInteractiva={onRespuestaInteractivaUnificado}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {cargando && (
                  <div className="chispa-msg animate-fade-in-up" style={{ marginTop: 14, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0, width: 22 }}><ChispaMascota size={22} showLabel={false} mood="think" /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, maxWidth: '80%' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.primaryHi }}>Chispa</span>
                      <div style={{ padding: '9px 14px', borderRadius: '14px 14px 14px 4px', background: T.bgCard, border: `1px solid ${T.border}`, display: 'flex', gap: 4, alignItems: 'center', alignSelf: 'flex-start' }}>
                        {[0, 1, 2].map((n) => (
                          <div key={n} style={{ width: 6, height: 6, borderRadius: 999, background: T.textMuted, animation: `chispaDot 1.2s ease-in-out ${n * 0.2}s infinite` }} />
                        ))}
                      </div>
                      {tipCarga ? (
                        <div style={{
                          marginTop: 4, padding: '8px 12px', borderRadius: 10,
                          background: T.bgPanel, border: `1px dashed ${T.border}`,
                          fontSize: 11.5, color: T.textSecondary, lineHeight: 1.45,
                          fontStyle: 'italic', display: 'flex', flexDirection: 'column', gap: 3
                        }}>
                          <span style={{ fontWeight: 700, color: T.primaryHi, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>💡 Tip de Chispa</span>
                          <span>{tipCarga}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Conflicto onboarding-vs-chat (S03 V3): durante la configuracion
                guiada el chat libre se PAUSA a proposito (es un asistente paso a
                paso, en orden). Para que el estado nunca sea ambiguo, este banner
                siempre visible declara que esta en curso y ofrece las dos salidas
                (saltar paso / salir) como botones claros — nunca un input
                bloqueado "en silencio". Al terminar o salir, el chat se reanuda. */}
            {configGuiada && (
              <div style={{
                margin: '0 12px 8px', padding: '10px 12px', flexShrink: 0,
                background: T.primarySoft, border: `1px solid ${T.primary}`, borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.primaryHi }}>Configuración guiada en curso</div>
                  <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 1, lineHeight: 1.35 }}>
                    Responde arriba para continuar. El chat libre se reanuda al terminar o al salir.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={saltarTema}
                    style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bgCard, color: T.textSecondary, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Saltar paso
                  </button>
                  <button onClick={salirConfigGuiada}
                    style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bgCard, color: T.danger, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Salir
                  </button>
                </div>
              </div>
            )}

            {/* S05 V3 - Toast de deshacer accion reversible.
                Aparece tras una accion exitosa reversible (crear/reagendar/cambiar
                config, etc.) y ofrece deshacerla durante 10 segundos. El estado
                reversible se captura ANTES de ejecutar la accion. */}
            {ultimaAccion && (
              <div style={{
                margin: '0 12px 8px', padding: '10px 12px', flexShrink: 0,
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>
                    {ultimaAccion.label}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>
                    Acción completada
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                  <button
                    onClick={deshacerUltimaAccion}
                    disabled={deshaciendo}
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      border: 'none',
                      background: deshaciendo ? T.bgCardHi : T.primary,
                      color: deshaciendo ? T.textMuted : '#fff',
                      fontSize: 12, fontWeight: 600, cursor: deshaciendo ? 'default' : 'pointer',
                      transition: 'background 0.15s ease, opacity 0.15s ease',
                      opacity: deshaciendo ? 0.7 : 1,
                    }}
                  >
                    {deshaciendo ? 'Deshaciendo...' : 'Deshacer'}
                  </button>
                  <button
                    onClick={() => setUltimaAccion(null)}
                    style={{
                      padding: '6px 10px', borderRadius: 8,
                      border: 'none', background: 'transparent',
                      color: T.textMuted, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Chips de sugerencias de prompts */}
            {!bloqueado && mensajes.length > 0 && (
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 16px 4px',
                scrollbarWidth: 'none', msOverflowStyle: 'none', flexShrink: 0,
                alignSelf: 'center', width: '100%', maxWidth: amplio ? 760 : undefined,
              }}>
                <style>{`.chispa-scroll-hide::-webkit-scrollbar { display: none; }`}</style>
                <div className="chispa-scroll-hide" style={{ display: 'flex', gap: 6, overflowX: 'auto', width: '100%', padding: '2px 0' }}>
                  {chipsSugeridos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => enviarMensaje(p.prompt)}
                      className="btn-interactive"
                      style={{
                        whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 99, border: `1px solid ${T.border}`,
                        background: T.bgCard, color: T.textSecondary, fontSize: 11.5,
                        fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        transition: 'transform 0.15s ease, background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.primarySoft; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.bgCard; }}
                    >
                      <span>{p.icono}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '12px 16px 20px', flexShrink: 0, display: 'flex', justifyContent: amplio ? 'center' : 'stretch', background: 'linear-gradient(0deg, rgba(255,253,251,0.9) 0%, rgba(255,253,251,0) 100%)' }}>
              <div style={{ width: '100%', maxWidth: amplio ? 760 : undefined, padding: amplio ? '0 32px' : undefined }}>
              {imagenB64 && (
                <div style={{ padding: '10px 14px', marginBottom: '10px', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                   <div style={{ fontSize: '12.5px', fontWeight: 600, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}><IconoImagen size={14} color={T.textSecondary} /> Imagen lista para enviar</div>
                   <button className="btn-interactive" onClick={() => setImagenB64(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.danger, fontSize: '12px', fontWeight: 700 }}>Quitar</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: '#fff', border: `1px solid ${hayAccionPendiente ? T.border : 'rgba(40,30,24,0.08)'}`, borderRadius: 24, padding: '8px 8px 8px 16px', boxShadow: '0 8px 24px rgba(40,30,24,0.06)', transition: 'border-color 0.15s ease' }}>
                <input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } }}
                  disabled={bloqueado}
                  placeholder={hayAccionPendiente ? 'Confirma o cancela la accion primero...' : configGuiada ? 'Responde arriba para continuar...' : 'Escribe tu solicitud...'}
                  aria-label="Mensaje para Chispa"
                  style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: T.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', lineHeight: 1.4, cursor: hayAccionPendiente ? 'not-allowed' : 'text', paddingBottom: 8, paddingTop: 8 }}
                />
                
                <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={manejarImagen} />
                <button
                  className="btn-interactive"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bloqueado || !!imagenB64}
                  aria-label="Adjuntar imagen"
                  style={{
                    width: 38, height: 38, borderRadius: 18, flexShrink: 0,
                    border: 'none',
                    background: imagenB64 ? T.primarySoft : '#f4f2f0',
                    cursor: bloqueado || !!imagenB64 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <IconoImagen size={16} color={imagenB64 ? T.primaryHi : T.textSecondary} />
                </button>

                <button
                  onClick={manejarClicMicro}
                  disabled={bloqueado && voz.estado === 'inactivo'}
                  aria-label={voz.estado === 'escuchando' ? 'Detener escucha' : voz.estado === 'transcribiendo' ? 'Transcribiendo' : 'Hablar a Chispa'}
                  aria-pressed={voz.estado === 'escuchando'}
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    border: `1.5px solid ${voz.estado === 'escuchando' ? T.danger : T.border}`,
                    background: voz.estado === 'escuchando' ? T.dangerSoft : T.bgPanel,
                    cursor: bloqueado && voz.estado === 'inactivo' ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: voz.estado === 'transcribiendo' ? 0.6 : 1,
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                  }}>
                  <IconoMicro size={16} color={voz.estado === 'escuchando' ? T.danger : T.textSecondary} />
                </button>
                <button onClick={() => enviarMensaje()} disabled={(!texto.trim() && !imagenB64) || bloqueado} aria-label="Enviar mensaje"
                  style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: (!texto.trim() && !imagenB64) || bloqueado ? T.bgCardHi : T.fireGradient, cursor: (!texto.trim() && !imagenB64) || bloqueado ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s ease' }}>
                  <IconoEnviar size={16} color={(!texto.trim() && !imagenB64) || bloqueado ? T.textMuted : '#fff'} />
                </button>
              </div>
              {/* Estado de voz visible (accesibilidad: nunca escuchar/hablar en
                  silencio sin que se note) + errores no bloqueantes */}
              {(voz.estado !== 'inactivo' || voz.errorVoz) && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6, paddingLeft: 4,
                  ...(voz.errorVoz ? { background: T.warningSoft, borderRadius: 8, padding: '6px 10px', marginLeft: -6, marginRight: -6 } : {}),
                }}>
                  {voz.estado !== 'inactivo' && (
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: voz.errorVoz ? T.textMuted : T.primary, animation: voz.errorVoz ? 'none' : 'chispaDot 1s ease-in-out infinite', flexShrink: 0, marginTop: 4 }} />
                  )}
                  <span style={{ fontSize: 11.5, color: voz.errorVoz ? T.warning : T.textTertiary, lineHeight: 1.4 }}>
                    {voz.errorVoz ?? (voz.estado === 'escuchando' ? 'Escuchando... habla ahora' : voz.estado === 'transcribiendo' ? 'Transcribiendo tu voz...' : voz.estado === 'hablando' ? 'Chispa está hablando...' : '')}
                  </span>
                </div>
              )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  // Portal a document.body: el fixed se ancla al viewport, no a ancestros con transform.
  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(contenido, document.body);
}
