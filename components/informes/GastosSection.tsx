import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, canAccessInformes } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { reportarError } from '@/lib/reportarError';
import { startOfMonth, endOfMonth, format, parseISO, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';
import { RegistroCard, IconosRegistro } from './RegistroCard';


const Icon = ({ name, size = 20, color = '#1c1814' }: { name: string; size?: number; color?: string }) => {
  const icons: Record<string, string> = {
    dollar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

interface Gasto {
  id: string;
  concepto: string;
  categoria: 'alquiler' | 'suministros' | 'producto' | 'otros';
  importe_cents: number;
  fecha: string;
  es_recurrente: boolean;
}

export function GastosSection({ 
  negocioId: propNegocioId, 
  onGastosChange,
  customInicio,
  customFin 
}: { 
  negocioId?: string, 
  onGastosChange?: () => void,
  customInicio?: string | null,
  customFin?: string | null 
}) {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState(propNegocioId || '');
  const [mesSeleccionado, setMesSeleccionado] = useState<Date>(new Date());
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [nuevoGasto, setNuevoGasto] = useState<Partial<Gasto>>({
    categoria: 'otros',
    es_recurrente: false,
  });

  useEffect(() => {
    cargarNegocio();
  }, []);

  useEffect(() => {
    if (negocioId) {
      cargarGastos();
    }
  }, [negocioId, mesSeleccionado, customInicio, customFin]);

  async function cargarNegocio() {
    try {
      const profile = await getUserProfile();
      if (!canAccessInformes(profile)) return;
      setNegocioId(propNegocioId || profile?.negocio_id || NEGOCIO_ID_FALLBACK);
    } catch (e) {
      console.error(e);
    }
  }

  async function cargarGastos() {
    setLoading(true);
    const desde = customInicio ? customInicio : startOfMonth(mesSeleccionado).toISOString();
    const hasta = customFin ? customFin : endOfMonth(mesSeleccionado).toISOString();
    
    const { data, error } = await supabase
      .from('gastos')
      .select('*')
      .eq('negocio_id', negocioId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false });

    if (!error && data) {
      setGastos(data as Gasto[]);
    } else if (error) {
      reportarError(error, { origen: 'app', tipo: 'operativo' });
    }
    setLoading(false);
  }

  const handleGuardar = async () => {
    if (!nuevoGasto.concepto || !nuevoGasto.importe_cents) {
      alert('Por favor rellena el concepto y el importe.');
      return;
    }
    
    const { error } = await supabase.from('gastos').insert({
      negocio_id: negocioId,
      concepto: nuevoGasto.concepto,
      categoria: nuevoGasto.categoria || 'otros',
      importe_cents: nuevoGasto.importe_cents,
      fecha: nuevoGasto.fecha || new Date().toISOString(),
      es_recurrente: nuevoGasto.es_recurrente || false,
    });

    if (error) {
      console.error('Error guardando gasto:', error);
      reportarError(error, { origen: 'app', tipo: 'operativo' });
      alert('Error guardando el gasto. El equipo técnico ha sido notificado.');
    } else {
      setModalOpen(false);
      setNuevoGasto({ categoria: 'otros', es_recurrente: false });
      cargarGastos();
      if (onGastosChange) onGastosChange();
    }
  };

  const handleBorrar = async (id: string) => {
    if (!confirm('¿Seguro que quieres borrar este gasto?')) return;
    const { error } = await supabase.from('gastos').delete().eq('id', id);
    if (error) {
      console.error('Error borrando gasto:', error);
      reportarError(error, { origen: 'app', tipo: 'operativo' });
      alert('Error al eliminar el gasto.');
    } else {
      cargarGastos();
      if (onGastosChange) onGastosChange();
    }
  };

  const fmtEur = (cents: number) => (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 });

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: d, label: format(d, "MMMM yyyy", { locale: es }) };
  });

  const periodoLabel = customInicio && customFin 
    ? `${format(parseISO(customInicio), 'd MMM yyyy', { locale: es })} - ${format(parseISO(customFin), 'd MMM yyyy', { locale: es })}`
    : `${format(startOfMonth(mesSeleccionado), 'd MMM', { locale: es })} - ${format(endOfMonth(mesSeleccionado), 'd MMM yyyy', { locale: es })}`;
  const totalMes = gastos.reduce((acc, g) => acc + g.importe_cents, 0);

  return (
    <>
      <RegistroCard
        titulo="Gastos fijos y variables"
        descripcion={periodoLabel}
        icono={IconosRegistro.gasto}
        acento={TOKENS.danger}
        accion={
          <button
            onClick={() => setModalOpen(true)}
            style={{ padding: '6px 12px', borderRadius: 8, background: TOKENS.danger, color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="plus" size={14} color="#fff" /> Añadir
          </button>
        }
      >
        <>
          {/* Selector de mes */}
          {!(customInicio && customFin) && (
            <div style={{ display: 'flex', gap: 4, background: TOKENS.bgPanel, borderRadius: 10, padding: 3, border: `1px solid ${TOKENS.border}`, overflowX: 'auto', marginBottom: 16 }}>
              {meses.slice(0, 6).map(m => (
                <button
                  key={m.label}
                  onClick={() => setMesSeleccionado(m.value)}
                  style={{
                    padding: isMobile ? '6px 11px' : '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: isMobile ? 11.5 : 12, fontWeight: startOfMonth(mesSeleccionado).getTime() === startOfMonth(m.value).getTime() ? 600 : 400,
                    background: startOfMonth(mesSeleccionado).getTime() === startOfMonth(m.value).getTime() ? TOKENS.dangerSoft : 'transparent',
                    color: startOfMonth(mesSeleccionado).getTime() === startOfMonth(m.value).getTime() ? TOKENS.danger : TOKENS.textSec,
                    transition: 'all 0.2s ease', whiteSpace: 'nowrap'
                  }}
                >
                  {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: TOKENS.bgPanel, border: `1px solid ${TOKENS.border}` }}>
            <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total de Gastos</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.danger }}>{fmtEur(totalMes)} €</div>
          </div>

          {loading ? (
             <div style={{ textAlign: 'center', padding: 20, color: TOKENS.textSec, fontSize: 13 }}>Cargando gastos...</div>
          ) : gastos.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', borderRadius: 12, background: TOKENS.bgPanel, border: `1px solid ${TOKENS.border}` }}>
              <Icon name="alert" size={32} color={TOKENS.textTer} />
              <div style={{ marginTop: 12, fontSize: 14, color: TOKENS.textSec }}>No hay gastos registrados en este periodo.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gastos.map(g => {
                const isExpanded = expandedId === g.id;
                return (
                  <div key={g.id} style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, border: `1px solid ${TOKENS.border}`, background: TOKENS.bgPanel, overflow: 'hidden' }}>
                    <div 
                      onClick={() => setExpandedId(isExpanded ? null : g.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, cursor: 'pointer' }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.text }}>{g.concepto}</div>
                        <div style={{ fontSize: 12, color: TOKENS.textSec, display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                          <span style={{ padding: '2px 6px', background: TOKENS.bg, borderRadius: 4, textTransform: 'capitalize' }}>{g.categoria}</span>
                          <span>{format(parseISO(g.fecha), 'd MMM yyyy', { locale: es })}</span>
                          {g.es_recurrente && <span style={{ color: TOKENS.warning }}>• Recurrente</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.danger }}>{fmtEur(g.importe_cents)} €</div>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div style={{ borderTop: `1px dashed ${TOKENS.border}`, padding: '12px 14px', background: TOKENS.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, color: TOKENS.textSec }}>
                          <strong>ID:</strong> {g.id}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => handleBorrar(g.id)} style={{ padding: '6px 12px', background: TOKENS.dangerSoft, color: TOKENS.danger, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="trash" size={14} color={TOKENS.danger} /> Eliminar gasto
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      </RegistroCard>

      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(28,24,20,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setModalOpen(false)}>
          <div style={{ background: TOKENS.bgCard, borderRadius: 14, width: '100%', maxWidth: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: TOKENS.text }}>Añadir Gasto</h2>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textSec, marginBottom: 4 }}>Concepto</label>
              <input type="text" value={nuevoGasto.concepto || ''} onChange={e => setNuevoGasto({...nuevoGasto, concepto: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOKENS.border}` }} placeholder="Ej. Alquiler Local" />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textSec, marginBottom: 4 }}>Importe (€)</label>
              <input type="number" step="0.01" value={nuevoGasto.importe_cents ? nuevoGasto.importe_cents / 100 : ''} onChange={e => setNuevoGasto({...nuevoGasto, importe_cents: Math.round(parseFloat(e.target.value) * 100)})} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOKENS.border}` }} placeholder="0.00" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textSec, marginBottom: 4 }}>Categoría</label>
              <select value={nuevoGasto.categoria} onChange={e => setNuevoGasto({...nuevoGasto, categoria: e.target.value as any})} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOKENS.border}` }}>
                <option value="alquiler">Alquiler</option>
                <option value="suministros">Suministros (Agua, Luz, etc.)</option>
                <option value="producto">Producto / Material</option>
                <option value="otros">Otros</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textSec, marginBottom: 4 }}>Fecha</label>
              <input type="date" value={nuevoGasto.fecha ? format(parseISO(nuevoGasto.fecha), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} onChange={e => setNuevoGasto({...nuevoGasto, fecha: new Date(e.target.value).toISOString()})} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOKENS.border}` }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setModalOpen(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: 'transparent', cursor: 'pointer', color: TOKENS.text, fontWeight: 600 }}>Cancelar</button>
              <button onClick={handleGuardar} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: TOKENS.danger, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
