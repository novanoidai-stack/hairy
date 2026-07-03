import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, can } from '@/lib/auth';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';
import { SSelect, STextInput } from '@/components/ui/SettingsAtoms';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualListaEspera } from '@/lib/manuals/lista-espera';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';

// ---------------------------------------------------------------------------
// Tokens (consistentes con el resto de .web.tsx)
// ---------------------------------------------------------------------------
const T = {
  bg: '#f6f1ea',
  panel: '#fffdfb',
  card: '#ffffff',
  cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)',
  borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.14)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.12)',
};

const ANIM = `
  @keyframes leFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes leUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  .le-row { animation: leUp 0.35s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.15s ease; }
  .le-row:hover { background: ${T.cardHi} !important; }
  .le-btn { transition: all 0.15s ease; cursor: pointer; }
  .le-btn:hover { filter: brightness(1.05); }
  .le-chip { transition: all 0.15s ease; cursor: pointer; }
  .le-chip:hover { transform: translateY(-1px); }
  .le-opt { transition: background 0.12s ease; }
  .le-opt:hover { background: ${T.cardHi} !important; }
`;

function Icon({ name, size = 16, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  };
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
      __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
    }} />
  );
}

interface ListaItem {
  id: string;
  negocio_id: string;
  cliente_id: string | null;
  nombre: string | null;
  telefono: string | null;
  servicio_id: string | null;
  profesional_id: string | null;
  desde: string | null;
  hasta: string | null;
  franja: 'manana' | 'tarde' | 'cualquiera';
  nota: string | null;
  estado: 'esperando' | 'avisado' | 'resuelta' | 'cancelada';
  prioridad: number;
  created_at: string;
  avisado_at: string | null;
}
interface Servicio { id: string; nombre: string; }
interface Profesional { id: string; nombre: string; color: string; }
interface Cliente { id: string; nombre: string; telefono: string | null; }

type FiltroEstado = 'activas' | 'esperando' | 'avisado' | 'todas';

const FRANJA_LABEL: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', cualquiera: 'Cualquier hora' };

