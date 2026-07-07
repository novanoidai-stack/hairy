// Voz de Chispa (Sesion 5 del plan IA — informes/PLAN-IA-CHISPA.md). Entrada por
// microfono (Web Speech API, con fallback de grabacion + STT server-side para
// navegadores sin soporte como Safari/iPad) y salida hablada (TTS ElevenLabs via
// edge, con fallback a speechSynthesis del navegador). Solo web: el nativo va
// por detras (CLAUDE.md) y estas APIs no existen en React Native puro.
//
// Regla de accesibilidad del plan: Chispa NUNCA escucha sola. iniciarEscucha()
// solo se llama desde un gesto explicito del usuario (click en el boton de
// microfono), nunca automaticamente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

export type EstadoVoz = 'inactivo' | 'escuchando' | 'transcribiendo' | 'hablando';
export type MotorVoz = 'elevenlabs' | 'navegador';

// --- Tipos minimos de la Web Speech API (no forma parte de lib.dom.d.ts: solo
// esta implementada, con prefijo webkit, en Chrome/Edge). Se declara aqui lo
// justo que se usa, para no depender de "any" (regla del proyecto).
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

const MOTOR_KEY = 'mecha-chispa-motor-voz';
const VOZ_ACTIVA_KEY = 'mecha-chispa-voz-activa';

// Cache en memoria (dura mientras la pestana este abierta) de audios ya
// sintetizados: evita pagar dos veces por el mismo texto exacto (p.ej. si el
// usuario pide "repite" o vuelve a llegar el mismo aviso).
const cacheAudioTts = new Map<string, string>();

function speechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as VentanaConSpeech;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function useChispaVoz() {
  const [estado, setEstado] = useState<EstadoVoz>('inactivo');
  const [errorVoz, setErrorVoz] = useState<string | null>(null);
  // Se apaga solo (y para toda la sesion de la pestana) si el edge responde que
  // no hay ELEVENLABS_API_KEY configurada: evita reintentar en cada respuesta.
  const [ttsDisponible, setTtsDisponible] = useState(true);
  // Voz honesta (Sesion 1 V2): true cuando la ULTIMA vez que se intento hablar con
  // ElevenLabs, fallo y se degrado a la voz del navegador. Se apaga en el proximo
  // exito. NO se activa cuando el usuario elige "navegador" a proposito en el A/B.
  const [vozDegradada, setVozDegradada] = useState(false);
  const [motorVoz, setMotorVozState] = useState<MotorVoz>('elevenlabs');
  const [vozActiva, setVozActivaState] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstancia | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const onResultadoRef = useRef<((texto: string) => void) | null>(null);

  const soportaReconocimientoNativo = useRef(!!speechRecognitionCtor()).current;

  // Preferencias persistidas (por navegador, no por negocio: es una preferencia
  // personal de como quiere usar Chispa cada usuario en su equipo).
  useEffect(() => {
    try {
      const m = localStorage.getItem(MOTOR_KEY);
      if (m === 'elevenlabs' || m === 'navegador') setMotorVozState(m);
      setVozActivaState(localStorage.getItem(VOZ_ACTIVA_KEY) === '1');
    } catch { /* almacenamiento no disponible: se queda en los valores por defecto */ }
  }, []);

  useEffect(() => {
    if (!errorVoz) return;
    const t = setTimeout(() => setErrorVoz(null), 5000);
    return () => clearTimeout(t);
  }, [errorVoz]);

  const setMotorVoz = useCallback((m: MotorVoz) => {
    setMotorVozState(m);
    try { localStorage.setItem(MOTOR_KEY, m); } catch { /* no critico */ }
  }, []);

  const setVozActiva = useCallback((v: boolean) => {
    setVozActivaState(v);
    try { localStorage.setItem(VOZ_ACTIVA_KEY, v ? '1' : '0'); } catch { /* no critico */ }
  }, []);

  const detenerHabla = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
    }
    setEstado((e) => (e === 'hablando' ? 'inactivo' : e));
  }, []);

  const detenerEscucha = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ya estaba parado */ }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setEstado((e) => (e === 'escuchando' ? 'inactivo' : e));
  }, []);

  useEffect(() => {
    // Solo al desmontar el panel: corta cualquier escucha/habla en curso.
    return () => { detenerEscucha(); detenerHabla(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fallback STT server-side: graba y manda el audio al edge chispa-stt ---
  const transcribirServidor = useCallback(async (blob: Blob) => {
    setEstado('transcribiendo');
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error('Sin sesion');
      const r = await fetch(`${SUPABASE_URL}/functions/v1/chispa-stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': blob.type || 'audio/webm',
        },
        body: blob,
      });
      if (r.status === 501) {
        setErrorVoz('La transcripcion por voz no esta disponible todavia en este navegador.');
        return;
      }
      if (!r.ok) throw new Error('Fallo al transcribir');
      const data = (await r.json()) as { texto?: string };
      const texto = typeof data.texto === 'string' ? data.texto.trim() : '';
      if (texto) onResultadoRef.current?.(texto);
      else setErrorVoz('No se entendió lo que dijiste. Intenta hablar un poco más alto y claro.');
    } catch {
      setErrorVoz('Error al conectar con el servicio de voz. Comprueba tu conexión.');
    } finally {
      setEstado('inactivo');
    }
  }, []);

  // --- Iniciar escucha: Web Speech si el navegador lo soporta; si no, graba ---
  const iniciarEscucha = useCallback(async (onResultado: (texto: string) => void) => {
    if (estado !== 'inactivo') return;
    setErrorVoz(null);
    onResultadoRef.current = onResultado;

    // Provoca el prompt NATIVO de permiso del navegador (getUserMedia) ANTES de
    // intentar Web Speech: el permiso interno de SpeechRecognition no es fiable
    // en todos los navegadores, y esto asegura un dialogo claro en el primer uso
    // en vez de un fallo silencioso o un mensaje generico de "activalo a mano".
    try {
      const permiso = await navigator.mediaDevices.getUserMedia({ audio: true });
      permiso.getTracks().forEach((t) => t.stop());
    } catch (err) {
      const nombre = (err as { name?: string } | undefined)?.name ?? '';
      if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') {
        setErrorVoz('El microfono esta bloqueado para este sitio. Haz clic en el candado de la barra de direcciones, entra en Permisos, pon Microfono en Permitir, y vuelve a pulsar el microfono.');
      } else if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
        setErrorVoz('No se ha encontrado ningun microfono conectado a este dispositivo.');
      } else {
        setErrorVoz('No se pudo acceder al microfono. Comprueba los permisos del navegador para este sitio.');
      }
      return;
    }

    const SR = speechRecognitionCtor();
    if (soportaReconocimientoNativo && SR) {
      const rec = new SR();
      rec.lang = 'es-ES';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e) => {
        const texto = String(e.results?.[0]?.[0]?.transcript ?? '').trim();
        if (texto) onResultadoRef.current?.(texto);
        else setErrorVoz('No se entendió. Habla un poco más alto y claro.');
      };
      rec.onerror = (ev: Event) => {
        const errorType = (ev as any).error ?? '';
        if (errorType === 'not-allowed' || errorType === 'permission-denied') {
          setErrorVoz('El micrófono está bloqueado. Haz clic en el candado de la barra del navegador, entra en Permisos, pon Micrófono en Permitir, y vuelve a intentarlo.');
        } else if (errorType === 'no-speech') {
          setErrorVoz('No detecté tu voz. ¿Tienes el micrófono encendido? Pulsa de nuevo e intenta hablar.');
        } else if (errorType === 'network') {
          setErrorVoz('Error de red al usar el reconocimiento de voz. Comprueba tu conexión a internet.');
        } else {
          setErrorVoz('No se pudo escuchar. Revisa que tu micrófono esté conectado y que el navegador tenga permiso para usarlo.');
        }
        setEstado('inactivo');
      };
      rec.onend = () => setEstado((e) => (e === 'escuchando' ? 'inactivo' : e));
      recognitionRef.current = rec;
      try {
        rec.start();
        setEstado('escuchando');
      } catch {
        setErrorVoz('No se pudo iniciar el micrófono. Comprueba que está conectado y permitido en el navegador.');
      }
      return;
    }

    // Fallback (Safari/iPad y demas navegadores sin Web Speech): grabar y
    // mandar el audio al edge de transcripcion server-side.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm' : '';
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        void transcribirServidor(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setEstado('escuchando');
    } catch {
      setErrorVoz('No se pudo acceder al micrófono. Ve a los ajustes del navegador y permite el acceso al micrófono para este sitio.');
      setEstado('inactivo');
    }
  }, [estado, soportaReconocimientoNativo, transcribirServidor]);

  // --- TTS navegador (fallback y motor "navegador" del A/B) ---
  const hablarNavegador = useCallback((texto: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.onstart = () => setEstado('hablando');
    u.onend = () => setEstado((e) => (e === 'hablando' ? 'inactivo' : e));
    u.onerror = () => setEstado((e) => (e === 'hablando' ? 'inactivo' : e));
    window.speechSynthesis.speak(u);
  }, []);

  // --- TTS: reproduce la respuesta de Chispa (ElevenLabs o navegador) ---
  const hablar = useCallback(async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;
    detenerHabla();

    if (motorVoz === 'navegador' || !ttsDisponible) {
      hablarNavegador(limpio);
      return;
    }

    try {
      let url = cacheAudioTts.get(limpio);
      if (!url) {
        const { data: sesion } = await supabase.auth.getSession();
        const token = sesion.session?.access_token;
        if (!token) throw new Error('Sin sesion');
        const r = await fetch(`${SUPABASE_URL}/functions/v1/chispa-tts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: limpio }),
        });
        if (r.status === 501) {
          // Sin ELEVENLABS_API_KEY configurada en Supabase secrets: se apaga el
          // motor IA para el resto de la sesion y se degrada al navegador.
          setTtsDisponible(false);
          setVozDegradada(true);
          hablarNavegador(limpio);
          return;
        }
        if (!r.ok) {
          setVozDegradada(true);
          throw new Error('Fallo al generar audio');
        }
        const blob = await r.blob();
        url = URL.createObjectURL(blob);
        cacheAudioTts.set(limpio, url);
      }
      // Llegar hasta aqui (cache o fetch fresco) significa que ElevenLabs
      // respondio bien: la voz deja de estar degradada.
      setVozDegradada(false);
      const audio = new Audio(url);
      audioElRef.current = audio;
      audio.onplay = () => setEstado('hablando');
      audio.onended = () => setEstado((e) => (e === 'hablando' ? 'inactivo' : e));
      audio.onerror = () => setEstado((e) => (e === 'hablando' ? 'inactivo' : e));
      await audio.play();
    } catch {
      // No dejar a Chispa "muda": si falla el proxy de ElevenLabs, se degrada.
      setVozDegradada(true);
      hablarNavegador(limpio);
    }
  }, [motorVoz, ttsDisponible, detenerHabla, hablarNavegador]);

  return {
    estado, errorVoz, soportaReconocimientoNativo, ttsDisponible, vozDegradada,
    motorVoz, setMotorVoz, vozActiva, setVozActiva,
    iniciarEscucha, detenerEscucha, hablar, detenerHabla,
  };
}

export default useChispaVoz;
