// Banner de consentimiento GDPR para Analytics
// Aparece al entrar al portal y requiere aceptacion explicita

import { useEffect, useState } from 'react';

const PRIVACY_URL = '/privacidad.html';

interface ConsentBannerProps {
  onAccept: () => void;
  onReject: () => void;
}

export function ConsentBanner({ onAccept, onReject }: ConsentBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Comprobar si ya hay consentimiento guardado
    try {
      const saved = localStorage.getItem('mecha-analytics-consent');
      if (saved === null) {
        // Mostrar banner si no hay decisión previa
        setVisible(true);
      }
    } catch {
      // Si falla localStorage, mostramos el banner
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(16, 23, 41, 0.95)',
      backdropFilter: 'blur(12px)',
      padding: '16px 24px',
      borderTop: '1px solid rgba(244, 80, 30, 0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      zIndex: 9999,
      boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          color: '#f6f8ff',
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          Usamos cookies para mejorar tu experiencia y entender el uso del portal.
          {' '}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#ff7a2e',
              textDecoration: 'underline',
            }}
          >
            Mas información
          </a>
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => {
            onReject();
            setVisible(false);
            try { localStorage.setItem('mecha-analytics-consent', 'false'); } catch {}
          }}
          style={{
            padding: '10px 18px',
            background: 'transparent',
            border: '1px solid rgba(244, 80, 30, 0.4)',
            borderRadius: 8,
            color: '#f6f8ff',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 0.16s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(244, 80, 30, 0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Rechazar
        </button>
        <button
          onClick={() => {
            onAccept();
            setVisible(false);
            try { localStorage.setItem('mecha-analytics-consent', 'true'); } catch {}
          }}
          style={{
            padding: '10px 18px',
            background: 'linear-gradient(135deg, #e0340e 0%, #ff7a2e 55%, #ffcf4a 100%)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'filter 0.16s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.filter = 'brightness(1.05)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.filter = 'none';
          }}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
