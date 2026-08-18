// Registro de tickets de venta.
//
// ANTES ESTO MENTIA: pintaba un QR que apuntaba a una URL inventada de la AEAT y
// un "hash" fabricado en el navegador con el id del cobro y Date.now() (o sea,
// que cambiaba en cada render), presentado como "Firma VeriFactu". Ahora todo lo
// que se ve sale de la tabla `tickets_verifactu`: numero de serie correlativo y
// huella SHA-256 encadenada con el ticket anterior, calculada en el servidor.
//
// Lo que sigue SIN ser: una factura remitida a la AEAT. No hay alta en VeriFactu
// ni QR de verificacion oficial. Es un registro interno inalterable, y la
// pantalla lo dice tal cual (regla 5 de CLAUDE.md: sin claims falsos).

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { mensajeDeError } from '@/lib/errores';
import { generarTicketPdf, descargarBlob } from '@/lib/caja/ticketPdf';
import { RegistroCard, RegistroEstado, RegistroVerMas, RegistroBuscador, IconosRegistro } from './RegistroCard';

interface Props {
  negocioId: string;
  desde: Date;
  hasta: Date;
}

interface TicketRow {
  cobro_id: string;
  cobrado_at: string | null;
  total_cents: number;
  propina_cents: number;
  descuento_cents: number;
  metodo: string;
  cliente: string | null;
  servicio: string | null;
  // Del ticket (puede faltar si la emision fallo)
  serie: string | null;
  numero: number | null;
  numero_factura: string | null;
  hash: string | null;
  hash_anterior: string | null;
  fecha_emision: string | null;
  reconstruido: boolean;
}

interface Emisor {
  razon_social: string | null;
  nif: string | null;
  direccion_fiscal: string | null;
  cp_fiscal: string | null;
  poblacion_fiscal: string | null;
  nombre_publico: string | null;
  telefono: string | null;
}

const IVA_PCT = 21;
const PAGINA = 50;
const eur = (c: number) => (c / 100).toFixed(2);

