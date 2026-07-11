// Voz de Chispa (Sesion 5 del plan IA — informes/PLAN-IA-CHISPA.md; ampliada en la
// sesion de voz manos libres — docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md).
// Entrada por microfono (Web Speech API en modo CONTINUO con deteccion de silencio propia,
// con fallback de grabacion + STT server-side para navegadores sin soporte como Safari/iPad)
// y salida hablada (TTS ElevenLabs via edge, con fallback a speechSynthesis del navegador).
// Solo web: el nativo va por detras (CLAUDE.md) y estas APIs no existen en React Native puro.
//
// Regla de accesibilidad del plan: Chispa NUNCA escucha sola. iniciarEscucha()
// solo se llama desde un gesto explicito del usuario (click en el boton de
// microfono, o activar el toggle de modo conversacion/palabra de activacion).
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

export type EstadoVoz = 'inactivo' | 'escuchando' | 'transcribiendo' | 'hablando';
export type MotorVoz = 'elevenlabs' | 'navegador';

// --- Tipos minimos de la Web Speech API (no forma parte de lib.dom.d.ts: solo
// esta implementada, con prefijo webkit, en Chrome/Edge). Se declara aqui lo
// justo que se usa, para no depender de "any" (regla del proyecto).
interface SpeechRecognitionAlternativa { transcript: string }
interface SpeechRecognitionResultado { readonly length: number; readonly isFinal: boolean; [index: number]: SpeechRecognitionAlternativa }
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

// Silencio real antes de considerar un turno terminado (auto-envio). Una pausa
// para pensar es mas corta que esto (ver diseno de la sesion de voz manos libres).
const SILENCIO_ENVIO_MS = 4500;
// Techo de seguridad: si no se detecta NADA de habla en este tiempo, se para
// sola sin enviar (evita un microfono abierto indefinidamente sin uso).
const TIMEOUT_SIN_HABLA_MS = 30000;
// Umbral de nivel (0-1) por encima del cual se considera que hay habla, usado
// SOLO por el fallback de grabacion (Safari/iPad, que no tiene texto parcial).
const UMBRAL_RUIDO = 0.02;

// Cache en memoria (dura mientras la pestana este abierta) de audios ya
// sintetizados: evita pagar dos veces por el mismo texto exacto (p.ej. si el
// usuario pide "repite" o vuelve a llegar el mismo aviso).
const cacheAudioTts = new Map<string, string>();

function speechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as VentanaConSpeech;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

// Exportado para que TabVoz.web.tsx (gate del toggle "Hola Mecha") y
// useChispaWakeWord.web.ts compartan la MISMA deteccion de soporte, sin
// montar el hook completo solo para comprobarlo.
export function soportaVozNavegador(): boolean {
  return !!speechRecognitionCtor();
}

