import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { mensajeDeError } from '@/lib/errores';
import { STextInput } from '@/components/ui/SettingsAtoms';
import {
  type MensajeHistorial, type TipoMensaje,
  cargarHistorialMensajes, resumenMensaje, motivoFallo, rutaCita,
  TIPO_MENSAJE_META, ESTADO_MENSAJE_META,
} from '@/lib/historialMensajes';

// Mismos tonos que la pantalla de Campanas, que es donde vive esta pestana.
const T = {
  panel: '#fffdfb', card: '#ffffff', cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)',
  text: '#1c1814', textSec: '#5c5249', textTer: '#736658',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  danger: '#e23b34',
};

const TIPOS_ORDEN: TipoMensaje[] = ['confirmacion', 'recordatorio', 'resena', 'senal', 'campana', 'lista_espera'];

const fmtDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

function telefonoVisible(c: string | null): string {
  if (!c) return '';
  return /^\d{8,15}$/.test(c) ? `+${c}` : c;
}

/** Todo lo que el salon ha mandado: automaticos de cita, campanas y avisos de
 *  lista de espera. Solo lectura, paginado de 50 en 50. */
export function HistorialMensajes({ isMobile }: { isMobile: boolean }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMensaje | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  const [items, setItems] = useState<MensajeHistorial[]>([]);
  const [total, setTotal] = useState(0);
  const [conteos, setConteos] = useState<Partial<Record<TipoMensaje, number>>>({});
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Descarta respuestas viejas si el filtro cambia mientras una peticion vuela.
  const peticion = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setBuscar(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    const n = ++peticion.current;
    setCargando(true); setError(null);
    cargarHistorialMensajes(tipo, buscar, 0)
      .then((p) => {
        if (n !== peticion.current) return;
        setItems(p.items); setTotal(p.total); setConteos(p.conteos);
      })
      .catch((e) => { if (n === peticion.current) setError(mensajeDeError(e, 'No se pudo cargar el historial.')); })
      .finally(() => { if (n === peticion.current) setCargando(false); });
  }, [tipo, buscar]);

  async function cargarMas() {
    const n = peticion.current;
    setCargandoMas(true);
    try {
      const p = await cargarHistorialMensajes(tipo, buscar, items.length);
      if (n === peticion.current) { setItems((prev) => [...prev, ...p.items]); setTotal(p.total); }
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudieron cargar más mensajes.'));
    } finally {
      setCargandoMas(false);
    }
  }

  const totalTodos = TIPOS_ORDEN.reduce((s, k) => s + (conteos[k] ?? 0), 0);
  // Solo los tipos que tienen algo (y el elegido, para poder volver de un cero).
  const chips: { k: TipoMensaje | null; label: string }[] = [
    { k: null, label: `Todos (${totalTodos})` },
    ...TIPOS_ORDEN
      .filter((k) => (conteos[k] ?? 0) > 0 || tipo === k)
      .map((k) => ({ k, label: `${TIPO_MENSAJE_META[k].plural} (${conteos[k] ?? 0})` })),
  ];

  return (
    <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text }}>Historial de mensajes</div>
        <div style={{ fontSize: 12, color: T.textTer, marginTop: 2 }}>
          Todo lo que tu salón ha mandado a sus clientas, del más reciente al más antiguo. Se registra desde el 11 de septiembre de 2026.
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div role="tablist" aria-label="Tipo de mensaje" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => {
            const on = tipo === c.k;
            return (
              <button key={c.k ?? 'todos'} type="button" role="tab" aria-selected={on} onClick={() => setTipo(c.k)}
                style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${on ? T.primary : T.border}`, background: on ? T.primary : T.card, color: on ? '#fff' : T.textSec }}>
                {c.label}
              </button>
            );
          })}
        </div>
        <div style={{ width: isMobile ? '100%' : 240 }}>
          <STextInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o teléfono..." leadingIcon="search" width="100%" />
        </div>
      </div>

      {error && <div style={{ fontSize: 13, color: T.danger, fontWeight: 600, marginBottom: 10 }}>{error}</div>}

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '26px 16px', color: T.textTer, fontSize: 13 }}>Cargando mensajes…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '26px 16px', border: `1px dashed ${T.border}`, borderRadius: 12, color: T.textTer, fontSize: 13 }}>
          {buscar.trim() || tipo ? 'No hay mensajes con este filtro.' : 'Tu salón todavía no ha enviado ningún mensaje.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((m) => {
            const fecha = new Date(m.fecha);
            const estado = ESTADO_MENSAJE_META[m.estado];
            const motivo = motivoFallo(m);
            const resumen = resumenMensaje(m);
            const ruta = rutaCita(m);
            return (
              <div key={m.id} style={{
                display: 'grid', alignItems: 'center', gap: isMobile ? 4 : 14,
                gridTemplateColumns: isMobile ? '1fr' : '96px minmax(140px, 0.8fr) minmax(0, 2fr) 150px',
                padding: '11px 13px', borderRadius: 12, background: T.cardHi, border: `1px solid ${T.border}`,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexDirection: isMobile ? 'row' : 'column' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{fmtDia.format(fecha)}</span>
                  <span style={{ fontSize: 11.5, color: T.textTer }}>{fmtHora.format(fecha)}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nombre || 'Sin nombre'}</div>
                  <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 2 }}>{telefonoVisible(m.contacto)}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.primaryHi, background: T.primarySoft, borderRadius: 999, padding: '2px 8px' }}>
                      {TIPO_MENSAJE_META[m.tipo].label}
                    </span>
                    {m.campana && <span style={{ fontSize: 11.5, fontWeight: 600, color: T.textSec }}>{m.campana}</span>}
                    {m.canal === 'email' && <span style={{ fontSize: 11, color: T.textTer }}>Correo</span>}
                  </div>
                  <div title={resumen} style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                    {resumen}
                  </div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: estado.color }}>{estado.label}</div>
                  {motivo && <div style={{ fontSize: 11, color: T.textTer, marginTop: 2 }}>{motivo}</div>}
                  {ruta && (
                    <button type="button" className="m-btn-secondary" onClick={() => router.push(ruta as never)}
                      style={{ marginTop: 6, padding: '5px 10px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.panel, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Ver cita
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!cargando && items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.textTer }}>{items.length} de {total}</span>
          {items.length < total && (
            <button className="m-btn-secondary" onClick={cargarMas} disabled={cargandoMas}
              style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.panel, color: T.textSec, fontSize: 13, fontWeight: 600, cursor: cargandoMas ? 'wait' : 'pointer' }}>
              {cargandoMas ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
