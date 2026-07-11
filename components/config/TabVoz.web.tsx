import { useState, useCallback, useRef, useEffect } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { Section, FieldRow } from '@/components/ui/SettingsAtoms';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '@/lib/supabase';

interface Props {
  config: any;
  setC: (key: any, value: any) => void;
}

// Voces REALES en español del VPS de Kokoro (verificado contra /v1/audio/voices:
// solo existen ef_dora, em_alex y em_santa en español). Las antiguas ef_rufo /
// am_adam / af_bella se retiraron: ef_rufo no existia (sonaba una voz de repuesto)
// y am_adam/af_bella son voces en INGLES que leian el espanol con acento.
const VOCES = [
  { id: 'ef_dora', nombre: 'Dora', descripcion: 'Femenina, natural y cercana', genero: 'Mujer' },
  { id: 'em_alex', nombre: 'Alex', descripcion: 'Masculina, profesional y cálida', genero: 'Hombre' },
  { id: 'em_santa', nombre: 'Santi', descripcion: 'Masculina, grave y pausada', genero: 'Hombre' },
];

export function TabVoz({ config, setC }: Props) {
  const [reproduciendo, setReproduciendo] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);

  // Al entrar en la pantalla de voz, pre-calentar Kokoro en segundo plano para
  // que el primer "Escuchar" no pague el cold start del VPS (~15-20s la 1a vez).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data: sesion } = await supabase.auth.getSession();
        const token = sesion.session?.access_token;
        if (!token || cancelado) return;
        await fetch(`${SUPABASE_URL}/functions/v1/chispa-tts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ warm: true }),
        });
      } catch { /* best-effort */ }
    })();
    return () => { cancelado = true; };
  }, []);

  // Fallback: previsualiza con la voz del navegador (speechSynthesis) cuando el
  // TTS natural (Kokoro/ElevenLabs) aun no esta activo. Asi el boton "Escuchar"
  // SIEMPRE hace algo, en vez de quedarse muerto con un error.
  const previewNavegador = useCallback((texto: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-ES';
      u.onend = () => setReproduciendo(null);
      u.onerror = () => setReproduciendo(null);
      window.speechSynthesis.speak(u);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reproducirDemo = useCallback(async (vozId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();

    if (reproduciendo === vozId) {
      setReproduciendo(null);
      return;
    }

    setReproduciendo(vozId);
    setErrorVoz(null);

    const texto = `Hola, soy ${VOCES.find(v => v.id === vozId)?.nombre}. Me encantaría ayudarte a gestionar tu salón.`;

    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error('Sin sesion');

      const r = await fetch(`${SUPABASE_URL}/functions/v1/chispa-tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ texto, voice_id: vozId }),
      });

      // 501 = el TTS natural aun no esta configurado por el equipo. No es un
      // fallo del usuario: previsualizamos con la voz del navegador y avisamos.
      if (r.status === 501) {
        const ok = previewNavegador(texto);
        setErrorVoz('La voz natural de Chispa todavía no está activada en tu salón (la activa el equipo de Mecha). Mientras tanto te la mostramos con la voz del navegador.');
        if (!ok) setReproduciendo(null);
        return;
      }
      if (!r.ok) throw new Error('Fallo al generar audio de prueba');

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setReproduciendo(null);
      audio.onerror = () => setReproduciendo(null);
      await audio.play();
    } catch (e: any) {
      // Ultimo recurso: intentar la voz del navegador antes de rendirse.
      const ok = previewNavegador(texto);
      if (!ok) {
        setErrorVoz('No se pudo reproducir la demo en este momento.');
        setReproduciendo(null);
      }
    }
  }, [reproduciendo, previewNavegador]);

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 8px 0' }}>Voz de Chispa</h2>
        <p style={{ fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.5 }}>
          Elige la voz con la que Chispa se comunicará por los altavoces. Esta configuración se aplicará a todos los dispositivos del salón que tengan el sonido activado.
        </p>
      </div>

      {errorVoz && (
        <div style={{ padding: '12px 16px', background: 'rgba(244,80,30,0.1)', color: T.primary, borderRadius: 8, fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          {errorVoz}
        </div>
      )}

      <Section title="Voces disponibles">
        <div style={{ display: 'grid', gap: 12 }}>
          {VOCES.map(voz => {
            const isSelected = config.chispaVozId === voz.id || (!config.chispaVozId && voz.id === 'ef_dora');
            const isPlaying = reproduciendo === voz.id;
            
            return (
              <div 
                key={voz.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  border: `1px solid ${isSelected ? T.primary : T.border}`,
                  borderRadius: 12,
                  background: isSelected ? `${T.primary}08` : T.bgCard,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => setC('chispaVozId', voz.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 24, height: 24, borderRadius: '50%', border: `2px solid ${isSelected ? T.primary : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {isSelected && <div style={{ width: 12, height: 12, borderRadius: '50%', background: T.primary }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {voz.nombre}
                      <span style={{ fontSize: 11, background: T.bg, padding: '2px 8px', borderRadius: 99, color: T.textTertiary, fontWeight: 600 }}>
                        {voz.genero}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: T.textSecondary }}>{voz.descripcion}</div>
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); reproducirDemo(voz.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px',
                    borderRadius: 99,
                    border: 'none',
                    background: isPlaying ? T.primary : T.border,
                    color: isPlaying ? '#fff' : T.text,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={isPlaying ? "#fff" : "currentColor"}>
                    {isPlaying ? (
                      <rect x="6" y="4" width="4" height="16" />
                    ) : (
                      <polygon points="5 3 19 12 5 21 5 3" />
                    )}
                    {isPlaying && <rect x="14" y="4" width="4" height="16" />}
                  </svg>
                  {isPlaying ? 'Parar' : 'Escuchar'}
                </button>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
