import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { getUserProfile } from '@/lib/auth';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { eur } from '@/lib/presupuestos';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  type Conversacion, type MensajeConversacion, TIPO_META,
  cargarConversaciones, cargarMensajes, marcarLeida, marcarEstado, responderConversacion,
} from '@/lib/bandeja';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualBandeja } from '@/lib/manuals/bandeja';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { useChispaSugerencia } from '@/lib/hooks/useChispaSugerencia';
import { normalizarRespuesta, type Bloque } from '@/lib/chispaBloques';
import { ejecutarAccion } from '@/lib/chispaOps';
import { BloqueRenderer, type AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { supabase } from '@/lib/supabase';

const T = {
  bg: '#f6f1ea', panel: '#fffdfb', card: '#ffffff', cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)', borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814', textSec: '#5c5249', textTer: '#736658',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b', successSoft: 'rgba(15,157,107,0.12)',
  warning: '#e08a00', danger: '#e23b34', dangerSoft: 'rgba(226,59,52,0.12)',
};

const ANIM = `
  @keyframes bFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes bUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  .b-row { animation: bUp 0.3s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.15s ease; cursor: pointer; }
  .b-row:hover { background: ${T.cardHi} !important; }
  .b-btn { transition: all 0.15s ease; cursor: pointer; }
  .b-btn:hover { filter: brightness(1.04); }
  .b-modal-overlay { animation: bFade 0.2s ease; }
  .b-modal { animation: bUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const ICONS: Record<string, string> = {
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>',
};
function Icon({ name, size = 16, color = T.text }: { name: string; size?: number; color?: string }) {
  return <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
    __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  }} />;
}

function OrigenChip({ conv }: { conv: Conversacion }) {
  if (conv.origen === 'presupuesto' && conv.presupuestos) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: T.primary, background: T.primarySoft, padding: '3px 9px', borderRadius: 999 }}>P-{conv.presupuestos.numero}</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: T.textSec, background: T.cardHi, padding: '3px 9px', borderRadius: 999 }}>Contacto</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE (modal): hilo completo + responder + marcar resuelta
// ─────────────────────────────────────────────────────────────────────────────
function DetalleModal({ conv, onClose, onEstadoCambiado }: {
  conv: Conversacion;
  onClose: () => void;
  onEstadoCambiado: (estado: 'abierta' | 'resuelta') => void;
}) {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [mensajes, setMensajes] = useState<MensajeConversacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  // Sesión 9-A: Chispa (borrador y acciones)
  const chispa = useChispaSugerencia();
  const [bloqueIA, setBloqueIA] = useState<Bloque | null>(null);
  const [accionEstado, setAccionEstado] = useState<AccionEstado>('pendiente');
  const [loadingAccion, setLoadingAccion] = useState(false);

  const triageSugerido = useMemo(() => {
    if (mensajes.length === 0) return null;
    const txt = mensajes.map(m => m.cuerpo.toLowerCase()).join(' ');
    if (txt.includes('urgente') || txt.includes('ayuda') || txt.includes('ya') || txt.includes('pronto')) return { label: 'Urgente', color: T.danger };
    if (txt.includes('precio') || txt.includes('cuanto') || txt.includes('cita') || txt.includes('reserva')) return { label: 'Consulta', color: T.primary };
    if (txt.includes('gratis') || txt.includes('oferta') || txt.includes('seo')) return { label: 'Spam/Promo', color: T.textTer };
    return null;
  }, [mensajes]);

  const generarBorradorIA = async () => {
    if (mensajes.length === 0) return;
    const txt = mensajes.map(m => `${m.autor}: ${m.cuerpo}`).join('\n');
    const prompt = `El cliente ${conv.contacto_nombre} escribió esto:\n${txt}\nPropón una respuesta educada y breve desde el salón.`;
    const borrador = await chispa.generar(prompt);
    if (borrador) setRespuesta(borrador);
  };

  const proponerAccionIA = async (tipoAccion: 'cita' | 'presupuesto') => {
    setLoadingAccion(true);
    setBloqueIA(null);
    setAccionEstado('pendiente');
    try {
      const txt = mensajes.map(m => `${m.autor}: ${m.cuerpo}`).join('\n');
      const prompt = `Analiza esta conversación con ${conv.contacto_nombre}. Genera un bloque de acción de tipo '${tipoAccion === 'cita' ? 'crear_cita' : 'crear_presupuesto'}' con los datos que puedas extraer. Si faltan datos, usa valores por defecto lógicos.\nConversación:\n${txt}`;
      const { data, error: err } = await supabase.functions.invoke('agenda-asistente', {
        body: { mensajes: [{ role: 'user', content: prompt }] },
      });
      if (!err && data) {
        const bloques = normalizarRespuesta(data);
        const accion = bloques.find(b => b.tipo === 'accion');
        if (accion) setBloqueIA(accion);
      }
    } finally {
      setLoadingAccion(false);
    }
  };

  const confirmarAccionIA = async () => {
    if (!bloqueIA || bloqueIA.tipo !== 'accion') return;
    setAccionEstado('aplicando');
    const user = await getUserProfile();
    const res = await ejecutarAccion(bloqueIA.accion, user?.id || '');
    if (res.ok) {
      setAccionEstado('aplicada');
    } else {
      setAccionEstado('pendiente');
      setError(res.error);
    }
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m] = await Promise.all([cargarMensajes(conv.id), marcarLeida(conv.id)]);
      setMensajes(m);
    } catch (e) { setError(mensajeDeError(e)); }
    finally { setLoading(false); }
  }, [conv.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async () => {
    if (!respuesta.trim()) { setError('Escribe una respuesta.'); return; }
    setEnviando(true); setError('');
    try {
      await responderConversacion(conv.id, respuesta);
      setRespuesta('');
      await cargar();
    } catch (e) { setError(mensajeDeError(e)); }
    finally { setEnviando(false); }
  };

  const toggleEstado = async () => {
    const nuevo = conv.estado === 'abierta' ? 'resuelta' : 'abierta';
    setCambiandoEstado(true);
    try { await marcarEstado(conv.id, nuevo); onEstadoCambiado(nuevo); }
    catch (e) { setError(mensajeDeError(e)); }
    finally { setCambiandoEstado(false); }
  };

  return (
    <div className="b-modal-overlay" onClick={() => { if (!enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 220, display: 'grid', placeItems: isMobile ? 'end stretch' : 'center', padding: isMobile ? 0 : 16 }}>
      <div className="b-modal" onClick={(e) => e.stopPropagation()}
        style={{ background: T.panel, border: `1px solid ${T.borderHi}`, borderRadius: isMobile ? '16px 16px 0 0' : 16, padding: isMobile ? 18 : 24, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{conv.contacto_nombre || 'Sin nombre'}</span>
              <OrigenChip conv={conv} />
            </div>
            <div style={{ fontSize: 12.5, color: T.textTer }}>
              {[conv.contacto_telefono, conv.contacto_email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </div>
            {triageSugerido && (
              <div style={{ marginTop: 6, display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: triageSugerido.color === T.danger ? T.dangerSoft : T.cardHi, color: triageSugerido.color }}>
                {triageSugerido.label}
              </div>
            )}
          </div>
          <button onClick={onClose} className="b-btn" style={{ background: 'none', border: 'none', padding: 4 }}><Icon name="x" size={20} color={T.textSec} /></button>
        </div>

        {conv.presupuestos && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: T.primarySoft, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
            <span style={{ color: T.text, fontWeight: 600 }}>Presupuesto P-{conv.presupuestos.numero} · {eur(conv.presupuestos.total_cents)}</span>
            <button onClick={() => router.push('/(tabs)/presupuestos' as never)} className="b-btn" style={{ background: 'none', border: 'none', padding: 0, color: T.primary, fontWeight: 700, fontSize: 12.5 }}>Abrir</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, minHeight: 120 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ width: 26, height: 26, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : mensajes.length === 0 ? (
            <p style={{ fontSize: 13, color: T.textTer, textAlign: 'center', padding: 20 }}>Sin mensajes.</p>
          ) : mensajes.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.autor === 'salon' ? 'flex-end' : 'flex-start' }}>
              {m.autor === 'cliente' && m.tipo !== 'mensaje' ? (
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: TIPO_META[m.tipo].color, marginBottom: 3 }}>{TIPO_META[m.tipo].label}</div>
              ) : null}
              <div style={{
                maxWidth: '85%', padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                background: m.autor === 'salon' ? T.primary : T.cardHi, color: m.autor === 'salon' ? '#fff' : T.text,
                border: m.autor === 'salon' ? 'none' : `1px solid ${T.border}`,
              }}>{m.cuerpo}</div>
              <div style={{ fontSize: 10.5, color: T.textTer, marginTop: 2 }}>
                {formatDistanceToNow(parseISO(m.created_at), { locale: es, addSuffix: true })}
                {m.autor === 'salon' && !m.enviado_email_at ? ' · no enviado por correo' : ''}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={generarBorradorIA} disabled={chispa.loading || enviando} className="b-btn" style={{ padding: '6px 10px', background: T.primarySoft, color: T.primaryHi, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="spark" size={14} />
              {chispa.loading ? '...' : 'Sugerir borrador'}
            </button>
            <button onClick={() => proponerAccionIA('cita')} disabled={loadingAccion || enviando} className="b-btn" style={{ padding: '6px 10px', background: T.cardHi, color: T.textSec, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              Cita (IA)
            </button>
            <button onClick={() => proponerAccionIA('presupuesto')} disabled={loadingAccion || enviando} className="b-btn" style={{ padding: '6px 10px', background: T.cardHi, color: T.textSec, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              Presupuesto (IA)
            </button>
          </div>
        </div>

        {bloqueIA && (
          <div style={{ marginBottom: 12 }}>
            <BloqueRenderer 
              bloque={bloqueIA} 
              accionEstado={accionEstado} 
              onConfirmar={confirmarAccionIA} 
              onCancelar={() => setBloqueIA(null)} 
            />
          </div>
        )}

        <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Escribe tu respuesta…" rows={3}
          style={{ width: '100%', padding: 11, borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }} />
        {error ? <p style={{ color: T.danger, fontSize: 12.5, marginBottom: 8 }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={enviar} disabled={enviando} className="b-btn" style={{ flex: 1, padding: '12px', background: T.primary, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="send" size={15} color="#fff" /> {enviando ? 'Enviando…' : 'Responder por correo'}
          </button>
          <button onClick={toggleEstado} disabled={cambiandoEstado} className="b-btn" style={{ padding: '12px 16px', background: 'transparent', color: T.textSec, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {conv.estado === 'abierta' ? 'Marcar resuelta' : 'Reabrir'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTA
// ─────────────────────────────────────────────────────────────────────────────
function BandejaScreen() {
  const { isMobile } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('bandeja');
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'abiertas' | 'todas'>('abiertas');
  const [abierta, setAbierta] = useState<Conversacion | null>(null);
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async () => {
    try {
      const p = await getUserProfile();
      if (!p?.negocio_id) { setLoading(false); return; }
      setNegocioId(p.negocio_id);
      const data = await cargarConversaciones(p.negocio_id);
      setConversaciones(data);
    } catch (e) { setMensaje(mensajeDeError(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(
    () => filtro === 'abiertas' ? conversaciones.filter((c) => c.estado === 'abierta') : conversaciones,
    [conversaciones, filtro]
  );

  const sinLeer = useMemo(() => conversaciones.filter((c) => !c.leido_at).length, [conversaciones]);

  const onEstadoCambiado = (id: string, estado: 'abierta' | 'resuelta') => {
    setConversaciones((prev) => prev.map((c) => c.id === id ? { ...c, estado } : c));
  };

  const cerrarDetalle = () => {
    setAbierta(null);
    if (negocioId) cargarConversaciones(negocioId).then(setConversaciones).catch(() => {});
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      Cargando bandeja…
    </div>;
  }

  return (
    <div style={{ background: T.bg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{ANIM}</style>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 14px 96px' : 24 }}>
        <div style={{ marginBottom: isMobile ? 14 : 20 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: T.text, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="mail" size={isMobile ? 22 : 26} color={T.primary} /> Bandeja
            {sinLeer > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: T.primary, borderRadius: 999, padding: '2px 9px' }}>{sinLeer}</span>}
            <button
              onClick={() => setShowManualPanel(true)}
              title="Manual de esta pagina"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: T.card, border: `1px solid ${T.borderHi}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <AvisosBell mode="header" />
          </h1>
          <p style={{ fontSize: isMobile ? 13 : 14, color: T.textSec, margin: 0 }}>Mensajes de clientes: rechazos y cambios de presupuestos, y contactos desde tu página pública.</p>
        </div>

        {!paginaManual.loading && !paginaManual.visto && (
          <div style={{ marginBottom: isMobile ? 14 : 20 }}>
            <AvisoPrimeraVisita
              content={manualBandeja}
              isMobile={isMobile}
              onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
              onCerrar={paginaManual.marcarVisto}
            />
          </div>
        )}

        {mensaje ? <div style={{ padding: '11px 15px', borderRadius: 10, marginBottom: 14, background: T.dangerSoft, color: T.danger, fontSize: 13.5 }}>{mensaje}</div> : null}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['abiertas', 'todas'] as const).map((k) => {
            const on = filtro === k;
            return <button key={k} onClick={() => setFiltro(k)} className="b-btn" style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: on ? T.primary : T.card, color: on ? '#fff' : T.textSec, border: `1px solid ${on ? T.primary : T.border}` }}>
              {k === 'abiertas' ? 'Abiertas' : 'Todas'}
            </button>;
          })}
        </div>

        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
            <Icon name="mail" size={42} color={T.textTer} />
            <p style={{ fontSize: 15, color: T.textSec, marginTop: 14, marginBottom: 4 }}>No hay mensajes {filtro === 'abiertas' ? 'abiertos' : 'todavía'}</p>
            <p style={{ fontSize: 13, color: T.textTer, margin: 0 }}>Aparecerán aquí los rechazos/cambios de presupuestos y los mensajes de tu página de contacto.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtradas.map((c, idx) => {
              const sinLeerRow = !c.leido_at;
              return (
                <div key={c.id} className="b-row" onClick={() => setAbierta(c)}
                  style={{ background: T.card, border: `1px solid ${sinLeerRow ? T.primary : T.border}`, borderRadius: 12, padding: isMobile ? 14 : '14px 18px', animationDelay: `${idx * 0.02}s`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 16, alignItems: isMobile ? 'stretch' : 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      {sinLeerRow && <span style={{ width: 7, height: 7, borderRadius: 999, background: T.primary, flexShrink: 0 }} />}
                      <span style={{ fontSize: 15, fontWeight: sinLeerRow ? 700 : 600, color: T.text }}>{c.contacto_nombre || 'Sin nombre'}</span>
                      <OrigenChip conv={c} />
                      {c.estado === 'resuelta' && <span style={{ fontSize: 11, fontWeight: 700, color: T.success, background: T.successSoft, padding: '3px 9px', borderRadius: 999 }}>Resuelta</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: T.textSec }}>
                      {format(parseISO(c.ultimo_mensaje_at), "d MMM yyyy, HH:mm", { locale: es })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {abierta && (
        <DetalleModal conv={abierta} onClose={cerrarDetalle}
          onEstadoCambiado={(estado) => { onEstadoCambiado(abierta.id, estado); setAbierta((prev) => prev ? { ...prev, estado } : prev); }} />
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualBandeja}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

export default withClientDataGate(BandejaScreen, 'Bandeja de mensajes');
