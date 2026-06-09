import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { getPortalInfo, getResenasPublicas, crearResenaPublica, type PortalNegocio, type ResenaResumen } from '@/lib/reservaPublica';

const T = {
  bg: '#f6f1ea', panel: '#fffdfb', card: '#ffffff', cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)', text: '#1c1814', textSec: '#5c5249', textTer: '#8a7d70',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  star: '#f59e0b', success: '#0f9d6b', successSoft: 'rgba(15,157,107,0.12)', danger: '#e23b34',
};

const ANIM = `
  @keyframes rsUp { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform: translateY(0) } }
  .rs-step { animation: rsUp 0.4s cubic-bezier(0.16,1,0.3,1) both }
  .rs-btn { transition: all 0.15s ease; cursor: pointer }
  .rs-btn:hover { filter: brightness(1.05) }
  .rs-star { transition: transform 0.12s ease; cursor: pointer; background: none; border: none; padding: 2px }
  .rs-star:hover { transform: scale(1.15) }
`;

function Star({ filled, size = 34 }: { filled: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', color: filled ? T.star : 'rgba(40,30,24,0.18)' }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
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
    if (puntuacion < 1) { setError('Elige una puntuacion.'); return; }
    setEnviando(true);
    try {
      await crearResenaPublica({ slug, puntuacion, comentario: comentario.trim() || undefined, autorNombre: nombre.trim() || undefined });
      setEnviado(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la valoracion.');
    } finally {
      setEnviando(false);
    }
  }, [slug, puntuacion, comentario, nombre]);

  const shown = hover || puntuacion;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '0 16px 48px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 4px 18px' }}>
          <MechaMark size={34} />
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: -0.3 }}>
            {negocio?.nombre || 'Tu opinión'}
          </div>
        </header>

        <main style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 18, padding: 24, boxShadow: '0 10px 40px rgba(40,30,24,0.06)' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textTer }}>Cargando…</div>
          ) : notFound ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No disponible</div>
              <div style={{ fontSize: 14, color: T.textSec }}>Este salon no tiene activadas las valoraciones.</div>
            </div>
          ) : enviado ? (
            <div className="rs-step" style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ display: 'inline-flex', width: 60, height: 60, borderRadius: '50%', background: T.successSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <span style={{ display: 'inline-flex', color: T.success }} dangerouslySetInnerHTML={{ __html: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 6 }}>¡Gracias por tu opinión!</div>
              <div style={{ fontSize: 14, color: T.textSec }}>Nos ayuda muchísimo a mejorar.</div>
            </div>
          ) : (
            <div className="rs-step">
              {resumen && resumen.total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                  <StarsRow value={resumen.media} size={16} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{resumen.media}</span>
                  <span style={{ fontSize: 13, color: T.textTer }}>· {resumen.total} valoracion{resumen.total === 1 ? '' : 'es'}</span>
                </div>
              )}

              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 14 }}>¿Qué tal tu experiencia?</div>

              <div style={{ display: 'flex', gap: 4, marginBottom: 18 }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} className="rs-star" onMouseEnter={() => setHover(n)} onClick={() => setPuntuacion(n)} aria-label={`${n} estrellas`}>
                    <Star filled={n <= shown} size={38} />
                  </button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 5 }}>Comentario (opcional)</label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="¿Qué te ha gustado? ¿Qué mejorarías?" rows={3}
                style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 14, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 5 }}>Tu nombre (opcional)</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Cómo quieres aparecer"
                style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 14, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />

              {error && <div style={{ marginTop: 12, fontSize: 13, color: T.danger }}>{error}</div>}

              <button className="rs-btn" onClick={enviar} disabled={enviando}
                style={{ width: '100%', marginTop: 18, padding: '14px', borderRadius: 12, border: 'none', background: T.primary, color: '#fff', fontSize: 15, fontWeight: 700, opacity: enviando ? 0.6 : 1 }}>
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
