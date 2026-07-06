import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { useChispaSugerencia } from '@/lib/hooks/useChispaSugerencia';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { PageLoader } from '@/components/ui/DesignComponents';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualResenas } from '@/lib/manuals/resenas';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { BloqueRenderer } from '@/components/chispa/BloqueRenderer.web';
import type { Bloque } from '@/lib/chispaBloques';

const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  star: '#f59e0b',
  gold: '#d97706',
  goldSoft: 'rgba(217,119,6,0.12)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
};

const ANIMATIONS = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .resena-card { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
  .stat-card { animation: slideInUp 0.35s cubic-bezier(0.16,1,0.3,1) both; }
  .rs-chip { transition: all 0.16s cubic-bezier(0.16,1,0.3,1); }
  @media (prefers-reduced-motion: reduce) {
    .resena-card, .stat-card { animation: none !important; }
    .rs-chip { transition: none !important; }
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
  mecha_puntuacion?: number | null;
  mecha_comentario?: string | null;
  salon_trato_puntuacion?: number | null;
  salon_productos_puntuacion?: number | null;
  mecha_facilidad_puntuacion?: number | null;
  mecha_disponibilidad_puntuacion?: number | null;
  mecha_pagos_puntuacion?: number | null;
  mecha_mejora_comentario?: string | null;
  respuesta_borrador?: string | null; // Sesion 9-A: borrador de respuesta generado por Chispa
}

// Metricas valorables: cada subcategoria del salon y de Mecha Reservas.
type MetricKey =
  | 'puntuacion'
  | 'salon_trato_puntuacion'
  | 'salon_productos_puntuacion'
  | 'mecha_puntuacion'
  | 'mecha_facilidad_puntuacion'
  | 'mecha_disponibilidad_puntuacion'
  | 'mecha_pagos_puntuacion';

const METRICS: { key: MetricKey; label: string; group: 'salon' | 'mecha' }[] = [
  { key: 'puntuacion', label: 'Salón (general)', group: 'salon' },
  { key: 'salon_trato_puntuacion', label: 'Trato recibido', group: 'salon' },
  { key: 'salon_productos_puntuacion', label: 'Limpieza y productos', group: 'salon' },
  { key: 'mecha_puntuacion', label: 'Reservas (general)', group: 'mecha' },
  { key: 'mecha_facilidad_puntuacion', label: 'Facilidad de reserva', group: 'mecha' },
  { key: 'mecha_disponibilidad_puntuacion', label: 'Disponibilidad de huecos', group: 'mecha' },
  { key: 'mecha_pagos_puntuacion', label: 'Rapidez y seguridad de pago', group: 'mecha' },
];

type PeriodKey = 'all' | '7' | '30' | '90';
type ScopeKey = 'all' | 'salon' | 'mecha' | 'comentario';

const Icon = ({ name, size = 20, color = TOKENS.text }: { name: string; size?: number; color?: string }) => {
  const icons: Record<string, string> = {
    star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    eye: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    up: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
    spark: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// Fueguito = el logo de Mecha (mismo path que MechaMark). Variante dorada para Mecha Reservas.
function FlameIcon({ filled = true, size = 20, color = TOKENS.primary }: { filled?: boolean; size?: number; color?: string }) {
  const isGold = color === TOKENS.star || color === TOKENS.gold;
  const gid = isGold ? 'rsGoldGrad' : 'rsFireGrad';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="rsFireGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#e0340e" />
            <stop offset="0.5" stopColor="#ff7a2e" />
            <stop offset="1" stopColor="#ffcf4a" />
          </linearGradient>
          <linearGradient id="rsGoldGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#b45309" />
            <stop offset="0.5" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#fde047" />
          </linearGradient>
        </defs>
        {filled ? (
          <>
            <path d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z" fill={`url(#${gid})`} />
            <path d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z" fill="#fff" opacity={0.9} />
          </>
        ) : (
          <path d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z" fill="rgba(40,30,24,0.05)" stroke="rgba(40,30,24,0.18)" strokeWidth="2" />
        )}
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

// Barra de progreso luminosa para una media (0-5).
function BarMeter({ value, color = TOKENS.primary }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div style={{ height: 6, borderRadius: 4, background: 'rgba(40,30,24,0.07)', overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: color === TOKENS.gold ? 'linear-gradient(90deg,#b45309,#f59e0b,#fde047)' : 'linear-gradient(90deg,#e0340e,#ff7a2e,#ffcf4a)', transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
    </div>
  );
}

function avgOf(list: Resena[], key: MetricKey): { avg: number; count: number } {
  const vals = list
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (!vals.length) return { avg: 0, count: 0 };
  return { avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, count: vals.length };
}

function ResenasScreen() {
  const { isMobile } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('resenas');
  const [loading, setLoading] = useState(true);
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [, setNegocioId] = useState('');

  // Filtros
  const [fRating, setFRating] = useState(0); // 0 = todas; 1..5 = puntuacion exacta del salon
  const [fPeriod, setFPeriod] = useState<PeriodKey>('all');
  const [fScope, setFScope] = useState<ScopeKey>('all');
  const [fSearch, setFSearch] = useState('');

  // Sugerencia de respuesta con Chispa (Sesion 9-A)
  const [resenaEnEdicion, setResenaEnEdicion] = useState<Resena | null>(null);
  const [borradorRespuesta, setBorradorRespuesta] = useState('');
  const [mostrarModalRespuesta, setMostrarModalRespuesta] = useState(false);
  const [guardandoRespuesta, setGuardandoRespuesta] = useState(false);
  const [respuestaGuardada, setRespuestaGuardada] = useState(false);
  const chispa = useChispaSugerencia();

  // Chispa: Resumen de temas recurrentes
  const [generandoResumen, setGenerandoResumen] = useState(false);
  const [resumenTemas, setResumenTemas] = useState<Bloque | null>(null);

  const generarResumenTemas = async () => {
    if (filtradas.length === 0) return;
    setGenerandoResumen(true);
    try {
      const comentarios = filtradas
        .map(r => `[${r.puntuacion}/5]: ${r.comentario || r.mecha_mejora_comentario || 'Sin comentario'}`)
        .join('\n');
      
      const prompt = `Analiza estas valoraciones de clientes y resume los temas recurrentes. 
Destaca los puntos fuertes más mencionados y las quejas o áreas de mejora principales.
Formato: una lista de puntos clara y concisa.
Valoraciones:
${comentarios}`;
      
      const texto = await chispa.generar(prompt);
      if (texto) {
        setResumenTemas({ tipo: 'texto', texto });
      }
    } finally {
      setGenerandoResumen(false);
    }
  };

  const cargar = async () => {
    setLoading(true);
    const profile = await getUserProfile();
    const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    setNegocioId(nId);

    const { data } = await supabase
      .from('resenas')
      .select(`
        id, puntuacion, comentario, autor_nombre, created_at, visible, fuente,
        mecha_puntuacion, mecha_comentario,
        salon_trato_puntuacion, salon_productos_puntuacion,
        mecha_facilidad_puntuacion, mecha_disponibilidad_puntuacion,
        mecha_pagos_puntuacion, mecha_mejora_comentario
      `)
      .eq('negocio_id', nId)
      .order('created_at', { ascending: false });

    if (data) setResenas(data as Resena[]);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const toggleVisibility = async (id: string, current: boolean) => {
    const next = !current;
    setResenas((prev) => prev.map((r) => (r.id === id ? { ...r, visible: next } : r)));
    await supabase.from('resenas').update({ visible: next }).eq('id', id);
  };

  const deleteResena = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar esta reseña? No se puede deshacer.')) return;
    setResenas((prev) => prev.filter((r) => r.id !== id));
    await supabase.from('resenas').delete().eq('id', id);
  };

  // Sesion 9-A: generar sugerencia de respuesta con Chispa
  const generarSugerenciaRespuesta = async (resena: Resena) => {
    setResenaEnEdicion(resena);
    setMostrarModalRespuesta(true);
    setRespuestaGuardada(false);

    // Prompt especifico para generar respuesta a reseña
    const prompt = `Genera una respuesta educada y profesional para esta reseña de cliente.
Cliente: ${resena.autor_nombre || 'Anónimo'}
Valoración: ${resena.puntuacion}/5
Comentario: ${resena.comentario || 'Sin comentarios'}
${resena.mecha_mejora_comentario ? `Sugerencia de mejora: ${resena.mecha_mejora_comentario}` : ''}

Instrucciones:
- Si la valoración es positiva (4-5): agradecer, mencionar algo concreto del comentario e invitar a volver.
- Si es neutral (3): agradecer, mostrar interés en mejorar y ofrecer contacto directo.
- Si es negativa (1-2): disculparse sin ser defensivos, explicar acciones correctivas y ofrecer solución.
- Tono cercano pero profesional, adaptado a un salón de peluquería.
- NO inventar servicios ni promesas falsas.
- Máximo 3-4 líneas.

Responde solo con el texto de la respuesta, sin explicaciones previas.`;

    const sugerencia = await chispa.generar(prompt);
    if (sugerencia) {
      setBorradorRespuesta(sugerencia);
    }
  };

  // Guardar borrador de respuesta (visible para Alexandro -> envío real por WhatsApp)
  const guardarBorradorRespuesta = async () => {
    if (!resenaEnEdicion || !borradorRespuesta.trim()) return;
    setGuardandoRespuesta(true);

    try {
      // Guardar en tabla de respuestas_borrador (nueva tabla para Sesion 9-A)
      const { error } = await supabase.from('respuestas_borrador').insert({
        negocio_id: (await getUserProfile())?.negocio_id || NEGOCIO_ID_FALLBACK,
        resena_id: resenaEnEdicion.id,
        borrador: borradorRespuesta,
        estado: 'pendiente_envio', // pendiente de que Alexandro lo envie
        creado_por: (await getUserProfile())?.id,
      });

      if (error) throw error;

      setRespuestaGuardada(true);
      // Actualizar estado visual de la reseña localmente
      setResenas((prev) => prev.map((r) => (r.id === resenaEnEdicion.id ? { ...r, respuesta_borrador: borradorRespuesta } : r)));
    } catch (e) {
      console.error('Error guardando borrador:', e);
    } finally {
      setGuardandoRespuesta(false);
    }
  };

  // Cerrar modal de respuesta
  const cerrarModalRespuesta = () => {
    setMostrarModalRespuesta(false);
    setResenaEnEdicion(null);
    setBorradorRespuesta('');
    setRespuestaGuardada(false);
    chispa.reset();
  };

  // --- Filtrado ---
  const filtradas = useMemo(() => {
    const now = Date.now();
    const cutoff = fPeriod === 'all' ? 0 : now - Number(fPeriod) * 86400000;
    const q = fSearch.trim().toLowerCase();
    return resenas.filter((r) => {
      if (fRating > 0 && Math.round(r.puntuacion) !== fRating) return false;
      if (cutoff > 0 && parseISO(r.created_at).getTime() < cutoff) return false;
      if (fScope === 'mecha' && !r.mecha_puntuacion) return false;
      if (fScope === 'comentario' && !r.comentario && !r.mecha_mejora_comentario) return false;
      if (q) {
        const hay = `${r.comentario || ''} ${r.mecha_mejora_comentario || ''} ${r.autor_nombre || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [resenas, fRating, fPeriod, fScope, fSearch]);

  const media = useMemo(() => {
    if (filtradas.length === 0) return 0;
    const sum = filtradas.reduce((acc, r) => acc + r.puntuacion, 0);
    return Math.round((sum / filtradas.length) * 10) / 10;
  }, [filtradas]);

  // Stats por subcategoria sobre el conjunto filtrado.
  const stats = useMemo(
    () => METRICS.map((m) => ({ ...m, ...avgOf(filtradas, m.key) })),
    [filtradas],
  );

  // Analisis de sentimiento (resumen automatico, derivado de las propias valoraciones).
  const sentiment = useMemo(() => {
    const withData = stats.filter((s) => s.count > 0);
    const strengths = withData
      .filter((s) => s.avg >= 4.2)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
    const opportunities = withData
      .filter((s) => s.avg > 0 && s.avg <= 3.6)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3);
    const sugerencias = filtradas
      .filter((r) => (r.mecha_mejora_comentario || '').trim())
      .slice(0, 3)
      .map((r) => r.mecha_mejora_comentario as string);
    const elogios = filtradas
      .filter((r) => r.puntuacion >= 4 && (r.comentario || '').trim())
      .slice(0, 3)
      .map((r) => r.comentario as string);
    const promotores = filtradas.filter((r) => r.puntuacion >= 4).length;
    const detractores = filtradas.filter((r) => r.puntuacion <= 2).length;
    return { strengths, opportunities, sugerencias, elogios, promotores, detractores };
  }, [stats, filtradas]);

  const hasSentiment = sentiment.strengths.length > 0 || sentiment.opportunities.length > 0;
  const PAD = isMobile ? '24px 16px' : '40px 48px';

  if (loading) {
    return <PageLoader message="Cargando valoraciones..." />;
  }

  return (
    <div style={{ height: '100%', flex: 1, overflowY: 'auto', background: TOKENS.bg, padding: isMobile ? '16px 14px 96px' : PAD, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS }} />

      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* CABECERA */}
        <header style={{ marginBottom: 28, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: TOKENS.text, margin: '0 0 8px 0', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }}>
              Reseñas de clientes
              <button
                onClick={() => setShowManualPanel(true)}
                title="Manual de esta pagina"
                style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.borderHi}`, color: TOKENS.textSec, cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
              <AvisosBell mode="header" />
            </h1>
            <p style={{ margin: 0, fontSize: isMobile ? 14 : 15, color: TOKENS.textSec, maxWidth: 560 }}>
              Qué piensan tus clientes de su experiencia en el salón y reservando con Mecha. Filtra, mide cada detalle y detecta qué mejorar.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: TOKENS.bgCard, padding: '16px 24px', borderRadius: 16, border: `1px solid ${TOKENS.border}`, boxShadow: '0 8px 30px rgba(40,30,24,0.04)', alignSelf: isMobile ? 'flex-start' : 'auto' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Puntuación media</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: TOKENS.text, lineHeight: 1 }}>{media || '-'}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FlamesRow value={media} size={18} />
                  <span style={{ fontSize: 12, color: TOKENS.textSec, fontWeight: 600 }}>{filtradas.length} {filtradas.length === 1 ? 'valoración' : 'valoraciones'}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {!paginaManual.loading && !paginaManual.visto && (
          <div style={{ marginBottom: 20 }}>
            <AvisoPrimeraVisita
              content={manualResenas}
              isMobile={isMobile}
              onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
              onCerrar={paginaManual.marcarVisto}
            />
          </div>
        )}

        {resenas.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', background: TOKENS.bgPanel, border: `1px dashed ${TOKENS.borderHi}`, borderRadius: 16 }}>
            <div style={{ display: 'inline-flex', padding: 16, background: TOKENS.primarySoft, borderRadius: '50%', marginBottom: 16 }}>
              <FlameIcon filled={true} size={32} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.text, marginBottom: 8 }}>Aún no hay reseñas</div>
            <div style={{ fontSize: 15, color: TOKENS.textSec, maxWidth: 400, margin: '0 auto' }}>
              Cuando los clientes dejen valoraciones en tu portal público, aparecerán aquí automáticamente.
            </div>
          </div>
        ) : (
          <>
            {/* STATS POR SUBCATEGORIA */}
            {isMobile ? (
              <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TOKENS.textSec }}>Valoración por categorías</div>
                {stats.map((s) => {
                  const isMecha = s.group === 'mecha';
                  const accent = isMecha ? TOKENS.gold : TOKENS.primary;
                  return (
                    <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textSec }}>{s.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: TOKENS.text }}>{s.avg || '–'} <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer }}>/5</span></span>
                      </div>
                      <BarMeter value={s.avg} color={accent} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
                {stats.map((s, i) => {
                  const isMecha = s.group === 'mecha';
                  const accent = isMecha ? TOKENS.gold : TOKENS.primary;
                  return (
                    <div key={s.key} className="stat-card" style={{ animationDelay: `${i * 0.04}s`, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.textSec, lineHeight: 1.2 }}>{s.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: s.count ? TOKENS.text : TOKENS.textTer, lineHeight: 1 }}>{s.avg || '–'}</span>
                        {s.count > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.textTer }}>/5</span>}
                      </div>
                      <BarMeter value={s.avg} color={accent} />
                      <span style={{ fontSize: 11.5, color: TOKENS.textTer, fontWeight: 600 }}>{s.count} {s.count === 1 ? 'respuesta' : 'respuestas'}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ANALISIS DE SENTIMIENTO */}
            {hasSentiment && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
                  {/* Puntos fuertes */}
                  <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 20, borderTop: `3px solid ${TOKENS.success}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ display: 'inline-flex', padding: 6, borderRadius: 8, background: TOKENS.successSoft, color: TOKENS.success }}>
                        <Icon name="up" size={16} color="currentColor" />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: TOKENS.text }}>Lo que mejor hacéis</span>
                    </div>
                    {sentiment.strengths.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sentiment.strengths.map((s) => (
                          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 13.5, color: TOKENS.textSec }}>{s.label}</span>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: TOKENS.success, whiteSpace: 'nowrap' }}>{s.avg} <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer }}>/5</span></span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: TOKENS.textTer }}>Aún sin destacados claros con los filtros actuales.</div>
                    )}
                    {sentiment.elogios.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sentiment.elogios.map((c, i) => (
                          <div key={i} style={{ fontSize: 12.5, color: TOKENS.textSec, fontStyle: 'italic', lineHeight: 1.4 }}>“{c}”</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Oportunidades de mejora */}
                  <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 20, borderTop: `3px solid ${TOKENS.star}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ display: 'inline-flex', padding: 6, borderRadius: 8, background: TOKENS.goldSoft, color: TOKENS.gold }}>
                        <Icon name="spark" size={16} color="currentColor" />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: TOKENS.text }}>A mejorar</span>
                    </div>
                    {sentiment.opportunities.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sentiment.opportunities.map((s) => (
                          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 13.5, color: TOKENS.textSec }}>{s.label}</span>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: TOKENS.gold, whiteSpace: 'nowrap' }}>{s.avg} <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer }}>/5</span></span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: TOKENS.textTer }}>Sin focos de mejora marcados. ¡Buen trabajo!</div>
                    )}
                    {sentiment.sugerencias.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sugerencias de clientes</span>
                        {sentiment.sugerencias.map((c, i) => (
                          <div key={i} style={{ fontSize: 12.5, color: TOKENS.textSec, fontStyle: 'italic', lineHeight: 1.4 }}>“{c}”</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumen de temas (Chispa) */}
                <div style={{ marginTop: 14 }}>
                  {!resumenTemas && !generandoResumen && (
                    <button onClick={generarResumenTemas} disabled={chispa.loading || filtradas.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: TOKENS.primarySoft, color: TOKENS.primaryHi, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <Icon name="spark" size={16} /> Resumir temas recurrentes (IA)
                    </button>
                  )}
                  {generandoResumen && (
                    <div style={{ fontSize: 13, color: TOKENS.textSec, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="chispa-loader" style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${TOKENS.primary}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                      Analizando reseñas con Chispa...
                    </div>
                  )}
                  {resumenTemas && (
                    <div style={{ marginTop: 8 }}>
                      <BloqueRenderer bloque={resumenTemas} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FILTROS */}
            <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: isMobile ? 14 : 16, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Busqueda */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: '9px 12px' }}>
                <Icon name="search" size={16} color={TOKENS.textTer} />
                <input
                  value={fSearch}
                  onChange={(e) => setFSearch(e.target.value)}
                  placeholder="Buscar en comentarios, sugerencias o nombre..."
                  style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 14, color: TOKENS.text, fontFamily: 'inherit', minWidth: 0 }}
                />
                {fSearch && (
                  <button onClick={() => setFSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: TOKENS.textTer, fontSize: 13, fontWeight: 700 }}>Limpiar</button>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 14 : 24 }}>
                {/* Fueguitos */}
                <FilterGroup label="Fueguitos">
                  <Chip active={fRating === 0} onClick={() => setFRating(0)}>Todas</Chip>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <Chip key={n} active={fRating === n} onClick={() => setFRating(fRating === n ? 0 : n)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{n}<FlameIcon filled={true} size={12} color={fRating === n ? '#fff' : TOKENS.primary} /></span>
                    </Chip>
                  ))}
                </FilterGroup>

                {/* Periodo */}
                <FilterGroup label="Periodo">
                  {([['all', 'Todo'], ['7', '7 días'], ['30', '30 días'], ['90', '90 días']] as [PeriodKey, string][]).map(([k, lbl]) => (
                    <Chip key={k} active={fPeriod === k} onClick={() => setFPeriod(k)}>{lbl}</Chip>
                  ))}
                </FilterGroup>

                {/* Ambito */}
                <FilterGroup label="Tipo">
                  {([['all', 'Todas'], ['mecha', 'Con Mecha'], ['comentario', 'Con comentario']] as [ScopeKey, string][]).map(([k, lbl]) => (
                    <Chip key={k} active={fScope === k} onClick={() => setFScope(k)}>{lbl}</Chip>
                  ))}
                </FilterGroup>
              </div>
            </div>

            {/* LISTADO */}
            {filtradas.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', background: TOKENS.bgPanel, border: `1px dashed ${TOKENS.borderHi}`, borderRadius: 16, color: TOKENS.textSec }}>
                Ninguna reseña coincide con los filtros. <button onClick={() => { setFRating(0); setFPeriod('all'); setFScope('all'); setFSearch(''); }} style={{ border: 'none', background: 'none', color: TOKENS.primary, fontWeight: 700, cursor: 'pointer', fontSize: 'inherit' }}>Quitar filtros</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: 20 }}>
                {filtradas.map((r, i) => (
                  <div key={r.id} className="resena-card" style={{
                    animationDelay: `${Math.min(i, 8) * 0.05}s`,
                    background: r.puntuacion <= 2 ? '#faf9f7' : TOKENS.bgCard, // Alerta visual sutil/neutra
                    border: `1px solid ${r.puntuacion <= 2 ? 'rgba(217,119,6,0.3)' : TOKENS.border}`,
                    borderRadius: 16, padding: 20,
                    display: 'flex', flexDirection: 'column',
                    opacity: r.visible ? 1 : 0.65,
                    transition: 'opacity 0.2s ease',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: '50%', background: TOKENS.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: TOKENS.primary, fontSize: 16, flexShrink: 0 }}>
                          {(r.autor_nombre || 'A')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text }}>{r.autor_nombre || 'Anónimo'}</div>
                          <div style={{ fontSize: 13, color: TOKENS.textTer }}>{format(parseISO(r.created_at), 'd MMM yyyy', { locale: es })}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => toggleVisibility(r.id, r.visible)}
                          title={r.visible ? 'Ocultar del portal público' : 'Mostrar en el portal público'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.visible ? TOKENS.primary : TOKENS.textTer, padding: 6, borderRadius: 8, display: 'flex' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = TOKENS.bgCardHi)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <Icon name={r.visible ? 'eye' : 'eyeOff'} size={18} color="currentColor" />
                        </button>
                        <button
                          onClick={() => deleteResena(r.id)}
                          title="Eliminar reseña"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.danger, padding: 6, borderRadius: 8, display: 'flex' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = TOKENS.dangerSoft)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <Icon name="trash" size={18} color="currentColor" />
                        </button>
                      </div>
                    </div>

                    {/* VALORACIONES DEL SALÓN */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.textSec }}>Salón:</span>
                        <FlamesRow value={r.puntuacion} size={16} />
                      </div>
                      {r.salon_trato_puntuacion ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.02)', padding: '2px 6px', borderRadius: 6, fontSize: 11.5 }}>
                          <span style={{ color: TOKENS.textTer }}>Trato:</span>
                          <FlamesRow value={r.salon_trato_puntuacion} size={11} />
                        </div>
                      ) : null}
                      {r.salon_productos_puntuacion ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.02)', padding: '2px 6px', borderRadius: 6, fontSize: 11.5 }}>
                          <span style={{ color: TOKENS.textTer }}>Limpieza/Prod:</span>
                          <FlamesRow value={r.salon_productos_puntuacion} size={11} />
                        </div>
                      ) : null}
                    </div>

                    {/* COMENTARIO DEL SALÓN */}
                    <div style={{ flex: 1, marginBottom: 12 }}>
                      {r.comentario ? (
                        <div style={{ fontSize: 14, color: TOKENS.textSec, lineHeight: 1.5, fontStyle: 'italic', paddingLeft: 8, borderLeft: `2.5px solid ${TOKENS.primarySoft}` }}>
                          "{r.comentario}"
                        </div>
                      ) : (
                        <div style={{ fontSize: 13.5, color: TOKENS.textTer, fontStyle: 'italic' }}>
                          Sin comentarios sobre el salón.
                        </div>
                      )}
                    </div>

                    {/* VALORACIONES DE MECHA */}
                    {r.mecha_puntuacion ? (
                      <div style={{ background: 'rgba(244,80,30,0.02)', border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 12, marginTop: 12 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.gold }}>Reservas:</span>
                            <FlamesRow value={r.mecha_puntuacion} size={14} color={TOKENS.star} />
                          </div>
                          {r.mecha_facilidad_puntuacion ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                              <span style={{ color: TOKENS.textTer }}>Facilidad:</span>
                              <FlamesRow value={r.mecha_facilidad_puntuacion} size={9} color={TOKENS.star} />
                            </div>
                          ) : null}
                          {r.mecha_disponibilidad_puntuacion ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                              <span style={{ color: TOKENS.textTer }}>Huecos:</span>
                              <FlamesRow value={r.mecha_disponibilidad_puntuacion} size={9} color={TOKENS.star} />
                            </div>
                          ) : null}
                          {r.mecha_pagos_puntuacion ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                              <span style={{ color: TOKENS.textTer }}>Pagos:</span>
                              <FlamesRow value={r.mecha_pagos_puntuacion} size={9} color={TOKENS.star} />
                            </div>
                          ) : null}
                        </div>
                        {r.mecha_mejora_comentario ? (
                          <div style={{ fontSize: 12.5, color: TOKENS.textSec, lineHeight: 1.4, marginTop: 6, background: '#fffdfb', padding: '6px 10px', borderRadius: 6, border: `1px solid ${TOKENS.border}` }}>
                            <strong style={{ fontSize: 10.5, color: TOKENS.textTer, display: 'block', marginBottom: 2 }}>Mejora sugerida:</strong>
                            "{r.mecha_mejora_comentario}"
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {r.respuesta_borrador ? (
                      <div style={{ marginTop: 16, padding: 12, background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`, borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Icon name="spark" size={14} color={TOKENS.primary} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.primary, textTransform: 'uppercase' }}>Respuesta sugerida</span>
                        </div>
                        <div style={{ fontSize: 13, color: TOKENS.textSec, fontStyle: 'italic' }}>
                          "{r.respuesta_borrador}"
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 16 }}>
                        <button onClick={() => generarSugerenciaRespuesta(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: TOKENS.primarySoft, color: TOKENS.primaryHi, border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          <Icon name="spark" size={14} /> Responder (Chispa)
                        </button>
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
          </>
        )}
        {/* MODAL RESPUESTA */}
        {mostrarModalRespuesta && resenaEnEdicion && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={cerrarModalRespuesta} />
            <div style={{ position: 'relative', background: TOKENS.bgPanel, width: '100%', maxWidth: 500, borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="spark" size={20} color={TOKENS.primary} />
                  <span style={{ fontSize: 18, fontWeight: 800, color: TOKENS.text }}>Responder Reseña</span>
                </div>
                <button onClick={cerrarModalRespuesta} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: TOKENS.textTer }}>×</button>
              </div>
              <div style={{ padding: 24 }}>
                {chispa.loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 30 }}>
                    <span className="chispa-loader" style={{ width: 24, height: 24, borderRadius: '50%', border: `3px solid ${TOKENS.primary}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 14, color: TOKENS.textSec }}>Generando sugerencia...</span>
                    <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { 100% { transform: rotate(360deg); } }' }} />
                  </div>
                ) : (
                  <>
                    <textarea 
                      value={borradorRespuesta} 
                      onChange={(e) => setBorradorRespuesta(e.target.value)}
                      style={{ width: '100%', height: 120, padding: 12, borderRadius: 10, border: `1px solid ${TOKENS.borderHi}`, fontSize: 14, fontFamily: 'inherit', resize: 'none' }}
                      placeholder="Escribe aquí la respuesta..."
                    />
                    {chispa.error && <div style={{ color: TOKENS.danger, fontSize: 13, marginTop: 8 }}>{chispa.error}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                      <button onClick={cerrarModalRespuesta} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: TOKENS.bgCardHi, color: TOKENS.textSec, fontWeight: 600, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button disabled={guardandoRespuesta || !borradorRespuesta.trim() || respuestaGuardada} onClick={guardarBorradorRespuesta} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: respuestaGuardada ? TOKENS.success : TOKENS.primary, color: '#fff', fontWeight: 700, cursor: (guardandoRespuesta || !borradorRespuesta.trim() || respuestaGuardada) ? 'default' : 'pointer', opacity: guardandoRespuesta ? 0.7 : 1 }}>
                        {guardandoRespuesta ? 'Guardando...' : respuestaGuardada ? 'Guardado' : 'Guardar borrador'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
      {showManualPanel && (
        <ManualPanel
          content={manualResenas}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="rs-chip"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? TOKENS.primary : TOKENS.border}`,
        background: active ? TOKENS.primary : TOKENS.bgCardHi,
        color: active ? '#fff' : TOKENS.textSec,
        fontSize: 12.5,
        fontWeight: 700,
        padding: '6px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'inherit',
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  );
}

export default withClientDataGate(ResenasScreen, 'Reseñas');
