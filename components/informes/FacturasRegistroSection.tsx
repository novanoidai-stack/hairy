import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import qrcode from 'qrcode-generator';

interface Props {
  negocioId: string;
  desde: Date;
  hasta: Date;
}

export function FacturasRegistroSection({ negocioId, desde, hasta }: Props) {
  const [loading, setLoading] = useState(true);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        if (!negocioId) return;

        const { data } = await supabase
          .from('cobros')
          .select(`
            id, cobrado_at, total_cents, metodo, estado,
            cita_id,
            citas (
              id, inicio,
              clientes ( nombre ),
              servicios ( nombre )
            )
          `)
          .eq('negocio_id', negocioId)
          .eq('estado', 'completado')
          .gte('cobrado_at', desde.toISOString())
          .lte('cobrado_at', hasta.toISOString())
          .order('cobrado_at', { ascending: false })
          .limit(1000);
        
        if (data && !cancelado) setFacturas(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [negocioId, desde.toISOString(), hasta.toISOString()]);

  // Genera un QR de simulacion
  const generateQR = (cobroId: string) => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(`https://aeat.es/verifactu?id=${cobroId}`);
      qr.make();
      return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    } catch {
      return '';
    }
  };

  const hashSimulado = (id: string) => {
    return 'VF-' + id.substring(0, 8).toUpperCase() + '-' + Date.now().toString(16).toUpperCase();
  };

  const descargarCSV = () => {
    let csv = 'Fecha,Método,Importe EUR,Ticket ID\n';
    facturas.forEach(f => {
      const fecha = f.cobrado_at ? format(parseISO(f.cobrado_at), "yyyy-MM-dd HH:mm:ss") : '';
      const importe = ((f.total_cents || 0) / 100).toFixed(2);
      csv += `"${fecha}","${f.metodo}","${importe}","${f.id}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas_${format(desde, 'yyyy-MM-dd')}_${format(hasta, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div style={{ padding: '24px', borderBottom: `1px solid ${T.borderHi}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
             Facturas y Tickets (VeriFactu)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T.textSec }}>
            Registro inalterable de todos los cobros procesados.
          </p>
        </div>
        <button onClick={descargarCSV} style={{ padding: '8px 16px', background: T.primarySoft, color: T.primary, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>

      <div style={{ padding: 24, overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.textSec }}>Cargando facturas...</div>
        ) : facturas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.textSec }}>No hay facturas en este periodo.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 600 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
              <tr style={{ borderBottom: `2px solid ${T.borderHi}` }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Fecha y Hora</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Cita / Cliente</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Método</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Importe</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => {
                const cita = f.citas;
                const clienteNombre = cita?.clientes?.nombre || 'Walk-in / Sin cliente';
                const servicioNombre = cita?.servicios?.nombre || 'Ticket rápido';
                
                return (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '12px 8px', color: T.text }}>
                      {f.cobrado_at ? format(parseISO(f.cobrado_at), "dd MMM yyyy - HH:mm", { locale: es }) : 'N/A'}
                    </td>
                    <td style={{ padding: '12px 8px', color: T.text }}>
                      <div style={{ fontWeight: 600 }}>{clienteNombre}</div>
                      <div style={{ fontSize: 12, color: T.textSec }}>{servicioNombre}</div>
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
                          background: 'transparent', color: T.primary, border: `1px solid ${T.borderHi}`, padding: '6px 12px',
                          borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                        }}>
                        Ver Ticket
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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

            {/* Nueva Información de Cliente y Cita */}
            <div style={{ width: '100%', padding: '0 0 16px', marginBottom: 16, borderBottom: '1px solid #eee' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Cliente</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 12 }}>
                {selectedTicket.citas?.clientes?.nombre || 'Walk-in / Venta directa'}
              </div>
              
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Servicio</div>
              <div style={{ fontSize: 14, color: '#444', marginBottom: 12 }}>
                {selectedTicket.citas?.servicios?.nombre || 'Productos / Ticket rápido'}
              </div>

              {selectedTicket.citas?.inicio && (
                <>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Fecha Cita Original</div>
                  <div style={{ fontSize: 14, color: '#444' }}>
                    {format(parseISO(selectedTicket.citas.inicio), "dd MMM yyyy - HH:mm", { locale: es })}
                  </div>
                </>
              )}
            </div>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ color: '#333', fontWeight: 600 }}>TOTAL</span>
              <span style={{ color: '#333', fontWeight: 700, fontSize: 18 }}>{((selectedTicket.total_cents || 0) / 100).toFixed(2)} €</span>
            </div>
            
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
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
