import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { eur, parseEurToCents, type Concepto } from '@/lib/presupuestos';

// Catálogo de "conceptos de presupuesto" (nombre + precio reutilizables).
// Se rellena solo cuando guardas un concepto nuevo desde el editor de presupuestos;
// aquí puedes revisarlos, ajustar el precio o eliminarlos.
const T = {
  card: '#ffffff', panel: '#fffdfb', border: 'rgba(40,30,24,0.10)', borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814', textSec: '#5c5249', textTer: '#736658', primary: '#f4501e',
  primarySoft: 'rgba(244,80,30,0.10)', danger: '#e23b34',
};

export function TabPresupuestoConceptos({ negocioId }: { negocioId: string }) {
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!negocioId) return;
    setLoading(true);
    const { data } = await supabase
      .from('presupuesto_conceptos')
      .select('id, nombre, precio_cents, activo')
      .eq('negocio_id', negocioId)
      .eq('activo', true)
      .order('nombre');
    const lista = (data || []) as Concepto[];
    setConceptos(lista);
    setPrecios(Object.fromEntries(lista.map(c => [c.id, (c.precio_cents / 100).toString()])));
    setLoading(false);
  }, [negocioId]);

  useEffect(() => { cargar(); }, [cargar]);

  const anadir = async () => {
    setError('');
    const n = nombre.trim();
    const p = parseEurToCents(precio);
    if (!n) { setError('Indica un nombre.'); return; }
    const { error: e } = await supabase
      .from('presupuesto_conceptos')
      .upsert({ negocio_id: negocioId, nombre: n, precio_cents: p }, { onConflict: 'negocio_id,nombre' });
    if (e) { setError(mensajeDeError(e)); return; }
    setNombre(''); setPrecio('');
    cargar();
  };

  const guardarPrecio = async (c: Concepto) => {
    const p = parseEurToCents(precios[c.id] ?? '');
    if (p === c.precio_cents) return;
    await supabase.from('presupuesto_conceptos').update({ precio_cents: p }).eq('id', c.id);
    setConceptos(prev => prev.map(x => x.id === c.id ? { ...x, precio_cents: p } : x));
  };

  const eliminar = async (c: Concepto) => {
    if (!confirm(`¿Eliminar el concepto "${c.nombre}"?`)) return;
    await supabase.from('presupuesto_conceptos').delete().eq('id', c.id);
    setConceptos(prev => prev.filter(x => x.id !== c.id));
  };

  const input: React.CSSProperties = { padding: '9px 11px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 13.5, boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>Conceptos de presupuesto</h2>
      <p style={{ fontSize: 13.5, color: T.textSec, margin: '0 0 18px' }}>
        Importes que reutilizas en los presupuestos (p. ej. “Tratamiento de pelo · 20 €”). Se guardan solos
        cuando creas uno nuevo en un presupuesto; aquí puedes ajustarlos o quitarlos.
      </p>

      {/* Añadir */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del concepto" style={{ ...input, flex: 1, minWidth: 180 }} />
        <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Precio €" inputMode="decimal" style={{ ...input, width: 110, textAlign: 'right' }} />
        <button onClick={anadir} style={{ padding: '9px 18px', background: T.primary, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Añadir</button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: T.danger, marginBottom: 12 }}>{error}</div>}

      {/* Lista */}
      {loading ? (
        <div style={{ color: T.textSec, fontSize: 13 }}>Cargando…</div>
      ) : conceptos.length === 0 ? (
        <div style={{ padding: '28px 18px', textAlign: 'center', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, color: T.textTer, fontSize: 13.5 }}>
          Aún no hay conceptos guardados. Crea un presupuesto y marca “Guardar este concepto” para que aparezcan aquí.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conceptos.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <span style={{ flex: 1, fontSize: 14, color: T.text }}>{c.nombre}</span>
              <input
                value={precios[c.id] ?? ''}
                onChange={e => setPrecios(prev => ({ ...prev, [c.id]: e.target.value }))}
                onBlur={() => guardarPrecio(c)}
                inputMode="decimal"
                style={{ ...input, width: 92, textAlign: 'right' }}
              />
              <span style={{ fontSize: 12.5, color: T.textTer, width: 18 }}>€</span>
              <button onClick={() => eliminar(c)} title="Eliminar" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: T.danger, fontSize: 13 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: T.textTer, marginTop: 14 }}>Total guardados: {conceptos.length} · El precio se guarda al salir del campo.</p>
    </div>
  );
}
