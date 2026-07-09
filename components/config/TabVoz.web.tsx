import { useState, useCallback, useRef } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { Section, FieldRow } from '@/components/ui/SettingsAtoms';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '@/lib/supabase';

interface Props {
  config: any;
  setC: (key: any, value: any) => void;
}

const VOCES = [
  { id: 'ef_dora', nombre: 'Dora', descripcion: 'Femenina, natural y cercana', genero: 'Mujer' },
  { id: 'ef_rufo', nombre: 'Rufo', descripcion: 'Femenina, enérgica y clara', genero: 'Mujer' },
  { id: 'em_alex', nombre: 'Alex', descripcion: 'Masculina, profesional y cálida', genero: 'Hombre' },
  { id: 'am_adam', nombre: 'Adam', descripcion: 'Masculina, grave y pausada', genero: 'Hombre' },
  { id: 'af_bella', nombre: 'Bella', descripcion: 'Femenina, dulce y expresiva', genero: 'Mujer' },
];

export function TabVoz({ config, setC }: Props) {
  const [reproduciendo, setReproduciendo] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);

  const reproducirDemo = useCallback(async (vozId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    if (reproduciendo === vozId) {
      setReproduciendo(null);
      return;
    }

    setReproduciendo(vozId);
    setErrorVoz(null);

    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error('Sin sesion');

      const texto = `Hola, soy ${VOCES.find(v => v.id === vozId)?.nombre}. Me encantaría ayudarte a gestionar tu salón.`;
      
      const r = await fetch(`${SUPABASE_URL}/functions/v1/chispa-tts`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`, 
          apikey: SUPABASE_ANON_KEY, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ texto, voice_id: vozId }),
      });

      if (!r.ok) {
        throw new Error('Fallo al generar audio de prueba');
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => setReproduciendo(null);
      audio.onerror = () => setReproduciendo(null);
      
      await audio.play();
    } catch (e: any) {
      setErrorVoz('No se pudo reproducir la demo en este momento.');
      setReproduciendo(null);
    }
  }, [reproduciendo]);

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
