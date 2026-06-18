import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { getPortalInfo, getResenasPublicas, crearResenaPublica, type PortalNegocio, type ResenaResumen } from '@/lib/reservaPublica';

const T = {
  bg: '#060202', // Basalt black
  panel: 'rgba(11, 16, 32, 0.72)', // Glassmorphic very dark gray-blue
  card: '#101729',
  cardHi: '#16203a',
  border: 'rgba(255, 255, 255, 0.08)',
  borderHi: 'rgba(255, 255, 255, 0.16)',
  text: '#f6f8ff',
  textSec: '#9aa6c2',
  textTer: '#8a9ab8',
  primary: '#f4501e',
  primaryHi: '#ff8a3d',
  primarySoft: 'rgba(244,80,30,0.14)',
  star: '#f59e0b',
  success: '#10b981',
  successSoft: 'rgba(16,185,129,0.14)',
  danger: '#ef4444',
};

const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SANS_SERIF = '"Space Grotesk", "Outfit", "Inter", sans-serif';

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

function FlameIcon({ filled, size = 24, isOptional = false }: { filled: boolean; size?: number; isOptional?: boolean }) {
  const gradientId = isOptional ? "goldGrad" : "fireGrad";
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="fireGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#e0340e" />
            <stop offset="0.5" stopColor="#ff7a2e" />
            <stop offset="1" stopColor="#ffcf4a" />
          </linearGradient>
          <linearGradient id="goldGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#b45309" />
            <stop offset="0.5" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#fde047" />
          </linearGradient>
        </defs>
        {filled ? (
          <>
            <path
              d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"
              fill={`url(#${gradientId})`}
              stroke={isOptional ? "#f59e0b" : "#ff8a3d"}
              strokeWidth="0.5"
            />
            <path
              d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"
              fill="#fff"
              opacity={0.9}
            />
          </>
        ) : (
          <>
            <path
              d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"
              fill="rgba(255,255,255,0.03)"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="2"
            />
            <path
              d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"
              fill="rgba(255,255,255,0.05)"
              stroke="none"
            />
          </>
        )}
      </svg>
    </span>
  );
}

function FlamesRow({ value, size = 16, isOptional = false }: { value: number; size?: number; isOptional?: boolean }) {
  const count = Math.round(value);
  if (count <= 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <FlameIcon key={i} filled={true} size={size} isOptional={isOptional} />
      ))}
    </span>
  );
}

function RatingSelector({
  value,
  onChange,
  size = 32,
  isOptional = false
}: {
  value: number;
  onChange: (val: number) => void;
  size?: number;
  isOptional?: boolean;
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
          <FlameIcon filled={n <= shown} size={size} isOptional={isOptional} />
        </button>
      ))}
    </div>
  );
}

