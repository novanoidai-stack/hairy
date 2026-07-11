# Chispa: voz manos libres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chispa's voice UX gets a real listening/speaking animation, fixes the premature auto-send
bug (real ~4.5s silence detection instead of the browser's short built-in pause), a hands-free
"modo conversación" loop (mic re-arms itself after each reply), and an opt-in "Hola Mecha" wake
word that opens the panel from anywhere in the app.

**Architecture:** 100% client-side (Expo/RN web), no edge/DB changes. `lib/hooks/useChispaVoz.web.ts`
gets a rewritten listening engine (continuous+interim Web Speech, our own silence timer, Web Audio
level metering). A new independent hook `lib/hooks/useChispaWakeWord.web.ts` runs a second,
background recognition instance gated by an explicit toggle. `ChispaPanel.web.tsx` wires both
together (auto re-arm loop, wake-event handling) and adds the visual polish. `TabVoz.web.tsx` gets
the wake-word toggle with honest privacy copy.

**Tech Stack:** React (Expo/RN web), Web Speech API (`SpeechRecognition`), Web Audio API
(`AudioContext`/`AnalyserNode`), `MediaRecorder` (Safari/iPad fallback, unchanged transport),
`localStorage` (device-level preferences), Deno tests for pure logic (repo convention, see
`lib/upsellCandidato.test.ts`).

## Global Constraints

- Código en inglés, comentarios en español, sin emojis en UI/código (CLAUDE.md).
- Sin `any` en TypeScript.
- Móvil primero (`useResponsive`), pero esta tanda es principalmente lógica/estado — sin nuevos
  layouts que requieran ese tratamiento salvo el toggle nuevo (reutiliza el patrón ya responsive
  de los botones de cabecera existentes).
- Tokens exactos de `lib/designTokens.ts` (`T.*`), reutilizar componentes de
  `components/ui/SettingsAtoms.tsx` (`Section`, `FieldRow`, `Toggle`) antes de crear nuevos.
- `prefers-reduced-motion` respetado en toda animación nueva (ya hay un media query en
  `PANEL_STYLES` de `ChispaPanel.web.tsx`; añadir ahí).
- Chispa NUNCA escucha sin un gesto explícito del usuario (activar un toggle cuenta como el
  gesto; una vez activo, el re-arme automático del modo conversación es continuación de ese
  mismo gesto, no una escucha nueva sin permiso).
- Nunca en la demo compartida (`IS_DEMO_MODE` / `demo_salon_001`): el wake-word ni se monta.
- "Hola Mecha" por defecto **OFF**, con copy honesto de privacidad, solo Chrome/Edge.
- Verificación: `npx tsc --noEmit` + `npm run build:web` limpios tras cada tarea que toque
  TypeScript. El micrófono real no se puede probar en el entorno de preview automatizado (sin
  hardware de audio) — se deja explícito en la tarea de verificación final.
- Spec de referencia completa:
  `docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md`.

---

### Task 1: Utilidades puras de detección de la palabra de activación

**Files:**
- Create: `lib/chispaWakeWordUtils.ts`
- Test: `lib/chispaWakeWordUtils.test.ts`

**Interfaces:**
- Produces: `normalizarTextoVoz(texto: string): string`, `detectarActivacion(texto: string, frases?:
  string[]): { activado: boolean; resto: string }`, `FRASES_ACTIVACION: string[]` — usados por
  Task 4 (`useChispaWakeWord.web.ts`).

- [ ] **Step 1: Escribe el test (falla porque el módulo no existe todavía)**

Crea `lib/chispaWakeWordUtils.test.ts`:

```ts
// Tests puros de la deteccion de "Hola Mecha" (deno test, sin DOM/navegador).
// Ejecutar: deno test lib/chispaWakeWordUtils.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizarTextoVoz, detectarActivacion, FRASES_ACTIVACION } from './chispaWakeWordUtils.ts';

Deno.test('normaliza mayusculas y tildes', () => {
  assertEquals(normalizarTextoVoz('Hóla MÉCHA'), 'hola mecha');
});

Deno.test('colapsa espacios repetidos', () => {
  assertEquals(normalizarTextoVoz('hola    mecha'), 'hola mecha');
});

Deno.test('detecta la frase exacta sin texto adicional', () => {
  const r = detectarActivacion('hola mecha');
  assertEquals(r.activado, true);
  assertEquals(r.resto, '');
});

Deno.test('detecta la frase con un comando pegado en la misma frase', () => {
  const r = detectarActivacion('hola mecha, cuanto llevo hoy');
  assertEquals(r.activado, true);
  assertEquals(r.resto, 'cuanto llevo hoy');
});

Deno.test('detecta la frase con texto delante ("oye, hola mecha")', () => {
  const r = detectarActivacion('oye, hola mecha');
  assertEquals(r.activado, true);
  assertEquals(r.resto, '');
});

Deno.test('detecta la variante "hola chispa"', () => {
  const r = detectarActivacion('hola chispa que tal');
  assertEquals(r.activado, true);
  assertEquals(r.resto, 'que tal');
});

Deno.test('no detecta si no aparece ninguna frase', () => {
  const r = detectarActivacion('cuanto llevo hoy');
  assertEquals(r.activado, false);
  assertEquals(r.resto, '');
});

Deno.test('ignora tildes/mayusculas en la frase de activacion', () => {
  const r = detectarActivacion('HÓLA MÉCHA cuanto llevo');
  assertEquals(r.activado, true);
  assertEquals(r.resto, 'cuanto llevo');
});

Deno.test('FRASES_ACTIVACION incluye mecha y chispa', () => {
  assertEquals(FRASES_ACTIVACION.includes('hola mecha'), true);
  assertEquals(FRASES_ACTIVACION.includes('hola chispa'), true);
});
```

- [ ] **Step 2: Ejecuta el test para verificar que falla**

Run: `deno test lib/chispaWakeWordUtils.test.ts`
Expected: FAIL (módulo `./chispaWakeWordUtils.ts` no existe: `Module not found`).

- [ ] **Step 3: Implementa el módulo**

Crea `lib/chispaWakeWordUtils.ts`:

```ts
// Logica PURA (sin DOM/navegador) para detectar la palabra de activacion de
// Chispa ("Hola Mecha" / "Hola Chispa") dentro de un texto transcrito. Se
// separa de useChispaWakeWord.web.ts para poder testearla con `deno test`
// (igual que lib/retrasos.ts, lib/upsellCandidato.ts), sin depender de APIs
// de navegador. Ver diseno: docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md

export const FRASES_ACTIVACION = ['hola mecha', 'hola chispa'];

// Minusculas, sin tildes, espacios colapsados y recortados. Determinista.
export function normalizarTextoVoz(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DeteccionActivacion {
  activado: boolean;
  // Lo que sigue a la frase de activacion (recortado), si el usuario dijo
  // algo mas en la misma frase ("hola mecha, cuanto llevo hoy" -> "cuanto llevo hoy").
  resto: string;
}

// Busca CUALQUIERA de las frases de activacion dentro del texto (no exige que
// sea el inicio exacto: "oye, hola mecha" tambien activa). Devuelve el resto
// del texto tras la PRIMERA aparicion de la frase encontrada.
export function detectarActivacion(texto: string, frases: string[] = FRASES_ACTIVACION): DeteccionActivacion {
  const normalizado = normalizarTextoVoz(texto);
  if (!normalizado) return { activado: false, resto: '' };
  for (const frase of frases) {
    const idx = normalizado.indexOf(frase);
    if (idx !== -1) {
      const resto = normalizado.slice(idx + frase.length).replace(/^[,.\s]+/, '').trim();
      return { activado: true, resto };
    }
  }
  return { activado: false, resto: '' };
}
```

- [ ] **Step 4: Ejecuta el test para verificar que pasa**

Run: `deno test lib/chispaWakeWordUtils.test.ts`
Expected: `ok | 9 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/chispaWakeWordUtils.ts lib/chispaWakeWordUtils.test.ts
git commit -m "feat(chispa-voz): utilidades puras de deteccion de Hola Mecha"
```

---

### Task 2: Constantes de eventos globales nuevas

**Files:**
- Modify: `lib/chispaBloques.ts`

**Interfaces:**
- Consumes: nada nuevo (archivo ya existente).
- Produces: `CHISPA_WAKE_EVENT: string`, `CHISPA_WAKEWORD_TOGGLE_EVENT: string` — usados por
  Task 4, Task 5, Task 7.

- [ ] **Step 1: Añade las dos constantes junto a las de organizar agenda**

En `lib/chispaBloques.ts`, busca este bloque (ya existe tal cual):

```ts
export const CHISPA_ORGANIZAR_EVENT = 'mecha-chispa-organizar-agenda';
export const CHISPA_ORGANIZAR_FLAG = '__mechaOrganizarDisponible';
```

Reemplázalo por (añade las dos constantes nuevas justo después, con su comentario):

```ts
export const CHISPA_ORGANIZAR_EVENT = 'mecha-chispa-organizar-agenda';
export const CHISPA_ORGANIZAR_FLAG = '__mechaOrganizarDisponible';

// Voz manos libres (palabra de activacion "Hola Mecha"): CHISPA_WAKE_EVENT lo
// dispara useChispaWakeWord.web.ts al detectar la frase (con el comando restante
// en detail.comando si venia en la misma frase); ChispaPanel.web.tsx lo escucha
// para abrirse y empezar a escuchar. CHISPA_WAKEWORD_TOGGLE_EVENT sincroniza el
// toggle de Configuracion > Voz (TabVoz.web.tsx) con la instancia real del hook
// (montada en ChispaPanel), que vive en otro punto del arbol y no comparte
// estado de React: sin este evento, activar/desactivar en Configuracion no
// tendria efecto hasta recargar la pagina.
export const CHISPA_WAKE_EVENT = 'mecha-chispa-wake';
export const CHISPA_WAKEWORD_TOGGLE_EVENT = 'mecha-chispa-wakeword-toggle';
```

- [ ] **Step 2: Verifica que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (el archivo solo añade exports de constantes).

- [ ] **Step 3: Commit**

```bash
git add lib/chispaBloques.ts
git commit -m "feat(chispa-voz): eventos globales para wake word y su toggle"
```

---

### Task 3: Reescritura de `useChispaVoz.web.ts` (escucha continua + silencio real + nivel de audio)

**Files:**
- Modify (reemplazo completo del contenido): `lib/hooks/useChispaVoz.web.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces (contrato del hook, TODO lo anterior se mantiene + lo nuevo):
  `estado: EstadoVoz`, `errorVoz: string | null`, `soportaReconocimientoNativo: boolean`,
  `ttsDisponible: boolean`, `vozDegradada: boolean`, `motorVoz: MotorVoz`,
  `setMotorVoz(m: MotorVoz): void`, `vozActiva: boolean`, `setVozActiva(v: boolean): void`,
  `transcripcionParcial: string` (NUEVO), `nivelAudio: number` (NUEVO, 0–1),
  `iniciarEscucha(onResultado: (texto: string) => void): Promise<void>`,
  `detenerEscucha(): void` (cancela SIN entregar), `finalizarEscucha(): void` (NUEVO: termina YA y
  entrega lo oído hasta el momento), `hablar(texto: string): Promise<void>`, `detenerHabla(): void`,
  `precalentar(): Promise<void>`. Además exporta a nivel de módulo:
  `soportaVozNavegador(): boolean` (NUEVO) — usado por Task 4 y Task 7 sin montar el hook completo.

Este hook es el único consumidor conocido hoy (`ChispaPanel.web.tsx`); el contrato previo se
mantiene, solo se añade.

- [ ] **Step 1: Reemplaza el contenido completo del archivo**

Sustituye TODO el contenido de `lib/hooks/useChispaVoz.web.ts` por:

```ts
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
```

- [ ] **Step 2: Verifica que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. Si aparece un error de tipos en `ChispaPanel.web.tsx` sobre
`voz.detenerEscucha`/`manejarClicMicro`, ES ESPERADO todavía en este punto (Task 5 lo actualiza);
confirma que el error está SOLO en ese archivo y no en `useChispaVoz.web.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useChispaVoz.web.ts
git commit -m "feat(chispa-voz): escucha continua con silencio real, nivel de audio y finalizarEscucha"
```

---

### Task 4: Hook de la palabra de activación ("Hola Mecha")

**Files:**
- Create: `lib/hooks/useChispaWakeWord.web.ts`

**Interfaces:**
- Consumes: `soportaVozNavegador()` de `lib/hooks/useChispaVoz.web.ts` (Task 3); `detectarActivacion`
  de `lib/chispaWakeWordUtils.ts` (Task 1); `CHISPA_WAKE_EVENT`, `CHISPA_WAKEWORD_TOGGLE_EVENT` de
  `lib/chispaBloques.ts` (Task 2).
- Produces: `useChispaWakeWord(habilitadoParaNegocio: boolean): { activo: boolean; setActivo:
  (v: boolean) => void; soportado: boolean }` y la constante `WAKEWORD_ACTIVO_KEY: string` — usados
  por Task 5 (`ChispaPanel.web.tsx`) y Task 7 (`TabVoz.web.tsx`).

- [ ] **Step 1: Crea el hook**

Crea `lib/hooks/useChispaWakeWord.web.ts`:

```ts
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
```

- [ ] **Step 2: Verifica que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useChispaWakeWord.web.ts
git commit -m "feat(chispa-voz): hook de la palabra de activacion Hola Mecha"
```

---

### Task 5: `ChispaPanel.web.tsx` — modo conversación + wake word (cableado funcional)

**Files:**
- Modify: `components/chispa/ChispaPanel.web.tsx`

**Interfaces:**
- Consumes: `finalizarEscucha`, `transcripcionParcial`, `nivelAudio` de `voz` (Task 3);
  `useChispaWakeWord` de Task 4; `CHISPA_WAKE_EVENT` de Task 2.
- Produces: función `iniciarTurnoVoz()` y estado `modoConversacion` — consumidos por Task 6
  (polish visual, mismo archivo).

- [ ] **Step 1: Añade el import de `CHISPA_WAKE_EVENT` y del nuevo hook**

Busca esta línea (import ya existente):

```ts
import { normalizarRespuesta, CHISPA_RUTAS, CHISPA_CONFIG_GUIADA_EVENT, CHISPA_ORGANIZAR_EVENT, CHISPA_ORGANIZAR_FLAG, type Bloque } from '@/lib/chispaBloques';
```

Reemplázala por:

```ts
import { normalizarRespuesta, CHISPA_RUTAS, CHISPA_CONFIG_GUIADA_EVENT, CHISPA_ORGANIZAR_EVENT, CHISPA_ORGANIZAR_FLAG, CHISPA_WAKE_EVENT, type Bloque } from '@/lib/chispaBloques';
```

Busca esta línea (import ya existente):

```ts
import { useChispaVoz } from '@/lib/hooks/useChispaVoz.web';
```

Reemplázala por:

```ts
import { useChispaVoz } from '@/lib/hooks/useChispaVoz.web';
import { useChispaWakeWord } from '@/lib/hooks/useChispaWakeWord.web';
```

- [ ] **Step 2: Añade la constante de localStorage del modo conversación**

Busca este bloque ya existente:

```ts
const ONBOARDING_AUTO_KEY_PREFIX = 'mecha-chispa-onboarding-auto:';
```

Reemplázalo por:

```ts
const ONBOARDING_AUTO_KEY_PREFIX = 'mecha-chispa-onboarding-auto:';
// Modo conversacion (voz manos libres): preferencia por navegador, igual
// patron que motorVoz/vozActiva en useChispaVoz.web.ts.
const MODO_CONVERSACION_KEY = 'mecha-chispa-modo-conversacion';
```

- [ ] **Step 3: Añade el estado de modo conversación y monta el wake word**

Busca esta línea ya existente (justo tras `const voz = useChispaVoz(chispaVozId);`, tal cual
aparece en el archivo):

```ts
  const voz = useChispaVoz(chispaVozId);
```

Reemplázala por:

```ts
  const voz = useChispaVoz(chispaVozId);
  // Modo conversacion (voz manos libres): tras cada respuesta, el microfono se
  // reabre solo (ver efectos mas abajo). Preferencia por navegador.
  const [modoConversacion, setModoConversacionState] = useState(false);
  useEffect(() => {
    try { setModoConversacionState(localStorage.getItem(MODO_CONVERSACION_KEY) === '1'); } catch { /* no critico */ }
  }, []);
  const setModoConversacion = (v: boolean) => {
    setModoConversacionState(v);
    try { localStorage.setItem(MODO_CONVERSACION_KEY, v ? '1' : '0'); } catch { /* no critico */ }
  };
  // Palabra de activacion "Hola Mecha": se monta solo por su EFECTO (escucha
  // en segundo plano) — el toggle que la activa/desactiva vive en TabVoz.web.tsx,
  // asi que aqui no hace falta leer su valor de retorno.
  useChispaWakeWord(!soloOnboarding && !IS_DEMO_MODE);
```

- [ ] **Step 4: Refactoriza `manejarClicMicro` para reutilizar el arranque y usar `finalizarEscucha`**

Busca este bloque completo ya existente:

```ts
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
```

Reemplázalo por:

```ts
  // Arranca un turno de escucha: se reutiliza tanto para el clic manual del
  // microfono como para el re-arme automatico del modo conversacion y para la
  // palabra de activacion (tras abrir el panel).
  function iniciarTurnoVoz() {
    if (voz.estado !== 'inactivo' || bloqueado) return;
    void voz.iniciarEscucha((textoReconocido: string) => {
      setTexto(textoReconocido);
      void enviarMensaje(textoReconocido);
    });
  }

  function manejarClicMicro() {
    if (voz.estado === 'escuchando') {
      // Tocar el microfono mientras escucha ya NO descarta lo oido: termina el
      // turno YA y envia lo acumulado (manos libres de verdad, sin esperar el
      // silencio completo si el usuario tiene prisa).
      voz.finalizarEscucha();
      return;
    }
    if (voz.estado === 'transcribiendo') return; // ya en curso, nada que hacer
    if (bloqueado) return;
    if (voz.estado === 'hablando') voz.detenerHabla();
    iniciarTurnoVoz();
  }
```

- [ ] **Step 5: Añade los efectos de re-arme automático (modo conversación) y de la palabra de activación**

Busca este bloque ya existente (justo después, están los efectos de "deshacer" S05):

```ts
  // S05: ventana temporal para deshacer (10s). Pasado ese tiempo, la opcion desaparece.
  useEffect(() => {
    if (!ultimaAccion) return;
    const timer = setTimeout(() => setUltimaAccion(null), 10000);
    return () => clearTimeout(timer);
  }, [ultimaAccion]);
```

Justo ANTES de ese bloque, inserta:

```ts
  // Modo conversacion (voz manos libres): tras terminar un turno completo
  // (Chispa acabo de hablar, o si el altavoz esta apagado, en cuanto se
  // renderizo su respuesta), se re-arma el microfono solo. Nunca se re-arma
  // mientras Chispa sigue hablando (evita que el microfono capte su propia
  // voz por los altavoces, aunque getUserMedia ya cancela eco por defecto).
  const prevEstadoVozRef = useRef(voz.estado);
  useEffect(() => {
    const prev = prevEstadoVozRef.current;
    prevEstadoVozRef.current = voz.estado;
    if (!modoConversacion || !abierto) return;
    if (prev === 'hablando' && voz.estado === 'inactivo') {
      setTimeout(() => iniciarTurnoVoz(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voz.estado, modoConversacion, abierto]);

  const prevCargandoRef = useRef(cargando);
  useEffect(() => {
    const prev = prevCargandoRef.current;
    prevCargandoRef.current = cargando;
    if (!modoConversacion || !abierto || voz.vozActiva) return;
    if (prev && !cargando) {
      setTimeout(() => iniciarTurnoVoz(), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, modoConversacion, abierto, voz.vozActiva]);

  // Palabra de activacion "Hola Mecha": al detectarla en cualquier pantalla,
  // se abre el panel y se empieza a escuchar (o se manda directamente el
  // comando si venia en la misma frase, "hola mecha, cuanto llevo hoy").
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (ev: Event) => {
      const detalle = (ev as CustomEvent<{ comando?: string | null }>).detail;
      setAbierto(true);
      if (detalle?.comando) {
        void enviarMensaje(detalle.comando);
      } else {
        setTimeout(() => iniciarTurnoVoz(), 400);
      }
    };
    window.addEventListener(CHISPA_WAKE_EVENT, handler);
    return () => window.removeEventListener(CHISPA_WAKE_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

```

- [ ] **Step 6: Verifica que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add components/chispa/ChispaPanel.web.tsx
git commit -m "feat(chispa-voz): modo conversacion + palabra de activacion (cableado funcional)"
```

---

### Task 6: `ChispaPanel.web.tsx` — animación reactiva del micro + transcripción en vivo + toggle "Conversación"

**Files:**
- Modify: `components/chispa/ChispaPanel.web.tsx`

**Interfaces:**
- Consumes: `voz.nivelAudio`, `voz.transcripcionParcial` (Task 3); `modoConversacion`,
  `setModoConversacion`, `iniciarTurnoVoz` (Task 5) — todos ya en este mismo archivo.

- [ ] **Step 1: Añade la animación base del micro a `PANEL_STYLES`**

Busca esta línea ya existente dentro de `PANEL_STYLES`:

```ts
  @keyframes chispaStatusPulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(15,157,107,0.14); } 50% { box-shadow: 0 0 0 3px rgba(15,157,107,0.28), 0 0 6px rgba(15,157,107,0.4); } }
  .chispa-status-dot { animation: chispaStatusPulse 2.4s ease-in-out infinite; }
