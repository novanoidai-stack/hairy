// Registro de auditoria: quien toco que y cuando.
//
// Los asientos los escriben triggers y RPC en el servidor (no el cliente), asi
// que no se pueden falsear desde la app:
//   - citas   / cambio_estado    -> trigger citas_audit_cambio_estado
//   - caja    / anulacion_cobro  -> RPC anular_cobro (exige motivo)
//   - caja    / gasto_modificado -> trigger gastos_audit_cambios
//   - caja    / gasto_eliminado  -> trigger gastos_audit_cambios
//
// Aqui solo se leen y se presentan en cristiano. La RPC ya restringe a
// owner/admin/direccion; si el rol no llega, devuelve no_autorizado y se dice.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { metaEstadoCita } from '@/lib/citasEstadoUi';

interface Props {
  desde: Date;
  hasta: Date;
  clientesMap?: Map<string, { nombre: string }>;
  profesionalesMap?: Map<string, { nombre: string }>;
}

interface Asiento {
  id: string;
  usuario_nombre: string | null;
  modulo: string;
  tipo_evento: string;
  detalles: any;
  created_at: string;
}

const PAGINA = 50;

// Como se lee cada tipo de evento. Lo que no este aqui se muestra en crudo pero
// legible, en vez de dejar un snake_case suelto en pantalla.
const ETIQUETA_EVENTO: Record<string, string> = {
  cambio_estado: 'Cambio de estado de cita',
  anulacion_cobro: 'Anulacion de cobro',
  gasto_modificado: 'Gasto modificado',
  gasto_eliminado: 'Gasto eliminado',
};

const eur = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);

