import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  type Presupuesto, type Concepto, type PresupuestoLinea, type PresupuestoEstado,
  ESTADO_META, eur, parseEurToCents, lineasTotalCents,
  cargarConceptos, guardarConcepto, guardarPresupuesto, subirPresupuestoPdf, enviarPresupuestoPorCorreo,
} from '@/lib/presupuestos';
import { generarPresupuestoPdf, descargarBlob } from '@/lib/presupuestoPdf';

const T = {
  bg: '#f6f1ea', panel: '#fffdfb', card: '#ffffff', cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)', borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814', textSec: '#5c5249', textTer: '#736658',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b', successSoft: 'rgba(15,157,107,0.12)',
  warning: '#e08a00', danger: '#e23b34', dangerSoft: 'rgba(226,59,52,0.12)',
};

const ANIM = `
  @keyframes pFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes pUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  .p-row { animation: pUp 0.3s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.15s ease; }
  .p-row:hover { background: ${T.cardHi} !important; }
  .p-btn { transition: all 0.15s ease; cursor: pointer; }
  .p-btn:hover { filter: brightness(1.04); }
  .p-modal-overlay { animation: pFade 0.2s ease; }
  .p-modal { animation: pUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const ICONS: Record<string, string> = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
};
function Icon({ name, size = 16, color = T.text }: { name: string; size?: number; color?: string }) {
  return <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
    __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  }} />;
}

function EstadoChip({ estado }: { estado: PresupuestoEstado }) {
  const m = ESTADO_META[estado];
  return <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 999 }}>{m.label}</span>;
}

interface Salon { nombre: string; color: string; direccion: string | null; telefono: string | null; slug: string | null; }
interface Prof { id: string; nombre: string; }
interface Serv { id: string; nombre: string; precio: number; duracion_activa_min: number | null; }

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR (modal)
// ─────────────────────────────────────────────────────────────────────────────
interface LineaDraft { concepto_id: string | null; nombre: string; precio: string; cantidad: number; guardar: boolean; }

function EditorModal({ profile, salon, profesionales, servicios, conceptos, initial, onClose, onSaved, reloadConceptos }: {
  profile: { negocio_id: string; id: string };
  salon: Salon;
  profesionales: Prof[];
  servicios: Serv[];
  conceptos: Concepto[];
  initial: Presupuesto | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  reloadConceptos: () => void;
}) {
  const { isMobile } = useResponsive();
  const [contactoNombre, setContactoNombre] = useState(initial?.contacto_nombre || '');
  const [contactoTelefono, setContactoTelefono] = useState(initial?.contacto_telefono || '');
  const [contactoEmail, setContactoEmail] = useState(initial?.contacto_email || '');
  const [clienteId, setClienteId] = useState<string | null>(initial?.cliente_id || null);
  const [profesionalId, setProfesionalId] = useState<string>(initial?.profesional_id || '');
  const [titulo, setTitulo] = useState(initial?.titulo || '');
  const [notas, setNotas] = useState(initial?.notas || '');
  const [validezDias, setValidezDias] = useState('30');
  const [lineas, setLineas] = useState<LineaDraft[]>(
    (initial?.lineas || []).map(l => ({ concepto_id: l.concepto_id ?? null, nombre: l.nombre, precio: ((l.precio_cents || 0) / 100).toString(), cantidad: l.cantidad || 1, guardar: false }))
  );
  const [busy, setBusy] = useState<null | 'guardar' | 'pdf' | 'email'>(null);
  const [error, setError] = useState('');
  const [servicioSelectorOpen, setServicioSelectorOpen] = useState(false);

  const eliminarConceptoCatalogo = async (conceptoId: string, nombre: string) => {
    if (!window.confirm(`¿Seguro que quieres eliminar el concepto "${nombre}" del catálogo general? Ya no aparecerá como opción sugerida.`)) return;
    try {
      const { error } = await supabase.from('presupuesto_conceptos').delete().eq('id', conceptoId);
      if (error) throw error;
      
      // Limpiar de las líneas del borrador si coinciden con este concepto_id
      setLineas(prev => prev.map(l => l.concepto_id === conceptoId ? { ...l, concepto_id: null } : l));
      reloadConceptos();
    } catch (err) {
      alert('No se pudo eliminar el concepto del catálogo: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Buscador de cliente existente
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResultados, setClienteResultados] = useState<Array<{ id: string; nombre: string; telefono: string | null; email: string | null }>>([]);
  useEffect(() => {
    if (clienteQuery.trim().length < 2) { setClienteResultados([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes')
        .select('id, nombre, telefono, email')
        .eq('negocio_id', profile.negocio_id)
        .ilike('nombre', `%${clienteQuery.trim()}%`)
        .limit(8);
      if (!cancel) setClienteResultados(data || []);
    }, 220);
    return () => { cancel = true; clearTimeout(t); };
  }, [clienteQuery, profile.negocio_id]);

  const totalCents = useMemo(
    () => lineasTotalCents(lineas.map(l => ({ nombre: l.nombre, precio_cents: parseEurToCents(l.precio), cantidad: l.cantidad }))),
    [lineas]
  );

  const addLinea = () => setLineas(prev => [...prev, { concepto_id: null, nombre: '', precio: '', cantidad: 1, guardar: true }]);
  const setLinea = (i: number, patch: Partial<LineaDraft>) => setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const delLinea = (i: number) => setLineas(prev => prev.filter((_, idx) => idx !== i));
  const addServicio = (servicio: Serv) => {
    setLineas(prev => [...prev, {
      concepto_id: null,
      nombre: servicio.nombre,
      precio: (servicio.precio / 100).toString(),
      cantidad: 1,
      guardar: false
    }]);
    setServicioSelectorOpen(false);
  };

  // Al escribir el nombre de una línea, si coincide con un concepto del catálogo, prefijar precio.
  const onLineaNombre = (i: number, nombre: string) => {
    const match = conceptos.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase());
    if (match) setLinea(i, { nombre, precio: (match.precio_cents / 100).toString(), concepto_id: match.id, guardar: false });
    else setLinea(i, { nombre, concepto_id: null });
  };

  const lineasLimpias = (): PresupuestoLinea[] => lineas
    .filter(l => l.nombre.trim() && parseEurToCents(l.precio) > 0)
    .map(l => ({ concepto_id: l.concepto_id, nombre: l.nombre.trim(), precio_cents: parseEurToCents(l.precio), cantidad: Math.max(1, l.cantidad || 1) }));

  // Guarda presupuesto + conceptos nuevos marcados. Devuelve el presupuesto.
  const persistir = async (estado?: PresupuestoEstado): Promise<Presupuesto> => {
    const ls = lineasLimpias();
    if (ls.length === 0) throw new Error('Añade al menos una línea con precio.');
    // Guardar conceptos nuevos para reusarlos
    for (const l of lineas) {
      if (l.guardar && l.nombre.trim() && parseEurToCents(l.precio) > 0 && !l.concepto_id) {
        await guardarConcepto(profile.negocio_id, l.nombre, parseEurToCents(l.precio)).catch(() => {});
      }
    }
    const validoHasta = (() => {
      const d = parseInt(validezDias, 10);
      if (!d || d <= 0) return null;
      const dt = new Date(); dt.setDate(dt.getDate() + d);
      return format(dt, 'yyyy-MM-dd');
    })();
    const saved = await guardarPresupuesto({
      id: initial?.id, negocioId: profile.negocio_id, estado,
      clienteId, contactoNombre: contactoNombre.trim() || null,
      contactoTelefono: contactoTelefono.trim() || null, contactoEmail: contactoEmail.trim() || null,
      profesionalId: profesionalId || null, titulo: titulo.trim() || null, notas: notas.trim() || null,
      validoHasta, citaId: initial?.cita_id || null, lineas: ls,
    });
    reloadConceptos();
    return saved;
  };

  const buildPdf = async (saved: Presupuesto): Promise<Blob> => generarPresupuestoPdf({
    salonNombre: salon.nombre, color: salon.color, salonDireccion: salon.direccion, salonTelefono: salon.telefono,
    numero: saved.numero, fecha: new Date(), contactoNombre: contactoNombre.trim() || null,
    titulo: titulo.trim() || null, notas: notas.trim() || null,
    lineas: lineasLimpias().map(l => ({ nombre: l.nombre, precio_cents: l.precio_cents, cantidad: l.cantidad })),
    totalCents, validoHasta: saved.valido_hasta,
  });

  const onGuardar = async () => {
    setError(''); setBusy('guardar');
    try { await persistir(); onSaved('Presupuesto guardado'); }
    catch (e) { setError(mensajeDeError(e)); } finally { setBusy(null); }
  };

  const onVerPdf = async () => {
    setError(''); setBusy('pdf');
    try {
      const saved = await persistir();
      const blob = await buildPdf(saved);
      await subirPresupuestoPdf(profile.negocio_id, saved.id, blob).catch(() => {});
      descargarBlob(blob, `presupuesto-P-${saved.numero}.pdf`);
      onSaved('PDF generado');
    } catch (e) { setError(mensajeDeError(e)); } finally { setBusy(null); }
  };

  const onEnviarCorreo = async () => {
    setError('');
    if (!contactoEmail.trim()) { setError('Indica el correo del cliente para enviarlo.'); return; }
    setBusy('email');
    try {
      const saved = await persistir('enviado');
      const blob = await buildPdf(saved);
      await subirPresupuestoPdf(profile.negocio_id, saved.id, blob);
      await enviarPresupuestoPorCorreo(saved.id);
      onSaved('Presupuesto enviado por correo');
    } catch (e) { setError(mensajeDeError(e)); } finally { setBusy(null); }
  };

  const inputBase: React.CSSProperties = { padding: '9px 11px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 13.5, boxSizing: 'border-box', width: '100%' };
  const labelBase: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, display: 'block' };

  return (
    <div className="p-modal-overlay" onClick={() => { if (!busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 220, display: 'grid', placeItems: isMobile ? 'end stretch' : 'center', padding: isMobile ? 0 : 16 }}>
      <div className="p-modal" onClick={e => e.stopPropagation()}
        style={{ background: T.panel, border: `1px solid ${T.borderHi}`, borderRadius: isMobile ? '16px 16px 0 0' : 16, padding: isMobile ? 18 : 24, width: '100%', maxWidth: 560, maxHeight: isMobile ? '94vh' : '92vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text }}>{initial ? `Presupuesto P-${initial.numero}` : 'Nuevo presupuesto'}</h3>
          <button onClick={onClose} className="p-btn" style={{ background: 'none', border: 'none', padding: 4 }}><Icon name="x" size={20} color={T.textTer} /></button>
        </div>

        {/* Contacto */}
        <label style={labelBase}>Cliente</label>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input value={clienteQuery} onChange={e => setClienteQuery(e.target.value)} placeholder="Buscar cliente existente (opcional)"
            style={{ ...inputBase, paddingLeft: 34 }} />
          <span style={{ position: 'absolute', left: 11, top: 10 }}><Icon name="search" size={15} color={T.textTer} /></span>
          {clienteResultados.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: T.card, border: `1px solid ${T.borderHi}`, borderRadius: 9, marginTop: 4, boxShadow: '0 8px 24px rgba(40,30,24,0.18)', overflow: 'hidden' }}>
              {clienteResultados.map(c => (
                <div key={c.id} className="p-btn" onClick={() => {
                  setClienteId(c.id); setContactoNombre(c.nombre || ''); setContactoTelefono(c.telefono || ''); setContactoEmail(c.email || '');
                  setClienteQuery(''); setClienteResultados([]);
                }} style={{ padding: '9px 12px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}` }}>
                  {c.nombre} {c.telefono ? <span style={{ color: T.textTer }}>· {c.telefono}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input value={contactoNombre} onChange={e => { setContactoNombre(e.target.value); setClienteId(null); }} placeholder="Nombre" style={inputBase} />
          <input value={contactoTelefono} onChange={e => setContactoTelefono(e.target.value)} placeholder="Teléfono" style={inputBase} inputMode="tel" />
        </div>
        <input value={contactoEmail} onChange={e => setContactoEmail(e.target.value)} placeholder="Correo (para enviar el presupuesto)" style={{ ...inputBase, marginBottom: 10 }} inputMode="email" />
        {clienteId && <div style={{ fontSize: 11.5, color: T.success, marginBottom: 12 }}>Vinculado a la ficha del cliente · se le contabilizará al cobrar.</div>}

        {/* Profesional */}
        <label style={labelBase}>Profesional (opcional)</label>
        <select value={profesionalId} onChange={e => setProfesionalId(e.target.value)} style={{ ...inputBase, marginBottom: 14 }}>
          <option value="">Sin asignar</option>
          {profesionales.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        {/* Líneas */}
        <label style={labelBase}>Conceptos</label>
        <datalist id="conceptos-list">{conceptos.map(c => <option key={c.id} value={c.nombre} />)}</datalist>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {lineas.map((l, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input list="conceptos-list" value={l.nombre} onChange={e => onLineaNombre(i, e.target.value)} placeholder="Concepto (ej. Tratamiento)" style={{ ...inputBase, flex: 1 }} />
                <button onClick={() => delLinea(i)} className="p-btn" aria-label="Quitar" style={{ background: 'none', border: 'none', padding: 4 }}><Icon name="trash" size={16} color={T.danger} /></button>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <input value={l.precio} onChange={e => setLinea(i, { precio: e.target.value })} placeholder="Precio €" inputMode="decimal" style={{ ...inputBase, width: 90, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: T.textTer }}>×</span>
                <input value={String(l.cantidad)} onChange={e => setLinea(i, { cantidad: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })} inputMode="numeric" style={{ ...inputBase, width: 56, textAlign: 'center' }} />
                <span style={{ flex: 1, textAlign: 'right', fontSize: 13, fontWeight: 600, color: T.text }}>{eur(parseEurToCents(l.precio) * Math.max(1, l.cantidad))}</span>
              </div>
              {!l.concepto_id && l.nombre.trim() && parseEurToCents(l.precio) > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: T.textSec, cursor: 'pointer' }}>
                  <input type="checkbox" checked={l.guardar} onChange={e => setLinea(i, { guardar: e.target.checked })} /> Guardar este concepto para futuros presupuestos
                </label>
              )}
              {l.concepto_id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5, color: T.textTer }}>
                  <span>✓ Concepto guardado en catálogo</span>
                  <button
                    onClick={() => eliminarConceptoCatalogo(l.concepto_id!, l.nombre)}
                    style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '0 4px', textDecoration: 'underline', fontSize: 11 }}
                  >
                    Eliminar del catálogo
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={addLinea} className="p-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: T.card, border: `1px dashed ${T.borderHi}`, borderRadius: 9, color: T.primary, fontSize: 13, fontWeight: 600, width: '100%', justifyContent: 'center', marginBottom: 8 }}>
          <Icon name="plus" size={15} color={T.primary} /> Añadir concepto
        </button>
        <button onClick={() => setServicioSelectorOpen(!servicioSelectorOpen)} className="p-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, color: T.textSec, fontSize: 13, fontWeight: 600, width: '100%', justifyContent: 'center', marginBottom: 14 }}>
          <Icon name="doc" size={15} color={T.textSec} /> Añadir desde servicios
        </button>

        {/* Selector de servicios */}
        {servicioSelectorOpen && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 14, maxHeight: 240, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTer, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Selecciona un servicio</div>
            {servicios.length === 0 ? (
              <div style={{ fontSize: 13, color: T.textSec, textAlign: 'center', padding: 16 }}>No hay servicios activos</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {servicios.map(s => (
                  <div key={s.id} onClick={() => addServicio(s)} className="p-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{s.nombre}</div>
                      <div style={{ fontSize: 11.5, color: T.textSec }}>{s.duracion_activa_min || 0} min</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.primary }}>{eur(s.precio)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Título / notas / validez */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 10, marginBottom: 10 }}>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (opcional, ej. Cambio de color completo)" style={inputBase} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input value={validezDias} onChange={e => setValidezDias(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={{ ...inputBase, width: 64, textAlign: 'center' }} />
            <span style={{ fontSize: 12.5, color: T.textSec }}>días de validez</span>
          </div>
        </div>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)" rows={2} style={{ ...inputBase, marginBottom: 14, resize: 'vertical', fontFamily: 'inherit' }} />

        {/* Total */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}`, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.primary }}>{eur(totalCents)}</span>
        </div>

        {error && <div style={{ fontSize: 12.5, color: T.danger, marginBottom: 12, background: T.dangerSoft, padding: '8px 12px', borderRadius: 8 }}>{error}</div>}

        {/* Acciones */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onGuardar} disabled={!!busy} className="p-btn" style={{ padding: '10px 16px', background: T.card, border: `1px solid ${T.borderHi}`, color: T.text, borderRadius: 9, fontSize: 13, fontWeight: 600 }}>
            {busy === 'guardar' ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button onClick={onVerPdf} disabled={!!busy} className="p-btn" style={{ padding: '10px 16px', background: T.card, border: `1px solid ${T.borderHi}`, color: T.text, borderRadius: 9, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="download" size={15} color={T.textSec} /> {busy === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
          <button onClick={onEnviarCorreo} disabled={!!busy} className="p-btn" style={{ padding: '10px 18px', background: T.primary, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="send" size={15} color="#fff" /> {busy === 'email' ? 'Enviando…' : 'Enviar por correo'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 10, fontSize: 11.5, color: T.textTer }}>
          <Icon name="whatsapp" size={14} color={T.textTer} /> Envío por WhatsApp · próximamente
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function PresupuestosScreen() {
  const { isMobile } = useResponsive();
  const [profile, setProfile] = useState<{ negocio_id: string; id: string } | null>(null);
  const [salon, setSalon] = useState<Salon>({ nombre: 'Salón', color: '#f4501e', direccion: null, telefono: null, slug: null });
  const [profesionales, setProfesionales] = useState<Prof[]>([]);
  const [servicios, setServicios] = useState<Serv[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | PresupuestoEstado>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; initial: Presupuesto | null }>({ open: false, initial: null });
  const [mensaje, setMensaje] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reloadConceptos = useCallback(async () => {
    if (!profile?.negocio_id) return;
    cargarConceptos(profile.negocio_id).then(setConceptos).catch(() => {});
  }, [profile?.negocio_id]);

  const cargar = useCallback(async () => {
    try {
      const p = await getUserProfile();
      if (!p?.negocio_id) { setLoading(false); return; }
      setProfile({ negocio_id: p.negocio_id, id: p.id });

      const [{ data: pres }, { data: profs }, { data: srvs }, { data: portal }, concs] = await Promise.all([
        supabase.from('presupuestos').select('*').eq('negocio_id', p.negocio_id).order('created_at', { ascending: false }),
        supabase.from('profesionales').select('id, nombre').eq('negocio_id', p.negocio_id).eq('activo', true).order('nombre'),
        supabase.from('servicios').select('id, nombre, precio, duracion_activa_min').eq('negocio_id', p.negocio_id).eq('activo', true).order('nombre'),
        supabase.from('negocio_portal').select('nombre_publico, color_acento, direccion, telefono, slug').eq('negocio_id', p.negocio_id).maybeSingle(),
        cargarConceptos(p.negocio_id),
      ]);
      setPresupuestos((pres || []) as Presupuesto[]);
      setProfesionales((profs || []) as Prof[]);
      setServicios((srvs || []) as Serv[]);
      setConceptos(concs);
      if (portal) setSalon({
        nombre: portal.nombre_publico || p.nombre_negocio || 'Salón',
        color: portal.color_acento && /^#?[0-9a-f]{6}$/i.test(portal.color_acento) ? (portal.color_acento.startsWith('#') ? portal.color_acento : `#${portal.color_acento}`) : '#f4501e',
        direccion: portal.direccion, telefono: portal.telefono, slug: portal.slug,
      });
    } catch (e) {
      setMensaje({ type: 'error', text: mensajeDeError(e) });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const flash = (type: 'success' | 'error', text: string) => { setMensaje({ type, text }); setTimeout(() => setMensaje(null), 3500); };

  const onEditorSaved = async (msg: string) => {
    setEditor({ open: false, initial: null });
    flash('success', msg);
    if (profile?.negocio_id) {
      const { data } = await supabase.from('presupuestos').select('*').eq('negocio_id', profile.negocio_id).order('created_at', { ascending: false });
      setPresupuestos((data || []) as Presupuesto[]);
    }
  };

  const openEditor = async (p: Presupuesto | null) => {
    if (p) {
      const { data: lineas } = await supabase.from('presupuesto_lineas').select('*').eq('presupuesto_id', p.id).order('orden');
      setEditor({ open: true, initial: { ...p, lineas: (lineas || []) as PresupuestoLinea[] } });
    } else {
      setEditor({ open: true, initial: null });
    }
  };

  const eliminar = async (p: Presupuesto) => {
    if (!confirm(`¿Eliminar el presupuesto P-${p.numero}?`)) return;
    const { error } = await supabase.from('presupuestos').delete().eq('id', p.id);
    if (error) { flash('error', mensajeDeError(error)); return; }
    setPresupuestos(prev => prev.filter(x => x.id !== p.id));
    flash('success', 'Presupuesto eliminado');
  };

  const copiarEnlace = async (p: Presupuesto) => {
    const url = `${window.location.origin}/app/presupuesto/${p.token}`;
    try { await navigator.clipboard.writeText(url); flash('success', 'Enlace copiado'); }
    catch { flash('error', 'No se pudo copiar'); }
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return presupuestos.filter(p =>
      (filtro === 'todos' || p.estado === filtro) &&
      (!q || (p.contacto_nombre || '').toLowerCase().includes(q) || String(p.numero).includes(q) || (p.titulo || '').toLowerCase().includes(q))
    );
  }, [presupuestos, filtro, busqueda]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      Cargando presupuestos…
    </div>;
  }

  const FILTROS: Array<['todos' | PresupuestoEstado, string]> = [
    ['todos', 'Todos'], ['borrador', 'Borradores'], ['enviado', 'Enviados'], ['aceptado', 'Aceptados'], ['cobrado', 'Cobrados'],
  ];

  return (
    <div style={{ background: T.bg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{ANIM}</style>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 14px 96px' : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: isMobile ? 14 : 20 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: T.text, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="doc" size={isMobile ? 22 : 26} color={T.primary} /> Presupuestos
            </h1>
            <p style={{ fontSize: isMobile ? 13 : 14, color: T.textSec, margin: 0 }}>Crea un presupuesto, envíalo en PDF por correo y cóbralo en Caja cuando la clienta acepte.</p>
          </div>
          <button onClick={() => openEditor(null)} className="p-btn" style={{ padding: '11px 18px', background: T.primary, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Icon name="plus" size={16} color="#fff" /> Nuevo presupuesto
          </button>
        </div>

        {mensaje && <div style={{ padding: '11px 15px', borderRadius: 10, marginBottom: 14, background: mensaje.type === 'success' ? T.successSoft : T.dangerSoft, color: mensaje.type === 'success' ? T.success : T.danger, fontSize: 13.5 }}>{mensaje.text}</div>}

        {/* Filtros + búsqueda */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {FILTROS.map(([k, lbl]) => {
            const on = filtro === k;
            return <button key={k} onClick={() => setFiltro(k)} className="p-btn" style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: on ? T.primary : T.card, color: on ? '#fff' : T.textSec, border: `1px solid ${on ? T.primary : T.border}` }}>{lbl}</button>;
          })}
          <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, nº o título" style={{ width: '100%', padding: '8px 12px 8px 32px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
            <span style={{ position: 'absolute', left: 10, top: 9 }}><Icon name="search" size={14} color={T.textTer} /></span>
          </div>
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
            <Icon name="doc" size={42} color={T.textTer} />
            <p style={{ fontSize: 15, color: T.textSec, marginTop: 14, marginBottom: 4 }}>No hay presupuestos {filtro !== 'todos' ? 'en este estado' : 'todavía'}</p>
            <p style={{ fontSize: 13, color: T.textTer, margin: 0 }}>Crea uno con el botón “Nuevo presupuesto”.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtrados.map((p, idx) => (
              <div key={p.id} className="p-row" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 14 : '14px 18px', animationDelay: `${idx * 0.02}s`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 16, alignItems: isMobile ? 'stretch' : 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textTer }}>P-{p.numero}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{p.contacto_nombre || 'Sin nombre'}</span>
                    <EstadoChip estado={p.estado} />
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textSec }}>
                    {p.titulo ? `${p.titulo} · ` : ''}{format(parseISO(p.created_at), "d MMM yyyy", { locale: es })}
                    {p.enviado_email_at ? ' · enviado por correo' : ''}
                  </div>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', textAlign: isMobile ? 'left' : 'right' }}>{eur(p.total_cents)}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                  <button onClick={() => openEditor(p)} className="p-btn" title="Editar" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}><Icon name="edit" size={15} color={T.textSec} /></button>
                  <button onClick={() => copiarEnlace(p)} className="p-btn" title="Copiar enlace" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}><Icon name="link" size={15} color={T.textSec} /></button>
                  <button onClick={() => eliminar(p)} className="p-btn" title="Eliminar" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}><Icon name="trash" size={15} color={T.danger} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editor.open && profile && (
        <EditorModal profile={profile} salon={salon} profesionales={profesionales} servicios={servicios} conceptos={conceptos}
          initial={editor.initial} onClose={() => setEditor({ open: false, initial: null })} onSaved={onEditorSaved} reloadConceptos={reloadConceptos} />
      )}
    </div>
  );
}