```

Reemplázala por:

```ts
  @keyframes chispaStatusPulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(15,157,107,0.14); } 50% { box-shadow: 0 0 0 3px rgba(15,157,107,0.28), 0 0 6px rgba(15,157,107,0.4); } }
  .chispa-status-dot { animation: chispaStatusPulse 2.4s ease-in-out infinite; }
  @keyframes chispaMicPulso { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
  .chispa-mic-pulso { animation: chispaMicPulso 1.4s ease-in-out infinite; }
```

Busca esta línea ya existente (lista de animaciones desactivadas por accesibilidad):

```ts
  @media (prefers-reduced-motion: reduce) {
    .chispa-msg, .chispa-drawer, .chispa-backdrop, .chispa-launch-tab, .chispa-typewriter-word, .chispa-status-dot { animation: none !important; }
  }
```

Reemplázala por:

```ts
  @media (prefers-reduced-motion: reduce) {
    .chispa-msg, .chispa-drawer, .chispa-backdrop, .chispa-launch-tab, .chispa-typewriter-word, .chispa-status-dot, .chispa-mic-pulso { animation: none !important; }
  }
```

- [ ] **Step 2: Añade el icono de "Conversación" junto a los demás iconos**

Busca esta función ya existente (icono de cerrar, al principio del archivo):

```ts
function IconoCerrar({ size = 15, color = T.textSecondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
```

Justo tras el cierre de esa función (busca el `}` que la cierra y el siguiente salto de línea),
añade esta función nueva:

```ts
function IconoConversacion({ size = 15, color = T.textSecondary, activo = false }: { size?: number; color?: string; activo?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17 2l4 4-4 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 6H8a5 5 0 0 0-5 5v1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22l-4-4 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 18h13a5 5 0 0 0 5-5v-1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {activo && <circle cx="12" cy="12" r="1.5" fill={color} />}
    </svg>
  );
}
```

- [ ] **Step 3: Añade el botón "Conversación" en la cabecera, junto al de altavoz**

Busca este bloque ya existente en la cabecera del drawer:

```tsx
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
```

Justo después de ese `</button>` de cierre, añade:

```tsx
              <button
                onClick={() => setModoConversacion(!modoConversacion)}
                aria-label={modoConversacion ? 'Desactivar conversacion por voz' : 'Activar conversacion por voz (el microfono se reabre solo tras cada respuesta)'}
                aria-pressed={modoConversacion}
                title={modoConversacion ? 'Conversacion por voz activa: el microfono se reabre solo' : 'Activar conversacion por voz'}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: `1px solid ${modoConversacion ? T.primary : T.border}`,
                  background: modoConversacion ? T.primarySoft : T.bgCard,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                <IconoConversacion size={15} color={modoConversacion ? T.primaryHi : T.textSecondary} activo={modoConversacion} />
              </button>
```

- [ ] **Step 4: Anima el botón del micro con el nivel de audio real**

Busca este bloque ya existente (botón del micro en el input):

```tsx
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
```

Reemplázalo por:

```tsx
                <button
                  onClick={manejarClicMicro}
                  disabled={bloqueado && voz.estado === 'inactivo'}
                  aria-label={voz.estado === 'escuchando' ? 'Terminar y enviar' : voz.estado === 'transcribiendo' ? 'Transcribiendo' : 'Hablar a Chispa'}
                  aria-pressed={voz.estado === 'escuchando'}
                  className={voz.estado === 'escuchando' ? 'chispa-mic-pulso' : undefined}
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    border: `1.5px solid ${voz.estado === 'escuchando' ? T.danger : T.border}`,
                    background: voz.estado === 'escuchando' ? T.dangerSoft : T.bgPanel,
                    cursor: bloqueado && voz.estado === 'inactivo' ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: voz.estado === 'transcribiendo' ? 0.6 : 1,
                    boxShadow: voz.estado === 'escuchando'
                      ? `0 0 0 ${2 + Math.round(voz.nivelAudio * 8)}px rgba(226,59,52,${(0.12 + voz.nivelAudio * 0.25).toFixed(2)})`
                      : 'none',
                    transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.08s linear',
                  }}>
                  <IconoMicro size={16} color={voz.estado === 'escuchando' ? T.danger : T.textSecondary} />
                </button>
