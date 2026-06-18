import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { format, parseISO, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';

// ─────────────────────────────────────────────────────────────────────────────────
// Tokens (consistente con el resto de .web.tsx)
// ─────────────────────────────────────────────────────────────────────────────────
const T = {
  bg: '#f6f1ea',
  panel: '#fffdfb',
  card: '#ffffff',
  cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)',
  borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#8a7d70',
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
  @keyframes caFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes caUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  .ca-row { animation: caUp 0.35s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.15s ease; }
  .ca-row:hover { background: ${T.cardHi} !important; }
  .ca-row.selected { background: ${T.primarySoft} !important; border-color: ${T.primary} !important; }
  .ca-btn { transition: all 0.15s ease; cursor: pointer; }
  .ca-btn:hover { filter: brightness(1.05); }
  .ca-modal-overlay { animation: caFade 0.2s ease; }
  .ca-modal { animation: caUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
`;

function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4z"/>',
    credit: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    cash: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    scisors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="6" r="1"/><path d="M20.2 19.2L13 12"/><path d="M18 4l4 4-8.8 8.8a4 4 0 0 1-2.8 1.2H4l1.8-1.8a4 4 0 0 1 1.2-2.8L18 4z"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  };
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
      __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────────
interface CitaPendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  cliente_nombre: string | null;
  profesional_nombre: string | null;
  servicio_nombre: string | null;
  servicio_precio: number | null;
  sena_pagada: number; // señal ya pagada
  total_pendiente: number; // lo que falta cobrar
}

interface CobroFormData {
  metodo: 'efectivo' | 'datafono';
  propina: number;
  descuento: number;
}

// ─────────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────────
export default function CajaScreen() {
  const [citas, setCitas] = useState<CitaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCobroModal, setShowCobroModal] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [mensaje, setMensaje] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Totales de la selección
  const seleccion = useMemo(() => {
    const seleccionadas = citas.filter(c => selectedIds.has(c.id));
    const totalServicios = seleccionadas.reduce((s, c) => s + (c.servicio_precio || 0), 0);
    const totalSenas = seleccionadas.reduce((s, c) => s + c.sena_pagada, 0);
    const pendiente = totalServicios - totalSenas;
    return { count: seleccionadas.length, totalServicios, totalSenas, pendiente };
  }, [citas, selectedIds]);

  // Cargar citas pendientes de cobro (hoy)
  const cargarCitas = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('citas')
        .select(`
          id,
          fecha,
          hora_inicio,
          cliente_id,
          clientes (nombre, apellidos),
          profesional_id,
          profesionales (nombre),
          cita_servicios (
            servicios (nombre, precio)
          ),
          pagos (tipo, amount_cents, estado)
        `)
        .eq('negocio_id', profile.negocio_id)
        .eq('cobrada', false)
        .in('estado', ['completada', 'finalizada'])
        .gte('fecha', new Date().toISOString().split('T')[0])
        .order('hora_inicio', { ascending: true });

      if (error) throw error;

      // Procesar datos
      const procesadas: CitaPendiente[] = (data || []).map((cita: any) => {
        const servicios = cita.cita_servicios || [];
        const servicio = servicios[0]?.servicios || {};
        const pagos = cita.pagos || [];
        const sena = pagos
          .filter((p: any) => p.tipo === 'senal' && p.estado === 'completado')
          .reduce((s: number, p: any) => s + (p.amount_cents || 0), 0);

        return {
          id: cita.id,
          fecha: cita.fecha,
          hora_inicio: cita.hora_inicio,
          cliente_nombre: cita.clientes
            ? `${cita.clientes.nombre} ${cita.clientes.apellidos || ''}`.trim()
            : null,
          profesional_nombre: cita.profesionales?.nombre || null,
          servicio_nombre: servicio.nombre || null,
          servicio_precio: servicio.precio || 0,
          sena_pagada: sena,
          total_pendiente: (servicio.precio || 0) - sena,
        };
      });

      setCitas(procesadas);
    } catch (err) {
      console.error('Error cargando citas pendientes:', err);
      setMensaje({ type: 'error', text: mensajeDeError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarCitas(); }, [cargarCitas]);

  // Toggle selección
  const toggleSeleccion = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodas = () => {
    if (selectedIds.size === citas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(citas.map(c => c.id)));
    }
  };

  // Cobrar
  const cobrarSeleccionadas = async (formData: CobroFormData) => {
    setCobrando(true);
    setMensaje(null);

    try {
      const ids = Array.from(selectedIds);
      const resultados = await Promise.all(
        ids.map(id =>
          supabase.rpc('crear_cobro_desde_cita', {
            p_cita_id: id,
            p_metodo: formData.metodo,
            p_propina_cents: formData.propina,
            p_descuento_cents: formData.descuento,
          })
        )
      );

      const fallidos = resultados.filter(r => r.error);
      if (fallidos.length > 0) {
        throw new Error(`${fallidos.length} de ${ids.length} cobros fallaron`);
      }

      setMensaje({ type: 'success', text: `✓ ${ids.length} citas cobradas` });
      setSelectedIds(new Set());
      setShowCobroModal(false);
      await cargarCitas(); // Recargar

      // Ocultar mensaje después de 3s
      setTimeout(() => setMensaje(null), 3000);
    } catch (err) {
      console.error('Error cobrando:', err);
      setMensaje({ type: 'error', text: mensajeDeError(err) });
    } finally {
      setCobrando(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: T.textSec }}>
        <div className="spinner" style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        Cargando citas pendientes...
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: '20px' }}>
      <style>{ANIM}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="wallet" size={28} color={T.primary} />
          Caja
        </h1>
        <p style={{ fontSize: 14, color: T.textSec, margin: 0 }}>
          Cobra las citas completadas. Elige método, confirma y listo.
        </p>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: mensaje.type === 'success' ? T.successSoft : T.dangerSoft,
          color: mensaje.type === 'success' ? T.success : T.danger,
          fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {mensaje.text}
        </div>
      )}

      {/* Barra de acciones */}
      {citas.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: T.card, borderRadius: 12,
          border: `1px solid ${T.borderHi}`, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              checked={selectedIds.size === citas.length && citas.length > 0}
              onChange={seleccionarTodas}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, color: T.text }}>
              {selectedIds.size > 0 ? `${selectedIds.size} seleccionadas` : 'Seleccionar todas'}
            </span>
          </div>

          {seleccion.count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: T.textSec }}>Pendiente</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.primary }}>
                  {(seleccion.pendiente / 100).toFixed(2)}€
                </div>
              </div>
              <button
                onClick={() => setShowCobroModal(true)}
                className="ca-btn"
                style={{
                  padding: '10px 20px', background: T.primary, color: 'white',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <Icon name="cash" size={16} color="white" />
                Cobrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista de citas */}
      {citas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: T.card,
          borderRadius: 16, border: `1px solid ${T.border}`,
        }}>
          <Icon name="check" size={48} color={T.success} />
          <p style={{ fontSize: 16, color: T.textSec, marginTop: 16, margin: 0 }}>
            No hay citas pendientes de cobro hoy
          </p>
          <p style={{ fontSize: 13, color: T.textTer, marginTop: 8, margin: 0 }}>
            Las citas que completes aparecerán aquí para cobrarlas
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {citas.map((cita, idx) => {
            const isSelected = selectedIds.has(cita.id);
            const hora = cita.hora_inicio ? format(parseISO(cita.hora_inicio), 'HH:mm', { locale: es }) : '--:--';

            return (
              <div
                key={cita.id}
                className={`ca-row ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSeleccion(cita.id)}
                style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                  gap: 16, padding: '14px 18px', background: T.card,
                  borderRadius: 12, border: `1px solid ${isSelected ? T.primary : T.border}`,
                  cursor: 'pointer', animationDelay: `${idx * 0.03}s`,
                }}
              >
                {/* Checkbox */}
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSeleccion(cita.id)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
                      {cita.cliente_nombre || 'Sin cliente'}
                    </span>
                    {cita.profesional_nombre && (
                      <span style={{ fontSize: 12, color: T.textSec, padding: '2px 8px', background: T.bg, borderRadius: 6 }}>
                        {cita.profesional_nombre}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: T.textSec, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="clock" size={13} />
                      {hora}
                    </span>
                    <span>{cita.servicio_nombre || 'Servicio'}</span>
                  </div>
                </div>

                {/* Importe */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
                    {(cita.total_pendiente / 100).toFixed(2)}€
                  </div>
                  {cita.sena_pagada > 0 && (
                    <div style={{ fontSize: 11, color: T.success }}>
                      señal {(cita.sena_pagada / 100).toFixed(2)}€
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de cobro */}
      {showCobroModal && (
        <CobroModal
          seleccion={seleccion}
          onCobrar={cobrarSeleccionadas}
          onClose={() => setShowCobroModal(false)}
          cobrando={cobrando}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// MODAL DE COBRO
// ─────────────────────────────────────────────────────────────────────────────────
interface CobroModalProps {
  seleccion: { count: number; pendiente: number };
  onCobrar: (data: CobroFormData) => void;
  onClose: () => void;
  cobrando: boolean;
}

function CobroModal({ seleccion, onCobrar, onClose, cobrando }: CobroModalProps) {
  const [metodo, setMetodo] = useState<'efectivo' | 'datafono'>('efectivo');
  const [propina, setPropina] = useState('');
  const [descuento, setDescuento] = useState('');

  const propinaCents = Math.round(parseFloat(propina || '0') * 100);
  const descuentoCents = Math.round(parseFloat(descuento || '0') * 100);
  const totalFinal = seleccion.pendiente + propinaCents - descuentoCents;

  const handleCobrar = () => {
    onCobrar({ metodo, propina: propinaCents, descuento: descuentoCents });
  };

  return (
    <>
      <div
        className="ca-modal-overlay"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        }}
      />
      <div
        className="ca-modal"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: T.card, borderRadius: 16, padding: 24, width: '90%', maxWidth: 400,
          zIndex: 101, border: `1px solid ${T.borderHi}`,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 16px' }}>
          Cobrar {seleccion.count} cita{seleccion.count > 1 ? 's' : ''}
        </h2>

        {/* Método */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 8, display: 'block' }}>
            Método de pago
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setMetodo('efectivo')}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, border: `2px solid ${metodo === 'efectivo' ? T.primary : T.border}`,
                background: metodo === 'efectivo' ? T.primarySoft : T.card,
                fontSize: 14, fontWeight: 600, color: metodo === 'efectivo' ? T.primary : T.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
              }}
            >
              <Icon name="cash" size={18} />
              Efectivo
            </button>
            <button
              onClick={() => setMetodo('datafono')}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, border: `2px solid ${metodo === 'datafono' ? T.primary : T.border}`,
                background: metodo === 'datafono' ? T.primarySoft : T.card,
                fontSize: 14, fontWeight: 600, color: metodo === 'datafono' ? T.primary : T.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
              }}
            >
              <Icon name="credit" size={18} />
              Tarjeta
            </button>
          </div>
        </div>

        {/* Propina */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 6, display: 'block' }}>
            Propina (para el profesional)
          </label>
          <input
            type="number"
            value={propina}
            onChange={(e) => setPropina(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.borderHi}`,
              fontSize: 14, background: T.panel, color: T.text,
            }}
          />
        </div>

        {/* Descuento */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 6, display: 'block' }}>
            Descuento
          </label>
          <input
            type="number"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.borderHi}`,
              fontSize: 14, background: T.panel, color: T.text,
            }}
          />
        </div>

        {/* Resumen */}
        <div style={{ padding: '12px', background: T.bg, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: T.textSec }}>Servicios</span>
            <span style={{ fontSize: 13, color: T.text }}>
              {(seleccion.pendiente / 100).toFixed(2)}€
            </span>
          </div>
          {propinaCents > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.textSec }}>+ Propina</span>
              <span style={{ fontSize: 13, color: T.success }}>
                +{(propinaCents / 100).toFixed(2)}€
              </span>
            </div>
          )}
          {descuentoCents > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.textSec }}>- Descuento</span>
              <span style={{ fontSize: 13, color: T.danger }}>
                -{(descuentoCents / 100).toFixed(2)}€
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${T.borderHi}` }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: T.primary }}>
              {(totalFinal / 100).toFixed(2)}€
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            disabled={cobrando}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${T.borderHi}`,
              background: T.card, fontSize: 14, fontWeight: 600, color: T.textSec,
              cursor: cobrando ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCobrar}
            disabled={cobrando}
            style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none',
              background: cobrando ? T.textTer : T.primary,
              fontSize: 14, fontWeight: 600, color: 'white',
              cursor: cobrando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {cobrando ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Cobrando...
              </>
            ) : (
              <>
                <Icon name="check" size={16} color="white" />
                Cobrar
              </>
            )}
          </button>
        </div>

        <p style={{ fontSize: 11, color: T.textTer, marginTop: 12, margin: '0 0 0', textAlign: 'center' }}>
          {metodo === 'datafono' ? 'El cliente pagará con tarjeta en el datáfono físico.' : 'El cliente pagará en efectivo.'}
        </p>
      </div>
    </>
  );
}
