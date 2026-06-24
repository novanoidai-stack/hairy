import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Aviso "sin conexion" — Fase A (online-resiliente) de DISENO_POS_COMPLETO_MECHA.md §6.
// Solo informa: hoy no hay cache de datos ni cola de cobros offline, asi que sin red
// la app deja de poder leer/escribir contra Supabase (no promete "funciona offline").
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (Platform.OS !== 'web' || online) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: T.warning, color: '#1c1814', fontSize: 12.5, fontWeight: 700,
        textAlign: 'center', padding: '7px 12px',
      }}
    >
      Sin conexión — no se pueden guardar cambios hasta que vuelvas a tener red.
    </div>
  );
}