export function FacturasRegistroSection({ negocioId, desde, hasta }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filas, setFilas] = useState<TicketRow[]>([]);
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const [lineasPorCobro, setLineasPorCobro] = useState<Record<string, any[]>>({});
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [busqueda, setBusqueda] = useState('');
  // Se cargan hasta 1000 cobros, pero no se pintan todos de golpe.
  const [visibles, setVisibles] = useState(PAGINA);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!negocioId) return;
      setLoading(true);
      setError('');
      try {
        const [cobrosRes, emisorRes] = await Promise.all([
          supabase
            .from('cobros')
            .select(
              `id, cobrado_at, total_cents, propina_cents, descuento_cents, metodo, estado,
               citas!cobros_cita_id_fkey ( clientes ( nombre ), servicios ( nombre ) )`,
            )
            .eq('negocio_id', negocioId)
            .eq('estado', 'completado')
            .gte('cobrado_at', desde.toISOString())
            .lte('cobrado_at', hasta.toISOString())
            .order('cobrado_at', { ascending: false })
            .limit(1000),
          supabase
            .from('negocio_portal')
            .select('razon_social, nif, direccion_fiscal, cp_fiscal, poblacion_fiscal, nombre_publico, telefono')
            .eq('negocio_id', negocioId)
            .maybeSingle(),
        ]);
        if (cobrosRes.error) throw cobrosRes.error;
        if (cancelado) return;
        setEmisor((emisorRes.data as Emisor) ?? null);

        const cobros = cobrosRes.data ?? [];
        const ids = cobros.map((c: any) => c.id);

        // Tickets y lineas de esos cobros. Se piden aparte porque
        // tickets_verifactu y cobro_lineas no cuelgan de `cobros` por FK
        // navegable desde PostgREST en este esquema.
        const [ticketsRes, lineasRes] = await Promise.all([
          ids.length
            ? supabase
                .from('tickets_verifactu')
                .select('cobro_id, serie, numero, hash, hash_anterior, fecha_emision, payload')
                .in('cobro_id', ids)
            : Promise.resolve({ data: [], error: null } as any),
          ids.length
            ? supabase
                .from('cobro_lineas')
                .select('cobro_id, tipo, nombre, precio_cents, cantidad')
                .in('cobro_id', ids)
            : Promise.resolve({ data: [], error: null } as any),
        ]);
        if (cancelado) return;

        const ticketPorCobro = new Map<string, any>();
        ((ticketsRes as any).data ?? []).forEach((t: any) => ticketPorCobro.set(t.cobro_id, t));

        const porCobro: Record<string, any[]> = {};
        ((lineasRes as any).data ?? []).forEach((l: any) => {
          (porCobro[l.cobro_id] ||= []).push(l);
        });
        setLineasPorCobro(porCobro);

        setFilas(
          cobros.map((c: any) => {
            const t = ticketPorCobro.get(c.id);
            const cita = Array.isArray(c.citas) ? c.citas[0] : c.citas;
            return {
              cobro_id: c.id,
              cobrado_at: c.cobrado_at,
              total_cents: c.total_cents ?? 0,
              propina_cents: c.propina_cents ?? 0,
              descuento_cents: c.descuento_cents ?? 0,
              metodo: c.metodo ?? '',
              cliente: cita?.clientes?.nombre ?? null,
              servicio: cita?.servicios?.nombre ?? null,
              serie: t?.serie ?? null,
              numero: t?.numero ?? null,
              numero_factura: t?.payload?.numero_factura ?? null,
              hash: t?.hash ?? null,
              hash_anterior: t?.hash_anterior ?? null,
              fecha_emision: t?.fecha_emision ?? null,
              reconstruido: t?.payload?.backfill === true,
            };
          }),
        );
      } catch (err) {
        if (!cancelado) setError(mensajeDeError(err, 'No se pudieron cargar los tickets.'));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [negocioId, desde.toISOString(), hasta.toISOString()]);

  useEffect(() => {
    setVisibles(PAGINA);
  }, [busqueda, filas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      [f.numero_factura, f.cliente, f.servicio, f.metodo, f.hash]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [filas, busqueda]);

  const sinTicket = useMemo(() => filas.filter((f) => !f.hash).length, [filas]);
  const razonEmisor = emisor?.razon_social || emisor?.nombre_publico || 'Tu salon';
  const faltanDatosFiscales = !emisor?.nif || !emisor?.razon_social;

  const descargarCSV = () => {
    let csv = 'Numero,Fecha,Cliente,Metodo,Importe EUR,Huella\n';
    filtradas.forEach((f) => {
      const fecha = f.cobrado_at ? format(parseISO(f.cobrado_at), 'yyyy-MM-dd HH:mm:ss') : '';
      csv += `"${f.numero_factura ?? ''}","${fecha}","${(f.cliente ?? '').replace(/"/g, "'")}","${f.metodo}","${eur(f.total_cents)}","${f.hash ?? ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    descargarBlob(blob, `tickets_${format(desde, 'yyyy-MM-dd')}_${format(hasta, 'yyyy-MM-dd')}.csv`);
  };

  const descargarPdf = async (f: TicketRow) => {
    setGenerando(true);
    try {
      const lineas = (lineasPorCobro[f.cobro_id] ?? []).map((l: any) => ({
        nombre: l.nombre || (l.tipo === 'servicio' ? 'Servicio' : 'Producto'),
        precio_cents: l.precio_cents ?? 0,
        cantidad: l.cantidad ?? 1,
      }));
      const blob = await generarTicketPdf({
        razonSocial: razonEmisor,
        nif: emisor?.nif ?? null,
        direccionFiscal: emisor?.direccion_fiscal,
        cpFiscal: emisor?.cp_fiscal,
        poblacionFiscal: emisor?.poblacion_fiscal,
        telefono: emisor?.telefono,
        color: T.primary,
        numeroFactura: f.numero_factura ?? 'sin numero',
        fechaEmision: f.fecha_emision
          ? parseISO(f.fecha_emision)
          : f.cobrado_at
            ? parseISO(f.cobrado_at)
            : new Date(),
        clienteNombre: f.cliente,
        lineas: lineas.length
          ? lineas
          : [{ nombre: f.servicio || 'Venta', precio_cents: f.total_cents, cantidad: 1 }],
        totalCents: f.total_cents,
        propinaCents: f.propina_cents,
        descuentoCents: f.descuento_cents,
        metodo: f.metodo,
        hash: f.hash ?? '(sin registro)',
        hashAnterior: f.hash_anterior,
        reconstruido: f.reconstruido,
      });
      descargarBlob(blob, `ticket_${f.numero_factura ?? f.cobro_id.slice(0, 8)}.pdf`);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo generar el PDF del ticket.'));
    } finally {
      setGenerando(false);
    }
  };

  const btn: React.CSSProperties = {
    padding: '8px 16px',
    background: T.primarySoft,
    color: T.primary,
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const aviso = (contenido: React.ReactNode, tono: 'neutro' | 'ojo') => (
    <div
      style={{
        fontSize: 12,
        color: tono === 'ojo' ? T.text : T.textSec,
        background: tono === 'ojo' ? T.warningSoft : T.bg,
        border: `1px solid ${tono === 'ojo' ? `${T.warning}33` : T.border}`,
        borderRadius: 8,
        padding: '10px 12px',
        lineHeight: 1.5,
      }}
    >
      {contenido}
    </div>
  );

  return (
    <RegistroCard
      titulo="Tickets de venta"
      descripcion="Cada cobro deja un ticket numerado con una huella encadenada al anterior: si se alterase uno, la cadena deja de cuadrar."
      icono={IconosRegistro.ticket}
      acento={T.primary}
      accion={
        <button onClick={descargarCSV} style={btn}>
          Exportar CSV
        </button>
      }
      toolbar={
        <RegistroBuscador
          valor={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por numero, cliente, servicio o huella"
        />
      }
    >
      {/* Avisos honestos, antes de la tabla */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {aviso(
          <>
            Registro interno inalterable. <strong>No se envía a la AEAT</strong>: no es una factura
            dada de alta en VeriFactu. Sirve como libro de tickets propio y como prueba de que no se
            ha tocado nada a posteriori.
          </>,
          'neutro',
        )}
        {faltanDatosFiscales &&
          aviso(
            <>
              Faltan los datos fiscales del salón (razón social y NIF), así que los tickets salen sin
              emisor. Complétalos en Ajustes para que el PDF quede presentable.
            </>,
            'ojo',
          )}
        {sinTicket > 0 &&
          aviso(
            <>
              {sinTicket} {sinTicket === 1 ? 'cobro no tiene' : 'cobros no tienen'} ticket emitido.
            </>,
            'ojo',
          )}
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
        {loading ? (
          <RegistroEstado tipo="cargando">Cargando tickets...</RegistroEstado>
        ) : error ? (
          <RegistroEstado tipo="error">{error}</RegistroEstado>
        ) : filtradas.length === 0 ? (
          <RegistroEstado tipo="vacio">
            {filas.length === 0 ? 'No hay cobros en este periodo.' : 'Ningun ticket coincide con la busqueda.'}
          </RegistroEstado>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 600 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
              <tr style={{ borderBottom: `2px solid ${T.borderHi}` }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Numero</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Fecha</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Metodo</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Importe</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: T.textSec, fontWeight: 600 }}>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, visibles).map((f) => (
                <tr key={f.cobro_id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '12px 8px', color: T.text, fontWeight: 600 }}>
                    {f.numero_factura ?? <span style={{ color: T.warning }}>sin emitir</span>}
                    {f.reconstruido && (
                      <div style={{ fontSize: 10, color: T.textTer, fontWeight: 500 }}>reconstruido</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', color: T.text }}>
                    {f.cobrado_at ? format(parseISO(f.cobrado_at), 'dd MMM yyyy - HH:mm', { locale: es }) : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', color: T.text }}>
                    <div style={{ fontWeight: 600 }}>{f.cliente ?? 'Venta directa'}</div>
                    <div style={{ fontSize: 12, color: T.textSec }}>{f.servicio ?? 'Productos'}</div>
                  </td>
                  <td style={{ padding: '12px 8px', color: T.text, textTransform: 'capitalize' }}>{f.metodo}</td>
                  <td style={{ padding: '12px 8px', color: T.text, textAlign: 'right', fontWeight: 600 }}>
                    {eur(f.total_cents)} €
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    <button
                      onClick={() => setSelected(f)}
                      style={{
                        background: 'transparent',
                        color: T.primary,
                        border: `1px solid ${T.borderHi}`,
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <RegistroVerMas
          restantes={filtradas.length - visibles}
          onClick={() => setVisibles((v) => v + PAGINA)}
        />
      </div>

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: '#fff',
              width: 360,
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 28,
              borderRadius: 12,
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Emisor */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #ccc', paddingBottom: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{razonEmisor}</div>
              {emisor?.nif && <div style={{ fontSize: 12, color: T.textSec }}>NIF: {emisor.nif}</div>}
              {(emisor?.direccion_fiscal || emisor?.poblacion_fiscal) && (
                <div style={{ fontSize: 12, color: T.textSec }}>
                  {[emisor?.direccion_fiscal, [emisor?.cp_fiscal, emisor?.poblacion_fiscal].filter(Boolean).join(' ')]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                {selected.numero_factura ?? 'Sin numero'}
              </div>
              <div style={{ fontSize: 12, color: T.textSec }}>
                {selected.cobrado_at ? format(parseISO(selected.cobrado_at), 'dd/MM/yyyy HH:mm') : ''}
              </div>
            </div>

            {selected.cliente && (
              <div style={{ fontSize: 13, color: T.textSec, marginBottom: 12 }}>Cliente: {selected.cliente}</div>
            )}

            {/* Lineas */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginBottom: 10 }}>
              {(lineasPorCobro[selected.cobro_id] ?? []).map((l: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: T.text }}>
                    {(l.cantidad ?? 1) > 1 ? `${l.cantidad}x ` : ''}
                    {l.nombre}
                  </span>
                  <span style={{ color: T.text }}>{eur((l.precio_cents ?? 0) * (l.cantidad ?? 1))} €</span>
                </div>
              ))}
              {(lineasPorCobro[selected.cobro_id] ?? []).length === 0 && (
                <div style={{ fontSize: 12, color: T.textTer }}>Sin desglose de lineas.</div>
              )}
            </div>

            {/* Importes */}
            {(() => {
              const baseConIva = Math.max(0, selected.total_cents - selected.propina_cents);
              const cuota = Math.round((baseConIva * IVA_PCT) / (100 + IVA_PCT));
              const fila = (k: string, v: string, bold = false) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 15 : 12.5, marginBottom: 5 }}>
                  <span style={{ color: bold ? T.text : T.textSec, fontWeight: bold ? 700 : 500 }}>{k}</span>
                  <span style={{ color: bold ? T.text : T.textSec, fontWeight: bold ? 700 : 500 }}>{v}</span>
                </div>
              );
              return (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginBottom: 14 }}>
                  {(lineasPorCobro[selected.cobro_id] ?? []).some((l: any) => /\(bono\)/i.test(l.nombre || '')) &&
                    fila('Servicio cubierto por bono', '0,00 €')}
                  {selected.descuento_cents > 0 && fila('Descuento', `-${eur(selected.descuento_cents)} €`)}
                  {selected.propina_cents > 0 && fila('Propina', `${eur(selected.propina_cents)} €`)}
                  {fila('Base imponible (orient.)', `${eur(baseConIva - cuota)} €`)}
                  {fila(`IVA ${IVA_PCT}% (orient.)`, `${eur(cuota)} €`)}
                  {fila('TOTAL', `${eur(selected.total_cents)} €`, true)}
                  {fila('Forma de pago', selected.metodo)}
                </div>
              );
            })()}

            {/* Huella */}
            <div style={{ padding: 12, background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                Registro interno inalterable
              </div>
              {selected.hash ? (
                <>
                  <div style={{ fontSize: 10, color: T.textSec, wordBreak: 'break-all', marginBottom: 4 }}>
                    Huella: {selected.hash}
                  </div>
                  {selected.hash_anterior && (
                    <div style={{ fontSize: 10, color: T.textTer, wordBreak: 'break-all' }}>
                      Enlaza con: {selected.hash_anterior}
                    </div>
                  )}
                  {selected.reconstruido && (
                    <div style={{ fontSize: 10.5, color: T.warning, marginTop: 6 }}>
                      Huella reconstruida después del cobro: este ticket no se emitió en el momento.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: T.warning }}>Este cobro no tiene ticket emitido.</div>
              )}
              <div style={{ fontSize: 10, color: T.textTer, marginTop: 8, lineHeight: 1.5 }}>
                Documento sin valor fiscal: no se ha remitido a la AEAT.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                onClick={() => descargarPdf(selected)}
                disabled={generando}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: T.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: generando ? 'default' : 'pointer',
                }}
              >
                {generando ? 'Generando...' : 'Descargar PDF'}
              </button>
              <button
                onClick={() => setSelected(null)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: '#eee',
                  color: '#333',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </RegistroCard>
  );
}
