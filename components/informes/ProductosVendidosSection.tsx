import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { RegistroCard, RegistroEstado, RegistroVerMas, IconosRegistro } from './RegistroCard';
import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';

// ─────────────────────────────────────────────────────────────────────────────
// Sección "Productos vendidos" para la pestaña Informes.
//
// Lee el libro real de ventas (cobro_lineas tipo='producto' + cobros) en el
// periodo activo y muestra:
//   - KPIs globales (unidades, ingresos, ticket medio de producto)
//   - Ranking de productos más vendidos
//   - Desglose por profesional y por cliente
//   - Registro detallado (qué producto, a quién, en qué cita/venta suelta)
//
// Esto cubre la ausencia que teníamos: cobro_lineas era write-only (los RPC lo
// llenaban, pero ninguna pantalla lo leía). Ahora Informes es la fuente visible
// del registro de productos vendidos.
// ─────────────────────────────────────────────────────────────────────────────


const fmtEur = (cents: number) => (cents / 100).toFixed(2);
const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'd MMM yyyy · HH:mm', { locale: es }); } catch { return iso; }
};

interface CobroConLineas {
  id: string;
  cobrado_at: string | null;
  profesional_id: string | null;
  cliente_id: string | null;
  cita_id: string | null;
  lineas: Array<{
    id: string;
    nombre: string;
    precio_cents: number;
    cantidad: number;
    ref_id: string | null;
  }>;
}

interface Props {
  negocioId: string;
  desde: Date;
  hasta: Date;
  // Mapas para resolver nombres (ya cargados por la pantalla principal).
  clientesMap?: Map<string, { nombre: string; telefono?: string }>;
  profesionalesMap?: Map<string, { nombre: string }>;
}