```

- [ ] **Step 5: Muestra la transcripción en vivo bajo el input**

Busca este bloque ya existente (línea de estado bajo el input):

```tsx
                  <span style={{ fontSize: 11.5, color: voz.errorVoz ? T.warning : T.textTertiary, lineHeight: 1.4 }}>
                    {voz.errorVoz ?? (voz.estado === 'escuchando' ? 'Escuchando... habla ahora' : voz.estado === 'transcribiendo' ? 'Transcribiendo tu voz...' : voz.estado === 'hablando' ? 'Chispa está hablando...' : '')}
                  </span>
```

Reemplázalo por:

```tsx
                  <span style={{ fontSize: 11.5, color: voz.errorVoz ? T.warning : T.textTertiary, lineHeight: 1.4, fontStyle: voz.transcripcionParcial ? 'italic' : 'normal' }}>
                    {voz.errorVoz ?? (
                      voz.estado === 'escuchando'
                        ? (voz.transcripcionParcial ? `"${voz.transcripcionParcial}"` : 'Escuchando... habla ahora')
                        : voz.estado === 'transcribiendo' ? 'Transcribiendo tu voz...'
                        : voz.estado === 'hablando' ? 'Chispa está hablando...'
                        : ''
                    )}
                  </span>
```

- [ ] **Step 6: Verifica en el preview (estados visuales, sin micro real)**

1. Arranca el servidor: usa `preview_start` con el nombre configurado en `.claude/launch.json`
   (si no existe, créalo con `runtimeExecutable: "node"`, `runtimeArgs: ["scripts/serve-web.mjs"]`,
   `port: 8080`, tras `npm run build:web`).
2. Abre `preview_screenshot`/`preview_snapshot` sobre `/demo.html?share=1` (iframe `?demo=1`), pulsa
   la pestaña Chispa y comprueba: el botón "Conversación" (icono de bucle) aparece junto al de
   altavoz; el botón del micro sigue siendo clicable (el acceso real al micro se denegará en este
   entorno — es esperado, revisa que el mensaje de error sea el de "no se pudo acceder al
   micrófono", no un crash de JS). `preview_console_logs` sin errores nuevos.

- [ ] **Step 7: Verifica que compila y construye**

Run: `npx tsc --noEmit && npm run build:web`
Expected: ambos limpios, sin `any` nuevo.

- [ ] **Step 8: Commit**

```bash
git add components/chispa/ChispaPanel.web.tsx
git commit -m "feat(chispa-voz): microfono audio-reactivo + transcripcion en vivo + toggle conversacion"
```

---

### Task 7: `TabVoz.web.tsx` — toggle "Hola Mecha" con aviso de privacidad

**Files:**
- Modify: `components/config/TabVoz.web.tsx`

**Interfaces:**
- Consumes: `soportaVozNavegador()` (Task 3), `WAKEWORD_ACTIVO_KEY` (Task 4),
  `CHISPA_WAKEWORD_TOGGLE_EVENT` (Task 2).

- [ ] **Step 1: Añade los imports nuevos**

Busca esta línea ya existente (imports del archivo):

```tsx
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '@/lib/supabase';
```

Reemplázala por:

```tsx
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '@/lib/supabase';
import { soportaVozNavegador } from '@/lib/hooks/useChispaVoz.web';
import { WAKEWORD_ACTIVO_KEY } from '@/lib/hooks/useChispaWakeWord.web';
import { CHISPA_WAKEWORD_TOGGLE_EVENT } from '@/lib/chispaBloques';
```

- [ ] **Step 2: Añade el estado local del toggle (leído de localStorage al montar)**

Busca esta línea ya existente (dentro de `export function TabVoz`):

```tsx
  const [errorVoz, setErrorVoz] = useState<string | null>(null);
