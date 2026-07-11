import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { supabase } from '@/lib/supabase';
import { irARedsys } from '@/lib/redsysRedirect';

// ---------------------------------------------------------------------------
// Pagina de pago del TOTAL de una cita (/app/pagar/[token], token = enlace opaco de tipo
// 'total'). Destino del QR de mostrador y del enlace "paga tu servicio". Muestra el detalle
// via pago_info_publica; si la cita es invitada y faltan datos, los pide (completar_datos_
// pago_publico) con consentimiento; luego abre Stripe Checkout via crear-checkout-cobro.
// El webhook concilia el cobro en el libro de cobros.
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
  .pg-inp { width: 100%; box-sizing: border-box; padding: 12px 13px; border-radius: 12px; border: 1px solid rgba(40,30,24,0.16); background: #fff; font-size: 15px; color: #241a14; outline: none }
  .pg-inp:focus { border-color: #f4501e }
  @media (prefers-reduced-motion: reduce) { .pg-step,.pg-flame,.pg-blob1,.pg-blob2 { animation: none !important } }
`;

function Lock({ size = 16, color = T.text }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` }} />
  );
}

const euros = (cents: number) => (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

type Info = {
  ok: boolean; motivo?: string; tipo?: string; salon?: string; servicio?: string;
  inicio?: string; importe_cents?: number; estado?: string; cobrada?: boolean; requiere_datos?: boolean;
  propinas_activo?: boolean; propinas_sugeridas?: number[];
};

export default function PagoTotalWeb() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = String(params.token || '');
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Datos del invitado (solo si requiere_datos).
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [acepto, setAcepto] = useState(false);
  // Propina (S4): seleccion del cliente (porcentaje sugerido, 'custom' o sin propina).
  const [tipSel, setTipSel] = useState<number | 'custom' | null>(null);
  const [tipCustom, setTipCustom] = useState('');

  useEffect(() => {
    (async () => {
      if (!token) { setLoading(false); return; }
      const { data, error } = await supabase.rpc('pago_info_publica', { p_token: token });
      if (error) { setErr('No se pudo cargar el pago.'); }
      else setInfo(data as Info);
      setLoading(false);
    })();
  }, [token]);

  async function pagar() {
    setErr(''); setBusy(true);
    try {
      // Si es invitado y faltan datos, guardarlos + consentimiento antes de pagar.
      if (info?.requiere_datos) {
        if (!acepto) { setErr('Debes aceptar la política de datos para continuar.'); setBusy(false); return; }
        const { data: d, error: e } = await supabase.rpc('completar_datos_pago_publico', {
          p_token: token, p_nombre: nombre, p_telefono: telefono, p_email: email || null, p_acepto: acepto,
        });
        if (e || !(d as any)?.ok) {
          const m = (d as any)?.motivo;
          setErr(m === 'telefono_invalido' ? 'Introduce un teléfono válido.'
            : m === 'nombre_invalido' ? 'Introduce tu nombre.'
            : 'No se pudieron guardar tus datos.');
          setBusy(false); return;
        }
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.mechaa.es';
      const { data, error } = await supabase.functions.invoke('crear-checkout-cobro', {
        body: {
          token, success_url: `${origin}/app/pago/ok`, cancel_url: window.location.href,
          propina_cents: tipsActive ? propinaCents : undefined,
        },
      });
      if (error) { setErr('No se pudo iniciar el pago. El enlace puede haber caducado.'); setBusy(false); return; }
      if ((data as any)?.redsys) { irARedsys((data as any).redsys.url, (data as any).redsys.params); return; }
      if ((data as any)?.ya_pagado) { setInfo({ ...(info as Info), estado: 'pagado' }); setBusy(false); return; }
      if ((data as any)?.checkout_url) { window.location.href = (data as any).checkout_url; return; }
      setErr('Respuesta inesperada del servidor.'); setBusy(false);
    } catch {
      setErr('Ha ocurrido un error. Inténtalo de nuevo.'); setBusy(false);
    }
  }

  if (loading) return <Shell><Panel><div className="pg-step" style={{ textAlign: 'center', color: T.textSec, fontSize: 14 }}>Cargando…</div></Panel></Shell>;

  const invalido = !token || !info || info.ok === false;
  const yaCobrada = info?.cobrada || info?.estado === 'pagado';

  // Propina: solo en el pago del total y si el salon la ofrece. El % se calcula sobre el importe.
  const tipsActive = !!info?.propinas_activo && info?.tipo === 'total';
  const base = info?.importe_cents || 0;
  const propinaCents = !tipsActive ? 0
    : tipSel === 'custom' ? Math.max(0, Math.round((parseFloat(tipCustom.replace(',', '.')) || 0) * 100))
    : typeof tipSel === 'number' ? Math.round(base * tipSel / 100)
    : 0;
  const totalCents = base + propinaCents;

  return (
    <Shell>
      <Panel>
        {invalido ? (
          <Exito titulo="Enlace no válido" sub="Este enlace de pago no existe o ha caducado. Pide uno nuevo al salón." />
        ) : yaCobrada ? (
          <Exito titulo="Pago completado" sub="Este servicio ya está pagado. ¡Gracias!" />
        ) : (
          <div className="pg-step">
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%', background: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <span className="pg-flame"><MechaMark size={34} /></span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 30, color: T.text, lineHeight: 1.05, marginBottom: 6 }}>Paga tu servicio</div>
              {!!info?.salon && <div style={{ fontSize: 13.5, color: T.textTer, marginBottom: 16 }}>{info.salon}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', background: T.cardHi, border: `1px solid ${T.border}`, borderRadius: 14, marginBottom: 18 }}>
              {!!info?.servicio && <Row k="Servicio" v={info.servicio} />}
              {tipsActive && propinaCents > 0 && <Row k="Subtotal" v={euros(base)} />}
              {tipsActive && propinaCents > 0 && <Row k="Propina" v={euros(propinaCents)} />}
              <Row k="Total a pagar" v={euros(totalCents)} strong />
            </div>

            {tipsActive && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: T.textSec, marginBottom: 8 }}>¿Añadir propina para el equipo?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <TipBtn label="Sin propina" active={!tipSel} onClick={() => setTipSel(0)} />
                  {(info?.propinas_sugeridas || [5, 10, 15]).map((p) => (
                    <TipBtn key={p} label={`${p}%`} sub={euros(Math.round(base * p / 100))} active={tipSel === p} onClick={() => setTipSel(p)} />
                  ))}
                  <TipBtn label="Otra" active={tipSel === 'custom'} onClick={() => setTipSel('custom')} />
                </div>
                {tipSel === 'custom' && (
                  <input className="pg-inp" style={{ marginTop: 8 }} placeholder="Importe de propina en €" inputMode="decimal"
                    value={tipCustom} onChange={(e) => setTipCustom(e.target.value.replace(/[^0-9.,]/g, ''))} />
                )}
              </div>
            )}

            {info?.requiere_datos && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: T.textSec }}>Necesitamos un par de datos para tu recibo:</div>
                <input className="pg-inp" placeholder="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                <input className="pg-inp" placeholder="Teléfono" inputMode="tel" value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/[^0-9+\s]/g, ''))} maxLength={20} />
                <input className="pg-inp" placeholder="Email (opcional)" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: T.textSec, cursor: 'pointer' }}>
                  <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>Acepto la <a href="/privacidad.html" target="_blank" style={{ color: T.primary }}>política de datos</a> para gestionar mi cita y recibo.</span>
                </label>
              </div>
            )}

            {!!err && (
              <div style={{ marginBottom: 14, padding: '10px 12px', background: T.dangerSoft, border: `1px solid ${T.danger}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>{err}</div>
            )}

            <button className="pg-cta" onClick={pagar} disabled={busy}
              style={{ width: '100%', padding: '15px 16px', borderRadius: 14, border: 'none', background: FIRE, color: '#fff', fontSize: 15.5, fontWeight: 800, boxShadow: '0 12px 30px rgba(192,38,10,0.28)', opacity: busy ? 0.65 : 1 }}>
              {busy ? 'Redirigiendo a pago seguro…' : `Pagar ${euros(totalCents)}`}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, fontSize: 12, color: T.textTer }}>
              <Lock size={13} color={T.textTer} /> Pago seguro con Stripe · Bizum · Apple/Google Pay
            </div>
          </div>
        )}
      </Panel>
    </Shell>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 13, color: T.textTer }}>{k}</span>
      <span style={{ fontSize: strong ? 20 : 14, fontWeight: strong ? 800 : 600, color: strong ? T.primaryHi : T.text }}>{v}</span>
    </div>
  );
}

function TipBtn({ label, sub, active, onClick }: { label: string; sub?: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pg-cta"
      style={{ flex: '1 1 auto', minWidth: 76, padding: '9px 10px', borderRadius: 12, textAlign: 'center',
        border: `1.5px solid ${active ? T.primary : T.border}`, background: active ? T.primarySoft : '#fff',
        color: active ? T.primaryHi : T.text, fontWeight: 700, fontSize: 13.5 }}>
      <div>{label}</div>
      {!!sub && <div style={{ fontSize: 11, fontWeight: 600, color: active ? T.primaryHi : T.textTer, marginTop: 1 }}>{sub}</div>}
    </button>
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
    <div style={{ height: '100vh', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', background: 'linear-gradient(180deg, #fdf6ee 0%, #f7ede1 60%, #f3e7d8 100%)', padding: '0 16px 32px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative' }}>
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
