import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { getPortalInfo, getResenasPublicas, crearResenaPublica, type PortalNegocio, type ResenaResumen } from '@/lib/reservaPublica';

const T = {
  bg: '#080605', // Deep carbon charcoal dark
  panel: 'rgba(20, 17, 15, 0.75)', // Glassmorphic translucent dark panel
  card: '#161311', // Dark card
  cardHi: '#221b18', // Higher contrast dark card
  border: 'rgba(244, 80, 30, 0.12)', // Subtle orange glowing border
  borderHi: 'rgba(244, 80, 30, 0.22)', // More glow border
  text: '#f7f5f3', // Bright white-cream text
  textSec: '#bfae9e', // Warm sand text
  textTer: '#877665', // Darker warm sand text
  primary: '#f4501e', // Fire orange
  primaryHi: '#ff7a2e', // Flame light orange
  primarySoft: 'rgba(244, 80, 30, 0.15)', // Orange glow fill
  star: '#ffb020', // Glowing gold
  success: '#10b981', // Clean green
  successSoft: 'rgba(16, 185, 129, 0.15)',
  danger: '#ef4444',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SERIF = '"Inter", system-ui, sans-serif';

const ANIM = `
  @keyframes rsUp { from { opacity:0; transform: translateY(20px); filter: blur(4px); } to { opacity:1; transform: translateY(0); filter: blur(0); } }
  @keyframes rsFlicker { 0%,100% { transform: rotate(-0.5deg) scale(1); filter: drop-shadow(0 0 10px rgba(244,80,30,0.5)) } 45% { transform: rotate(1deg) scale(1.03); filter: drop-shadow(0 0 15px rgba(244,80,30,0.7)) } 70% { transform: rotate(-0.5deg) scale(0.98); filter: drop-shadow(0 0 8px rgba(244,80,30,0.4)) } }
  @keyframes rsRing { 0% { transform: scale(0.7); opacity: 0.8 } 100% { transform: scale(2.0); opacity: 0 } }
  @keyframes rsPop { from { opacity:0; transform: scale(0.8) } to { opacity:1; transform: scale(1) } }
  .rs-step { animation: rsUp 0.6s cubic-bezier(0.16,1,0.3,1) both }
  .rs-flame { animation: rsFlicker 2.8s ease-in-out infinite; transform-origin: 50% 80%; display: inline-flex }
  .rs-cta { transition: all 0.2s cubic-bezier(0.16,1,0.3,1); cursor: pointer; border: 1px solid rgba(255,255,255,0.05) }
  .rs-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(244,80,30,0.4); filter: brightness(1.1) }
  .rs-cta:active { transform: translateY(0); box-shadow: 0 4px 10px rgba(244,80,30,0.2) }
  .rs-star { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1); cursor: pointer; background: none; border: none; padding: 2px 6px }
  .rs-star:hover { transform: scale(1.25) }
  .rs-field { transition: all 0.2s ease }
  .rs-field:focus { border-color: ${T.primaryHi} !important; box-shadow: 0 0 0 4px rgba(244,80,30,0.25); background: rgba(20,17,15,0.9) !important }
  @media (prefers-reduced-motion: reduce) {
    .rs-step, .rs-flame { animation: none !important }
    .rs-cta, .rs-star { transition: none !important }
  }
`;

const ETIQUETAS = ['', 'Lo siento', 'Mejorable', 'Bien', 'Muy bien', '¡Excelente!'];

function Fueguito({ filled, size = 36 }: { filled: boolean; size?: number }) {
  return (
    <span style={{ 
      display: 'inline-flex', 
      opacity: filled ? 1 : 0.25, 
      filter: filled ? 'drop-shadow(0 0 12px rgba(244,80,30,0.6)) drop-shadow(0 0 2px #ffcf4a)' : 'grayscale(100%) brightness(0.5)',
      transform: filled ? 'scale(1.1) translateY(-2px)' : 'scale(1)',
      transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)'
    }}>
      <MechaMark size={size} />
    </span>
  );
}

function FueguitosRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => <Fueguito key={n} filled={n <= Math.round(value)} size={size} />)}
    </span>
  );
}