```

Reemplázala por:

```tsx
  const [errorVoz, setErrorVoz] = useState<string | null>(null);
  const [wakeWordActivo, setWakeWordActivo] = useState(false);
  const soportaWakeWord = useRef(soportaVozNavegador()).current;

  useEffect(() => {
    try { setWakeWordActivo(localStorage.getItem(WAKEWORD_ACTIVO_KEY) === '1'); } catch { /* no critico */ }
  }, []);

  // Este toggle NO monta el hook de escucha (ese vive en ChispaPanel, siempre
  // montado globalmente): solo persiste la preferencia y avisa a la instancia
  // REAL via evento, para que el cambio surta efecto sin recargar la pagina.
  const cambiarWakeWord = (v: boolean) => {
    setWakeWordActivo(v);
    try { localStorage.setItem(WAKEWORD_ACTIVO_KEY, v ? '1' : '0'); } catch { /* no critico */ }
    window.dispatchEvent(new CustomEvent(CHISPA_WAKEWORD_TOGGLE_EVENT, { detail: { activo: v } }));
  };
```

- [ ] **Step 3: Añade la sección "Activar con la voz" antes del cierre del componente**

Busca este bloque ya existente (cierre del componente, al final del archivo):

```tsx
      <Section title="Voces disponibles">
        <div style={{ display: 'grid', gap: 12 }}>
          {VOCES.map(voz => {
```

... (deja intacto todo ese `Section` de voces) ... y busca el cierre exacto de ese `Section` y del
`div` raíz, que en el archivo actual es:

```tsx
      </Section>
    </div>
  );
}
```

Reemplázalo por:

```tsx
      </Section>

      <Section title="Activar con la voz">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '4px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              "Hola Mecha"
            </div>
            <div style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 1.5 }}>
              {soportaWakeWord
                ? 'Al activarla, este dispositivo escucha de forma continua para detectar "Hola Mecha". El audio lo procesa el reconocimiento de voz del navegador; Mecha no lo recibe ni lo guarda hasta que se detecta la frase y empieza una conversación normal.'
                : 'No disponible en este navegador (necesitas Chrome o Edge).'}
            </div>
          </div>
          <Toggle
            on={wakeWordActivo}
            onChange={cambiarWakeWord}
            disabled={!soportaWakeWord}
            label=""
          />
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: Importa `Toggle` de `SettingsAtoms`**

