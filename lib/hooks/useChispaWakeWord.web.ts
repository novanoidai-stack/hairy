// Palabra de activacion de Chispa ("Hola Mecha" / "Hola Chispa"): escucha
// AMBIENTE continua, en segundo plano, mientras el usuario la active de forma
// EXPLICITA (toggle en Configuracion > Voz, apagado por defecto). Ver diseno:
// docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md (seccion 4).
//
// Privacidad: el audio ambiente lo procesa el motor de reconocimiento del
// NAVEGADOR (igual que cualquier uso de Web Speech); Mecha nunca lo recibe ni
// lo guarda. Solo cuando se detecta la frase se abre una conversacion normal
// con Chispa (ese mensaje SI viaja a Mecha, como cualquier otro).
//
// Instancia de reconocimiento INDEPENDIENTE de la del panel (useChispaVoz):
// esta corre en segundo plano incluso con el panel cerrado; la del panel solo
// mientras el usuario habla activamente con Chispa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { soportaVozNavegador } from '@/lib/hooks/useChispaVoz.web';
import { detectarActivacion } from '@/lib/chispaWakeWordUtils';
import { CHISPA_WAKE_EVENT, CHISPA_WAKEWORD_TOGGLE_EVENT } from '@/lib/chispaBloques';

export const WAKEWORD_ACTIVO_KEY = 'mecha-chispa-wakeword-activo';

// Tipos minimos de la Web Speech API (mismo subconjunto que useChispaVoz.web.ts;
// no se comparte un tipo comun porque son dos motores independientes con ciclo
// de vida propio, y este archivo no debe importar internals del otro hook).
interface SpeechRecognitionAlternativa { transcript: string }
interface SpeechRecognitionResultado { readonly length: number; [index: number]: SpeechRecognitionAlternativa }
interface SpeechRecognitionListaResultados { readonly length: number; [index: number]: SpeechRecognitionResultado }
interface SpeechRecognitionEventoResultado extends Event { results: SpeechRecognitionListaResultados }
interface SpeechRecognitionInstancia extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventoResultado) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstancia;
interface VentanaConSpeech {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
function speechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as VentanaConSpeech;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

// El navegador puede terminar una sesion "continuous" por su cuenta (limite
// interno, silencio muy largo): se reinicia sola mientras el toggle siga
// activo. Si el error se repite varias veces seguidas (p.ej. permiso
// revocado a medio uso), se deja de reintentar y se apaga el toggle.
const REINTENTO_MS = 400;
const MAX_ERRORES_SEGUIDOS = 3;

export function useChispaWakeWord(habilitadoParaNegocio: boolean) {
  const soportado = useRef(soportaVozNavegador()).current;
  const [activo, setActivoState] = useState(false);
  const [pestanaVisible, setPestanaVisible] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstancia | null>(null);
  const erroresSeguidosRef = useRef(0);
  const detenidoManualmenteRef = useRef(true); // true hasta que se arranca la primera vez

  useEffect(() => {
    try { setActivoState(localStorage.getItem(WAKEWORD_ACTIVO_KEY) === '1'); } catch { /* no critico */ }
  }, []);

  // Sincroniza con el toggle de Configuracion > Voz aunque viva en otro punto
  // del arbol (mismo patron que el resto de eventos globales de Chispa: sin
  // esto, activar/desactivar en Configuracion no tendria efecto en la
  // instancia real de este hook -montada en ChispaPanel- hasta recargar).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (ev: Event) => {
      const detalle = (ev as CustomEvent<{ activo?: boolean }>).detail;
      if (typeof detalle?.activo === 'boolean') setActivoState(detalle.activo);
    };
    window.addEventListener(CHISPA_WAKEWORD_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(CHISPA_WAKEWORD_TOGGLE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => setPestanaVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const setActivo = useCallback((v: boolean) => {
    setActivoState(v);
    try { localStorage.setItem(WAKEWORD_ACTIVO_KEY, v ? '1' : '0'); } catch { /* no critico */ }
  }, []);

  const pararEscucha = useCallback(() => {
    detenidoManualmenteRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ya estaba parado */ }
    }
    recognitionRef.current = null;
  }, []);

  const arrancarEscucha = useCallback(() => {
    const SR = speechRecognitionCtor();
    if (!SR) return;
    detenidoManualmenteRef.current = false;
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        const alt = String(e.results[i]?.[0]?.transcript ?? '');
        const deteccion = detectarActivacion(alt);
        if (deteccion.activado) {
          window.dispatchEvent(new CustomEvent(CHISPA_WAKE_EVENT, { detail: { comando: deteccion.resto || null } }));
          // Se corta esta escucha tras detectar: el panel toma el relevo con SU
          // propio microfono (useChispaVoz); onend la reiniciara para volver a
          // vigilar la siguiente vez que se diga la frase.
          try { rec.stop(); } catch { /* onend gestiona el reinicio */ }
          return;
        }
      }
    };
    rec.onerror = () => {
      erroresSeguidosRef.current += 1;
    };
    rec.onend = () => {
      recognitionRef.current = null;
      if (detenidoManualmenteRef.current) return;
      if (erroresSeguidosRef.current >= MAX_ERRORES_SEGUIDOS) {
        // Demasiados errores seguidos (p.ej. permiso revocado a medio uso):
        // se apaga el toggle en vez de reintentar indefinidamente en bucle.
        setActivo(false);
        return;
      }
      setTimeout(() => { if (!detenidoManualmenteRef.current) arrancarEscucha(); }, REINTENTO_MS);
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      erroresSeguidosRef.current = 0;
    } catch {
      erroresSeguidosRef.current += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActivo]);

  // Un unico efecto controla arrancar/parar segun TODAS las condiciones: el
  // toggle, si el navegador lo soporta, si Chispa esta habilitada para este
  // negocio, y si la pestana esta visible (no tiene sentido seguir
  // escuchando en segundo plano si el usuario ni siquiera mira la app).
  useEffect(() => {
    if (!soportado || !habilitadoParaNegocio || !activo || !pestanaVisible) {
      pararEscucha();
      return;
    }
    arrancarEscucha();
    return () => pararEscucha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, soportado, habilitadoParaNegocio, pestanaVisible]);

  return { activo, setActivo, soportado };
}

export default useChispaWakeWord;
