import { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { makeT, type TFn } from '@/lib/portalI18n';
import { getPortalInfo, getResenasPublicas, crearResenaPublica, type PortalNegocio, type ResenaResumen } from '@/lib/reservaPublica';

// Mismo tono que el portal de reserva: crema calido + fuego (marca Mecha).
// Los sub-criterios opcionales se valoran con mechas PEQUEÑAS en AZUL para
// distinguirlos de las mechas grandes (obligatorias, en fuego).
const T = {
  bg: '#f7f0e8',
  panel: '#fffdfb',
  card: '#ffffff',
  cardHi: '#fbf5ef',
  border: 'rgba(40,30,24,0.10)',
  borderHi: 'rgba(40,30,24,0.16)',
  text: '#241a14',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  danger: '#e23b34',
  blue: '#3b6ef5',
  blueSoft: 'rgba(59,110,245,0.10)',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";

const ANIM = `
  @keyframes rsUp { from { opacity:0; transform: translateY(18px) } to { opacity:1; transform: translateY(0) } }
  @keyframes rsFlicker { 0%,100% { transform: rotate(-1deg) scale(1) } 45% { transform: rotate(1.5deg) scale(1.05) } 70% { transform: rotate(-0.5deg) scale(0.99) } }
  @keyframes rsRing { 0% { transform: scale(0.6); opacity: 0.55 } 100% { transform: scale(1.9); opacity: 0 } }
  @keyframes rsPop { from { opacity:0; transform: scale(0.8) } to { opacity:1; transform: scale(1) } }
  @keyframes floatBlob1 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(26px,-38px) scale(1.08) } }
  @keyframes floatBlob2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-30px,30px) scale(1.1) } }
  .rs-blob1 { animation: floatBlob1 20s ease-in-out infinite alternate; filter: blur(64px) }
  .rs-blob2 { animation: floatBlob2 26s ease-in-out infinite alternate; filter: blur(72px) }
  .rs-step { animation: rsUp 0.5s cubic-bezier(0.16,1,0.3,1) both }
  .rs-flame { animation: rsFlicker 3.2s ease-in-out infinite; transform-origin: 50% 80%; display: inline-flex }
  .rs-cta { transition: transform 0.16s ease, filter 0.16s ease; cursor: pointer }
  .rs-cta:hover { transform: translateY(-2px); filter: brightness(1.05) }
  .rs-cta:active { transform: translateY(0) }
  .rs-star { transition: transform 0.18s cubic-bezier(0.16,1,0.3,1); cursor: pointer; background: none; border: none; padding: 3px }
  .rs-star:hover { transform: scale(1.18) }
  .rs-field { transition: border-color 0.18s ease, box-shadow 0.18s ease }
  .rs-field:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} }
  .rs-link:hover { color: ${T.primaryHi} !important }
  @media (prefers-reduced-motion: reduce) {
    .rs-step, .rs-flame, .rs-blob1, .rs-blob2 { animation: none !important }
    .rs-cta, .rs-star { transition: none !important }
  }
`;

// Mecha grande (marca de fuego) para las valoraciones obligatorias.
function Fueguito({ filled, size = 44 }: { filled: boolean; size?: number }) {
  return (
    <span style={{
      display: 'inline-flex',
      opacity: filled ? 1 : 0.24,
      filter: filled ? 'drop-shadow(0 4px 10px rgba(244,80,30,0.35))' : 'grayscale(0.95)',
      transform: filled ? 'scale(1.06) translateY(-1px)' : 'scale(1)',
      transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
    }}>
      <MechaMark size={size} />
    </span>
  );
}

// Mecha PEQUEÑA en azul para los sub-criterios opcionales (control de color total).
function MiniFlame({ filled, size = 24, color = T.blue }: { filled: boolean; size?: number; color?: string }) {
  const d = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
  return (
    <span
      style={{ display: 'inline-flex', transition: 'all 0.2s ease', transform: filled ? 'scale(1.05)' : 'scale(1)' }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? color : 'none'}" stroke="${filled ? color : 'rgba(40,30,24,0.28)'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`,
      }}
    />
  );
}

// Fila de valoracion grande (obligatoria) con etiqueta de nivel.
function BigRating({ value, onChange, et }: { value: number; onChange: (v: number) => void; et: string[] }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" className="rs-star" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} aria-label={`${n}`}>
            <Fueguito filled={n <= shown} size={44} />
          </button>
        ))}
      </div>
      {shown > 0 && (
        <span key={shown} style={{ fontSize: 16, fontWeight: 800, color: T.primaryHi, animation: 'rsPop 0.2s ease both' }}>{et[shown]}</span>
      )}
    </div>
  );
}

// Sub-criterio opcional: mechas pequeñas en azul.
function MiniRating({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.textSec }}>{label}</div>
      <div style={{ display: 'flex', gap: 2 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" className="rs-star" style={{ padding: 2 }} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} aria-label={`${n}`}>
            <MiniFlame filled={n <= shown} size={22} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ResenaWeb() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  const [negocio, setNegocio] = useState<PortalNegocio | null>(null);
  const [resumen, setResumen] = useState<ResenaResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Salon (obligatorio + detalles)
  const [puntuacion, setPuntuacion] = useState(0);
  const [salonTrato, setSalonTrato] = useState(0);
  const [salonProductos, setSalonProductos] = useState(0);
  const [comentario, setComentario] = useState('');

  // Mecha (obligatorio + detalles)
  const [mechaPuntuacion, setMechaPuntuacion] = useState(0);
  const [mechaFacilidad, setMechaFacilidad] = useState(0);
  const [mechaDisponibilidad, setMechaDisponibilidad] = useState(0);
  const [mechaPagos, setMechaPagos] = useState(0);
  const [mechaComentario, setMechaComentario] = useState('');
  const [mechaMejora, setMechaMejora] = useState('');

  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  const t: TFn = useMemo(() => makeT(negocio?.idioma), [negocio?.idioma]);
  const ET = useMemo(() => ['', t('et_1'), t('et_2'), t('et_3'), t('et_4'), t('et_5')], [t]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [info, res] = await Promise.all([getPortalInfo(slug), getResenasPublicas(slug)]);
      if (!info) { setNotFound(true); } else { setNegocio(info.negocio); setResumen(res); }
    } catch { setNotFound(true); } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = useCallback(async () => {
    setError('');
    if (puntuacion < 1) { setError(t('res_err_salon')); return; }
    if (mechaPuntuacion < 1) { setError(t('res_err_mecha')); return; }
    setEnviando(true);
    try {
      await crearResenaPublica({
        slug, puntuacion,
        comentario: comentario.trim() || undefined,
        autorNombre: nombre.trim() || undefined,
        mechaPuntuacion: mechaPuntuacion || undefined,
        mechaComentario: mechaComentario.trim() || undefined,
        salonTrato: salonTrato || undefined,
        salonProductos: salonProductos || undefined,
        mechaFacilidad: mechaFacilidad || undefined,
        mechaDisponibilidad: mechaDisponibilidad || undefined,
        mechaPagos: mechaPagos || undefined,
        mechaMejora: mechaMejora.trim() || undefined,
      });
      setEnviado(true);
    } catch (e: any) {
      setError(e?.message || t('res_err_salon'));
    } finally {
      setEnviando(false);
    }
  }, [slug, puntuacion, comentario, nombre, mechaPuntuacion, mechaComentario, salonTrato, salonProductos, mechaFacilidad, mechaDisponibilidad, mechaPagos, mechaMejora, t]);

  const inputBase: React.CSSProperties = {
    width: '100%', padding: '12px 13px', borderRadius: 12, border: `1.5px solid ${T.border}`,
    fontSize: 14.5, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
  const sectionLabel: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: T.textSec, marginBottom: 8 };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fdf6ee 0%, #f7ede1 60%, #f3e7d8 100%)', padding: '0 16px 36px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 560, height: 340, background: 'radial-gradient(closest-side, rgba(244,80,30,0.14), transparent)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="rs-blob1" aria-hidden style={{ position: 'absolute', top: '6%', left: '6%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,196,150,0.5)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="rs-blob2" aria-hidden style={{ position: 'absolute', bottom: '8%', right: '4%', width: 340, height: 340, borderRadius: '50%', background: 'rgba(255,222,170,0.45)', pointerEvents: 'none', zIndex: 0 }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -70, right: -50, opacity: 0.05, pointerEvents: 'none', zIndex: 0 }}><MechaMark size={360} /></div>

      <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <header style={{ padding: '26px 4px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(244,80,30,0.16)', padding: '5px 11px', borderRadius: 999 }}>
              <span className="rs-flame"><MechaMark size={13} /></span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '0.8px' }}>mecha</span>
            </div>
          </div>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(32px, 8.5vw, 44px)', fontWeight: 400, color: T.text, letterSpacing: -0.4, lineHeight: 1.0 }}>
            {negocio?.nombre || t('res_header_default')}
          </h1>
        </header>

        <main style={{ background: 'rgba(255,253,251,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(244,80,30,0.10)', borderRadius: 22, padding: 24, boxShadow: '0 24px 60px rgba(40,30,24,0.07)' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
              <div style={{ height: 18, width: 180, borderRadius: 8, background: 'rgba(40,30,24,0.06)' }} />
              <div style={{ height: 44, width: 230, borderRadius: 10, background: 'rgba(40,30,24,0.06)' }} />
              <div style={{ height: 88, borderRadius: 10, background: 'rgba(40,30,24,0.06)' }} />
            </div>
          ) : notFound ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 24, color: T.text, marginBottom: 6 }}>{t('res_notfound_t')}</div>
              <div style={{ fontSize: 14, color: T.textSec }}>{t('res_notfound_x')}</div>
            </div>
          ) : enviado ? (
            <div className="rs-step" style={{ textAlign: 'center', padding: '20px 0 10px' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: T.primarySoft, animation: 'rsRing 1.8s ease-out infinite' }} />
                <span style={{ position: 'relative', display: 'inline-flex', width: 84, height: 84, borderRadius: '50%', background: '#fff', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
                  <span className="rs-flame"><MechaMark size={44} /></span>
                </span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 34, color: T.text, marginBottom: 8, lineHeight: 1.02 }}>{t('res_thanks_title')}</div>
              <div style={{ fontSize: 15, color: T.textSec }}>{t('res_thanks_sub')}</div>
            </div>
          ) : (
            <div className="rs-step">
              {/* Resumen + confianza (personas reales) */}
              {resumen && resumen.total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ display: 'inline-flex', gap: 1 }}>
                    {[1, 2, 3, 4, 5].map(n => <Fueguito key={n} filled={n <= Math.round(resumen.media)} size={18} />)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{resumen.media}</span>
                  <span style={{ fontSize: 13, color: T.textTer }}>· {resumen.total} {resumen.total === 1 ? t('valoracion_1') : t('valoracion_n')}</span>
                  {!!resumen.verificadas && resumen.verificadas > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: T.success, background: T.successSoft, padding: '3px 8px', borderRadius: 999 }}>
                      <span dangerouslySetInnerHTML={{ __html: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${T.success}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` }} />
                      {resumen.verificadas} {t('verificadas')}
                    </span>
                  )}
                </div>
              )}

              {/* Escala */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 12, background: T.cardHi, border: `1px solid ${T.border}`, marginBottom: 22 }}>
                <span className="rs-flame"><MechaMark size={16} /></span>
                <span style={{ fontSize: 12.5, color: T.textSec, fontWeight: 600 }}>{t('res_scale')}</span>
              </div>

              {/* SECCION SALON */}
              <SectionHead serif={SERIF} icon="fire" titulo={t('res_salon_title')} sub={t('res_salon_sub')} badge={t('res_obligatorio')} />
              <BigRating value={puntuacion} onChange={setPuntuacion} et={ET} />

              {puntuacion > 0 && (
                <div className="rs-step" style={{ background: T.blueSoft, padding: '12px 16px', borderRadius: 14, margin: '16px 0 0', border: `1px solid rgba(59,110,245,0.18)` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{t('res_opcional')}</div>
                  <MiniRating label={t('res_lbl_trato')} value={salonTrato} onChange={setSalonTrato} />
                  <MiniRating label={t('res_lbl_productos')} value={salonProductos} onChange={setSalonProductos} />
                </div>
              )}

              <label style={{ ...sectionLabel, marginTop: 18 }}>{t('res_comment_salon')}</label>
              <textarea className="rs-field" value={comentario} onChange={e => setComentario(e.target.value)} placeholder={t('res_comment_salon_ph')} rows={3}
                style={{ ...inputBase, resize: 'vertical' }} />

              <div style={{ height: 1, background: T.border, margin: '28px -24px' }} />

              {/* SECCION MECHA */}
              <SectionHead serif={SERIF} icon="bolt" titulo={t('res_mecha_title')} sub={t('res_mecha_sub')} badge={t('res_obligatorio')} />
              <BigRating value={mechaPuntuacion} onChange={setMechaPuntuacion} et={ET} />

              {mechaPuntuacion > 0 && (
                <div className="rs-step" style={{ background: T.blueSoft, padding: '12px 16px', borderRadius: 14, margin: '16px 0 0', border: `1px solid rgba(59,110,245,0.18)` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{t('res_opcional')}</div>
                  <MiniRating label={t('res_lbl_facilidad')} value={mechaFacilidad} onChange={setMechaFacilidad} />
                  <MiniRating label={t('res_lbl_disponibilidad')} value={mechaDisponibilidad} onChange={setMechaDisponibilidad} />
                  <MiniRating label={t('res_lbl_pagos')} value={mechaPagos} onChange={setMechaPagos} />
                </div>
              )}

              <label style={{ ...sectionLabel, marginTop: 18 }}>{t('res_strengths')}</label>
              <textarea className="rs-field" value={mechaComentario} onChange={e => setMechaComentario(e.target.value)} placeholder={t('res_strengths_ph')} rows={2}
                style={{ ...inputBase, resize: 'vertical' }} />

              <label style={{ ...sectionLabel, marginTop: 16 }}>{t('res_improve')}</label>
              <textarea className="rs-field" value={mechaMejora} onChange={e => setMechaMejora(e.target.value)} placeholder={t('res_improve_ph')} rows={2}
                style={{ ...inputBase, resize: 'vertical' }} />

              <div style={{ height: 1, background: T.border, margin: '28px -24px' }} />

              <label style={sectionLabel}>{t('res_name')}</label>
              <input className="rs-field" value={nombre} onChange={e => setNombre(e.target.value)} placeholder={t('res_name_ph')} style={inputBase} />

              {/* Nota de verificacion humana */}
              <div style={{ display: 'flex', gap: 9, marginTop: 18, padding: '11px 13px', borderRadius: 12, background: T.successSoft, border: `1px solid rgba(15,157,107,0.2)` }}>
                <span style={{ flexShrink: 0, marginTop: 1 }} dangerouslySetInnerHTML={{ __html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${T.success}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 5-3.5 7.5-8.5 9C7.5 19.5 4 17 4 12V6l8-3 8 3v6z"/></svg>` }} />
                <span style={{ fontSize: 12, color: T.textSec, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700, color: T.text }}>{t('res_human')}.</span> {t('res_human_x')}
                </span>
              </div>

              {error && <div className="rs-step" style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: T.primarySoft, color: T.primaryHi, fontSize: 13.5, fontWeight: 600, border: `1px solid ${T.primary}33` }}>{error}</div>}

              <button className="rs-cta" onClick={enviar} disabled={enviando}
                style={{ width: '100%', marginTop: 22, padding: '16px', borderRadius: 16, border: 'none', background: FIRE, color: '#fff', fontSize: 16, fontWeight: 800, boxShadow: '0 12px 30px rgba(244,80,30,0.28)', opacity: enviando ? 0.65 : 1 }}>
                {enviando ? t('res_sending') : t('res_send')}
              </button>
            </div>
          )}
        </main>
        <div style={{ textAlign: 'center', fontSize: 12, color: T.textTer, marginTop: 16 }}>
          {t('footer_resenas')} <span style={{ fontWeight: 800, color: T.primary }}>mecha</span>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ serif, icon, titulo, sub, badge }: { serif: string; icon: 'fire' | 'bolt'; titulo: string; sub: string; badge: string }) {
  const svg = icon === 'fire'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${T.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${T.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 9, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: svg }} />
        <span style={{ fontFamily: serif, fontSize: 23, color: T.text, lineHeight: 1.05 }}>{titulo}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: T.primaryHi, background: T.primarySoft, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{badge}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: T.textTer }}>{sub}</p>
    </div>
  );
}