Busca esta línea ya existente:

```tsx
import { Section, FieldRow } from '@/components/ui/SettingsAtoms';
```

Reemplázala por:

```tsx
import { Section, FieldRow, Toggle } from '@/components/ui/SettingsAtoms';
```

- [ ] **Step 5: Verifica en el preview**

1. Con el servidor de preview corriendo, abre Configuración > Voz (navega directamente o via
   `preview_eval` con `window.location.href`) en una sesión de staff real (no en la demo pública:
   el toggle no depende de `IS_DEMO_MODE` en este archivo, pero confírmalo con `preview_snapshot`).
2. Confirma con `preview_snapshot` que aparece la sección "Activar con la voz" con su copy y el
   interruptor, y que el interruptor cambia de estado al pulsarlo (`preview_click` sobre su
   selector) y que un `preview_eval` de `localStorage.getItem('mecha-chispa-wakeword-activo')`
   refleja el nuevo valor.

- [ ] **Step 6: Verifica que compila y construye**

Run: `npx tsc --noEmit && npm run build:web`
Expected: ambos limpios.

- [ ] **Step 7: Commit**

```bash
git add components/config/TabVoz.web.tsx
git commit -m "feat(chispa-voz): toggle Hola Mecha en Configuracion > Voz con aviso de privacidad"
```

