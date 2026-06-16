import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { MechaMark } from '@/components/ui/MechaMark';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#241a14',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  blue: '#3b6ef5',
  blueSoft: 'rgba(59,110,245,0.10)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.14)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';

const ANIMATIONS = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes barGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .resena-card { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
  .rv-bar-fill { transform-origin: left; animation: barGrow 0.6s cubic-bezier(0.16,1,0.3,1) both; }
  .rv-chip { transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; cursor: pointer; }
  .rv-iconbtn { transition: background 0.15s ease; }
  @media (prefers-reduced-motion: reduce) {
    .resena-card, .rv-bar-fill { animation: none !important; }
  }
`;

interface Resena {
  id: string;
  puntuacion: number;
  comentario: string | null;
  autor_nombre: string | null;
  created_at: string;
  visible: boolean;
  fuente: string | null;
  cita_id: string | null;
  salon_trato_puntuacion: number | null;
  salon_productos_puntuacion: number | null;
  mecha_puntuacion: number | null;
  mecha_comentario: string | null;
  mecha_facilidad_puntuacion: number | null;
  mecha_disponibilidad_puntuacion: number | null;
  mecha_pagos_puntuacion: number | null;
  mecha_mejora_comentario: string | null;
}

// Icono generico (hex explicito en stroke/fill por la trampa del color global).
const Icon = ({ name, size = 18, color = TOKENS.text }: { name: string; size?: number; color?: string }) => {
  const icons: Record<string, string> = {
    eye: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`,
    eyeOff: `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`,
    trash: `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`,
    search: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
    shield: `<path d="M9 12l2 2 4-4"/><path d="M21 12c0 5-3.5 7.5-8.5 9C7.5 19.5 4 17 4 12V6l8-3 8 3v6z"/>`,
    message: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
    users: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    bolt: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
    smile: `<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>`,
  };
  return <div style={{ display: 'inline-flex', color, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>` }} />;
};

// Fueguito (la "mecha"): MechaMark relleno / atenuado. Reemplaza las estrellas.
function Fueguito({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', lineHeight: 0, opacity: filled ? 1 : 0.2, filter: filled ? 'drop-shadow(0 1px 3px rgba(244,80,30,0.3))' : 'grayscale(0.95)' }}>
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

function avgOf(nums: (number | null)[]): number {
  const v = nums.filter((n): n is number => typeof n === 'number' && n > 0);
  if (!v.length) return 0;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

type Filtro = 'todas' | 'verificadas' | 'ocultas' | '5' | '4' | '3' | '2' | '1';
type Orden = 'recientes' | 'mejor' | 'peor';

export default function ResenasScreen() {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [orden, setOrden] = useState<Orden>('recientes');

  const cargar = async () => {
    setLoading(true);
    const profile = await getUserProfile();
    const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    const { data } = await supabase
      .from('resenas')
      .select('id, puntuacion, comentario, autor_nombre, created_at, visible, fuente, cita_id, salon_trato_puntuacion, salon_productos_puntuacion, mecha_puntuacion, mecha_comentario, mecha_facilidad_puntuacion, mecha_disponibilidad_puntuacion, mecha_pagos_puntuacion, mecha_mejora_comentario')
      .eq('negocio_id', nId)
      .order('created_at', { ascending: false });
    if (data) setResenas(data as Resena[]);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const toggleVisibility = async (id: string, current: boolean) => {
    const next = !current;
    setResenas(prev => prev.map(r => r.id === id ? { ...r, visible: next } : r));
    await supabase.from('resenas').update({ visible: next }).eq('id', id);
  };

  const deleteResena = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('¿Seguro que quieres eliminar esta reseña? No se puede deshacer.')) return;
    setResenas(prev => prev.filter(r => r.id !== id));
    await supabase.from('resenas').delete().eq('id', id);
  };

  // Agregados (sobre las visibles para las metricas publicas) ----------------
  const stats = useMemo(() => {
    const total = resenas.length;
    const media = total ? Math.round((resenas.reduce((a, r) => a + r.puntuacion, 0) / total) * 10) / 10 : 0;
    const verificadas = resenas.filter(r => r.cita_id).length;
    const dist = [5, 4, 3, 2, 1].map(n => ({ n, count: resenas.filter(r => r.puntuacion === n).length }));
    const pos = resenas.filter(r => r.puntuacion >= 4).length;
    const neu = resenas.filter(r => r.puntuacion === 3).length;
    const neg = resenas.filter(r => r.puntuacion <= 2).length;
    const trato = avgOf(resenas.map(r => r.salon_trato_puntuacion));
    const productos = avgOf(resenas.map(r => r.salon_productos_puntuacion));
    // Sobre el sistema (Mecha)
    const conMecha = resenas.filter(r => r.mecha_puntuacion);
    const mechaMedia = avgOf(resenas.map(r => r.mecha_puntuacion));
    const mechaFac = avgOf(resenas.map(r => r.mecha_facilidad_puntuacion));
    const mechaDisp = avgOf(resenas.map(r => r.mecha_disponibilidad_puntuacion));
    const mechaPagos = avgOf(resenas.map(r => r.mecha_pagos_puntuacion));
    return { total, media, verificadas, dist, pos, neu, neg, trato, productos, mechaMedia, mechaCount: conMecha.length, mechaFac, mechaDisp, mechaPagos };
  }, [resenas]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = resenas.filter(r => {
      if (filtro === 'verificadas' && !r.cita_id) return false;
      if (filtro === 'ocultas' && r.visible) return false;
      if (['5', '4', '3', '2', '1'].includes(filtro) && r.puntuacion !== Number(filtro)) return false;
      if (q) {
        const hay = `${r.autor_nombre || 'anonimo'} ${r.comentario || ''} ${r.mecha_comentario || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      if (orden === 'mejor') return b.puntuacion - a.puntuacion || +new Date(b.created_at) - +new Date(a.created_at);
      if (orden === 'peor') return a.puntuacion - b.puntuacion || +new Date(b.created_at) - +new Date(a.created_at);
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
    return arr;
  }, [resenas, query, filtro, orden]);

  if (loading) {
    return (
      <div style={{ padding: isMobile ? 24 : 40, fontFamily: 'Inter, system-ui, sans-serif', color: TOKENS.text }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Reseñas</div>
        <div style={{ color: TOKENS.textSec }}>Cargando valoraciones...</div>
      </div>
    );
  }

  const pad = isMobile ? '20px 16px 48px' : '40px 48px';

  return (
    <div style={{ minHeight: '100vh', background: TOKENS.bg, padding: pad, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS }} />
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* Cabecera */}
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: isMobile ? 25 : 32, fontWeight: 800, color: TOKENS.text, margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>Reseñas del salón</h1>
          <p style={{ margin: 0, fontSize: isMobile ? 13.5 : 15, color: TOKENS.textSec }}>Lo que opinan tus clientes de su experiencia.</p>
        </header>

        {resenas.length === 0 ? (
          <div style={{ padding: isMobile ? '40px 20px' : 60, textAlign: 'center', background: TOKENS.bgPanel, border: `1px dashed ${TOKENS.borderHi}`, borderRadius: 16 }}>
            <div style={{ display: 'inline-flex', padding: 14, background: TOKENS.primarySoft, borderRadius: '50%', marginBottom: 14 }}>
              <MechaMark size={30} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.text, marginBottom: 8 }}>Aún no hay reseñas</div>
            <div style={{ fontSize: 14.5, color: TOKENS.textSec, maxWidth: 420, margin: '0 auto' }}>
              Cuando tus clientes valoren desde el portal o su QR, aparecerán aquí con sus estadísticas.
            </div>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))', gap: isMobile ? 10 : 14, marginBottom: 14 }}>
              <KpiMedia media={stats.media} total={stats.total} isMobile={isMobile} />
              <Kpi label="Valoraciones" value={String(stats.total)} icon="message" tint={TOKENS.blue} tintSoft={TOKENS.blueSoft} isMobile={isMobile} />
              <Kpi label="Verificadas" value={String(stats.verificadas)} icon="shield" tint={TOKENS.success} tintSoft={TOKENS.successSoft} isMobile={isMobile} sub="visita real" />
              <Kpi label="Positivas" value={stats.total ? `${Math.round((stats.pos / stats.total) * 100)}%` : '-'} icon="smile" tint={TOKENS.primary} tintSoft={TOKENS.primarySoft} isMobile={isMobile} />
            </div>

            {/* Graficas: distribucion + sentimiento/detalle */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Card>
                <CardTitle>Distribución</CardTitle>
                {stats.dist.map(d => (
                  <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, width: 34, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: TOKENS.text }}>{d.n}</span>
                      <Fueguito filled size={13} />
                    </span>
                    <span style={{ flex: 1, height: 10, background: TOKENS.bgCardHi, borderRadius: 999, overflow: 'hidden' }}>
                      <span className="rv-bar-fill" style={{ display: 'block', height: '100%', width: `${stats.total ? (d.count / stats.total) * 100 : 0}%`, background: FIRE, borderRadius: 999 }} />
                    </span>
                    <span style={{ width: 26, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: TOKENS.textSec, flexShrink: 0 }}>{d.count}</span>
                  </div>
                ))}
              </Card>

              <Card>
                <CardTitle>Sentimiento</CardTitle>
                <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: TOKENS.bgCardHi, marginBottom: 14 }}>
                  {stats.pos > 0 && <span className="rv-bar-fill" style={{ width: `${(stats.pos / stats.total) * 100}%`, background: TOKENS.success }} />}
                  {stats.neu > 0 && <span className="rv-bar-fill" style={{ width: `${(stats.neu / stats.total) * 100}%`, background: TOKENS.warning }} />}
                  {stats.neg > 0 && <span className="rv-bar-fill" style={{ width: `${(stats.neg / stats.total) * 100}%`, background: TOKENS.danger }} />}
                </div>
                <SentLegend color={TOKENS.success} label="Positivas (4-5)" n={stats.pos} />
                <SentLegend color={TOKENS.warning} label="Neutras (3)" n={stats.neu} />
                <SentLegend color={TOKENS.danger} label="Mejorables (1-2)" n={stats.neg} />
                {(stats.trato > 0 || stats.productos > 0) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stats.trato > 0 && <ScoreBar label="Trato" value={stats.trato} />}
                    {stats.productos > 0 && <ScoreBar label="Productos" value={stats.productos} />}
                  </div>
                )}
              </Card>
            </div>

            {/* Bloque opcional: opiniones sobre la reserva online (Mecha) */}
            {stats.mechaCount > 0 && (
              <Card style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: TOKENS.blueSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="bolt" size={14} color={TOKENS.blue} /></span>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: TOKENS.text }}>Sobre la reserva online</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FueguitosRow value={stats.mechaMedia} size={14} /><span style={{ fontSize: 13, fontWeight: 800, color: TOKENS.text }}>{stats.mechaMedia}</span></span>
                  <span style={{ fontSize: 12, color: TOKENS.textTer }}>· {stats.mechaCount}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 10 }}>
                  {stats.mechaFac > 0 && <ScoreBar label="Facilidad" value={stats.mechaFac} blue />}
                  {stats.mechaDisp > 0 && <ScoreBar label="Disponibilidad" value={stats.mechaDisp} blue />}
                  {stats.mechaPagos > 0 && <ScoreBar label="Pagos" value={stats.mechaPagos} blue />}
                </div>
              </Card>
            )}

            {/* Nota de verificacion humana */}
            <div style={{ display: 'flex', gap: 10, padding: '11px 14px', borderRadius: 12, background: TOKENS.successSoft, border: `1px solid rgba(15,157,107,0.22)`, marginBottom: 18 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="shield" size={16} color={TOKENS.success} /></span>
              <span style={{ fontSize: 12.5, color: TOKENS.textSec, lineHeight: 1.45 }}>
                <strong style={{ color: TOKENS.text }}>Visita verificada.</strong> Las reseñas marcadas con el escudo provienen de un cliente con una cita real en tu salón: así demuestras que son de personas, no de bots.
              </span>
            </div>

            {/* Toolbar: buscador + filtros + orden */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '1 1 260px', minWidth: 0 }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><Icon name="search" size={15} color={TOKENS.textTer} /></span>
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o comentario..."
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 34px', borderRadius: 12, border: `1.5px solid ${TOKENS.border}`, background: TOKENS.bgCard, fontSize: 14, color: TOKENS.text, outline: 'none', fontFamily: 'inherit' }}
                  />
                </span>
                <select value={orden} onChange={e => setOrden(e.target.value as Orden)}
                  style={{ padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${TOKENS.border}`, background: TOKENS.bgCard, fontSize: 13.5, fontWeight: 600, color: TOKENS.text, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="recientes">Más recientes</option>
                  <option value="mejor">Mejor valoradas</option>
                  <option value="peor">Peor valoradas</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {([['todas', 'Todas'], ['verificadas', 'Verificadas'], ['5', '5'], ['4', '4'], ['3', '3'], ['2', '2'], ['1', '1'], ['ocultas', 'Ocultas']] as [Filtro, string][]).map(([key, label]) => {
                  const on = filtro === key;
                  const isNum = ['5', '4', '3', '2', '1'].includes(key);
                  return (
                    <button key={key} className="rv-chip" onClick={() => setFiltro(key)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 999, border: `1.5px solid ${on ? TOKENS.primary : TOKENS.border}`, background: on ? TOKENS.primary : TOKENS.bgCard, color: on ? '#fff' : TOKENS.textSec, fontSize: 12.5, fontWeight: 700 }}>
                      {label}{isNum && <Fueguito filled={on ? false : true} size={11} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista de reseñas */}
            {visibles.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', background: TOKENS.bgPanel, border: `1px dashed ${TOKENS.borderHi}`, borderRadius: 16, color: TOKENS.textSec, fontSize: 14 }}>
                No hay reseñas que coincidan con el filtro.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                {visibles.map((r, i) => (
                  <ReviewCard key={r.id} r={r} i={i} onToggle={toggleVisibility} onDelete={deleteResena} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Subcomponentes ---------------------------------------------------------

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 18, boxShadow: '0 6px 20px rgba(40,30,24,0.03)', ...style }}>
      {children}
    </div>
  );
}
function CardTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 800, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>{children}</div>;
}

function KpiMedia({ media, total, isMobile }: { media: number; total: number; isMobile: boolean }) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: isMobile ? '13px 14px' : '16px 18px', boxShadow: '0 6px 20px rgba(40,30,24,0.03)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Media</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: isMobile ? 28 : 34, fontWeight: 800, color: TOKENS.text, lineHeight: 1 }}>{media || '-'}</span>
        <span style={{ fontSize: 13, color: TOKENS.textTer }}>/ 5</span>
      </div>
      <div style={{ marginTop: 7 }}><FueguitosRow value={media} size={isMobile ? 14 : 16} /></div>
    </div>
  );
}

function Kpi({ label, value, icon, tint, tintSoft, isMobile, sub }: { label: string; value: string; icon: string; tint: string; tintSoft: string; isMobile: boolean; sub?: string }) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: isMobile ? '13px 14px' : '16px 18px', boxShadow: '0 6px 20px rgba(40,30,24,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: tintSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={14} color={tint} /></span>
      </div>
      <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: TOKENS.text, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SentLegend({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12.5, color: TOKENS.textSec }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: TOKENS.text }}>{n}</span>
    </div>
  );
}

function ScoreBar({ label, value, blue }: { label: string; value: number; blue?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: TOKENS.textSec, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: TOKENS.text }}>{value}</span>
      </div>
      <span style={{ display: 'block', height: 7, background: TOKENS.bgCardHi, borderRadius: 999, overflow: 'hidden' }}>
        <span className="rv-bar-fill" style={{ display: 'block', height: '100%', width: `${(value / 5) * 100}%`, background: blue ? TOKENS.blue : FIRE, borderRadius: 999 }} />
      </span>
    </div>
  );
}

function VerifBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: TOKENS.success, background: TOKENS.successSoft, padding: '3px 8px', borderRadius: 999 }}>
      <Icon name="shield" size={11} color={TOKENS.success} /> Visita verificada
    </span>
  );
}

function ReviewCard({ r, i, onToggle, onDelete }: { r: Resena; i: number; onToggle: (id: string, cur: boolean) => void; onDelete: (id: string) => void }) {
  const subChips: { label: string; value: number; blue?: boolean }[] = [];
  if (r.salon_trato_puntuacion) subChips.push({ label: 'Trato', value: r.salon_trato_puntuacion });
  if (r.salon_productos_puntuacion) subChips.push({ label: 'Productos', value: r.salon_productos_puntuacion });
  if (r.mecha_facilidad_puntuacion) subChips.push({ label: 'Facilidad', value: r.mecha_facilidad_puntuacion, blue: true });
  if (r.mecha_disponibilidad_puntuacion) subChips.push({ label: 'Disponib.', value: r.mecha_disponibilidad_puntuacion, blue: true });
  if (r.mecha_pagos_puntuacion) subChips.push({ label: 'Pagos', value: r.mecha_pagos_puntuacion, blue: true });

  return (
    <div className="resena-card" style={{
      animationDelay: `${Math.min(i, 8) * 0.04}s`,
      background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 18,
      display: 'flex', flexDirection: 'column', opacity: r.visible ? 1 : 0.6, transition: 'opacity 0.2s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: TOKENS.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: TOKENS.primary, fontSize: 15, flexShrink: 0 }}>
            {(r.autor_nombre || 'A')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: TOKENS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.autor_nombre || 'Anónimo'}</div>
            <div style={{ fontSize: 12.5, color: TOKENS.textTer }}>{format(parseISO(r.created_at), "d MMM yyyy", { locale: es })}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button className="rv-iconbtn" onClick={() => onToggle(r.id, r.visible)} title={r.visible ? 'Ocultar del portal público' : 'Mostrar en el portal público'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.visible ? TOKENS.primary : TOKENS.textTer, padding: 6, borderRadius: 8, display: 'flex' }}>
            <Icon name={r.visible ? 'eye' : 'eyeOff'} size={17} color={r.visible ? TOKENS.primary : TOKENS.textTer} />
          </button>
          <button className="rv-iconbtn" onClick={() => onDelete(r.id)} title="Eliminar reseña"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.danger, padding: 6, borderRadius: 8, display: 'flex' }}>
            <Icon name="trash" size={17} color={TOKENS.danger} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <FueguitosRow value={r.puntuacion} size={16} />
        {r.cita_id && <VerifBadge />}
      </div>

      {r.comentario ? (
        <div style={{ fontSize: 14, color: TOKENS.textSec, lineHeight: 1.5, flex: 1 }}>&ldquo;{r.comentario}&rdquo;</div>
      ) : (
        <div style={{ fontSize: 13.5, color: TOKENS.textTer, fontStyle: 'italic', flex: 1 }}>Sin comentario.</div>
      )}

      {subChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {subChips.map(c => (
            <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: c.blue ? TOKENS.blue : TOKENS.textSec, background: c.blue ? TOKENS.blueSoft : TOKENS.bgCardHi, padding: '3px 9px', borderRadius: 999 }}>
              {c.label} <strong style={{ color: c.blue ? TOKENS.blue : TOKENS.text }}>{c.value}</strong>
            </span>
          ))}
        </div>
      )}

      {(r.mecha_comentario || r.mecha_mejora_comentario) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {r.mecha_comentario && <div style={{ fontSize: 12.5, color: TOKENS.textSec, lineHeight: 1.4 }}><span style={{ color: TOKENS.blue, fontWeight: 700 }}>Reserva online:</span> {r.mecha_comentario}</div>}
          {r.mecha_mejora_comentario && <div style={{ fontSize: 12.5, color: TOKENS.textTer, lineHeight: 1.4 }}><span style={{ fontWeight: 700 }}>Mejora:</span> {r.mecha_mejora_comentario}</div>}
        </div>
      )}

      {!r.visible && (
        <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 600, color: TOKENS.textTer, display: 'flex', alignItems: 'center', gap: 6, background: TOKENS.bgCardHi, padding: '6px 10px', borderRadius: 8, alignSelf: 'flex-start' }}>
          <Icon name="eyeOff" size={13} color={TOKENS.textTer} /> Oculta al público
        </div>
      )}
    </div>
  );
}
