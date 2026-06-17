import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  star: '#f59e0b',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
};

const ANIMATIONS = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .resena-card { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
`;

interface Resena {
  id: string;
  puntuacion: number;
  comentario: string | null;
  autor_nombre: string | null;
  created_at: string;
  visible: boolean;
  fuente: string | null;
}

const Icon = ({ name, size = 20, color = TOKENS.text }: any) => {
  const icons: any = {
    star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color === TOKENS.star ? color : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    eye: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

function StarsRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Icon key={n} name="star" size={size} color={n <= Math.round(value) ? TOKENS.star : TOKENS.borderHi} />
      ))}
    </span>
  );
}

export default function ResenasScreen() {
  const [loading, setLoading] = useState(true);
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [negocioId, setNegocioId] = useState('');

  const cargar = async () => {
    setLoading(true);
    const profile = await getUserProfile();
    const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    setNegocioId(nId);

    const { data } = await supabase
      .from('resenas')
      .select('id, puntuacion, comentario, autor_nombre, created_at, visible, fuente')
      .eq('negocio_id', nId)
      .order('created_at', { ascending: false });

    if (data) setResenas(data);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const toggleVisibility = async (id: string, current: boolean) => {
    const next = !current;
    setResenas(prev => prev.map(r => r.id === id ? { ...r, visible: next } : r));
    await supabase.from('resenas').update({ visible: next }).eq('id', id);
  };

  const deleteResena = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar esta reseña? No se puede deshacer.')) return;
    setResenas(prev => prev.filter(r => r.id !== id));
    await supabase.from('resenas').delete().eq('id', id);
  };

  const media = useMemo(() => {
    if (resenas.length === 0) return 0;
    const sum = resenas.reduce((acc, r) => acc + r.puntuacion, 0);
    return Math.round((sum / resenas.length) * 10) / 10;
  }, [resenas]);

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, system-ui, sans-serif', color: TOKENS.text }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Reseñas</div>
        <div style={{ color: TOKENS.textSec }}>Cargando valoraciones...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: TOKENS.bg, padding: '40px 48px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS }} />

      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <header style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: TOKENS.text, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Reseñas de clientes</h1>
            <p style={{ margin: 0, fontSize: 15, color: TOKENS.textSec }}>
              Descubre qué piensan tus clientes de su experiencia.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: TOKENS.bgCard, padding: '16px 24px', borderRadius: 16, border: `1px solid ${TOKENS.border}`, boxShadow: '0 8px 30px rgba(40,30,24,0.04)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Puntuación media</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: TOKENS.text, lineHeight: 1 }}>{media || '-'}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <StarsRow value={media} size={18} />
                  <span style={{ fontSize: 12, color: TOKENS.textSec, fontWeight: 600 }}>{resenas.length} valoraciones</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {resenas.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', background: TOKENS.bgPanel, border: `1px dashed ${TOKENS.borderHi}`, borderRadius: 16 }}>
            <div style={{ display: 'inline-flex', padding: 16, background: TOKENS.primarySoft, borderRadius: '50%', marginBottom: 16 }}>
              <Icon name="star" size={32} color={TOKENS.primary} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.text, marginBottom: 8 }}>Aún no hay reseñas</div>
            <div style={{ fontSize: 15, color: TOKENS.textSec, maxWidth: 400, margin: '0 auto' }}>
              Cuando los clientes dejen valoraciones en tu portal público, aparecerán aquí automáticamente.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
            {resenas.map((r, i) => (
              <div key={r.id} className="resena-card" style={{
                animationDelay: `${i * 0.05}s`,
                background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 20,
                display: 'flex', flexDirection: 'column',
                opacity: r.visible ? 1 : 0.65,
                transition: 'opacity 0.2s ease',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: TOKENS.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: TOKENS.primary, fontSize: 16 }}>
                      {(r.autor_nombre || 'A')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text }}>{r.autor_nombre || 'Anónimo'}</div>
                      <div style={{ fontSize: 13, color: TOKENS.textTer }}>{format(parseISO(r.created_at), "d MMM yyyy", { locale: es })}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => toggleVisibility(r.id, r.visible)}
                      title={r.visible ? "Ocultar del portal público" : "Mostrar en el portal público"}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.visible ? TOKENS.primary : TOKENS.textTer, padding: 6, borderRadius: 8, display: 'flex' }}
                      onMouseEnter={e => e.currentTarget.style.background = TOKENS.bgCardHi}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <Icon name={r.visible ? 'eye' : 'eyeOff'} size={18} color="currentColor" />
                    </button>
                    <button
                      onClick={() => deleteResena(r.id)}
                      title="Eliminar reseña"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.danger, padding: 6, borderRadius: 8, display: 'flex' }}
                      onMouseEnter={e => e.currentTarget.style.background = TOKENS.dangerSoft}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <Icon name="trash" size={18} color="currentColor" />
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <StarsRow value={r.puntuacion} size={16} />
                </div>

                {r.comentario ? (
                  <div style={{ fontSize: 14.5, color: TOKENS.textSec, lineHeight: 1.5, flex: 1 }}>
                    "{r.comentario}"
                  </div>
                ) : (
                  <div style={{ fontSize: 14.5, color: TOKENS.textTer, fontStyle: 'italic', flex: 1 }}>
                    Sin comentario adicional.
                  </div>
                )}

                {!r.visible && (
                  <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: TOKENS.textTer, display: 'flex', alignItems: 'center', gap: 6, background: TOKENS.bgCardHi, padding: '6px 10px', borderRadius: 6, alignSelf: 'flex-start' }}>
                    <Icon name="eyeOff" size={14} color={TOKENS.textTer} /> Oculta al público
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
