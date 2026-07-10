import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useAvisos } from '@/lib/hooks/useAvisos';

const LOCALE = 'es-ES';

interface Props {
  // 'sidebar': boton compacto para la cabecera del Sidebar; el panel se ancla
  // en fixed junto al menu para no quedar recortado por el overflow del aside.
  collapsed?: boolean;
  mode?: 'sidebar' | 'header';
}

// Campana de avisos global: visible en todas las paginas (vive en el Sidebar).
// Cada aviso navega a la pantalla donde se resuelve: la cita sin confirmar abre
// su ficha en la agenda, los mensajes van a Bandeja, las clientas en fuga al
// filtro de Clientes y los cumpleanos a la ficha de la clienta.
export function AvisosBell({ collapsed, mode = 'sidebar' }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const avisos = useAvisos();

  const go = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  const hayUrgente = avisos.hallazgos.some((h) => h.severidad === 'urgente');
  const dotColor = (avisos.sinConfirmar.length > 0 || hayUrgente) ? T.danger : '#fb923c';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Color por severidad de hallazgo (mismos tokens de la paleta fuego/semantica).
  const sevColor = (sev: string): { fg: string; bg: string } => {
    if (sev === 'urgente') return { fg: T.danger, bg: T.dangerSoft };
    if (sev === 'alta') return { fg: '#fb923c', bg: 'rgba(251,146,60,0.14)' };
    if (sev === 'media') return { fg: T.cyan, bg: T.cyanSoft };
    return { fg: T.textTertiary, bg: T.bgCardHi };
  };

  // Ruta destino de un hallazgo segun su accion sugerida (o por tipo como fallback).
  const rutaHallazgo = (tipo: string, payload?: Record<string, unknown>): string => {
    const destino = (payload?.destino as string) || '';
    const mapa: Record<string, string> = {
      agenda: '/(tabs)/', bandeja: '/(tabs)/bandeja', presupuestos: '/(tabs)/presupuestos',
      inventario: '/(tabs)/inventario', clientes: '/(tabs)/clientes',
    };
    if (destino && mapa[destino]) return mapa[destino];
    if (tipo === 'senal_sin_pagar') return '/(tabs)/';
    if (tipo === 'presupuesto_sin_respuesta') return '/(tabs)/presupuestos';
    if (tipo === 'stock_bajo') return '/(tabs)/inventario';
    return '/(tabs)/';
  };

  const btnWidth = mode === 'header' ? 32 : (collapsed ? 32 : 26);
  const btnHeight = mode === 'header' ? 32 : (collapsed ? 32 : 26);
  const btnBackground = open ? T.primarySoft : (mode === 'header' ? T.bgCard : T.bgCardHi);
  const btnBorder = `1px solid ${open ? 'rgba(244,80,30,0.30)' : T.border}`;
  const btnColor = open ? T.primaryHi : (mode === 'header' ? T.textSec : T.textTertiary);

  const dropdownStyle: React.CSSProperties = mode === 'header'
    ? (isMobile
      ? { position: 'fixed', top: 58, left: 12, right: 12, maxHeight: '60vh', overflowY: 'auto', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 20px 50px rgba(20,12,6,0.30)', zIndex: 99999, padding: 12 }
      : { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxHeight: 420, overflowY: 'auto', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 20px 50px rgba(20,12,6,0.30)', zIndex: 99999, padding: 12 })
    : { position: 'fixed', top: 12, left: collapsed ? 84 : 248, width: 320, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 20px 50px rgba(20,12,6,0.30)', zIndex: 99999, padding: 12 };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) avisos.refresh(); }}
        title="Avisos"
        style={{
          display: 'grid', placeItems: 'center', width: btnWidth, height: btnHeight,
          borderRadius: 8, background: btnBackground,
          border: btnBorder,
          color: btnColor, cursor: 'pointer', position: 'relative', padding: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {avisos.total > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, background: dotColor, borderRadius: 999, boxShadow: `0 0 0 2px ${T.bgPanel}` }} />
        )}
      </button>

      {open && mounted && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99998 }} />
          <div style={dropdownStyle} className="animate-pop-in">
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Avisos</span>
              {avisos.total > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: avisos.sinConfirmar.length > 0 ? T.danger : '#fb923c', background: avisos.sinConfirmar.length > 0 ? T.dangerSoft : 'rgba(251,146,60,0.14)', borderRadius: 999, padding: '2px 8px' }}>{avisos.total}</span>
              )}
            </div>

            {avisos.total === 0 ? (
              <div style={{ fontSize: 12, color: T.textTertiary, textAlign: 'center', padding: '18px 0' }}>
                {avisos.loading ? 'Cargando...' : 'No hay avisos pendientes'}
              </div>
            ) : (
              <>
                {avisos.sinConfirmar.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 6 }}>Sin confirmar (proximas 48h)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                      {avisos.sinConfirmar.slice(0, 8).map((c) => {
                        const ini = new Date(c.inicio);
                        return (
                          <button
                            key={c.id}
                            onClick={() => go(`/(tabs)/?cita=${c.id}`)}
                            title="Abrir la cita para gestionarla"
                            style={{ textAlign: 'left', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{c.clienteNombre}</span>
                            <span style={{ fontSize: 11, color: T.textSecondary }}>{ini.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })} · {ini.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {avisos.mensajesSinLeer > 0 && (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 6, marginTop: avisos.sinConfirmar.length > 0 ? 10 : 0 }}>Mensajes</div>
                    <button
                      onClick={() => go('/(tabs)/bandeja')}
                      style={{ width: '100%', textAlign: 'left', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}
                    >
                      <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8, background: T.primarySoft, color: T.primary }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{avisos.mensajesSinLeer} {avisos.mensajesSinLeer === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}</span>
                    </button>
                  </>
                )}

                {avisos.clientesFuga > 0 && (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 6, marginTop: (avisos.sinConfirmar.length > 0 || avisos.mensajesSinLeer > 0) ? 10 : 0 }}>Clientas</div>
                    <button
                      onClick={() => go('/(tabs)/clientes?filtro=fuga')}
                      style={{ width: '100%', textAlign: 'left', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}
                    >
                      <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8, background: T.cyanSoft, color: T.cyan }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{avisos.clientesFuga} {avisos.clientesFuga === 1 ? 'clienta en riesgo de fuga' : 'clientas en riesgo de fuga'}</span>
                    </button>
                  </>
                )}

                {avisos.hallazgos.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 6, marginTop: (avisos.sinConfirmar.length > 0 || avisos.mensajesSinLeer > 0 || avisos.clientesFuga > 0) ? 10 : 0 }}>Chispa esta vigilando</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                      {avisos.hallazgos.map((h) => {
                        const c = sevColor(h.severidad);
                        const cnt = h.datos?.count ?? 0;
                        return (
                          <div key={h.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                            <button
                              onClick={() => go(rutaHallazgo(h.tipo, h.accion_sugerida?.payload as Record<string, unknown>))}
                              title={h.detalle || h.resumen}
                              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${c.fg}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.resumen}</span>
                                {h.severidad === 'urgente' && (
                                  <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, color: c.fg, background: c.bg, borderRadius: 999, padding: '1px 6px' }}>URGENTE</span>
                                )}
                              </span>
                              <span style={{ fontSize: 11, color: T.textSecondary }}>{cnt > 0 ? `${cnt} ${cnt === 1 ? 'caso' : 'casos'}` : h.detalle}</span>
                            </button>
                            <button
                              onClick={() => { void avisos.resolverHallazgo(h.id, 'resuelto'); }}
                              title="Marcar como resuelto"
                              style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, color: T.success, cursor: 'pointer', padding: 0 }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            </button>
                            <button
                              onClick={() => { void avisos.resolverHallazgo(h.id, 'descartado'); }}
                              title="Descartar este aviso"
                              style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, color: T.textTertiary, cursor: 'pointer', padding: 0 }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {avisos.cumples.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 6, marginTop: (avisos.sinConfirmar.length > 0 || avisos.mensajesSinLeer > 0 || avisos.clientesFuga > 0 || avisos.hallazgos.length > 0) ? 10 : 0 }}>Cumpleanos (proximos 7 dias)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {avisos.cumples.map((b) => {
                        const cuando = b.diff === 0 ? 'Hoy' : b.diff === 1 ? 'Manana' : `En ${b.diff} dias`;
                        return (
                          <button
                            key={b.clienteId}
                            onClick={() => go(`/(tabs)/clientes?clienteId=${b.clienteId}`)}
                            title="Ver la ficha de la clienta"
                            style={{ textAlign: 'left', background: T.bgCard, border: '1px solid rgba(251,146,60,0.30)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}
                          >
                            <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8, background: 'rgba(251,146,60,0.14)', color: '#fb923c' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.nombre}</span>
                              <span style={{ fontSize: 11, color: '#fb923c', fontWeight: 600 }}>{cuando} · {b.fecha.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