function ListaEsperaScreen() {
  const { isMobile } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('lista-espera');
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [negocioId, setNegocioId] = useState('');
  const [items, setItems] = useState<ListaItem[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState<FiltroEstado>('activas');
  const [showAdd, setShowAdd] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const profile = await getUserProfile();
    if (profile && !can(profile, 'agenda.ver_todas')) { setAccessDenied(true); setLoading(false); return; }
    const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    setNegocioId(nId);
    const [le, srv, prof, cli] = await Promise.all([
      supabase.from('lista_espera').select('*').eq('negocio_id', nId).order('prioridad', { ascending: false }).order('created_at', { ascending: true }),
      supabase.from('servicios').select('id, nombre').eq('negocio_id', nId),
      supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', nId).eq('activo', true),
      supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', nId).order('nombre').limit(500),
    ]);
    setItems(le.data ?? []);
    setServicios(srv.data ?? []);
    setProfesionales(prof.data ?? []);
    setClientes(cli.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const srvMap = useMemo(() => new Map(servicios.map(s => [s.id, s.nombre])), [servicios]);
  const profMap = useMemo(() => new Map(profesionales.map(p => [p.id, p])), [profesionales]);

  const visibles = useMemo(() => {
    if (filtro === 'todas') return items;
    if (filtro === 'activas') return items.filter(i => i.estado === 'esperando' || i.estado === 'avisado');
    return items.filter(i => i.estado === filtro);
  }, [items, filtro]);

  const conteo = useMemo(() => ({
    esperando: items.filter(i => i.estado === 'esperando').length,
    avisado: items.filter(i => i.estado === 'avisado').length,
  }), [items]);

  // -- Acciones --
  const marcarAvisado = useCallback(async (item: ListaItem) => {
    await supabase.from('lista_espera').update({ estado: 'avisado', avisado_at: new Date().toISOString() }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, estado: 'avisado', avisado_at: new Date().toISOString() } : i));
  }, []);

  const marcarResuelta = useCallback(async (item: ListaItem) => {
    await supabase.from('lista_espera').update({ estado: 'resuelta' }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, estado: 'resuelta' } : i));
  }, []);

  const quitar = useCallback(async (item: ListaItem) => {
    if (typeof window !== 'undefined' && !window.confirm('¿Quitar a esta persona de la lista de espera?')) return;
    await supabase.from('lista_espera').delete().eq('id', item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
  }, []);

  const abrirWhatsApp = (tel: string | null) => {
    if (!tel || typeof window === 'undefined') return;
    const limpio = tel.replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${limpio}`, '_blank');
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTer }}>Cargando…</div>;
  }
  if (accessDenied) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSec, padding: 24, textAlign: 'center' }}>No tienes permiso para ver la lista de espera.</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: isMobile ? '16px 12px' : '28px 32px', fontFamily: 'Inter, system-ui, sans-serif', overflowY: 'auto' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: -0.5, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              Lista de espera
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
            <p style={{ fontSize: 14, color: T.textTer, margin: '4px 0 0' }}>
              Apunta a quien quiere un hueco lleno y avísale cuando se libere uno.
            </p>
          </div>
          <button className="le-btn" onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 14, fontWeight: 700 }}>
            <Icon name="plus" size={16} color="#fff" /> Añadir a la lista
          </button>
        </div>

        {!paginaManual.loading && !paginaManual.visto && (
          <div style={{ marginBottom: 16 }}>
            <AvisoPrimeraVisita
              content={manualListaEspera}
              isMobile={isMobile}
              onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
              onCerrar={paginaManual.marcarVisto}
            />
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {([
            { k: 'activas', label: `Activas (${conteo.esperando + conteo.avisado})` },
            { k: 'esperando', label: `Esperando (${conteo.esperando})` },
            { k: 'avisado', label: `Avisadas (${conteo.avisado})` },
            { k: 'todas', label: 'Todas' },
          ] as { k: FiltroEstado; label: string }[]).map(f => {
            const on = filtro === f.k;
            return (
              <button key={f.k} className="le-chip" onClick={() => setFiltro(f.k)} style={{
                padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${on ? T.primary : T.border}`, background: on ? T.primary : T.card, color: on ? '#fff' : T.textSec,
              }}>{f.label}</button>
            );
          })}
        </div>

        {/* Lista */}
        {visibles.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textTer, fontSize: 14, border: `1px dashed ${T.borderHi}`, borderRadius: 14, background: T.panel }}>
            No hay nadie en esta vista de la lista de espera.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibles.map(item => {
              const prof = item.profesional_id ? profMap.get(item.profesional_id) : null;
              const resueltaOCancelada = item.estado === 'resuelta' || item.estado === 'cancelada';
              
              if (isMobile) {
                return (
                  <div key={item.id} className="le-row" style={{
                    display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px',
                    background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, opacity: resueltaOCancelada ? 0.6 : 1,
                  }}>
                    {/* Cabecera de la tarjeta: Avatar + Nombre + Estado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="user" size={16} color={T.primary} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{item.nombre || 'Sin nombre'}</span>
                          <EstadoBadge estado={item.estado} />
                        </div>
                        {item.telefono && (
                          <div style={{ fontSize: 12, color: T.textSec, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="phone" size={12} color={T.textTer} />
                            <span>{item.telefono}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Caja de Detalles */}
                    <div style={{ background: T.panel, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: T.textSec, display: 'flex', flexDirection: 'column', gap: 5, border: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: T.textTer }}>Servicio:</span>
                        <span style={{ fontWeight: 600, color: T.text }}>
                          {item.servicio_id && srvMap.get(item.servicio_id) ? srvMap.get(item.servicio_id) : 'Cualquier servicio'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: T.textTer }}>Profesional:</span>
                        <span style={{ fontWeight: 600, color: T.text }}>
                          {prof ? prof.nombre : 'Cualquier profesional'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: T.textTer }}>Preferencia:</span>
                        <span style={{ fontWeight: 600, color: T.text }}>
                          {FRANJA_LABEL[item.franja] || 'Cualquier hora'}
                        </span>
                      </div>
                    </div>

                    {item.nota && (
                      <div style={{ fontSize: 12, color: T.textSec, background: 'rgba(244,80,30,0.03)', borderLeft: `3px solid ${T.primary}`, padding: '6px 10px', borderRadius: '0 8px 8px 0', fontStyle: 'italic' }}>
                        {item.nota}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: T.textTer, borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 2 }}>
                      <span>Apuntado {format(parseISO(item.created_at), "d MMM 'a las' HH:mm", { locale: es })}</span>
                    </div>

                    {!resueltaOCancelada && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {item.telefono && (
                          <button className="le-btn" title="Abrir WhatsApp" onClick={() => abrirWhatsApp(item.telefono)} style={{ ...iconBtn(T.success), flex: 1, minWidth: 40 }}>
                            <Icon name="phone" size={15} color={T.success} />
                          </button>
                        )}
                        {item.estado === 'esperando' && (
                          <button className="le-btn" onClick={() => marcarAvisado(item)} style={{ ...pillBtn(T.warning, T.warningSoft), flex: 2, justifyContent: 'center' }}>
                            <Icon name="bell" size={14} color={T.warning} /> Avisar
                          </button>
                        )}
                        <button className="le-btn" onClick={() => marcarResuelta(item)} style={{ ...pillBtn(T.success, T.successSoft), flex: 2, justifyContent: 'center' }}>
                          <Icon name="check" size={14} color={T.success} /> Resuelta
                        </button>
                        <button className="le-btn" title="Quitar" onClick={() => quitar(item)} style={{ ...iconBtn(T.danger), flex: 1, minWidth: 40 }}>
                          <Icon name="x" size={15} color={T.danger} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={item.id} className="le-row" style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, opacity: resueltaOCancelada ? 0.6 : 1,
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="user" size={18} color={T.primary} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.nombre || 'Sin nombre'}</span>
                      <EstadoBadge estado={item.estado} />
                    </div>
                    <div style={{ fontSize: 13, color: T.textSec, marginTop: 3 }}>
                      {item.servicio_id && srvMap.get(item.servicio_id) ? srvMap.get(item.servicio_id) : 'Cualquier servicio'}
                      {prof ? ` · con ${prof.nombre}` : ' · cualquier profesional'}
                      {` · ${FRANJA_LABEL[item.franja] || 'Cualquier hora'}`}
                    </div>
                    {item.nota && <div style={{ fontSize: 12.5, color: T.textTer, marginTop: 3, fontStyle: 'italic' }}>{item.nota}</div>}
                    <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 3 }}>
                      Apuntado {format(parseISO(item.created_at), "d MMM 'a las' HH:mm", { locale: es })}
                      {item.telefono ? ` · ${item.telefono}` : ''}
                    </div>
                  </div>
                  {!resueltaOCancelada && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {item.telefono && (
                        <button className="le-btn" title="Abrir WhatsApp" onClick={() => abrirWhatsApp(item.telefono)} style={iconBtn(T.success)}>
                          <Icon name="phone" size={15} color={T.success} />
                        </button>
                      )}
                      {item.estado === 'esperando' && (
                        <button className="le-btn" onClick={() => marcarAvisado(item)} style={pillBtn(T.warning, T.warningSoft)}>
                          <Icon name="bell" size={14} color={T.warning} /> Avisar
                        </button>
                      )}
                      <button className="le-btn" onClick={() => marcarResuelta(item)} style={pillBtn(T.success, T.successSoft)}>
                        <Icon name="check" size={14} color={T.success} /> Resuelta
                      </button>
                      <button className="le-btn" title="Quitar" onClick={() => quitar(item)} style={iconBtn(T.danger)}>
                        <Icon name="x" size={15} color={T.danger} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <AddModal
          negocioId={negocioId}
          servicios={servicios}
          profesionales={profesionales}
          clientes={clientes}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); cargar(); }}
        />
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualListaEspera}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: ListaItem['estado'] }) {
  const map: Record<string, { label: string; color: string; soft: string }> = {
    esperando: { label: 'Esperando', color: T.primary, soft: T.primarySoft },
    avisado: { label: 'Avisada', color: T.warning, soft: T.warningSoft },
    resuelta: { label: 'Resuelta', color: T.success, soft: T.successSoft },
    cancelada: { label: 'Cancelada', color: T.textTer, soft: 'rgba(138,125,112,0.12)' },
  };
  const m = map[estado];
  return <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: m.color, background: m.soft, padding: '2px 8px', borderRadius: 999 }}>{m.label}</span>;
}