---

### Task 8: Documentación (auto-conocimiento de Chispa)

**Files:**
- Modify: `lib/iaCatalogo.ts`
- Modify: `lib/manuals/chispa.ts`

- [ ] **Step 1: Actualiza la entrada de voz en `lib/iaCatalogo.ts`**

Busca la entrada `id: 'chispa-vo-z'` (ya existente, actualizada en la sesión anterior) y añade, al
final de su `descripcion`, la mención del modo conversación y la palabra de activación. Sustituye
el campo `descripcion` completo de esa entrada por:

```ts
    descripcion: 'Chispa lee sus respuestas en voz alta con voz neural natural (motor Kokoro), y SÍ se puede cambiar: en Configuración > Voz eliges entre varias voces de distintos tonos y géneros, con un botón "Escuchar" para probar cada una antes de fijarla. Además: "Conversación" (botón junto al altavoz) hace que el micrófono se reabra solo tras cada respuesta, para hablar con Chispa sin tocar nada entre turnos; y "Hola Mecha" (Configuración > Voz, apagado por defecto) abre el panel con solo decir la frase, desde cualquier pantalla. Si la voz neural no está disponible, cae a la voz básica del navegador con aviso honesto.',
```

- [ ] **Step 2: Añade una entrada nueva al manual de Chispa**

