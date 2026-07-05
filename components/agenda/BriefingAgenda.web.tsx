import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import { roleOf } from '@/lib/permissions';
import {
  cargarSenalesOperativas,
  cargarClientesRecuperar,
  senalesSetup,
  rankearSenales,
  type BriefingSignal,
  type SeveridadSenal,
} from '@/lib/briefing';

// Briefing proactivo (Fase 3) dentro del panel del asistente. Muestra, al abrir,
// lo que requiere atencion. Determinista: la deteccion viene del RPC agenda_briefing
// + clientes_en_riesgo_fuga + useOnboardingStatus (ver lib/briefing.ts).

const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
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
  const [cargando, setCargando] = useState(true);

  const scope: 'all' | 'self' = roleOf(profile) === 'profesional' ? 'self' : 'all';

  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargando(true);
      const [o, r] = await Promise.all([cargarSenalesOperativas(scope), cargarClientesRecuperar(scope)]);
      if (!cancel) { setOps(o); setRecuperar(r); setCargando(false); }
    })();
    return () => { cancel = true; };
  }, [scope, negocioId]);

  function irA(s: BriefingSignal) {
    const p = s.accion?.payload as { pathname?: string; params?: Record<string, string>; destino?: string } | undefined;
    if (!p) return;
    if (p.pathname) router.push({ pathname: p.pathname as never, params: p.params });
    else if (p.destino === 'bandeja') router.push('/(tabs)/bandeja' as never);
    else if (p.destino === 'clientes') router.push('/(tabs)/clientes' as never);
    else return;
    onClose();
  }

  if (cargando || !status.ready) return null;

  const senales = rankearSenales(senalesSetup(status), ops, recuperar, status.coreDone);
  if (senales.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: T.textTertiary, textTransform: 'uppercase' }}>
        Esto es lo que veo hoy
      </div>
      {senales.map((s) => {
        const navegable = s.accion?.tipo === 'ir_a';
        return (
          <div
            key={s.tipo}
            style={{
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderLeft: `3px solid ${COLOR_SEV[s.severidad]}`,
              borderRadius: 12,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>
              {s.titulo}
              {s.count > 1 ? ` · ${s.count}` : ''}
            </div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2, lineHeight: 1.4 }}>{s.detalle}</div>
            {navegable && s.accion ? (
              <button
                onClick={() => irA(s)}
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  borderRadius: 9,
                  border: 'none',
                  background: FIRE,
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {s.accion.label}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
