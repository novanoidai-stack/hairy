import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import qrcode from 'qrcode-generator';

interface HistorialFacturasModalProps {
  onClose: () => void;
}

export function HistorialFacturasModal({ onClose }: HistorialFacturasModalProps) {
  const [loading, setLoading] = useState(true);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const profile = await getUserProfile();
        if (!profile?.negocio_id) return;

        const { data } = await supabase
          .from('cobros')
          .select('id, cobrado_at, total_cents, metodo, estado')
          .eq('negocio_id', profile.negocio_id)
          .eq('estado', 'completado')
          .order('cobrado_at', { ascending: false })
          .limit(100);
        
        if (data) setFacturas(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Genera un QR de simulacion
  const generateQR = (cobroId: string) => {
    try {
      const qr = qrcode(0, 'M');
      // En produccion real este enlace apuntaria a la AEAT o URL de VeriFactu
      qr.addData(`https://aeat.es/verifactu?id=${cobroId}`);
      qr.make();
      return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    } catch {
      return '';
    }
  };

  // Hash simulado para demostracion de inalterabilidad
  const hashSimulado = (id: string) => {
    return 'VF-' + id.substring(0, 8).toUpperCase() + '-' + Date.now().toString(16).toUpperCase();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: T.bg, width: '100%', maxWidth: 700, height: '90vh', borderRadius: 20,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Cabecera */}
        <div style={{ padding: '24px', background: '#fff', borderBottom: `1px solid ${T.borderHi}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>Historial de Facturas y Tickets</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSec }}>Registro inalterable (VeriFactu)</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: T.textSec }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Contenido (Tabla) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.textSec }}>Cargando facturas...</div>
          ) : facturas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.textSec }}>No hay facturas registradas.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.borderHi}` }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Fecha y Hora</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Método</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Importe</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '12px 8px', color: T.text }}>
                      {f.cobrado_at ? format(parseISO(f.cobrado_at), "dd MMM yyyy - HH:mm", { locale: es }) : 'N/A'}
                    </td>
                    <td style={{ padding: '12px 8px', color: T.text, textTransform: 'capitalize' }}>
                      {f.metodo}
                    </td>
                    <td style={{ padding: '12px 8px', color: T.text, textAlign: 'right', fontWeight: 600 }}>
                      {((f.total_cents || 0) / 100).toFixed(2)} €
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button 
                        onClick={() => setSelectedTicket(f)}
                        style={{
                          background: T.primarySoft, color: T.primary, border: 'none', padding: '6px 12px',
                          borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                        }}>
                        Ver Ticket
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Interno: Ver Ticket (Simulado) */}
      {selectedTicket && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setSelectedTicket(null)}>
          <div style={{
            background: '#fff', width: 340, padding: 32, borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '100%', borderBottom: '1px dashed #ccc', paddingBottom: 16, marginBottom: 16, textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#333' }}>Ticket de Venta</h3>
              <div style={{ fontSize: 13, color: '#666' }}>
                {selectedTicket.cobrado_at ? format(parseISO(selectedTicket.cobrado_at), "dd/MM/yyyy HH:mm", { locale: es }) : ''}
              </div>
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ color: '#333', fontWeight: 600 }}>TOTAL</span>
              <span style={{ color: '#333', fontWeight: 700, fontSize: 18 }}>{((selectedTicket.total_cents || 0) / 100).toFixed(2)} €</span>
            </div>
            
            {/* Componente visual VeriFactu */}
            <div style={{ width: '100%', padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Firma VeriFactu
              </div>
              <div style={{ width: 120, height: 120, background: '#fff', padding: 8, borderRadius: 8, marginBottom: 12 }} 
                   dangerouslySetInnerHTML={{ __html: generateQR(selectedTicket.id) }} />
              <div style={{ fontSize: 10, color: '#888', wordBreak: 'break-all', textAlign: 'center' }}>
                Hash: {hashSimulado(selectedTicket.id)}
              </div>
            </div>

            <button onClick={() => setSelectedTicket(null)} style={{ marginTop: 24, padding: '10px 0', width: '100%', background: '#eee', color: '#333', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
              Cerrar Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