export function AuditoriaSection({ desde, hasta, clientesMap, profesionalesMap }: Props) {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [filtroModulo, setFiltroModulo] = useState<'todos' | 'citas' | 'caja'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [visibles, setVisibles] = useState(PAGINA);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('obtener_auditoria_historica', {
        p_desde: format(desde, 'yyyy-MM-dd'),
        p_hasta: format(hasta, 'yyyy-MM-dd'),
        p_modulo: null,
        p_limit: 1000,
      });
      if (rpcErr) throw rpcErr;
      const res = data as { ok?: boolean; error?: string; registros?: Asiento[] };
      if (!res?.ok) {
        setError(
          res?.error === 'no_autorizado'
            ? 'Solo el propietario o la direccion pueden ver el registro de auditoria.'
            : 'No se pudo cargar el registro de auditoria.',
        );
        setAsientos([]);
        return;
      }
      setAsientos(res.registros ?? []);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el registro de auditoria.'));
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setVisibles(PAGINA);
  }, [filtroModulo, busqueda, asientos]);

  // Traduce un asiento a una frase que se entienda sin saber como esta hecho.
  const describir = useCallback(
    (a: Asiento): { titulo: string; detalle: string } => {
      const d = a.detalles ?? {};
      const cliente = d.cliente_id ? clientesMap?.get(d.cliente_id)?.nombre : null;
      const prof = d.profesional_id ? profesionalesMap?.get(d.profesional_id)?.nombre : null;

      if (a.tipo_evento === 'cambio_estado') {
        const antes = metaEstadoCita(d.estado_anterior).label;
        const ahora = metaEstadoCita(d.estado_nuevo).label;
        const cuando = d.inicio
          ? format(parseISO(d.inicio), "d MMM 'a las' HH:mm", { locale: es })
          : null;
        return {
          titulo: `${antes} -> ${ahora}`,
          detalle: [
            cliente ? `Cita de ${cliente}` : 'Cita',
            prof ? `con ${prof}` : null,
            cuando,
            d.cobrada ? '(cobrada)' : null,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      }

      if (a.tipo_evento === 'anulacion_cobro') {
        return {
          titulo: `Cobro anulado · ${eur(d.total_cents)} EUR`,
          detalle: [
            d.metodo ? `Pagado por ${d.metodo}` : null,
            d.cobrado_at ? format(parseISO(d.cobrado_at), "d MMM yyyy", { locale: es }) : null,
            d.motivo ? `Motivo: ${d.motivo}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      }

      if (a.tipo_evento === 'gasto_modificado') {
        const antes = d.antes ?? {};
        const desp = d.despues ?? {};
        const cambios: string[] = [];
        if (antes.importe_cents !== desp.importe_cents) {
          cambios.push(`importe ${eur(antes.importe_cents)} -> ${eur(desp.importe_cents)} EUR`);
        }
        if (antes.concepto !== desp.concepto) cambios.push(`concepto "${antes.concepto}" -> "${desp.concepto}"`);
        if (antes.categoria !== desp.categoria) cambios.push(`categoria ${antes.categoria} -> ${desp.categoria}`);
        return {
          titulo: 'Gasto modificado',
          detalle: cambios.length ? cambios.join(' · ') : `${desp.concepto ?? ''}`.trim() || 'Sin cambios de importe',
        };
      }

      if (a.tipo_evento === 'gasto_eliminado') {
        return {
          titulo: `Gasto eliminado · ${eur(d.importe_cents)} EUR`,
          detalle: [d.concepto, d.categoria].filter(Boolean).join(' · '),
        };
      }

      return {
        titulo: ETIQUETA_EVENTO[a.tipo_evento] ?? a.tipo_evento.replace(/_/g, ' '),
        detalle: '',
      };
    },
    [clientesMap, profesionalesMap],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return asientos.filter((a) => {
      if (filtroModulo !== 'todos' && a.modulo !== filtroModulo) return false;
      if (!q) return true;
      const { titulo, detalle } = describir(a);
      return [a.usuario_nombre, titulo, detalle].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [asientos, filtroModulo, busqueda, describir]);

  const chip = (activo: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${activo ? T.primary : T.border}`,
    background: activo ? T.primarySoft : 'transparent',
    color: activo ? T.primaryHi : T.textSec,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div style={{ padding: isMobile ? 16 : 24, borderBottom: `1px solid ${T.borderHi}` }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>Auditoria</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: T.textSec }}>
          Quien cambio que y cuando. Los asientos los escribe el servidor, no la app: no se pueden
          editar ni borrar desde aqui.
        </p>
      </div>

      <div
        style={{
          padding: isMobile ? '12px 16px' : '16px 24px',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {(['todos', 'citas', 'caja'] as const).map((m) => (
          <button key={m} onClick={() => setFiltroModulo(m)} style={chip(filtroModulo === m)}>
            {m === 'todos' ? 'Todo' : m === 'citas' ? 'Citas' : 'Caja y gastos'}
          </button>
        ))}
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por persona, cliente o motivo"
          style={{
            flex: 1,
            minWidth: isMobile ? '100%' : 220,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            fontSize: 13,
            color: T.text,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ padding: isMobile ? 16 : 24, maxHeight: 600, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.textSec }}>Cargando registro...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.danger }}>{error}</div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.textSec }}>
            {asientos.length === 0
              ? 'Todavia no hay movimientos registrados en este periodo.'
              : 'Ningun movimiento coincide con el filtro.'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtrados.slice(0, visibles).map((a, i) => {
                const { titulo, detalle } = describir(a);
                const esCita = a.modulo === 'citas';
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 0',
                      borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                    }}
                  >
                    {/* Linea de tiempo */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background: esCita ? T.primary : T.success,
                          flexShrink: 0,
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{titulo}</div>
                      {detalle && (
                        <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 2, lineHeight: 1.45 }}>
                          {detalle}
                        </div>
                      )}
                      <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 4 }}>
                        {format(parseISO(a.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        {a.usuario_nombre ? ` · ${a.usuario_nombre}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {filtrados.length > visibles && (
              <button
                onClick={() => setVisibles((v) => v + PAGINA)}
                style={{
                  marginTop: 14,
                  width: '100%',
                  padding: '10px 0',
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  color: T.textSec,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ver mas ({filtrados.length - visibles} restantes)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