En `lib/manuals/chispa.ts`, busca este bloque ya existente:

```ts
    {
      titulo: 'Biblioteca de Prompts Prefabricados',
```

Justo ANTES de ese bloque, inserta:

```ts
    {
      titulo: 'Conversación por voz y "Hola Mecha"',
      texto: 'Junto al botón de altavoz hay un botón de "Conversación": actívalo y, tras cada respuesta de Chispa, el micrófono se reabre solo para que sigas hablando sin tocar nada, como una llamada normal. Además, en Configuración > Voz puedes activar "Hola Mecha" (apagado por defecto): con el micrófono escuchando de fondo, decir "Hola Mecha" desde cualquier pantalla abre el panel al instante. El audio lo procesa el navegador; Mecha no lo recibe hasta que se detecta la frase.',
    },
    {
      titulo: 'Biblioteca de Prompts Prefabricados',
```

- [ ] **Step 3: Verifica que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/iaCatalogo.ts lib/manuals/chispa.ts
git commit -m "docs(chispa-voz): documenta conversacion por voz y Hola Mecha en auto-conocimiento"
```

---

### Task 9: Verificación final y publicación

**Files:** ninguno nuevo (solo verificación + push).

- [ ] **Step 1: Typecheck y build completos**

Run: `npx tsc --noEmit && npm run build:web`
Expected: ambos limpios, cero `any` nuevo, cero errores.

- [ ] **Step 2: Tests puros**

Run: `deno test lib/chispaWakeWordUtils.test.ts`
Expected: `ok | 9 passed | 0 failed`

- [ ] **Step 3: Verificación visual final en preview**

1. `preview_start` (si no está corriendo) + `preview_screenshot` del panel de Chispa abierto en
   `/demo.html?share=1` (iframe `?demo=1`): confirma que el botón "Conversación" y el micro con su
   nuevo estilo aparecen sin romper el layout (`preview_inspect` sobre el botón del micro para
   confirmar `border-radius`/`box-shadow` coherentes con los tokens).
2. `preview_console_logs` con `level: 'error'`: cero errores nuevos.
3. Deja constancia explícita (no lo declares probado si no lo hiciste): el micrófono real —
   detección de voz, temporizador de 4.5s, "Hola Mecha" oyendo de verdad — **no se puede verificar
   en este entorno de preview automatizado** (sin hardware de audio, `getUserMedia` deniega aquí).
   Esa prueba definitiva la hace Carlos con su micrófono real, en su propio navegador.

- [ ] **Step 4: Commit final de cierre (si queda algo suelto) y push a master**

```bash
git status --short
git pull --rebase origin master
git push origin master
```

Expected: push aceptado. Producción (Vercel) despliega desde `master`; al no haber cambios de
edge/BD, no hace falta ningún paso de despliegue adicional.

- [ ] **Step 5: Actualiza el spec con el resultado**

Añade al final de `docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md` una línea
tipo:

```markdown

