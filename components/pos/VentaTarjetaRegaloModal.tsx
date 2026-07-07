import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

interface VentaTarjetaRegaloModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Genera codigo alfanumerico no adivinable (TR-A8K9-M2P4)
const generateCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I,O,0,1 para evitar confusion
  const rand = (len: number): string =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `TR-${rand(4)}-${rand(4)}`;
};

interface ClienteOption {
  id: string;
  nombre: string;
  apellidos?: string | null;
  telefono?: string | null;
}

export function VentaTarjetaRegaloModal({ onClose, onSuccess }: VentaTarjetaRegaloModalProps) {
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteId, setClienteId] = useState('');

  const [precio, setPrecio] = useState('');
  const [codigo, setCodigo] = useState(generateCode());
  const [metodo, setMetodo] = useState<'efectivo' | 'datafono' | 'bizum'>('efectivo');

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const profile = await getUserProfile();
        if (!profile?.negocio_id) return;

        const { data } = await supabase
          .from('clientes')
          .select('id, nombre, apellidos, telefono')
          .eq('negocio_id', profile.negocio_id)
          .order('nombre');
        if (data) setClientes(data as ClienteOption[]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    const precioFloat = parseFloat((precio || '0').replace(',', '.'));
    if (isNaN(precioFloat) || precioFloat <= 0) { setError('Importe inválido'); return; }
    if (!codigo.trim()) { setError('El código no puede estar vacío'); return; }

    setEnviando(true);
    setError('');

    try {
      const { error: rpcErr } = await supabase.rpc('vender_tarjeta_regalo', {
        p_cliente_id: clienteId || null,
        p_precio_cents: Math.round(precioFloat * 100),
        p_metodo: metodo,
        p_codigo: codigo.trim(),
      });

      if (rpcErr) throw rpcErr;

      onSuccess();
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'Error al vender la tarjeta regalo.'));
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
        <h4 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: T.text }}>Vender Tarjeta Regalo</h4>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: T.textSec }}>Cargando datos...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Cliente comprador (opcional) */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Cliente comprador (opcional)</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14 }}>
                <option value="">-- Sin asignar / Venta rápida --</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellidos ?? ''} {c.telefono ? `(${c.telefono})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Importe */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Importe Saldo (€)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ej: 50.00"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {/* Codigo generado */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Código Generado</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={codigo}
                  onChange={e => setCodigo(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 14, fontFamily: 'monospace', fontWeight: 600, boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => setCodigo(generateCode())}
                  title="Regenerar código"
                  style={{ padding: '0 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', color: T.text, fontSize: 16 }}
                >
                  ↻
                </button>
              </div>
              <div style={{ fontSize: 10, color: T.textTer, marginTop: 4 }}>
                Este código se imprimirá / entregará al cliente para canjear el saldo.
              </div>
            </div>

            {/* Metodo de pago */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textTer, marginBottom: 4 }}>Método de pago (cobro hoy)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['efectivo', 'datafono', 'bizum'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMetodo(m)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: metodo === m ? T.successSoft : T.bgCard,
                      border: `1px solid ${metodo === m ? T.success : T.border}`,
                      color: metodo === m ? T.success : T.textSec,
                    }}
                  >
                    {m === 'efectivo' ? 'Efectivo' : m === 'datafono' ? 'Datáfono' : 'Bizum'}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ fontSize: 12, color: T.danger }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={onClose}
                disabled={enviando}
                style={{ flex: 1, padding: '10px 0', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={enviando}
                style={{ flex: 2, padding: '10px 0', background: T.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: enviando ? 0.7 : 1 }}
              >
                {enviando ? 'Creando...' : 'Cobrar y Emitir Tarjeta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
