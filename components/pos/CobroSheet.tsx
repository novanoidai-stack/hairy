import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

export type CobroMetodo = 'efectivo' | 'datafono' | 'bizum';

interface CobroSheetProps {
  // Una cita (ficha de cita) o varias (cobro multiple desde Caja).
  citaIds: string[];
  // Pendiente ya neto de señal (lo calcula el caller, igual para 1 o N citas).
  pendienteCents: number;
  // Señal ya pagada (informativa); si es 0 no se muestra la linea.
  senalCents?: number;
  titulo?: string;
  subtitulo?: string;
  onClose: () => void;
  onSuccess: (cobroIds: string[]) => void;
}

const METODOS: Array<[CobroMetodo, string]> = [
  ['efectivo', 'Efectivo'],
  ['datafono', 'Datáfono'],
  ['bizum', 'Bizum'],
];

// Motor de cobro unico (POS-0/1): usado desde la ficha de cita y desde Caja.
// Ambos llaman a la misma RPC `crear_cobro_desde_cita` (security definer), que
// valida el negocio, que la cita no este ya cobrada, y descuenta la señal pagada.
export function CobroSheet({ citaIds, pendienteCents, senalCents = 0, titulo, subtitulo, onClose, onSuccess }: CobroSheetProps) {
  const [metodo, setMetodo] = useState<CobroMetodo>('efectivo');
  const [descuento, setDescuento] = useState('');
  const [propina, setPropina] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const descuentoCents = Math.round(Math.max(0, parseFloat((descuento || '0').replace(',', '.')) || 0) * 100);
  const propinaCents = Math.round(Math.max(0, parseFloat((propina || '0').replace(',', '.')) || 0) * 100);
  const totalCents = Math.max(0, pendienteCents - descuentoCents) + propinaCents;

  const confirmar = async () => {
    if (totalCents <= 0) { setError('El total debe ser mayor que 0.'); return; }
    setError('');
    setEnviando(true);
    try {
      const resultados = await Promise.all(
        citaIds.map((id) =>
          supabase.rpc('crear_cobro_desde_cita', {
            p_cita_id: id,
            p_metodo: metodo,
            p_propina_cents: propinaCents,
            p_descuento_cents: descuentoCents,
          })
        )
      );
      const fallidos = resultados.filter((r) => r.error);
      if (fallidos.length > 0) {
        throw fallidos.length === citaIds.length
          ? fallidos[0].error
          : new Error(`${fallidos.length} de ${citaIds.length} cobros fallaron.`);
      }
      onSuccess(resultados.map((r) => r.data as string));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el cobro.'));
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
        style={{ background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 16, padding: 22, width: '100%', maxWidth: 400, boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.text }}>
            {titulo || `Cobrar ${citaIds.length} cita${citaIds.length > 1 ? 's' : ''}`}
          </h4>
          <span style={{ fontSize: 10, color: T.textTer, fontWeight: 600 }}>Comprobante · no es factura</span>
        </div>
        {subtitulo && <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 16 }}>{subtitulo}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, marginTop: subtitulo ? 0 : 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: T.textSec }}>Pendiente</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{(pendienteCents / 100).toFixed(2)} €</span>
          </div>
          {senalCents > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: T.success }}>Señal ya pagada</span>
              <span style={{ fontSize: 12.5, color: T.success }}>incluida (no se vuelve a cobrar)</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ fontSize: 12.5, color: T.textSec }}>Descuento (€)</label>
            <input type="text" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" style={{ width: 92, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ fontSize: 12.5, color: T.textSec }}>Propina (€)</label>
            <input type="text" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="0" style={{ width: 92, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}`, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Total a cobrar</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.success }}>{(totalCents / 100).toFixed(2)} €</span>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Método</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {METODOS.map(([k, lbl]) => {
            const on = metodo === k;
            return (
              <button key={k} onClick={() => setMetodo(k)} style={{ flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? T.successSoft : T.bgCard, border: `1px solid ${on ? T.success : T.border}`, color: on ? T.success : T.textSec }}>{lbl}</button>
            );
          })}
        </div>

        {error && <div style={{ fontSize: 12, color: T.danger, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={enviando} style={{ padding: '9px 18px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Cancelar</button>
          <button onClick={confirmar} disabled={enviando} style={{ padding: '9px 20px', background: enviando ? T.textTer : 'linear-gradient(180deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: enviando ? 0.7 : 1 }}>
            {enviando ? 'Cobrando…' : 'Confirmar cobro'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: T.textTer, marginTop: 12, margin: '12px 0 0', textAlign: 'center' }}>
          {metodo === 'datafono' ? 'El cliente pagará con tarjeta en el datáfono físico.' : metodo === 'bizum' ? 'El cliente pagará por Bizum.' : 'El cliente pagará en efectivo.'}
        </p>
      </div>
    </div>
  );
}