function RatingInput({ label, value, onChange, size = 32 }: { label: string; value: number; onChange: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.textSec }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 2 }} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" className="rs-star" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} aria-label={`${n} estrellas`}>
              <Fueguito filled={n <= shown} size={size} />
            </button>
          ))}
        </div>
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

  // Salon
  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [salonTrato, setSalonTrato] = useState(0);
  const [salonProductos, setSalonProductos] = useState(0);
  const [comentario, setComentario] = useState('');
  
  // Mecha
  const [mechaPuntuacion, setMechaPuntuacion] = useState(0);
  const [mechaHover, setMechaHover] = useState(0);
  const [mechaFacilidad, setMechaFacilidad] = useState(0);
  const [mechaDisponibilidad, setMechaDisponibilidad] = useState(0);
  const [mechaPagos, setMechaPagos] = useState(0);
  const [mechaComentario, setMechaComentario] = useState('');
  const [mechaMejora, setMechaMejora] = useState('');

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
    if (puntuacion < 1) { setError('Elige una puntuación general para el salón.'); return; }
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
        salonTrato: salonTrato || undefined,
        salonProductos: salonProductos || undefined,
        mechaFacilidad: mechaFacilidad || undefined,
        mechaDisponibilidad: mechaDisponibilidad || undefined,
        mechaPagos: mechaPagos || undefined,
        mechaMejora: mechaMejora.trim() || undefined,
      });
      setEnviado(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar la valoración.');
    } finally {
      setEnviando(false);
    }
  }, [slug, puntuacion, comentario, nombre, mechaPuntuacion, mechaComentario, salonTrato, salonProductos, mechaFacilidad, mechaDisponibilidad, mechaPagos, mechaMejora]);

  const shown = hover || puntuacion;
  const mechaShown = mechaHover || mechaPuntuacion;
  const inputBase: React.CSSProperties = {
    width: '100%', padding: '12px 13px', borderRadius: 12, border: `1.5px solid ${T.border}`,
    fontSize: 14.5, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '0 16px 48px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div aria-hidden style={{ position: 'absolute', top: -200, left: '25%', width: 600, height: 500, background: 'radial-gradient(closest-side, rgba(244,80,30,0.08), transparent)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -200, right: '10%', width: 500, height: 400, background: 'radial-gradient(closest-side, rgba(255,122,46,0.05), transparent)', pointerEvents: 'none' }} />
      
      <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '32px 4px 24px' }}>
          <span className="rs-flame"><MechaMark size={40} /></span>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: -0.2, lineHeight: 1.05 }}>
            {negocio?.nombre || 'Tu opinión importa'}
          </div>
        </header>

        <main style={{ 
          background: T.panel, 
          border: `1px solid ${T.borderHi}`, 
          borderRadius: 24, 
          padding: 32, 
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
              <div style={{ height: 18, width: 180, borderRadius: 8, background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ height: 44, width: 230, borderRadius: 10, background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ height: 88, borderRadius: 10, background: 'rgba(255,255,255,0.07)' }} />
            </div>
          ) : notFound ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No disponible</div>
              <div style={{ fontSize: 14, color: T.textSec }}>Este salón no tiene activadas las valoraciones.</div>
            </div>
          ) : enviado ? (
            <div className="rs-step" style={{ textAlign: 'center', padding: '20px 0 10px' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: T.primarySoft, animation: 'rsRing 1.8s ease-out infinite' }} />
                <span style={{ position: 'relative', display: 'inline-flex', width: 84, height: 84, borderRadius: '50%', background: T.card, border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
                  <span className="rs-flame"><MechaMark size={44} /></span>
                </span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 800, color: T.text, marginBottom: 8, lineHeight: 1.05 }}>¡Gracias por tu fuego!</div>
              <div style={{ fontSize: 15, color: T.textSec }}>Nos ayuda muchísimo a mejorar.</div>
            </div>
          ) : (
            <div className="rs-step">
              {resumen && resumen.total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${T.border}` }}>
                  <FueguitosRow value={resumen.media} size={18} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{resumen.media}</span>
                  <span style={{ fontSize: 13.5, color: T.textTer }}>· {resumen.total} {resumen.total === 1 ? 'valoración' : 'valoraciones'}</span>
                </div>
              )}

              {/* SECCION SALON */}
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6, lineHeight: 1.08 }}>
                Sobre el salón
              </div>
              <p style={{ fontSize: 14, color: T.textSec, marginBottom: 20 }}>Ayúdanos a mejorar contándonos qué tal fue tu experiencia general.</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} className="rs-star" onMouseEnter={() => setHover(n)} onClick={() => setPuntuacion(n)} aria-label={`${n} fueguitos`}>
                      <Fueguito filled={n <= shown} size={44} />
                    </button>
                  ))}
                </div>
                {shown > 0 && (
                  <span key={shown} style={{ fontSize: 15, fontWeight: 700, color: T.primaryHi, animation: 'rsPop 0.2s ease both' }}>{ETIQUETAS[shown]}</span>
                )}
              </div>

              {puntuacion > 0 && (
                <div className="rs-step" style={{ background: 'rgba(244, 80, 30, 0.03)', padding: 16, borderRadius: 16, marginBottom: 24, border: '1px solid rgba(244, 80, 30, 0.15)' }}>
                  <RatingInput label="Trato de los profesionales" value={salonTrato} onChange={setSalonTrato} size={30} />
                  <RatingInput label="Calidad de los productos" value={salonProductos} onChange={setSalonProductos} size={30} />
                </div>
              )}

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.textSec, marginBottom: 8 }}>Comentario para el salón (opcional)</label>
              <textarea className="rs-field" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="¿Qué te ha gustado del servicio?" rows={3}
                style={{ ...inputBase, resize: 'vertical', marginBottom: 32 }} />

              <div style={{ height: 1, background: T.border, margin: '0 -32px 32px' }} />

              {/* SECCION MECHA */}
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6, lineHeight: 1.08 }}>
                Sobre el software
              </div>
              <p style={{ fontSize: 14, color: T.textSec, marginBottom: 20 }}>¿Qué te ha parecido hacer la reserva a través del sistema Mecha?</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setMechaHover(0)}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={'m'+n} className="rs-star" onMouseEnter={() => setMechaHover(n)} onClick={() => setMechaPuntuacion(n)} aria-label={`${n} fueguitos Mecha`}>
                      <Fueguito filled={n <= mechaShown} size={44} />
                    </button>
                  ))}
                </div>
                {mechaShown > 0 && (
                  <span key={'m'+mechaShown} style={{ fontSize: 15, fontWeight: 700, color: T.primaryHi, animation: 'rsPop 0.2s ease both' }}>{ETIQUETAS[mechaShown]}</span>
                )}
              </div>

              {mechaPuntuacion > 0 && (
                <div className="rs-step" style={{ background: 'rgba(244, 80, 30, 0.05)', padding: 16, borderRadius: 16, marginBottom: 24, border: '1px solid rgba(244, 80, 30, 0.20)' }}>
                  <RatingInput label="Facilidad de la reserva" value={mechaFacilidad} onChange={setMechaFacilidad} size={30} />
                  <RatingInput label="Disponibilidad que hay siempre" value={mechaDisponibilidad} onChange={setMechaDisponibilidad} size={30} />
                  <RatingInput label="Sistema de pagos" value={mechaPagos} onChange={setMechaPagos} size={30} />
                </div>
              )}

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.textSec, marginBottom: 8 }}>Puntos fuertes / Comentario (opcional)</label>
              <textarea className="rs-field" value={mechaComentario} onChange={e => setMechaComentario(e.target.value)} placeholder="¿Te ha sido fácil reservar?" rows={2}
                style={{ ...inputBase, resize: 'vertical', marginBottom: 16 }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.textSec, marginBottom: 8 }}>¿Qué podríamos mejorar? (opcional)</label>
              <textarea className="rs-field" value={mechaMejora} onChange={e => setMechaMejora(e.target.value)} placeholder="Alguna sugerencia sobre gestión, diseño..." rows={2}
                style={{ ...inputBase, resize: 'vertical', marginBottom: 32 }} />

              <div style={{ height: 1, background: T.border, margin: '0 -32px 32px' }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.textSec, marginBottom: 8 }}>Tu nombre (opcional)</label>
              <input className="rs-field" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Cómo quieres aparecer en la reseña" style={inputBase} />

              {error && <div className="rs-step" style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: T.danger, fontSize: 14, fontWeight: 600 }}>{error}</div>}

              <button className="rs-cta" onClick={enviar} disabled={enviando}
                style={{ width: '100%', marginTop: 28, padding: '16px', borderRadius: 16, border: 'none', background: FIRE, color: '#fff', fontSize: 16, fontWeight: 800, boxShadow: '0 12px 30px rgba(244,80,30,0.3)', opacity: enviando ? 0.65 : 1 }}>
                {enviando ? 'Enviando…' : 'Enviar valoración'}
              </button>
            </div>
          )}
        </main>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: T.textTer, marginTop: 20 }}>
          Con <span style={{ fontWeight: 800, color: T.primary }}>mecha</span>
        </div>
      </div>
    </div>
  );
}