export function ProductosVendidosSection({ negocioId, desde, hasta, clientesMap, profesionalesMap }: Props) {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [cobros, setCobros] = useState<CobroConLineas[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  // Antes se cortaba en 50 y punto: las ventas 51 en adelante no habia forma de
  // verlas, sin decirlo en ninguna parte.
  const [visibles, setVisibles] = useState(50);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!negocioId) return;
      setLoading(true);
      try {
        // 1. Cobros del periodo con al menos una línea de producto.
        //    Traemos los campos mínimos para resolver cliente/profesional/cita.
        const { data: cobrosBase, error } = await supabase
          .from('cobros')
          .select('id, cobrado_at, profesional_id, cliente_id, cita_id')
          .eq('negocio_id', negocioId)
          .eq('estado', 'completado')
          .gte('cobrado_at', desde.toISOString())
          .lte('cobrado_at', hasta.toISOString())
          .order('cobrado_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        if (!cobrosBase || cobrosBase.length === 0) {
          if (!cancelado) setCobros([]);
          return;
        }

        // 2. Líneas de producto de esos cobros. Cobro_lineas no tiene negocio_id:
        //    filtramos por la lista de cobro_id (PostgREST "in").
        const ids = cobrosBase.map((c: any) => c.id);
        const { data: lineas, error: errLineas } = await supabase
          .from('cobro_lineas')
          .select('id, cobro_id, tipo, nombre, precio_cents, cantidad, ref_id')
          .in('cobro_id', ids)
          .eq('tipo', 'producto')
          .order('nombre', { ascending: true });

        if (errLineas) throw errLineas;

        // 3. Agrupar líneas por cobro y descartar cobros sin producto.
        const lineasPorCobro = new Map<string, CobroConLineas['lineas']>();
        for (const l of (lineas ?? [])) {
          const arr = lineasPorCobro.get(l.cobro_id) ?? [];
          arr.push({
            id: l.id,
            nombre: l.nombre,
            precio_cents: l.precio_cents,
            cantidad: l.cantidad,
            ref_id: l.ref_id,
          });
          lineasPorCobro.set(l.cobro_id, arr);
        }

        const resultado: CobroConLineas[] = cobrosBase
          .filter((c: any) => lineasPorCobro.has(c.id))
          .map((c: any) => ({
            id: c.id,
            cobrado_at: c.cobrado_at,
            profesional_id: c.profesional_id,
            cliente_id: c.cliente_id,
            cita_id: c.cita_id,
            lineas: lineasPorCobro.get(c.id) ?? [],
          }));

        if (!cancelado) setCobros(resultado);
      } catch (err) {
        console.error('Error cargando productos vendidos:', err);
        if (!cancelado) setCobros([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, [negocioId, desde.toISOString(), hasta.toISOString()]);

  // ── Agregaciones ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let unidades = 0;
    let ingresosCents = 0;
    const porProducto = new Map<string, { nombre: string; unidades: number; ingresosCents: number }>();
    const porProfesional = new Map<string, { unidades: number; ingresosCents: number }>();
    const porCliente = new Map<string, { unidades: number; ingresosCents: number }>();

    for (const cobro of cobros) {
      for (const l of cobro.lineas) {
        const importe = l.precio_cents * l.cantidad;
        unidades += l.cantidad;
        ingresosCents += importe;

        // Por producto (agrupa por ref_id si existe, si no por nombre).
        const claveProd = l.ref_id || `nombre:${l.nombre}`;
        const p = porProducto.get(claveProd) ?? { nombre: l.nombre, unidades: 0, ingresosCents: 0 };
        p.unidades += l.cantidad;
        p.ingresosCents += importe;
        porProducto.set(claveProd, p);

        // Por profesional.
        if (cobro.profesional_id) {
          const pr = porProfesional.get(cobro.profesional_id) ?? { unidades: 0, ingresosCents: 0 };
          pr.unidades += l.cantidad;
          pr.ingresosCents += importe;
          porProfesional.set(cobro.profesional_id, pr);
        }

        // Por cliente.
        if (cobro.cliente_id) {
          const cl = porCliente.get(cobro.cliente_id) ?? { unidades: 0, ingresosCents: 0 };
          cl.unidades += l.cantidad;
          cl.ingresosCents += importe;
          porCliente.set(cobro.cliente_id, cl);
        }
      }
    }

    const numCobrosConProducto = cobros.length;
    return {
      unidades,
      ingresosCents,
      ticketMedioCents: numCobrosConProducto > 0 ? Math.round(ingresosCents / numCobrosConProducto) : 0,
      numCobrosConProducto,
      rankingProductos: Array.from(porProducto.values()).sort((a, b) => b.ingresosCents - a.ingresosCents),
      rankingProfesionales: Array.from(porProfesional.entries())
        .map(([id, v]) => ({ id, ...v, nombre: profesionalesMap?.get(id)?.nombre ?? 'Sin profesional' }))
        .sort((a, b) => b.ingresosCents - a.ingresosCents),
      rankingClientes: Array.from(porCliente.entries())
        .map(([id, v]) => ({ id, ...v, nombre: clientesMap?.get(id)?.nombre ?? 'Cliente desconocido' }))
        .sort((a, b) => b.ingresosCents - a.ingresosCents),
    };
  }, [cobros, clientesMap, profesionalesMap]);

  const sinDatos = !loading && cobros.length === 0;

  return (
    <RegistroCard
      titulo="Productos vendidos"
      descripcion="Registro de venta de productos (en cita o sueltos) del periodo."
      icono={IconosRegistro.producto}
      acento={TOKENS.success}
    >
      <>
        {loading ? (
          <RegistroEstado tipo="cargando">Cargando productos vendidos…</RegistroEstado>
        ) : sinDatos ? (
          <RegistroEstado tipo="vacio">
            No se han vendido productos en este periodo.
            <br />
            <span style={{ fontSize: 11, color: TOKENS.textTer }}>
              Las ventas de productos desde Caja aparecerán aquí automáticamente.
            </span>
          </RegistroEstado>
        ) : (
          <>
            {/* KPIs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
              gap: 10, marginBottom: 16,
            }}>
              <KPI label="Ingresos" value={`${fmtEur(stats.ingresosCents)} €`} color={TOKENS.success} />
              <KPI label="Unidades" value={String(stats.unidades)} color={TOKENS.primary} />
              <KPI label="Tickets c/producto" value={String(stats.numCobrosConProducto)} color={TOKENS.text} />
              <KPI label="Ticket medio" value={`${fmtEur(stats.ticketMedioCents)} €`} color={TOKENS.warning} />
            </div>

            {/* Ranking de productos + por profesional (2 columnas en desktop) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 16, marginBottom: 16,
            }}>
              <RankingTabla
                titulo="Top productos"
                filas={stats.rankingProductos.slice(0, 8).map(p => ({
                  nombre: p.nombre,
                  detalle: `${p.unidades} u.`,
                  valor: `${fmtEur(p.ingresosCents)} €`,
                }))}
                vacio="Sin productos."
              />
              <RankingTabla
                titulo="Por profesional"
                filas={stats.rankingProfesionales.slice(0, 8).map(p => ({
                  nombre: p.nombre,
                  detalle: `${p.unidades} u.`,
                  valor: `${fmtEur(p.ingresosCents)} €`,
                }))}
                vacio="Sin ventas asignadas."
              />
            </div>

            {/* Registro detallado */}
            <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: TOKENS.textSec, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Registro detallado
            </div>
            <div style={{
              border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: 'hidden',
            }}>
              {/* Cabecera */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 70px' : '2fr 1.4fr 1fr 1fr 80px',
                background: TOKENS.bgCardHi, padding: '9px 12px', fontSize: 11, fontWeight: 700,
                color: TOKENS.textSec, textTransform: 'uppercase', letterSpacing: 0.3, gap: 8,
              }}>
                <div>Producto</div>
                {!isMobile && <div>Cliente</div>}
                {!isMobile && <div>Profesional</div>}
                <div>{isMobile ? 'Fecha' : 'Fecha'}</div>
                <div style={{ textAlign: 'right' }}>Importe</div>
              </div>
              {cobros.slice(0, visibles).map((cobro) => (
                cobro.lineas.map((l, idx) => {
                  const cliente = cobro.cliente_id ? clientesMap?.get(cobro.cliente_id) : null;
                  const prof = cobro.profesional_id ? profesionalesMap?.get(cobro.profesional_id) : null;
                  const esEnCita = !!cobro.cita_id;
                  const isExpanded = expandedRow === `${cobro.id}-${idx}`;
                  return (
                    <div key={`${cobro.id}-${idx}`} style={{
                      borderTop: idx === 0 ? `1px solid ${TOKENS.border}` : 'none',
                    }}>
                      <div 
                        onClick={() => setExpandedRow(isExpanded ? null : `${cobro.id}-${idx}`)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr 70px' : '2fr 1.4fr 1fr 1fr 80px',
                          padding: '9px 12px', fontSize: 12, color: TOKENS.text,
                          gap: 8, alignItems: 'center', cursor: 'pointer',
                          background: isExpanded ? 'rgba(244,80,30,0.03)' : 'transparent',
                        }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.nombre} <span style={{ color: TOKENS.textTer, fontWeight: 400 }}>×{l.cantidad}</span>
                          </div>
                          {isMobile && (
                            <div style={{ fontSize: 10.5, color: TOKENS.textTer, marginTop: 1 }}>
                              {cliente?.nombre ?? 'Sin cliente'}
                              {esEnCita ? ' · en cita' : ' · suelto'}
                            </div>
                          )}
                        </div>
                        {!isMobile && (
                          <div style={{ color: TOKENS.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cliente?.nombre ?? '—'}
                            <span style={{ color: TOKENS.textTer, fontSize: 10.5 }}> {esEnCita ? '(en cita)' : '(suelto)'}</span>
                          </div>
                        )}
                        {!isMobile && (
                          <div style={{ color: TOKENS.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {prof?.nombre ?? '—'}
                          </div>
                        )}
                        <div style={{ color: TOKENS.textTer, fontSize: isMobile ? 10.5 : 11 }}>
                          {cobro.cobrado_at ? format(parseISO(cobro.cobrado_at), isMobile ? 'd MMM' : 'd MMM HH:mm', { locale: es }) : '—'}
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700, color: TOKENS.success }}>
                          {fmtEur(l.precio_cents * l.cantidad)} €
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div style={{ padding: '12px', background: TOKENS.bgPanel, borderTop: `1px dashed ${TOKENS.borderHi}`, fontSize: 12, color: TOKENS.textSec, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div><strong>Vendido por:</strong> {prof?.nombre ?? 'No especificado'}</div>
                          <div><strong>Comprado por:</strong> {cliente?.nombre ?? 'Cliente genérico'}</div>
                          {esEnCita ? (
                            <div><strong>Contexto:</strong> Venta cruzada durante una cita. <span style={{ color: TOKENS.textTer, fontSize: 10 }}>(Ref cita: {cobro.cita_id?.substring(0, 8)})</span></div>
                          ) : (
                            <div><strong>Contexto:</strong> Venta directa (walk-in).</div>
                          )}
                          <div><strong>Fecha exacta:</strong> {cobro.cobrado_at ? format(parseISO(cobro.cobrado_at), "dd/MM/yyyy 'a las' HH:mm:ss") : '—'}</div>
                        </div>
                      )}
                    </div>
                  );
                })
              ))}
            </div>
            <RegistroVerMas
              restantes={Math.max(0, cobros.length - visibles)}
              onClick={() => setVisibles((v) => v + 50)}
            />

            {/* Top clientes (colapsable visualmente debajo) */}
            {stats.rankingClientes.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: TOKENS.textSec, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Clientes que más compran productos
                </div>
                <RankingTabla
                  filas={stats.rankingClientes.slice(0, 6).map(c => ({
                    nombre: c.nombre,
                    detalle: `${c.unidades} u.`,
                    valor: `${fmtEur(c.ingresosCents)} €`,
                  }))}
                  vacio="Sin clientes."
                />
              </div>
            )}
          </>
        )}
      </>
    </RegistroCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────────
function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10.5, color: TOKENS.textSec, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function RankingTabla({ titulo, filas, vacio }: { titulo?: string; filas: Array<{ nombre: string; detalle: string; valor: string }>; vacio: string }) {
  return (
    <div>
      {titulo && (
        <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: TOKENS.textSec, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {titulo}
        </div>
      )}
      {filas.length === 0 ? (
        <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '8px 0' }}>{vacio}</div>
      ) : (
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {filas.map((f, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8,
              padding: '8px 11px', fontSize: 12, color: TOKENS.text,
              borderTop: i === 0 ? 'none' : `1px solid ${TOKENS.border}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</div>
                <div style={{ fontSize: 10.5, color: TOKENS.textTer }}>{f.detalle}</div>
              </div>
              <div style={{ fontWeight: 700, color: TOKENS.success, textAlign: 'right' }}>{f.valor}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
