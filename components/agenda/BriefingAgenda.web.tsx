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

// Hex exactos del sistema de diseño para severidad
const COLOR_SEV: Record<SeveridadSenal, string> = { alta: '#e23b34', media: '#e08a00', baja: '#736658' };
const BG_SEV_SOFT: Record<SeveridadSenal, string> = {
  alta: 'rgba(226,59,52,0.06)',
  media: 'rgba(224,138,0,0.06)',
  baja: 'rgba(115,102,88,0.06)'
};

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
  const [expandido, setExpandido] = useState(true); // Por defecto expandido, pero ultracompacto

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

  const operativas = noShow ? [...ops, noShow] : ops;
  const senales = rankearSenales(senalesSetup(status), operativas, recuperar, status.coreDone);

  if (senales.length === 0) {
    return (
      <div className="animate-pop-in glass-panel" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '12px 16px', borderRadius: 14, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20 }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: -0.2 }}>Todo al día</div>
          <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 1 }}>Tu agenda está despejada y sin alertas.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pop-in glass-panel" style={{ borderRadius: 16, padding: '12px 14px', marginBottom: 10, border: `1px solid ${T.border}`, background: T.bgCard }}>
      {/* Cabecera compacta con toggle de expansión */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expandido ? 10 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: T.textTertiary, textTransform: 'uppercase' }}>
            Alertas y Tareas
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: T.primarySoft, color: T.primaryHi, fontSize: 10.5, fontWeight: 700,
            borderRadius: 99, padding: '1px 5px', height: 16, minWidth: 16
          }}>
            {senales.length}
          </span>
        </div>
        <button
          onClick={() => setExpandido(!expandido)}
          style={{ border: 'none', background: 'transparent', color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
        >
          {expandido ? 'Ocultar ▲' : 'Ver todo ▼'}
        </button>
      </div>

      {expandido && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {senales.map((s) => {
            const navegable = s.accion?.tipo === 'ir_a';
            return (
              <div
                key={s.tipo}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: BG_SEV_SOFT[s.severidad] || T.bgPanel,
                  border: `1px solid ${T.border}`,
                }}
              >
                {/* Lado izquierdo: indicador de severidad + info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span
                    title={`Prioridad: ${s.severidad}`}
                    style={{
                      width: 7, height: 7, borderRadius: 99,
                      background: COLOR_SEV[s.severidad], flexShrink: 0,
                      boxShadow: `0 0 4px ${COLOR_SEV[s.severidad]}`
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.titulo}
                    </div>
                    <div style={{ fontSize: 11.5, color: T.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                      {s.detalle}
                    </div>
                  </div>
                </div>

                {/* Lado derecho: botón de acción ultracompacto */}
                {navegable && s.accion ? (
                  <button
                    className="btn-interactive"
                    onClick={() => irA(s)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 16,
                      border: 'none',
                      background: T.bgCardHi,
                      color: T.text,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                      flexShrink: 0,
                    }}
                  >
                    {(s.accion.payload as any)?.label || 'Ver'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