## Estado

Implementado 2026-07-11 (commits: ver `git log --oneline` de esta tanda). Verificado: tsc + build +
tests puros + UI en preview (toggles, animación, gating). Pendiente de verificación con micrófono
real (Carlos, navegador real) antes de considerar el modo conversación / Hola Mecha completamente
probado en producción.
```

Luego:

```bash
git add docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md
git commit -m "docs: marca estado de la sesion de voz manos libres"
git push origin master
```

---

## Notas para quien ejecute (o revise) este plan

- El microfono real (deteccion de voz, temporizador de silencio, "Hola Mecha" oyendo) **no se
  puede probar en el entorno de preview automatizado**: sin hardware de audio, `getUserMedia`
  deniega ahi. Verifica con tsc/build/tests + inspeccion de UI (toggles, animacion, gating por
  navegador), y deja explicito en tu resumen que la prueba con microfono real queda para el
  usuario en su propio navegador.
- Si `ChispaPanel.web.tsx` ha cambiado de forma incompatible con los anchors de este plan (multi-
  sesion, ver memoria `multi-sesion-reconciliacion-git`), relee el archivo actual antes de aplicar
  los Steps de las Tareas 5-6 y adapta el `old_string` al contenido real (la logica/diseno no
  cambia, solo la ubicacion exacta del texto a reemplazar).
