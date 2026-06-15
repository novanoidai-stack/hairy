import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { getPortalInfo, getResenasPublicas, crearResenaPublica, type PortalNegocio, type ResenaResumen } from '@/lib/reservaPublica';

const T = {
  bg: '#f6f1ea', panel: '#fffdfb', card: '#ffffff', cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)', borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814', textSec: '#5c5249', textTer: '#8a7d70',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  star: '#f59e0b', success: '#0f9d6b', successSoft: 'rgba(15,157,107,0.12)', danger: '#e23b34',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SERIF = '"Inter", system-ui, sans-serif';

const ANIM = `
  @keyframes rsUp { from { opacity:0; transform: translateY(14px) } to { opacity:1; transform: translateY(0) } }
  @keyframes rsFlicker { 0%,100% { transform: rotate(-1deg) scale(1); opacity: 1 } 45% { transform: rotate(1.5deg) scale(1.05); opacity: 0.92 } 70% { transform: rotate(-0.5deg) scale(0.99) } }
  @keyframes rsRing { 0% { transform: scale(0.6); opacity: 0.55 } 100% { transform: scale(1.9); opacity: 0 } }
  @keyframes rsPop { from { opacity:0; transform: scale(0.8) } to { opacity:1; transform: scale(1) } }
  .rs-step { animation: rsUp 0.45s cubic-bezier(0.16,1,0.3,1) both }
  .rs-flame { animation: rsFlicker 3.4s ease-in-out infinite; transform-origin: 50% 80%; display: inline-flex }
  .rs-cta { transition: transform 0.16s ease, filter 0.16s ease; cursor: pointer }
  .rs-cta:hover { filter: brightness(1.05) }
  .rs-cta:active { transform: translateY(1px) }
  .rs-star { transition: transform 0.14s cubic-bezier(0.16,1,0.3,1); cursor: pointer; background: none; border: none; padding: 3px }
  .rs-star:hover { transform: scale(1.18) }
  .rs-field:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} }
  @media (prefers-reduced-motion: reduce) {
    .rs-step, .rs-flame { animation: none !important }
    .rs-cta, .rs-star { transition: none !important }
  }
`;

const ETIQUETAS = ['', 'Lo siento', 'Mejorable', 'Bien', 'Muy bien', '¡Excelente!'];

function Star({ filled, size = 36 }: { filled: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', color: filled ? T.star : 'rgba(40,30,24,0.16)' }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? T.star : 'none'}" stroke="${filled ? T.star : 'rgba(40,30,24,0.16)'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
      }} />
  );
}

function StarsRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} filled={n <= Math.round(value)} size={size} />)}
    </span>
  );
}

