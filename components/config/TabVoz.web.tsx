import { useState, useRef, useEffect } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { Section, Toggle } from '@/components/ui/SettingsAtoms';
import { soportaVozNavegador } from '@/lib/hooks/useChispaVoz.web';
import { WAKEWORD_ACTIVO_KEY } from '@/lib/hooks/useChispaWakeWord.web';
import { CHISPA_WAKEWORD_TOGGLE_EVENT } from '@/lib/chispaBloques';

interface Props {
  config: any;
  setC: (key: any, value: any) => void;
}

// Rework KISS (2026-07): Chispa ya NO habla (se retiro el TTS). Esta pantalla
// deja solo lo que sigue vivo: el DICTADO por voz (entrada) y su palabra de
// activacion "Hola Mecha". Se retiro el selector de voces y la previsualizacion.
export function TabVoz({ config: _config, setC: _setC }: Props) {
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

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 8px 0' }}>Voz de Chispa</h2>
        <p style={{ fontSize: 14, color: T.textSecondary, margin: 0, lineHeight: 1.5 }}>
          Puedes dictarle a Chispa por voz desde el botón del micrófono. Chispa te responde por escrito.
        </p>
      </div>

      <Section title="Activar con la voz">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '4px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              "Hola Mecha" o "Hola Chispa"
            </div>
            <div style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 1.5 }}>
              {soportaWakeWord
                ? 'Al activarla, este dispositivo escucha de forma continua para detectar "Hola Mecha" o "Hola Chispa". El audio lo procesa el reconocimiento de voz del navegador; Mecha no lo recibe ni lo guarda hasta que se detecta la frase y empieza una conversación normal.'
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
