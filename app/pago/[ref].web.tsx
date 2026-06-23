import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Pagina de pago de la senal (/app/pago/[ref], ref = cita_id). Es el destino del
// boton "Pagar" de la plantilla de WhatsApp `enlace_pago_senal`. Llama a la edge
// function crear-checkout-senal (anon) y redirige a Stripe Checkout. Tras pagar,
// el webhook confirma la cita; Stripe devuelve a /app/pago/ok.
// ---------------------------------------------------------------------------
const T = {
  card: '#ffffff', cardHi: '#fbf5ef', border: 'rgba(40,30,24,0.10)',
  text: '#241a14', textSec: '#5c5249', textTer: '#736658',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b', danger: '#e23b34', dangerSoft: 'rgba(226,59,52,0.10)',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const ANIM = `
  @keyframes pgUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes pgFlicker { 0%,100% { transform: rotate(-1deg) scale(1) } 45% { transform: rotate(1.5deg) scale(1.05) } 70% { transform: rotate(-0.5deg) scale(0.99) } }
  @keyframes pgFloat1 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(26px,-38px) scale(1.08) } }
  @keyframes pgFloat2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-30px,30px) scale(1.1) } }
  .pg-blob1 { animation: pgFloat1 20s ease-in-out infinite alternate; filter: blur(64px) }
  .pg-blob2 { animation: pgFloat2 26s ease-in-out infinite alternate; filter: blur(72px) }
  .pg-step { animation: pgUp 0.45s cubic-bezier(0.16,1,0.3,1) both }
  .pg-flame { animation: pgFlicker 3.4s ease-in-out infinite; transform-origin: 50% 80% }
  .pg-cta { transition: transform 0.16s ease, filter 0.16s ease; cursor: pointer }
  .pg-cta:hover { filter: brightness(1.05) }
  .pg-cta:active { transform: translateY(1px) }
  @media (prefers-reduced-motion: reduce) { .pg-step,.pg-flame,.pg-blob1,.pg-blob2 { animation: none !important } }
`;

function Lock({ size = 16, color = T.text }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` }} />
  );
}

export default function PagoSenalWeb() {
  const params = useLocalSearchParams<{ ref: string }>();
  const citaId = String(params.ref || '');
  const [busy, setBusy] = useState(false);
  const [estado, setEstado] = useState<'idle' | 'paid' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function pagar() {
    if (!citaId) { setErr('Enlace de pago no válido.'); setEstado('error'); return; }
    setBusy(true); setErr('');
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mecha.app';
    const { data, error } = await supabase.functions.invoke('crear-checkout-senal', {
      body: { cita_id: citaId, success_url: `${origin}/app/pago/ok`, cancel_url: window.location.href },
    });
    if (error) {
      setErr('No se pudo iniciar el pago. Puede que esta cita ya no requiera señal o el enlace haya caducado.');
      setEstado('error'); setBusy(false); return;
    }
    if (data?.ya_pagado) { setEstado('paid'); setBusy(false); return; }
    if (data?.checkout_url) { window.location.href = data.checkout_url as string; return; }
    setErr('Respuesta inesperada del servidor.'); setEstado('error'); setBusy(false);
  }

  return (
    <Shell>
      <Panel>
        {estado === 'paid' ? (
          <Exito titulo="Señal ya pagada" sub="Tu cita ya está confirmada. ¡Te esperamos!" />
        ) : (
          <div className="pg-step" style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%', background: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <span className="pg-flame"><MechaMark size={34} /></span>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 30, color: T.text, lineHeight: 1.05, marginBottom: 8 }}>Confirma tu cita</div>
            <div style={{ fontSize: 15, color: T.textSec, lineHeight: 1.5, maxWidth: 340, margin: '0 auto 20px' }}>
              Para asegurar tu reserva queda un pequeño pago de señal. El importe se descuenta de tu servicio.
            </div>
            {estado === 'error' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: '10px 12px', background: T.dangerSoft, border: `1px solid ${T.danger}33`, borderRadius: 12, fontSize: 12.5, color: T.text, textAlign: 'left' }}>{err}</div>
            )}
            <button className="pg-cta" onClick={pagar} disabled={busy}
              style={{ width: '100%', padding: '15px 16px', borderRadius: 14, border: 'none', background: FIRE, color: '#fff', fontSize: 15.5, fontWeight: 800, boxShadow: '0 12px 30px rgba(192,38,10,0.28)', opacity: busy ? 0.65 : 1 }}>
              {busy ? 'Redirigiendo a pago seguro…' : 'Pagar señal ahora'}
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12, color: T.textTer }}>
              <Lock size={13} color={T.textTer} /> Pago seguro con Stripe
            </div>
          </div>
        )}
      </Panel>
    </Shell>
  );
}

function Exito({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div className="pg-step" style={{ textAlign: 'center', padding: '6px 0 2px' }}>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <span style={{ position: 'relative', display: 'inline-flex', width: 78, height: 78, borderRadius: '50%', background: '#fff', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
          <span className="pg-flame"><MechaMark size={40} /></span>
        </span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 32, color: T.text, marginBottom: 8, lineHeight: 1.02 }}>{titulo}</div>
      <div style={{ maxWidth: 360, margin: '0 auto', fontSize: 15, color: T.textSec, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,253,251,0.88)', backdropFilter: 'blur(10px)', border: `1px solid ${T.border}`, borderRadius: 22, padding: 26, boxShadow: '0 18px 50px rgba(40,30,24,0.08)' }}>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'linear-gradient(180deg, #fdf6ee 0%, #f7ede1 60%, #f3e7d8 100%)', padding: '0 16px 32px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 560, height: 340, background: 'radial-gradient(closest-side, rgba(244,80,30,0.14), transparent)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="pg-blob1" aria-hidden style={{ position: 'absolute', top: '8%', left: '6%', width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,196,150,0.5)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="pg-blob2" aria-hidden style={{ position: 'absolute', bottom: '8%', right: '4%', width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,222,170,0.45)', pointerEvents: 'none', zIndex: 0 }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -70, right: -50, opacity: 0.05, pointerEvents: 'none', zIndex: 0 }}><MechaMark size={360} /></div>
      <div style={{ maxWidth: 440, margin: '0 auto', position: 'relative', zIndex: 1, paddingTop: 56 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
          <span className="pg-flame" style={{ display: 'inline-flex' }}><MechaMark size={18} /></span>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '0.9px' }}>mecha</span>
        </header>
        {children}
      </div>
    </div>
  );
}
