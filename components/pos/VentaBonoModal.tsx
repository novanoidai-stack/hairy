import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { mensajeDeError } from '@/lib/errores';
import { reportarError } from '@/lib/reportarError';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

interface VentaBonoModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function VentaBonoModal({ onClose, onSuccess }: VentaBonoModalProps) {
  const [clientes, setClientes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  
  const [clienteId, setClienteId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [sesiones, setSesiones] = useState('5');
  const [precio, setPrecio] = useState('');
  const [metodo, setMetodo] = useState<'efectivo' | 'datafono' | 'bizum'>('efectivo');

  // Spec 6: el bono de estetica no es un contador, es un calendario ("la sesion
  // 3 de 10 el jueves"). Si se agenda aqui, la venta deja las N citas puestas
  // con su cadencia clinica; si no, quedan las N sesiones sin fecha.
  const [agendar, setAgendar] = useState(false);
  const [inicioPrimera, setInicioPrimera] = useState('');
  const [cadenciaDias, setCadenciaDias] = useState('30');

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const profile = await getUserProfile();
        if (!profile?.negocio_id) return;

        const [resCli, resSer] = await Promise.all([
          supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', profile.negocio_id).order('nombre'),
          supabase.from('servicios').select('id, nombre, precio').eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre'),
        ]);

        if (resCli.data) setClientes(resCli.data);
        if (resSer.data) setServicios(resSer.data);
        if (resCli.error) reportarError(resCli.error, { origen: 'app', tipo: 'operativo' });
        if (resSer.error) reportarError(resSer.error, { origen: 'app', tipo: 'operativo' });
      } catch (err) {
        console.error(err);
        reportarError(err, { origen: 'app', tipo: 'excepcion' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleServicioChange = (sid: string) => {
    setServicioId(sid);
    const srv = servicios.find(s => s.id === sid);
    if (srv && srv.precio) {
      // Suggest a price
    }
  };

  const handleSubmit = async () => {
    if (!clienteId) { setError('Selecciona un cliente'); return; }
    if (!servicioId) { setError('Selecciona un servicio'); return; }
    const numSesiones = parseInt(sesiones, 10);
    if (isNaN(numSesiones) || numSesiones <= 0) { setError('Número de sesiones inválido'); return; }
    const precioFloat = parseFloat((precio || '0').replace(',', '.'));
    if (isNaN(precioFloat) || precioFloat <= 0) { setError('Precio inválido'); return; }

    const numCadencia = parseInt(cadenciaDias, 10);
    if (agendar) {
      if (!inicioPrimera) { setError('Indica cuándo es la primera sesión'); return; }
      if (isNaN(numCadencia) || numCadencia <= 0) { setError('Cadencia inválida'); return; }
    }

    setEnviando(true);
    setError('');

    try {
      const { error: rpcErr } = await supabase.rpc('vender_bono', {
        p_cliente_id: clienteId,
        p_servicio_id: servicioId,
        p_sesiones: numSesiones,
        p_precio_cents: Math.round(precioFloat * 100),
        p_metodo: metodo,
        // Sin agendar van como null y el servidor crea las sesiones sin fecha.
        p_inicio_primera: agendar ? new Date(inicioPrimera).toISOString() : null,
        p_cadencia_dias: agendar ? numCadencia : null
      });

      if (rpcErr) throw rpcErr;
      
      onSuccess();
    } catch (err: any) {
      reportarError(err, { origen: 'app', tipo: 'operativo' });
      setError(mensajeDeError(err, 'Error al vender el bono.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      onClick={() => { if (!enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 16, padding: 22, width: '100%', maxWidth: 420, boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}
      >
        <h4 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: T.text }}>Vender Bono</h4>
        
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: T.textSec }}>Cargando datos...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Cliente</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14 }}>
                <option value="">-- Seleccionar cliente --</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} {c.telefono ? `(${c.telefono})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Servicio</label>
              <select value={servicioId} onChange={e => handleServicioChange(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14 }}>
                <option value="">-- Seleccionar servicio --</option>
                {servicios.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre} ({s.precio}€)</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Sesiones</label>
                <input type="number" min="1" value={sesiones} onChange={e => setSesiones(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Precio Total (€)</label>
                <input type="text" inputMode="decimal" placeholder="0.00" value={precio} onChange={e => setPrecio(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Método de pago</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['efectivo', 'datafono', 'bizum'] as const).map(m => (
                  <button key={m} onClick={() => setMetodo(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: metodo === m ? T.successSoft : T.bgCard, border: `1px solid ${metodo === m ? T.success : T.border}`, color: metodo === m ? T.success : T.textSec }}>
                    {m === 'efectivo' ? 'Efectivo' : m === 'datafono' ? 'Datáfono' : 'Bizum'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={agendar} onChange={e => setAgendar(e.target.checked)} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Agendar las sesiones ahora</span>
              </label>
              <div style={{ fontSize: 11, color: T.textTer, marginTop: 4, lineHeight: 1.45 }}>
                Deja las {parseInt(sesiones, 10) > 0 ? parseInt(sesiones, 10) : 'N'} citas puestas con su cadencia. Sin marcar, las sesiones quedan sin fecha y se enganchan a citas según se pidan.
              </div>

              {agendar && (
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Primera sesión</label>
                    <input type="datetime-local" value={inicioPrimera} onChange={e => setInicioPrimera(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Cada (días)</label>
                    <input type="number" min="1" value={cadenciaDias} onChange={e => setCadenciaDias(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 12, color: T.danger }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={onClose} disabled={enviando} style={{ flex: 1, padding: '10px 0', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
              <button onClick={handleSubmit} disabled={enviando} style={{ flex: 2, padding: '10px 0', background: T.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: enviando ? 0.7 : 1 }}>
                {enviando ? 'Vendiendo...' : 'Vender y Cobrar Bono'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