export function EmbersCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const COLORS = [
      'rgba(255, 218, 80, ',
      'rgba(255, 152, 46, ',
      'rgba(255, 102, 25, ',
      'rgba(230, 40, 10, ',
      'rgba(255, 75, 20, '
    ];

    interface Particle {
      x: number;
      y: number;
      size: number;
      color: string;
      speedY: number;
      speedX: number;
      alpha: number;
      decay: number;
      sway: number;
      swaySpeed: number;
    }

    const particles: Particle[] = [];
    // Throttle en movil: reducir particulas para mejor rendimiento
    const IS_MOBILE = (window.matchMedia && window.matchMedia('(max-width:767px)').matches) || window.innerWidth < 768;
    const MAX_PARTICLES = IS_MOBILE ? 20 : 60;

    const createParticle = (init = false): Particle => {
      const size = Math.random() * 2.5 + 1;
      return {
        x: Math.random() * width,
        y: init ? Math.random() * height : height + 20,
        size,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speedY: -(Math.random() * 0.8 + 0.3),
        speedX: Math.random() * 0.3 - 0.15,
        alpha: Math.random() * 0.5 + 0.2,
        decay: Math.random() * 0.0012 + 0.0006,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: Math.random() * 0.015 + 0.004
      };
    };

    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push(createParticle(true));
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.speedY;
        p.x += p.speedX + Math.sin(p.sway) * 0.2;
        p.sway += p.swaySpeed;
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.y < -10 || p.x < -10 || p.x > width + 10) {
          particles[i] = createParticle(false);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color + p.alpha + ')';
          ctx.fill();
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
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
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      backgroundImage: `
        radial-gradient(80% 60% at 50% -10%, rgba(224,52,14,0.06), transparent 75%),
        radial-gradient(60% 50% at 85% 5%, rgba(255,130,40,0.12), transparent 70%),
        radial-gradient(65% 55% at 15% 15%, rgba(255,90,30,0.12), transparent 70%),
        radial-gradient(75% 60% at 50% 110%, rgba(224,52,14,0.08), transparent 70%)
      `,
      padding: '0 16px 48px',
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative',
      overflowY: 'auto'
    }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <EmbersCanvas />
      <div style={{ maxWidth: 540, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 4px 14px', borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="rs-flame"><MechaMark size={32} /></span>
            <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.04em', fontFamily: SANS_SERIF }}>Mecha<span style={{ fontSize: 10, color: T.textTer, marginLeft: 6, border: `1px solid ${T.border}`, padding: '1px 4px', borderRadius: 4 }}>OS</span></span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, fontFamily: SANS_SERIF }}>
            Valorar visita
          </div>
        </div>

        <main style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 22, padding: 24, boxShadow: '0 16px 50px rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
              <div style={{ height: 18, width: 180, borderRadius: 8, background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ height: 44, width: 230, borderRadius: 10, background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ height: 88, borderRadius: 10, background: 'rgba(255,255,255,0.07)' }} />
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
                <span style={{ position: 'relative', display: 'inline-flex', width: 74, height: 74, borderRadius: '50%', background: '#101729', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(244,80,30,0.25)' }}>
                  <span className="rs-flame"><MechaMark size={38} /></span>
                </span>
              </div>
              <div style={{ fontFamily: SANS_SERIF, fontSize: 30, fontWeight: 800, color: T.text, marginBottom: 6, lineHeight: 1.05 }}>¡Gracias por tu opinión!</div>
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

              {/* INFO BOX ANÓNIMO */}
              <div style={{ background: 'rgba(244,80,30,0.04)', border: `1px solid rgba(244,80,30,0.15)`, borderRadius: 16, padding: 16, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left' }}>
                <div style={{ color: T.primary, fontSize: 18, lineHeight: 1 }}>💡</div>
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5 }}>
                  <strong style={{ color: T.text }}>Tus respuestas son 100% anónimas</strong> (el nombre es opcional). Tu feedback es vital: nos da la vida para seguir creciendo, ayuda a mejorar el servicio diario del salón y perfecciona nuestro software de reservas. ¡Gracias por ayudarnos!
                </div>
              </div>

              {/* SECCIÓN 1: EL SALÓN */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 14, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, fontFamily: SANS_SERIF, letterSpacing: -0.2 }}>
                  1. Tu visita al salón{negocio?.nombre ? `: ${negocio.nombre}` : ''}
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>
                    Valoración general del salón *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RatingSelector value={puntuacion} onChange={setPuntuacion} size={36} />
                    {puntuacion > 0 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.primaryHi }}>{ETIQUETAS[puntuacion]}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>
                      Trato recibido (opcional)
                    </label>
                    <RatingSelector value={salonTrato} onChange={setSalonTrato} size={24} isOptional={true} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>
                      Limpieza y productos (opcional)
                    </label>
                    <RatingSelector value={salonProductos} onChange={setSalonProductos} size={24} isOptional={true} />
                  </div>
                </div>

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>Comentario sobre tu visita (opcional)</label>
                <textarea className="rs-field" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="¿Qué destacarías de tu experiencia en el salón?" rows={3}
                  style={{ ...inputBase, resize: 'vertical' }} />
              </div>

              {/* SECCIÓN 2: EL SISTEMA DE RESERVAS */}
              <div style={{ background: 'rgba(244,80,30,0.03)', border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, marginBottom: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 14, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, fontFamily: SANS_SERIF, letterSpacing: -0.2 }}>
                  2. Sistema de reservas (Mecha)
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>
                    ¿Cómo valorarías el proceso de reserva online? (opcional)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RatingSelector value={mechaPuntuacion} onChange={setMechaPuntuacion} size={32} isOptional={true} />
                    {mechaPuntuacion > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>{ETIQUETAS[mechaPuntuacion]}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: T.textSec }}>Facilidad para reservar</span>
                    <RatingSelector value={mechaFacilidad} onChange={setMechaFacilidad} size={20} isOptional={true} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: T.textSec }}>Disponibilidad de huecos</span>
                    <RatingSelector value={mechaDisponibilidad} onChange={setMechaDisponibilidad} size={20} isOptional={true} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: T.textSec }}>Rapidez y seguridad de pago</span>
                    <RatingSelector value={mechaPagos} onChange={setMechaPagos} size={20} isOptional={true} />
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
