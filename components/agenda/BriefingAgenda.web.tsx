import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import { roleOf } from '@/lib/permissions';
import {
  cargarSenalesOperativas,
  cargarClientesRecuperar,
  cargarNoShowInminente,
  senalesSetup,
  rankearSenales,
  type BriefingSignal,
  type SeveridadSenal,
} from '@/lib/briefing';

// Briefing proactivo (Fase 3) dentro del panel del asistente. Muestra, al abrir,
// lo que requiere atencion. Determinista: la deteccion viene del RPC agenda_briefing
// + clientes_en_riesgo_fuga + useOnboardingStatus (ver lib/briefing.ts).

// Hex exactos del sistema de diseno (danger / warning / textTertiary).
const COLOR_SEV: Record<SeveridadSenal, string> = { alta: '#e23b34', media: '#e08a00', baja: '#736658' };

export interface BriefingAgendaProps {
  negocioId: string;
  profile: { id: string; role?: string | null };
  onClose: () => void;
}

export default function BriefingAgenda({ negocioId, profile, onClose }: BriefingAgendaProps) {
  const router = useRouter();
  const status = useOnboardingStatus(negocioId, true);
  const [ops, setOps] = useState<BriefingSignal[]>([]);
  const [recuperar, setRecuperar] = useState<BriefingSignal | null>(null);
  const [noShow, setNoShow] = useState<BriefingSignal | null>(null);
  const [cargando, setCargando] = useState(true);

  const scope: 'all' | 'self' = roleOf(profile) === 'profesional' ? 'self' : 'all';

  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargando(true);
      const [o, r, ns] = await Promise.all([
        cargarSenalesOperativas(scope),
        cargarClientesRecuperar(scope),
        cargarNoShowInminente(scope),
      ]);
      if (!cancel) { setOps(o); setRecuperar(r); setNoShow(ns); setCargando(false); }
    })();
    return () => { cancel = true; };
  }, [scope, negocioId]);

  function irA(s: BriefingSignal) {
    const p = s.accion?.payload as { pathname?: string; params?: Record<string, string>; destino?: string } | undefined;
    if (!p) return;
    if (p.pathname) router.push({ pathname: p.pathname as never, params: p.params });
    else if (p.destino === 'bandeja') router.push('/(tabs)/bandeja' as never);
    else if (p.destino === 'clientes') router.push('/(tabs)/clientes' as never);
    else if (p.destino === 'agenda') router.push('/(tabs)' as never);
    else return;
    onClose();
  }

  if (cargando || !status.ready) return null;

  // El no-show inminente es una senal operativa mas: se suma a las del RPC para
  // que rankearSenales la ordene por severidad junto al resto.
  const operativas = noShow ? [...ops, noShow] : ops;
  const senales = rankearSenales(senalesSetup(status), operativas, recuperar, status.coreDone);
  if (senales.length === 0) {
    return (
      <div className="animate-pop-in glass-panel" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '16px 20px', borderRadius: 16 }}>
        <div style={{ fontSize: 24 }}>✨</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: -0.2 }}>Todo al día</div>
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 2 }}>Tu agenda está despejada y sin alertas.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pop-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: T.textTertiary, textTransform: 'uppercase', paddingLeft: 4 }}>
        Esto es lo que veo hoy
      </div>
      {senales.map((s) => {
        const navegable = s.accion?.tipo === 'ir_a';
        return (
          <div
            key={s.tipo}
            className="glass-panel"
            style={{
              borderLeft: `4px solid ${COLOR_SEV[s.severidad]}`,
              borderRadius: 16,
              padding: '14px 16px',
              boxShadow: '0 4px 12px rgba(40,30,24,0.05)',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
              {s.titulo}
            </div>
            <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 4, lineHeight: 1.45 }}>{s.detalle}</div>
            {navegable && s.accion ? (
              <button
                className="btn-interactive"
                onClick={() => irA(s)}
                style={{
                  marginTop: 12,
                  padding: '8px 16px',
                  borderRadius: 24,
                  border: 'none',
                  background: T.bgCardHi,
                  color: T.text,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                {(s.accion.payload as any)?.label || 'Ver detalle'}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
