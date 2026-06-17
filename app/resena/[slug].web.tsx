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
const SERIF = '"Instrument Serif", Georgia, serif';

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

function FlameIcon({ filled, size = 24, color = '#f4501e' }: { filled: boolean; size?: number; color?: string }) {
  const path = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={filled ? '#ff8a3d' : 'rgba(40,30,24,0.20)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

function FlamesRow({ value, size = 16, color }: { value: number; size?: number; color?: string }) {
  const count = Math.round(value);
  if (count <= 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <FlameIcon key={i} filled={true} size={size} color={color} />
      ))}
    </span>
  );
}

function RatingSelector({
  value,
  onChange,
  size = 32,
  color = '#f4501e'
}: {
  value: number;
  onChange: (val: number) => void;
  size?: number;
  color?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', transition: 'transform 0.1s ease', display: 'inline-flex' }}
          className="rs-star"
          aria-label={`${n} fueguitos`}
        >
          <FlameIcon filled={n <= shown} size={size} color={color} />
        </button>
      ))}
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

  // Salon states
  const [puntuacion, setPuntuacion] = useState(0);
  const [salonTrato, setSalonTrato] = useState(0);
  const [salonProductos, setSalonProductos] = useState(0);
  const [comentario, setComentario] = useState('');

  // Mecha states
  const [mechaPuntuacion, setMechaPuntuacion] = useState(0);
  const [mechaFacilidad, setMechaFacilidad] = useState(0);
  const [mechaDisponibilidad, setMechaDisponibilidad] = useState(0);
  const [mechaPagos, setMechaPagos] = useState(0);
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
    if (puntuacion < 1) { setError('Elige una puntuación para el salón.'); return; }
    setEnviando(true);
    try {
      await crearResenaPublica({
        slug,
        puntuacion,
        comentario: comentario.trim() || undefined,
        autorNombre: nombre.trim() || undefined,
        mechaPuntuacion: mechaPuntuacion > 0 ? mechaPuntuacion : undefined,
        mechaComentario: undefined,
        salonTrato: salonTrato > 0 ? salonTrato : undefined,
        salonProductos: salonProductos > 0 ? salonProductos : undefined,
        mechaFacilidad: mechaFacilidad > 0 ? mechaFacilidad : undefined,
        mechaDisponibilidad: mechaDisponibilidad > 0 ? mechaDisponibilidad : undefined,
        mechaPagos: mechaPagos > 0 ? mechaPagos : undefined,
        mechaMejora: mechaMejora.trim() || undefined
      });
      setEnviado(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la valoración.');
    } finally {
      setEnviando(false);
    }
  }, [slug, puntuacion, comentario, nombre, mechaPuntuacion, salonTrato, salonProductos, mechaFacilidad, mechaDisponibilidad, mechaPagos, mechaMejora]);

  const inputBase: React.CSSProperties = {
    width: '100%', padding: '12px 13px', borderRadius: 12, border: `1.5px solid ${T.border}`,
    fontSize: 14.5, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '0 16px 48px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 520, height: 320, background: 'radial-gradient(closest-side, rgba(244,80,30,0.10), transparent)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 540, margin: '0 auto', position: 'relative' }}>
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
              <div style={{ fontSize: 14.5, color: T.textSec }}>Nos ayuda muchísimo a mejorar el servicio.</div>
            </div>
          ) : (
            <div className="rs-step">
              {resumen && resumen.total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
                  <FlamesRow value={resumen.media} size={18} />
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: T.text }}>{resumen.media}</span>
                  <span style={{ fontSize: 13, color: T.textTer }}>· {resumen.total} {resumen.total === 1 ? 'valoración' : 'valoraciones'}</span>
                </div>
              )}

              {/* SECCIÓN 1: EL SALÓN */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 14, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, fontFamily: SERIF, letterSpacing: -0.2 }}>
                  1. Tu visita al salón
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>
                    Valoración general del salón *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RatingSelector value={puntuacion} onChange={setPuntuacion} size={36} />
                    {puntuacion > 0 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.primary }}>{ETIQUETAS[puntuacion]}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>
                      Trato recibido (opcional)
                    </label>
                    <RatingSelector value={salonTrato} onChange={setSalonTrato} size={24} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>
                      Limpieza y productos (opcional)
                    </label>
                    <RatingSelector value={salonProductos} onChange={setSalonProductos} size={24} />
                  </div>
                </div>

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>Comentario sobre tu visita (opcional)</label>
                <textarea className="rs-field" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="¿Qué destacarías de tu experiencia en el salón?" rows={3}
                  style={{ ...inputBase, resize: 'vertical' }} />
              </div>

              {/* SECCIÓN 2: EL SISTEMA DE RESERVAS */}
              <div style={{ background: 'rgba(244,80,30,0.03)', border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, marginBottom: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 14, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, fontFamily: SERIF, letterSpacing: -0.2 }}>
                  2. Sistema de reservas (Mecha)
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>
                    ¿Cómo valorarías el proceso de reserva online? (opcional)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RatingSelector value={mechaPuntuacion} onChange={setMechaPuntuacion} size={32} color="#f59e0b" />
                    {mechaPuntuacion > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>{ETIQUETAS[mechaPuntuacion]}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: T.textSec }}>Facilidad para reservar</span>
                    <RatingSelector value={mechaFacilidad} onChange={setMechaFacilidad} size={20} color="#f59e0b" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: T.textSec }}>Disponibilidad de huecos</span>
                    <RatingSelector value={mechaDisponibilidad} onChange={setMechaDisponibilidad} size={20} color="#f59e0b" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: T.textSec }}>Rapidez y seguridad de pago</span>
                    <RatingSelector value={mechaPagos} onChange={setMechaPagos} size={20} color="#f59e0b" />
                  </div>
                </div>

                <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>¿Qué mejorarías del sistema de reserva? (opcional)</label>
                <textarea className="rs-field" value={mechaMejora} onChange={e => setMechaMejora(e.target.value)} placeholder="Sugerencias para hacer el proceso aún más fácil..." rows={2}
                  style={{ ...inputBase, resize: 'vertical' }} />
              </div>

              {/* IDENTIFICACIÓN */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>Tu nombre (opcional)</label>
                <input className="rs-field" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Carlos M. (se mostrará públicamente)" style={inputBase} />
              </div>

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