export default function ResenaWeb() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  const [negocio, setNegocio] = useState<PortalNegocio | null>(null);
  const [resumen, setResumen] = useState<ResenaResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  
  const [mechaPuntuacion, setMechaPuntuacion] = useState(0);
  const [mechaHover, setMechaHover] = useState(0);
  const [mechaComentario, setMechaComentario] = useState('');

  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

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
    if (puntuacion < 1) { setError('Elige una puntuación para el salón.'); return; }
    if (mechaPuntuacion < 1) { setError('Por favor, valora también el sistema de reservas.'); return; }
    setEnviando(true);
    try {
      await crearResenaPublica({ 
        slug, 
        puntuacion, 
        comentario: comentario.trim() || undefined, 
        autorNombre: nombre.trim() || undefined,
        mechaPuntuacion: mechaPuntuacion || undefined,
        mechaComentario: mechaComentario.trim() || undefined,
      });
      setEnviado(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar la valoración.');
    } finally {
      setEnviando(false);
    }
  }, [slug, puntuacion, comentario, nombre, mechaPuntuacion, mechaComentario]);

  const shown = hover || puntuacion;
  const mechaShown = mechaHover || mechaPuntuacion;
  const inputBase: React.CSSProperties = {
    width: '100%', padding: '12px 13px', borderRadius: 12, border: `1.5px solid ${T.border}`,
    fontSize: 14.5, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '0 16px 48px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 520, height: 320, background: 'radial-gradient(closest-side, rgba(244,80,30,0.10), transparent)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '24px 4px 18px' }}>
          <span className="rs-flame"><MechaMark size={36} /></span>
          <div style={{ fontFamily: SERIF, fontSize: 25, color: T.text, letterSpacing: -0.2, lineHeight: 1.05 }}>
            {negocio?.nombre || 'Tu opinión'}
          </div>
        </header>

        <main style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 22, padding: 24, boxShadow: '0 16px 50px rgba(40,30,24,0.08)' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
              <div style={{ height: 18, width: 180, borderRadius: 8, background: 'rgba(40,30,24,0.07)' }} />
              <div style={{ height: 44, width: 230, borderRadius: 10, background: 'rgba(40,30,24,0.07)' }} />
              <div style={{ height: 88, borderRadius: 10, background: 'rgba(40,30,24,0.07)' }} />
            </div>
          ) : notFound ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No disponible</div>
              <div style={{ fontSize: 14, color: T.textSec }}>Este salon no tiene activadas las valoraciones.</div>
            </div>
          ) : enviado ? (
            <div className="rs-step" style={{ textAlign: 'center', padding: '14px 0 6px' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ position: 'absolute', width: 74, height: 74, borderRadius: '50%', background: T.primarySoft, animation: 'rsRing 1.8s ease-out infinite' }} />
                <span style={{ position: 'relative', display: 'inline-flex', width: 74, height: 74, borderRadius: '50%', background: '#fff', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
                  <span className="rs-flame"><MechaMark size={38} /></span>
                </span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 30, color: T.text, marginBottom: 6, lineHeight: 1.05 }}>¡Gracias por tu opinión!</div>
              <div style={{ fontSize: 14.5, color: T.textSec }}>Nos ayuda muchísimo a mejorar.</div>
            </div>
          ) : (
            <div className="rs-step">
              {resumen && resumen.total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
                  <StarsRow value={resumen.media} size={16} />
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: T.text }}>{resumen.media}</span>
                  <span style={{ fontSize: 13, color: T.textTer }}>· {resumen.total} {resumen.total === 1 ? 'valoración' : 'valoraciones'}</span>
                </div>
              )}

              <div style={{ fontFamily: SERIF, fontSize: 26, color: T.text, marginBottom: 16, lineHeight: 1.08 }}>Tu experiencia en el salón</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} className="rs-star" onMouseEnter={() => setHover(n)} onClick={() => setPuntuacion(n)} aria-label={`${n} estrellas`}>
                      <Star filled={n <= shown} size={40} />
                    </button>
                  ))}
                </div>
                {shown > 0 && (
                  <span key={shown} style={{ fontSize: 14, fontWeight: 700, color: T.primaryHi, animation: 'rsPop 0.2s ease both' }}>{ETIQUETAS[shown]}</span>
                )}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>Comentario para el salón (opcional)</label>
              <textarea className="rs-field" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="¿Qué te ha gustado del servicio?" rows={3}
                style={{ ...inputBase, resize: 'vertical', marginBottom: 24 }} />

              <div style={{ height: 1, background: T.border, margin: '0 -24px 24px' }} />

              <div style={{ fontFamily: SERIF, fontSize: 22, color: T.text, marginBottom: 16, lineHeight: 1.08 }}>¿Qué te ha parecido el sistema de reservas?</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setMechaHover(0)}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={'m'+n} className="rs-star" onMouseEnter={() => setMechaHover(n)} onClick={() => setMechaPuntuacion(n)} aria-label={`${n} estrellas Mecha`}>
                      <Star filled={n <= mechaShown} size={40} />
                    </button>
                  ))}
                </div>
                {mechaShown > 0 && (
                  <span key={'m'+mechaShown} style={{ fontSize: 14, fontWeight: 700, color: T.primaryHi, animation: 'rsPop 0.2s ease both' }}>{ETIQUETAS[mechaShown]}</span>
                )}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>Comentario sobre el sistema (opcional)</label>
              <textarea className="rs-field" value={mechaComentario} onChange={e => setMechaComentario(e.target.value)} placeholder="¿Te ha sido fácil reservar?" rows={2}
                style={{ ...inputBase, resize: 'vertical', marginBottom: 24 }} />

              <div style={{ height: 1, background: T.border, margin: '0 -24px 24px' }} />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>Tu nombre (opcional)</label>
              <input className="rs-field" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Cómo quieres aparecer" style={inputBase} />

              {error && <div style={{ marginTop: 12, fontSize: 13, color: T.danger }}>{error}</div>}

              <button className="rs-cta" onClick={enviar} disabled={enviando}
                style={{ width: '100%', marginTop: 20, padding: '15px', borderRadius: 14, border: 'none', background: FIRE, color: '#fff', fontSize: 15.5, fontWeight: 800, boxShadow: '0 12px 30px rgba(192,38,10,0.28)', opacity: enviando ? 0.65 : 1 }}>
                {enviando ? 'Enviando…' : 'Enviar valoración'}
              </button>
            </div>
          )}
        </main>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: T.textTer, marginTop: 16 }}>
          Con <span style={{ fontWeight: 800, color: T.primary }}>mecha</span>
        </div>
      </div>
    </div>
  );
}