export function useChispaVoz(configVozId: string = 'ef_dora') {
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
  // Transcripcion en vivo (final + lo que se esta oyendo ahora mismo): se
  // muestra bajo el input mientras escuchando (indicador visual real, no solo
  // un texto estatico de "Escuchando...").
  const [transcripcionParcial, setTranscripcionParcial] = useState('');
  // Nivel de audio (0-1) para animar el boton del microfono de forma reactiva.
  const [nivelAudio, setNivelAudio] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionInstancia | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const onResultadoRef = useRef<((texto: string) => void) | null>(null);

  // --- Medicion de nivel de audio (AnalyserNode), compartida por ambos motores ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nivelStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- Estado interno del turno de escucha en curso ---
  const textoActualRef = useRef(''); // ultimo texto (final+parcial) reconocido, motor nativo
  const silencioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const techoSinHablaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entregadoRef = useRef(false); // evita doble entrega si stop() dispara otro evento

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

  // Pre-calienta el motor natural (Kokoro en el VPS) en segundo plano: la
  // primera sintesis del dia carga el modelo (~15-20s cold start), asi que se
  // dispara al abrir Chispa / activar la voz para que ese coste se pague MIENTRAS
  // el usuario lee o escribe, no cuando pide oir la respuesta. Best-effort y
  // throttled (una vez cada 4 min): si falla o el motor es el navegador, no hace nada.
  const ultimoWarm = useRef(0);
  const precalentar = useCallback(async () => {
    if (motorVoz === 'navegador' || !ttsDisponible) return;
    const now = Date.now();
    if (now - ultimoWarm.current < 4 * 60 * 1000) return;
    ultimoWarm.current = now;
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) { ultimoWarm.current = 0; return; }
      await fetch(`${SUPABASE_URL}/functions/v1/chispa-tts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ warm: true, voice_id: configVozId }),
      });
    } catch {
      ultimoWarm.current = 0; // reintentar la proxima vez si fallo la red
    }
  }, [motorVoz, ttsDisponible, configVozId]);

  const detenerHabla = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
    }
    setEstado((e) => (e === 'hablando' ? 'inactivo' : e));
  }, []);

  // Para el medidor de nivel (RAF + AudioContext) y resetea el indicador visual.
  const detenerMedidorNivel = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* ya cerrado */ });
      audioCtxRef.current = null;
    }
    setNivelAudio(0);
  }, []);

  // Mide el nivel de audio de un stream (0-1, suavizado) para animar el boton
  // del microfono. onSilencioLargo es OPCIONAL: solo lo usa el fallback de
  // grabacion (Safari/iPad, que no tiene texto parcial que mirar) para decidir
  // cuando cortar sola tras un silencio real. El motor nativo ignora este
  // callback (usa su propio temporizador basado en texto, mas fiable que el
  // volumen en un salon con ruido de fondo).
  const iniciarMedidorNivel = useCallback((stream: MediaStream, onSilencioLargo?: () => void) => {
    try {
      const AudioContextCtor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const datos = new Uint8Array(analyser.frequencyBinCount);
      const inicio = Date.now();
      let huboHabla = false;
      let ultimoSonido = inicio;
      const medir = () => {
        const an = analyserRef.current;
        if (!an) return;
        an.getByteFrequencyData(datos);
        let suma = 0;
        for (let i = 0; i < datos.length; i++) suma += datos[i];
        const promedio = suma / datos.length / 255;
        setNivelAudio(promedio);
        if (onSilencioLargo) {
          const ahora = Date.now();
          if (promedio > UMBRAL_RUIDO) { huboHabla = true; ultimoSonido = ahora; }
          if (huboHabla && ahora - ultimoSonido > SILENCIO_ENVIO_MS) { onSilencioLargo(); return; }
          if (!huboHabla && ahora - inicio > TIMEOUT_SIN_HABLA_MS) { onSilencioLargo(); return; }
        }
        rafRef.current = requestAnimationFrame(medir);
      };
      rafRef.current = requestAnimationFrame(medir);
    } catch {
      // Puramente cosmetico/de apoyo: si falla, se sigue sin animacion reactiva
      // ni auto-corte por amplitud (el usuario aun puede tocar el boton a mano).
    }
  }, []);

  const limpiarTemporizadores = useCallback(() => {
    if (silencioTimerRef.current) { clearTimeout(silencioTimerRef.current); silencioTimerRef.current = null; }
    if (techoSinHablaRef.current) { clearTimeout(techoSinHablaRef.current); techoSinHablaRef.current = null; }
  }, []);

  // Para TODO lo que este escuchando/grabando y limpia recursos, sin decidir
  // que hacer con lo oido (eso lo deciden detenerEscucha/finalizarEscucha).
  const pararMotor = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ya estaba parado */ }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    nivelStreamRef.current?.getTracks().forEach((t) => t.stop());
    nivelStreamRef.current = null;
    detenerMedidorNivel();
    limpiarTemporizadores();
  }, [detenerMedidorNivel, limpiarTemporizadores]);

  // Cancela la escucha SIN entregar nada (cierre de panel, desmontaje).
  const detenerEscucha = useCallback(() => {
    entregadoRef.current = true; // evita que un onresult/onend tardio entregue de mas
    pararMotor();
    setEstado((e) => (e === 'escuchando' ? 'inactivo' : e));
    setTranscripcionParcial('');
    textoActualRef.current = '';
  }, [pararMotor]);

  // Termina el turno YA y entrega lo oido hasta este momento (el usuario tenia
  // prisa y no quiere esperar el temporizador de silencio). En el motor nativo
  // se entrega el texto acumulado DIRECTAMENTE (no se espera a que el navegador
  // dispare otro evento tras stop(), que no es fiable entre navegadores). En el
  // fallback de grabacion, stop() ya dispara la transcripcion real via mr.onstop
  // (por eso aqui NO se llama al callback: lo hace transcribirServidor cuando
  // resuelva). Idempotente: una segunda llamada (p.ej. el onend del navegador
  // tras nuestro propio stop()) no hace nada.
  const finalizarEscucha = useCallback(() => {
    if (entregadoRef.current) return;
    entregadoRef.current = true;
    const texto = textoActualRef.current.trim();
    const esNativo = !!recognitionRef.current;
    pararMotor();
    setEstado((e) => (e === 'escuchando' ? (esNativo ? 'inactivo' : 'transcribiendo') : e));
    setTranscripcionParcial('');
    textoActualRef.current = '';
    if (esNativo) onResultadoRef.current?.(texto);
  }, [pararMotor]);

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
    entregadoRef.current = false;
    textoActualRef.current = '';
    setTranscripcionParcial('');

    let streamInicial: MediaStream | null = null;
    try {
      const getAudio = () => {
        if (navigator.mediaDevices?.getUserMedia) {
          return navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const legacy = (navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        if (legacy) {
          return new Promise<MediaStream>((res, rej) => legacy.call(navigator, { audio: true }, res, rej));
        }
        return Promise.reject(new Error('NotSupportedError'));
      };
      streamInicial = await getAudio();
    } catch (err) {
      const nombre = (err as { name?: string } | undefined)?.name ?? (err as Error)?.message ?? '';
      if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') {
        setErrorVoz('El microfono esta bloqueado para este sitio. Haz clic en el candado de la barra de direcciones, entra en Permisos, pon Microfono en Permitir, y vuelve a pulsar el microfono.');
      } else if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
        setErrorVoz('No se ha encontrado ningun microfono conectado a este dispositivo.');
      } else if (nombre === 'NotSupportedError') {
        setErrorVoz('Tu navegador no soporta el acceso al microfono o la conexion no es segura (HTTPS).');
      } else {
        setErrorVoz('No se pudo acceder al microfono. Comprueba los permisos del navegador para este sitio.');
      }
      return;
    }

    const SR = speechRecognitionCtor();
    if (soportaReconocimientoNativo && SR) {
      // A diferencia de antes, este stream YA NO se detiene: se usa en paralelo
      // solo para medir el nivel de audio (animacion). El reconocedor gestiona
      // su propio audio interno por separado; el navegador permite dos
      // consumidores del mismo microfono a la vez.
      nivelStreamRef.current = streamInicial;
      iniciarMedidorNivel(streamInicial);

      const rec = new SR();
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      // Continuo: YA NO depende del corte corto del propio navegador (esa era
      // la causa del envio prematuro). El turno lo cierra NUESTRO temporizador
      // de silencio real (SILENCIO_ENVIO_MS), no el endpointing del navegador.
      rec.continuous = true;

      const programarEnvioPorSilencio = () => {
        if (silencioTimerRef.current) clearTimeout(silencioTimerRef.current);
        silencioTimerRef.current = setTimeout(() => finalizarEscucha(), SILENCIO_ENVIO_MS);
      };
      // Techo de seguridad: si no llega NINGUN resultado en todo este tiempo,
      // se para sola (finalizarEscucha con texto vacio es un no-op para quien
      // la llama: enviarMensaje ya ignora los mensajes vacios).
      techoSinHablaRef.current = setTimeout(() => {
        if (!textoActualRef.current.trim()) finalizarEscucha();
      }, TIMEOUT_SIN_HABLA_MS);

      rec.onresult = (e) => {
        let finalTxt = '';
        let interimTxt = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          const alt = String(r[0]?.transcript ?? '').trim();
          if (!alt) continue;
          if (r.isFinal) finalTxt = `${finalTxt} ${alt}`.trim();
          else interimTxt = `${interimTxt} ${alt}`.trim();
        }
        const combinado = `${finalTxt} ${interimTxt}`.trim();
        textoActualRef.current = combinado;
        setTranscripcionParcial(combinado);
        if (combinado) programarEnvioPorSilencio();
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
        entregadoRef.current = true; // en error no se entrega texto parcial, solo se limpia
        pararMotor();
        setEstado('inactivo');
        setTranscripcionParcial('');
      };
      rec.onend = () => {
        // Si el navegador termina la sesion de reconocimiento por su cuenta
        // (limite interno) antes de que nuestro temporizador de silencio
        // dispare, entregamos igualmente lo que hubiera hasta ahora.
        if (!entregadoRef.current) finalizarEscucha();
        setEstado((e) => (e === 'escuchando' ? 'inactivo' : e));
      };
      recognitionRef.current = rec;
      try {
        rec.start();
        setEstado('escuchando');
      } catch {
        setErrorVoz('No se pudo iniciar el micrófono. Comprueba que está conectado y permitido en el navegador.');
        limpiarTemporizadores();
      }
      return;
    }

    // Fallback (Safari/iPad y demas navegadores sin Web Speech): grabar y
    // mandar el audio al edge de transcripcion server-side. Sin texto parcial
    // real: se usa el NIVEL de audio para decidir cuando cortar sola tras un
    // silencio real, con el mismo umbral temporal que el motor nativo.
    try {
      const stream = streamInicial;
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
      iniciarMedidorNivel(stream, () => finalizarEscucha());
    } catch {
      streamInicial.getTracks().forEach((t) => t.stop());
      setErrorVoz('No se pudo iniciar la grabacion. Ve a los ajustes del navegador y permite el acceso al micrófono para este sitio.');
      setEstado('inactivo');
    }
  }, [estado, soportaReconocimientoNativo, transcribirServidor, iniciarMedidorNivel, limpiarTemporizadores, finalizarEscucha, pararMotor]);

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
      const cacheKey = `${configVozId}|${limpio}`;
      let url = cacheAudioTts.get(cacheKey);
      if (!url) {
        const { data: sesion } = await supabase.auth.getSession();
        const token = sesion.session?.access_token;
        if (!token) throw new Error('Sin sesion');
        const r = await fetch(`${SUPABASE_URL}/functions/v1/chispa-tts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: limpio, voice_id: configVozId }),
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
        cacheAudioTts.set(cacheKey, url);
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
    transcripcionParcial, nivelAudio,
    iniciarEscucha, detenerEscucha, finalizarEscucha, hablar, detenerHabla, precalentar,
  };
}

export default useChispaVoz;
