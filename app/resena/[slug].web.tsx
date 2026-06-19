import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { getPortalInfo, getResenasPublicas, crearResenaPublica, type PortalNegocio, type ResenaResumen } from '@/lib/reservaPublica';
import { PageLoader } from '@/components/ui/DesignComponents';

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
  .rs-field { color: #f6f8ff !important; background-color: #101729 !important; }
  .rs-field:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} }
  @media (prefers-reduced-motion: reduce) {
    .rs-step, .rs-flame { animation: none !important }
    .rs-cta, .rs-star { transition: none !important }
  }
  /* Grid de dos columnas que apila en movil (las columnas px fijas recortaban el
     selector de valoracion en pantallas estrechas). */
  .rs-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px }
  @media (max-width: 560px) { .rs-grid2 { grid-template-columns: 1fr; gap: 14px } }
`;

const ETIQUETAS = ['', 'Lo siento', 'Mejorable', 'Bien', 'Muy bien', '¡Excelente!'];

function FlameIcon({ filled, size = 24, isOptional = false }: { filled: boolean; size?: number; isOptional?: boolean }) {
  const gradientId = isOptional ? "blueGrad" : "fireGrad";
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="fireGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#e0340e" />
            <stop offset="0.5" stopColor="#ff7a2e" />
            <stop offset="1" stopColor="#ffcf4a" />
          </linearGradient>
          <linearGradient id="blueGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#0284c7" />
            <stop offset="0.5" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#7dd3fc" />
          </linearGradient>
        </defs>
        {filled ? (
          <>
            <path
              d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"
              fill={`url(#${gradientId})`}
              stroke={isOptional ? "#38bdf8" : "#ff8a3d"}
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

  if (loading) {
    return <PageLoader message="Cargando portal de valoración..." />;
  }

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '24px 4px 14px', borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, padding: '4px 8px', borderRadius: 8 }}>
              <span className="rs-flame" style={{ display: 'inline-flex' }}><MechaMark size={14} /></span>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '0.8px' }}>mecha</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, fontFamily: SANS_SERIF }}>
              Valorar visita
            </div>
          </div>
          {negocio?.nombre && (
            <h1 style={{ margin: '8px 0 0', fontFamily: SANS_SERIF, fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 800, color: T.text, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {negocio.nombre}
            </h1>
          )}
        </div>

        <main style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 22, padding: 24, boxShadow: '0 16px 50px rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          {notFound ? (
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
              <div style={{ fontSize: 14.5, color: T.textSec, marginBottom: 24 }}>Nos ayuda muchísimo a mejorar el servicio.</div>

              {/* Botón Google Maps */}
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20, marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <p style={{ fontSize: 13.5, color: T.textSec, margin: 0, maxWidth: 360, lineHeight: 1.5 }}>
                  ¿Te gustaría seguir ayudándonos? También puedes dejar una reseña en Google Maps para que más personas nos conozcan:
                </p>
                <a className="rs-cta"
                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((negocio?.nombre || '') + ' ' + (negocio?.direccion || ''))}`}
                   target="_blank"
                   rel="noreferrer"
                   style={{
                     display: 'inline-flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     gap: 8,
                     padding: '12px 20px',
                     borderRadius: 12,
                     background: 'rgba(255,255,255,0.06)',
                     border: `1.5px solid ${T.border}`,
                     color: T.text,
                     fontSize: 14,
                     fontWeight: 700,
                     textDecoration: 'none',
                     boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                   }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  Dejar reseña en Google Maps
                </a>
              </div>
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

              {/* INFO BOX ANÓNIMO MÍNIMO */}
              <div style={{ textAlign: 'center', marginBottom: 24, padding: '4px 0' }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #ff7a2e 0%, #ffcf4a 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.02em',
                  fontFamily: SANS_SERIF
                }}>
                  🔒 Valoración 100% anónima · Tu feedback nos ayuda a mejorar
                </span>
              </div>

              {/* BLOQUE 1: OBLIGATORIO PARA CONTINUAR */}
              <div style={{
                border: `1.5px solid ${T.primary}`,
                background: 'rgba(244, 80, 30, 0.05)',
                borderRadius: 16,
                padding: '20px 20px 24px',
                marginBottom: 26,
                position: 'relative',
                boxShadow: '0 4px 20px rgba(244,80,30,0.06)'
              }}>
                {/* Badge */}
                <div style={{
                  position: 'absolute',
                  top: -12,
                  right: 16,
                  background: T.primary,
                  color: '#fff',
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 20,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  boxShadow: '0 4px 10px rgba(244,80,30,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  Obligatorio
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 12, fontFamily: SANS_SERIF, letterSpacing: -0.2 }}>
                  1. Valoración general del salón
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: T.textSec, marginBottom: 8 }}>
                    ¿Cómo calificarías tu experiencia general en {negocio?.nombre || 'el salón'}? *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <RatingSelector value={puntuacion} onChange={setPuntuacion} size={36} />
                    {puntuacion > 0 && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.primaryHi }}>{ETIQUETAS[puntuacion]}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* BLOQUE 2: OPCIONAL / VOLUNTARIO */}
              <div style={{
                border: `1.5px dashed rgba(255, 255, 255, 0.14)`,
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 16,
                padding: 20,
                marginBottom: 24,
                position: 'relative'
              }}>
                {/* Badge */}
                <div style={{
                  position: 'absolute',
                  top: -12,
                  right: 16,
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: `1px solid rgba(56, 189, 248, 0.35)`,
                  color: '#38bdf8',
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 20,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  Opcional / Voluntario
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, color: T.textTer, marginBottom: 18, fontFamily: SANS_SERIF, letterSpacing: -0.2 }}>
                  2. Detalles adicionales (Si quieres ayudarnos más)
                </div>

                {/* Detalles de la visita */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: SANS_SERIF }}>
                    Sobre el servicio recibido:
                  </div>
                  <div className="rs-grid2" style={{ marginBottom: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: T.textTer, marginBottom: 6 }}>
                        Trato recibido
                      </label>
                      <RatingSelector value={salonTrato} onChange={setSalonTrato} size={22} isOptional={true} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: T.textTer, marginBottom: 6 }}>
                        Limpieza y productos
                      </label>
                      <RatingSelector value={salonProductos} onChange={setSalonProductos} size={22} isOptional={true} />
                    </div>
                  </div>

                  <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>¿Quieres dejar un comentario?</label>
                  <textarea className="rs-field" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="¿Qué destacarías de tu experiencia en el salón?" rows={3}
                    style={{ ...inputBase, resize: 'vertical' }} />
                </div>

                {/* Sistema de reservas */}
                <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 16, marginTop: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: SANS_SERIF }}>
                    Sobre el proceso de reserva online (Mecha):
                  </div>
                  
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>
                      ¿Cómo valorarías el proceso de reserva online?
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <RatingSelector value={mechaPuntuacion} onChange={setMechaPuntuacion} size={26} isOptional={true} />
                      {mechaPuntuacion > 0 && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>{ETIQUETAS[mechaPuntuacion]}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, background: 'rgba(255,255,255,0.015)', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.textTer }}>Facilidad para reservar</span>
                      <RatingSelector value={mechaFacilidad} onChange={setMechaFacilidad} size={18} isOptional={true} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.textTer }}>Disponibilidad de huecos</span>
                      <RatingSelector value={mechaDisponibilidad} onChange={setMechaDisponibilidad} size={18} isOptional={true} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.textTer }}>Rapidez y seguridad de pago</span>
                      <RatingSelector value={mechaPagos} onChange={setMechaPagos} size={18} isOptional={true} />
                    </div>
                  </div>

                  <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>¿Qué mejorarías del sistema de reserva?</label>
                  <textarea className="rs-field" value={mechaMejora} onChange={e => setMechaMejora(e.target.value)} placeholder="Sugerencias para hacer el proceso aún más fácil..." rows={2}
                    style={{ ...inputBase, resize: 'vertical' }} />
                </div>

                {/* Identificación */}
                <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 16, marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: 12.5, color: T.textSec, marginBottom: 6 }}>Tu nombre (opcional)</label>
                  <input className="rs-field" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Carlos M. (se mostrará públicamente)" style={inputBase} />
                </div>
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
