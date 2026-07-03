import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile, type UserProfile } from '@/lib/auth';
import { CURRENT_PRIVACY_POLICY_VERSION } from '@/lib/legal';

// Consentimiento de politica de privacidad del STAFF que usa el software (no
// confundir con el consentimiento de datos del cliente final al reservar cita,
// que vive aparte en consentimientos_cliente). La cuenta demo compartida queda
// siempre exenta: nadie "acepta" nada por una cuenta que no es suya.

type GateReason = string | null;

interface PrivacyConsentValue {
  loading: boolean;
  accepted: boolean;
  isDemo: boolean;
  modalOpen: boolean;
  gateReason: GateReason;
  openGate: (reason?: GateReason) => void;
  closeGate: () => void;
  accept: () => Promise<void>;
}

const PrivacyConsentContext = createContext<PrivacyConsentValue | null>(null);

const SESSION_SEEN_KEY = 'mecha-privacy-prompt-seen';

function isVersionCurrent(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return !!profile.privacy_accepted_at && profile.privacy_policy_version === CURRENT_PRIVACY_POLICY_VERSION;
}

export function PrivacyConsentProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [gateReason, setGateReason] = useState<GateReason>(null);

  useEffect(() => {
    if (IS_DEMO_MODE) { setLoading(false); return; }
    let cancel = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancel) setLoading(false); return; }
      if (!cancel) setHasSession(true);
      const p = await getUserProfile();
      if (cancel) return;
      setProfile(p);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  // accepted=true cubre: demo, rutas publicas sin sesion (nada que aceptar), la
  // version actual ya aceptada, y el caso "hay sesion pero el perfil no se pudo
  // leer" (fallo puntual de red/RLS) - ahi no bloqueamos, igual que ya hace el
  // guard de auth de app/_layout.tsx para no expulsar a alguien por un error.
  const accepted = IS_DEMO_MODE || !hasSession || isVersionCurrent(profile) || (!loading && profile === null);

  // Aviso de bienvenida automatico, una vez por pestana/sesion de navegador
  // (no en cada clic): si ya lo cerraron con "Ahora no", no se vuelve a forzar
  // solo; reaparece igual si intentan entrar a una seccion con datos de clientes.
  useEffect(() => {
    if (loading || accepted || IS_DEMO_MODE || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let already = false;
    try { already = window.sessionStorage.getItem(SESSION_SEEN_KEY) === '1'; } catch {}
    if (!already) {
      setModalOpen(true);
      try { window.sessionStorage.setItem(SESSION_SEEN_KEY, '1'); } catch {}
    }
  }, [loading, accepted]);

  const openGate = useCallback((reason: GateReason = null) => {
    setGateReason(reason);
    setModalOpen(true);
  }, []);

  const closeGate = useCallback(() => {
    setModalOpen(false);
    setGateReason(null);
  }, []);

  const accept = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({ privacy_accepted_at: now, privacy_policy_version: CURRENT_PRIVACY_POLICY_VERSION })
      .eq('id', user.id);
    if (error) throw error;
    setProfile((prev) => prev ? { ...prev, privacy_accepted_at: now, privacy_policy_version: CURRENT_PRIVACY_POLICY_VERSION } : prev);
    setModalOpen(false);
    setGateReason(null);
  }, []);

  return (
    <PrivacyConsentContext.Provider value={{ loading, accepted, isDemo: IS_DEMO_MODE, modalOpen, gateReason, openGate, closeGate, accept }}>
      {children}
    </PrivacyConsentContext.Provider>
  );
}

export function usePrivacyConsent(): PrivacyConsentValue {
  const ctx = useContext(PrivacyConsentContext);
  if (!ctx) throw new Error('usePrivacyConsent debe usarse dentro de PrivacyConsentProvider');
  return ctx;
}