function iconBtn(color: string): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, border: `1px solid ${color}33`, background: 'transparent' };
}
function pillBtn(color: string, soft: string): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, border: `1px solid ${color}33`, background: soft, color, fontSize: 13, fontWeight: 600 };
}

// ---------------------------------------------------------------------------
// Modal de alta
// ---------------------------------------------------------------------------
function AddModal({ negocioId, servicios, profesionales, clientes, onClose, onSaved }: {
  negocioId: string;
  servicios: Servicio[];
  profesionales: Profesional[];
  clientes: Cliente[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [profesionalId, setProfesionalId] = useState('');
  const [franja, setFranja] = useState<'manana' | 'tarde' | 'cualquiera'>('cualquiera');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const q = nombre.trim().toLowerCase();
  const matchesClientes = q && !clienteId
    ? clientes.filter(c => c.nombre.toLowerCase().includes(q) || (c.telefono || '').includes(nombre.trim())).slice(0, 6)
    : [];

  const guardar = async () => {
    setErr('');
    if (!nombre.trim()) { setErr('Indica al menos el nombre.'); return; }
    setSaving(true);
    const { error } = await supabase.from('lista_espera').insert({
      negocio_id: negocioId,
      cliente_id: clienteId || null,
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      servicio_id: servicioId || null,
      profesional_id: profesionalId || null,
      franja,
      nota: nota.trim() || null,
      estado: 'esperando',
    });
    setSaving(false);
    if (error) { setErr(mensajeDeError(error, 'No se pudo guardar en la lista de espera.')); return; }
    onSaved();
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 5 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, animation: 'leFade 0.2s ease both' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: T.panel, borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(28,24,20,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0 }}>Añadir a la lista de espera</h2>
          <button className="le-btn" onClick={onClose} style={{ ...iconBtn(T.textTer), border: 'none' }}><Icon name="x" size={18} color={T.textSec} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Cliente *</label>
            <div style={{ position: 'relative' }}>
              <STextInput value={nombre} onChange={(v) => { setNombre(v); setClienteId(''); }} placeholder="Busca por nombre o teléfono, o escribe uno nuevo" leadingIcon="search" />
              {matchesClientes.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: T.panel, border: `1px solid ${T.borderHi}`, borderRadius: 10, boxShadow: '0 16px 40px rgba(28,24,20,0.18)', padding: 4, zIndex: 60, maxHeight: 220, overflowY: 'auto' }}>
                  {matchesClientes.map(c => (
                    <button key={c.id} className="le-opt" onClick={() => { setClienteId(c.id); setNombre(c.nombre); setTelefono(c.telefono || ''); }}
                      style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.nombre}</span>
                      {c.telefono && <span style={{ fontSize: 11, color: T.textTer }}>{c.telefono}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {clienteId ? (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                Cliente existente
                <button className="le-btn" onClick={() => setClienteId('')} style={{ border: 'none', background: 'transparent', color: T.textTer, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>cambiar</button>
              </div>
            ) : nombre.trim() ? (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.textTer }}>Se añadirá como cliente nuevo</div>
            ) : null}
          </div>
          <div>
            <label style={labelStyle}>Teléfono</label>
            <PhoneInput value={telefono} onChange={(e164) => setTelefono(e164)} placeholder="600 000 000" />
          </div>
          <div>
            <label style={labelStyle}>Servicio</label>
            <SSelect
              value={servicioId}
              onChange={setServicioId}
              width="100%"
              placeholder="Cualquier servicio"
              options={[{ value: '', label: 'Cualquier servicio' }, ...servicios.map(s => ({ value: String(s.id), label: s.nombre }))]}
            />
          </div>
          <div>
            <label style={labelStyle}>Profesional preferido</label>
            <SSelect
              value={profesionalId}
              onChange={setProfesionalId}
              width="100%"
              placeholder="Cualquier profesional"
              options={[{ value: '', label: 'Cualquier profesional' }, ...profesionales.map(p => ({ value: String(p.id), label: p.nombre }))]}
            />
          </div>
          <div>
            <label style={labelStyle}>Franja preferida</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['manana', 'tarde', 'cualquiera'] as const).map(f => (
                <button key={f} className="le-chip" onClick={() => setFranja(f)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${franja === f ? T.primary : T.border}`, background: franja === f ? T.primary : T.card, color: franja === f ? '#fff' : T.textSec,
                }}>{FRANJA_LABEL[f]}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Nota</label>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 9, boxSizing: 'border-box' }}>
              <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Disponibilidad, preferencias…" rows={2}
                style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', outline: 'none', resize: 'vertical', color: T.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', display: 'block' }} />
            </div>
          </div>
        </div>

        {err && <div style={{ marginTop: 12, fontSize: 13, color: T.danger }}>{err}</div>}

        <button className="le-btn" onClick={guardar} disabled={saving} style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: 11, border: 'none', background: T.primary, color: '#fff', fontSize: 15, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Guardando…' : 'Añadir a la lista'}
        </button>
      </div>
    </div>
  );
}

export default withClientDataGate(ListaEsperaScreen, 'Lista de espera');
