import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { format, parseISO, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { CobroSheet } from '@/components/pos/CobroSheet';
import { categoryColorHex } from '@/lib/categoryColors';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualCaja } from '@/lib/manuals/caja';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';

// ─────────────────────────────────────────────────────────────────────────────────
// Tokens (consistente con el resto de .web.tsx)
// ─────────────────────────────────────────────────────────────────────────────────
const T = {
  bg: '#f6f1ea',
  panel: '#fffdfb',
  card: '#ffffff',
  cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)',
  borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.14)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.12)',
};

const ANIM = `
  @keyframes caFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes caUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  .ca-row { animation: caUp 0.35s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.15s ease; }
  .ca-row:hover { background: ${T.cardHi} !important; }
  .ca-row.selected { background: ${T.primarySoft} !important; border-color: ${T.primary} !important; }
  .ca-btn { transition: all 0.15s ease; cursor: pointer; }
  .ca-btn:hover { filter: brightness(1.05); }
  .ca-modal-overlay { animation: caFade 0.2s ease; }
  .ca-modal { animation: caUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
`;

function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4z"/>',
    credit: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    cash: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    scisors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="6" r="1"/><path d="M20.2 19.2L13 12"/><path d="M18 4l4 4-8.8 8.8a4 4 0 0 1-2.8 1.2H4l1.8-1.8a4 4 0 0 1 1.2-2.8L18 4z"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  };
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
      __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────────
interface CitaPendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  cliente_nombre: string | null;
  profesional_nombre: string | null;
  servicio_nombre: string | null;
  servicio_precio: number | null;
  categoria_color: string | null;
  sena_pagada: number; // señal ya pagada
  total_pendiente: number; // lo que falta cobrar
}

// Registros descargables (CSV) — como el modo gestor de novanoidai.
function toCSV(rows: (string | number)[][]): string {
  return rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
}
function downloadCSV(filename: string, rows: (string | number)[][]) {
  // BOM para que Excel respete los acentos.
  const blob = new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────────
function CajaScreen() {
  const { isMobile } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('caja');
  const [citas, setCitas] = useState<CitaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCobroModal, setShowCobroModal] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  // Presupuestos aceptados pendientes de cobro (se cobran con el mismo motor).
  type PresupuestoCobrable = { id: string; numero: number | null; contacto_nombre: string | null; total_cents: number };
  const [presupuestosCobrables, setPresupuestosCobrables] = useState<PresupuestoCobrable[]>([]);
  const [cobroPresupuesto, setCobroPresupuesto] = useState<PresupuestoCobrable | null>(null);
  const [mensaje, setMensaje] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Arqueo del dia: lo cobrado HOY de verdad (libro de cobros), por metodo.
  const [arqueo, setArqueo] = useState<{ total: number; efectivo: number; datafono: number; propinas: number; count: number } | null>(null);
  // Fichajes (registro de jornada del equipo)
  const [userId, setUserId] = useState<string>('');
  // Rol del usuario: propietario/dirección ven TODO el equipo; el resto, lo suyo.
  const [canSeeAll, setCanSeeAll] = useState(false);
  // Mapa user_id -> nombre del miembro del equipo (para mostrar quién fichó).
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [fichajesHoy, setFichajesHoy] = useState<Array<{ tipo: string; marcado_at: string; user_id: string | null }>>([]);
  // Cobros del día (filas crudas) para los registros descargables.
  const [cobrosHoy, setCobrosHoy] = useState<Array<any>>([]);
  // Id del cobro que se está reembolsando (spinner del botón).
  const [reembolsando, setReembolsando] = useState<string | null>(null);

  // --- Venta rápida de productos ---
  type ProductoVenta = { id: string; nombre: string; precio_cents: number };
  type CarritoItem = ProductoVenta & { cantidad: number };
  const [showVentaProductos, setShowVentaProductos] = useState(false);
  const [productosDisponibles, setProductosDisponibles] = useState<ProductoVenta[]>([]);
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [ventaMetodo, setVentaMetodo] = useState<'efectivo' | 'datafono' | 'bizum'>('efectivo');
  const [ventaEnviando, setVentaEnviando] = useState(false);

  // Totales de la selección
  const seleccion = useMemo(() => {
    const seleccionadas = citas.filter(c => selectedIds.has(c.id));
    const totalServicios = seleccionadas.reduce((s, c) => s + (c.servicio_precio || 0), 0);
    const totalSenas = seleccionadas.reduce((s, c) => s + c.sena_pagada, 0);
    const pendiente = totalServicios - totalSenas;
    return { count: seleccionadas.length, totalServicios, totalSenas, pendiente };
  }, [citas, selectedIds]);

  // Cargar citas pendientes de cobro (hoy)
  const cargarCitas = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      // Citas de hoy pendientes de cobro. El esquema real usa `inicio` (timestamptz),
      // `servicio_id` (no tabla puente) y `pagos.importe_cents`.
      const { data, error } = await supabase
        .from('citas')
        .select(`
          id,
          inicio,
          estado,
          cliente_id,
          clientes (nombre),
          profesional_id,
          profesionales (nombre),
          servicio_id,
          servicios (nombre, precio, categorias_servicio (color)),
          pagos (tipo, importe_cents, estado)
        `)
        .eq('negocio_id', profile.negocio_id)
        .eq('cobrada', false)
        .in('estado', ['completada', 'finalizada', 'confirmada'])
        .gte('inicio', todayStart)
        .lt('inicio', tomorrowStart)
        .order('inicio', { ascending: true });

      if (error) throw error;

      // Importes SIEMPRE en centimos internamente (servicios.precio viene en euros).
      const procesadas: CitaPendiente[] = (data || []).map((cita: any) => {
        const servicio = cita.servicios || {};
        const precioCents = Math.round((servicio.precio || 0) * 100);
        const catRel = servicio.categorias_servicio;
        const catToken = Array.isArray(catRel) ? catRel[0]?.color : catRel?.color;
        const pagos = cita.pagos || [];
        const sena = pagos
          .filter((p: any) => p.tipo === 'senal' && ['completado', 'pagado', 'succeeded', 'paid'].includes(p.estado))
          .reduce((s: number, p: any) => s + (p.importe_cents || 0), 0);

        return {
          id: cita.id,
          fecha: cita.inicio,
          hora_inicio: cita.inicio,
          cliente_nombre: cita.clientes?.nombre || null,
          profesional_nombre: cita.profesionales?.nombre || null,
          servicio_nombre: servicio.nombre || null,
          servicio_precio: precioCents,
          categoria_color: catToken ? categoryColorHex(catToken) : null,
          sena_pagada: sena,
          total_pendiente: Math.max(0, precioCents - sena),
        };
      });

      setCitas(procesadas);

      // Rol + equipo: el propietario/dirección ve el equipo entero; el resto, lo suyo.
      setUserId(profile.id || '');
      setCanSeeAll(profile.role === 'owner' || profile.role === 'admin');
      const { data: team } = await supabase
        .from('profiles')
        .select('id, nombre, apellido')
        .eq('negocio_id', profile.negocio_id);
      const map: Record<string, string> = {};
      (team || []).forEach((m: any) => { map[m.id] = [m.nombre, m.apellido].filter(Boolean).join(' ').trim() || 'Miembro'; });
      setStaffMap(map);

      // Arqueo del dia: lo cobrado HOY de verdad (libro de cobros)
      const { data: cobrosData } = await supabase
        .from('cobros')
        .select('id, cobrado_at, total_cents, efectivo_cents, datafono_cents, propina_cents, metodo, online_cents, cliente_id')
        .eq('negocio_id', profile.negocio_id)
        .eq('estado', 'completado')
        .gte('cobrado_at', todayStart)
        .order('cobrado_at', { ascending: false });
      const cr = cobrosData || [];
      setCobrosHoy(cr);
      setArqueo({
        total: cr.reduce((s: number, r: any) => s + (r.total_cents || 0), 0),
        efectivo: cr.reduce((s: number, r: any) => s + (r.efectivo_cents || 0), 0),
        datafono: cr.reduce((s: number, r: any) => s + (r.datafono_cents || 0), 0),
        propinas: cr.reduce((s: number, r: any) => s + (r.propina_cents || 0), 0),
        count: cr.length,
      });

      // Fichajes de hoy del negocio (registro de jornada)
      const { data: fchs } = await supabase
        .from('fichajes')
        .select('tipo, marcado_at, user_id')
        .eq('negocio_id', profile.negocio_id)
        .gte('marcado_at', todayStart)
        .order('marcado_at', { ascending: false });
      setFichajesHoy(fchs || []);

      // Presupuestos aceptados, aún sin cobrar.
      const { data: presData } = await supabase
        .from('presupuestos')
        .select('id, numero, contacto_nombre, total_cents')
        .eq('negocio_id', profile.negocio_id)
        .eq('estado', 'aceptado')
        .is('cobro_id', null)
        .order('created_at', { ascending: true });
      setPresupuestosCobrables((presData || []) as PresupuestoCobrable[]);
    } catch (err) {
      console.error('Error cargando citas pendientes:', err);
      setMensaje({ type: 'error', text: mensajeDeError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarCitas(); }, [cargarCitas]);

  // Toggle selección
  const toggleSeleccion = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodas = () => {
    if (selectedIds.size === citas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(citas.map(c => c.id)));
    }
  };

  // Tras cobrar con exito desde el CobroSheet: recargar, avisar, cerrar.
  const handleCobroSuccess = async (cobroIds: string[]) => {
    setMensaje({ type: 'success', text: `${cobroIds.length} cita${cobroIds.length === 1 ? '' : 's'} cobrada${cobroIds.length === 1 ? '' : 's'}` });
    setSelectedIds(new Set());
    setShowCobroModal(false);
    await cargarCitas(); // Recargar
    setTimeout(() => setMensaje(null), 3000);
  };

  // Reembolsar un cobro online (Stripe). El dinero se devuelve y la cita vuelve a "sin cobrar".
  const reembolsarCobro = async (cobroId: string, importeCents: number) => {
    if (typeof window !== 'undefined' &&
        !window.confirm(`¿Reembolsar ${(importeCents / 100).toFixed(2)} € al cliente?\nEl dinero se devuelve por Stripe y la cita vuelve a estar sin cobrar.`)) return;
    setReembolsando(cobroId);
    try {
      const { data, error } = await supabase.functions.invoke('reembolsar-cobro', { body: { cobro_id: cobroId } });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || 'No se pudo reembolsar.');
      setMensaje({ type: 'success', text: 'Reembolso realizado.' });
      await cargarCitas();
      setTimeout(() => setMensaje(null), 3000);
    } catch (err) {
      setMensaje({ type: 'error', text: mensajeDeError(err, 'No se pudo reembolsar.') });
    } finally {
      setReembolsando(null);
    }
  };

  // Cobro rapido (walk-in): venta sin cita, mismo motor, sin lista de pendientes que tocar.
  const handleWalkinSuccess = async () => {
    setMensaje({ type: 'success', text: 'Venta cobrada' });
    setShowWalkin(false);
    await cargarCitas(); // Recargar arqueo del dia
    setTimeout(() => setMensaje(null), 3000);
  };

  const handleCobroPresupuestoSuccess = async () => {
    setMensaje({ type: 'success', text: 'Presupuesto cobrado' });
    setCobroPresupuesto(null);
    await cargarCitas();
    setTimeout(() => setMensaje(null), 3000);
  };

  // El fichaje personal vive ahora en "Mi jornada". Aqui Caja solo supervisa
  // la jornada del equipo (lista + CSV), funcion de gestor.

  // Descargas (registros del día) — solo propietario/dirección.
  const hoyStr = format(new Date(), 'yyyy-MM-dd');
  const descargarCobros = () => {
    const rows: (string | number)[][] = [['Hora', 'Total (€)', 'Efectivo (€)', 'Datáfono (€)', 'Propina (€)']];
    cobrosHoy.forEach((c: any) => rows.push([
      format(parseISO(c.cobrado_at), 'HH:mm', { locale: es }),
      ((c.total_cents || 0) / 100).toFixed(2),
      ((c.efectivo_cents || 0) / 100).toFixed(2),
      ((c.datafono_cents || 0) / 100).toFixed(2),
      ((c.propina_cents || 0) / 100).toFixed(2),
    ]));
    rows.push(['TOTAL', ((arqueo?.total || 0) / 100).toFixed(2), ((arqueo?.efectivo || 0) / 100).toFixed(2), ((arqueo?.datafono || 0) / 100).toFixed(2), ((arqueo?.propinas || 0) / 100).toFixed(2)]);
    downloadCSV(`caja-cobros-${hoyStr}.csv`, rows);
  };
  const descargarFichajes = () => {
    const rows: (string | number)[][] = [['Empleado', 'Tipo', 'Hora']];
    [...fichajesHoy].reverse().forEach((f) => rows.push([
      (f.user_id && staffMap[f.user_id]) || 'Miembro',
      f.tipo === 'entrada' ? 'Entrada' : 'Salida',
      format(parseISO(f.marcado_at), 'HH:mm', { locale: es }),
    ]));
    downloadCSV(`fichajes-${hoyStr}.csv`, rows);
  };

  // ─────────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: T.textSec }}>
        <div className="spinner" style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        Cargando citas pendientes...
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{ANIM}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Contenedor con scroll propio: en movil la pantalla vive en una escena de
          altura acotada (con la tab bar de 58px abajo); sin overflowY propio + padding
          inferior, el contenido se cortaba y no se podia hacer scroll. */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 14px 96px' : '20px' }}>

      {/* Header */}
      <div style={{ marginBottom: isMobile ? 16 : 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: T.text, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="wallet" size={isMobile ? 22 : 28} color={T.primary} />
            Caja
          </h1>
          <p style={{ fontSize: isMobile ? 13 : 14, color: T.textSec, margin: 0 }}>
            Cobra las citas completadas, controla el arqueo del día y la jornada del equipo.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, zIndex: 100, flexWrap: 'wrap' }}>
          {canSeeAll && (
            <>
              <button
                onClick={async () => {
                  setShowVentaProductos(true);
                  if (productosDisponibles.length === 0) {
                    const profile = await getUserProfile();
                    if (profile?.negocio_id) {
                      const { data } = await supabase.from('productos').select('id, nombre, precio_cents').eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre');
                      setProductosDisponibles(data ?? []);
                    }
                  }
                }}
                className="ca-btn"
                style={{ padding: '10px 18px', background: T.primary, border: 'none', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
              >
                <Icon name="wallet" size={15} color="#fff" />
                Vender producto
              </button>
              <button
                onClick={() => setShowWalkin(true)}
                className="ca-btn"
                style={{ padding: '10px 18px', background: T.card, border: `1px solid ${T.borderHi}`, color: T.text, borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
              >
                <Icon name="cash" size={15} color={T.primary} />
                Cobro rápido
              </button>
            </>
          )}
          <button
            onClick={() => setShowManualPanel(true)}
            title="Manual de esta pagina"
            style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: T.card, border: `1px solid ${T.borderHi}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <AvisosBell mode="header" />
        </div>
      </div>

      {!paginaManual.loading && !paginaManual.visto && (
        <div style={{ marginBottom: isMobile ? 16 : 20 }}>
          <AvisoPrimeraVisita
            content={manualCaja}
            isMobile={isMobile}
            onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
            onCerrar={paginaManual.marcarVisto}
          />
        </div>
      )}

      {/* Arqueo del dia — solo propietario/dirección (todo lo del dinero) */}
      {canSeeAll && arqueo && (() => {
        // IVA estimado (operativo, NO fiscal): peluquería 21% incluido en el precio.
        const ivaEstim = Math.round(arqueo.total * 21 / 121);
        const card = (label: string, value: string, opts: { hero?: boolean; color?: string; icon?: string; sub?: string } = {}) => (
          <div style={{ background: T.card, border: `1px solid ${opts.hero ? 'rgba(244,80,30,0.32)' : T.border}`, borderRadius: 12, padding: '14px 16px', boxShadow: opts.hero ? '0 6px 20px -10px rgba(244,80,30,0.4)' : 'none' }}>
            <div style={{ fontSize: 11, color: T.textSec, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 5 }}>
              {opts.icon ? <Icon name={opts.icon} size={13} color={opts.color || T.textSec} /> : null}{label}
            </div>
            <div style={{ fontSize: opts.hero ? 24 : 18, fontWeight: opts.hero ? 800 : 700, color: opts.color || T.text, marginTop: 4 }}>{value}</div>
            {opts.sub ? <div style={{ fontSize: 11, color: T.textTer, marginTop: 2 }}>{opts.sub}</div> : null}
          </div>
        );
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            {card('Cobrado hoy', `${(arqueo.total / 100).toFixed(2)}€`, { hero: true, sub: `${arqueo.count} cobro${arqueo.count === 1 ? '' : 's'}` })}
            {card('Efectivo', `${(arqueo.efectivo / 100).toFixed(2)}€`, { icon: 'cash', color: T.text })}
            {card('Datáfono', `${(arqueo.datafono / 100).toFixed(2)}€`, { icon: 'credit', color: T.text })}
            {card('Propinas', `${(arqueo.propinas / 100).toFixed(2)}€`, { color: T.success })}
            {card('IVA estim. (21%)', `${(ivaEstim / 100).toFixed(2)}€`, { color: T.textSec, sub: 'incluido en lo cobrado' })}
          </div>
        );
      })()}

      {/* Registros descargables (CSV) — solo propietario/dirección */}
      {canSeeAll && cobrosHoy.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.borderHi}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="download" size={18} color={T.textTer} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Exportar registros del día</div>
              <div style={{ fontSize: 12, color: T.textSec }}>Descarga los cobros completados hoy en formato CSV.</div>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={descargarCobros} className="ca-btn" style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 9, border: `1px solid ${T.borderHi}`, background: T.bg, color: T.textSec, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="download" size={13} color={T.textSec} /> Cobros (CSV)
            </button>
          </div>
        </div>
      )}

      {/* Cobros online de hoy — reembolsables por Stripe (solo propietario/dirección) */}
      {canSeeAll && cobrosHoy.some((c: any) => c.metodo === 'online' || c.metodo === 'bizum') && (
        <div style={{ background: T.card, border: `1px solid ${T.borderHi}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Cobros online de hoy</div>
          <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>Pagos por QR/enlace (tarjeta o Bizum). Puedes reembolsarlos.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cobrosHoy.filter((c: any) => c.metodo === 'online' || c.metodo === 'bizum').map((c: any) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{(c.total_cents / 100).toFixed(2)} €</div>
                  <div style={{ fontSize: 11.5, color: T.textTer }}>
                    {c.metodo === 'bizum' ? 'Bizum' : 'Online'} · {new Date(c.cobrado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => reembolsarCobro(c.id, c.total_cents)}
                  disabled={reembolsando === c.id}
                  className="ca-btn"
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.danger}55`, background: T.dangerSoft ?? 'rgba(226,59,52,0.10)', color: T.danger, cursor: reembolsando === c.id ? 'not-allowed' : 'pointer', opacity: reembolsando === c.id ? 0.6 : 1, whiteSpace: 'nowrap' }}
                >
                  {reembolsando === c.id ? 'Reembolsando…' : 'Reembolsar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensaje */}
      {mensaje && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: mensaje.type === 'success' ? T.successSoft : T.dangerSoft,
          color: mensaje.type === 'success' ? T.success : T.danger,
          fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {mensaje.text}
        </div>
      )}

      {/* Barra de acciones — solo propietario/dirección */}
      {canSeeAll && citas.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: T.card, borderRadius: 12,
          border: `1px solid ${T.borderHi}`, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              checked={selectedIds.size === citas.length && citas.length > 0}
              onChange={seleccionarTodas}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, color: T.text }}>
              {selectedIds.size > 0 ? `${selectedIds.size} seleccionadas` : 'Seleccionar todas'}
            </span>
          </div>

          {seleccion.count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: T.textSec }}>Pendiente</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.primary }}>
                  {(seleccion.pendiente / 100).toFixed(2)}€
                </div>
              </div>
              <button
                onClick={() => setShowCobroModal(true)}
                className="ca-btn"
                style={{
                  padding: '10px 20px', background: T.primary, color: 'white',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <Icon name="cash" size={16} color="white" />
                Cobrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista de citas pendientes de cobro — solo propietario/dirección */}
      {canSeeAll && (citas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: T.card,
          borderRadius: 16, border: `1px solid ${T.border}`,
        }}>
          <Icon name="check" size={48} color={T.success} />
          <p style={{ fontSize: 16, color: T.textSec, marginTop: 16, margin: 0 }}>
            No hay citas pendientes de cobro hoy
          </p>
          <p style={{ fontSize: 13, color: T.textTer, marginTop: 8, margin: 0 }}>
            Las citas que completes aparecerán aquí para cobrarlas
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {citas.map((cita, idx) => {
            const isSelected = selectedIds.has(cita.id);
            const hora = cita.hora_inicio ? format(parseISO(cita.hora_inicio), 'HH:mm', { locale: es }) : '--:--';

            return (
              <div
                key={cita.id}
                className={`ca-row ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSeleccion(cita.id)}
                style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                  gap: 16, padding: '14px 18px', background: T.card,
                  borderRadius: 12, border: `1px solid ${isSelected ? T.primary : T.border}`,
                  cursor: 'pointer', animationDelay: `${idx * 0.03}s`,
                }}
              >
                {/* Checkbox */}
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSeleccion(cita.id)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
                      {cita.cliente_nombre || 'Sin cliente'}
                    </span>
                    {cita.profesional_nombre && (
                      <span style={{ fontSize: 12, color: T.textSec, padding: '2px 8px', background: T.bg, borderRadius: 6 }}>
                        {cita.profesional_nombre}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: T.textSec, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="clock" size={13} />
                      {hora}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {cita.categoria_color && <span style={{ width: 6, height: 6, borderRadius: 99, background: cita.categoria_color, flexShrink: 0 }} />}
                      {cita.servicio_nombre || 'Servicio'}
                    </span>
                  </div>
                </div>

                {/* Importe */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
                    {(cita.total_pendiente / 100).toFixed(2)}€
                  </div>
                  {cita.sena_pagada > 0 && (
                    <div style={{ fontSize: 11, color: T.success }}>
                      señal {(cita.sena_pagada / 100).toFixed(2)}€
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Presupuestos aceptados pendientes de cobro */}
      {canSeeAll && presupuestosCobrables.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={16} color={T.primary} /> Presupuestos aceptados
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {presupuestosCobrables.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textTer }}>P-{p.numero}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{p.contacto_nombre || 'Sin nombre'}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 2 }}>Presupuesto aceptado · pendiente de cobro</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{(p.total_cents / 100).toFixed(2)}€</span>
                  <button onClick={() => setCobroPresupuesto(p)} className="ca-btn" style={{ padding: '9px 16px', background: T.primary, color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <Icon name="cash" size={14} color="white" /> Cobrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>{/* fin contenedor con scroll */}

      {/* Modal de cobro — solo propietario/dirección (fixed: fuera del scroll) */}
      {canSeeAll && showCobroModal && (
        <CobroSheet
          mode="cita"
          citaIds={Array.from(selectedIds)}
          pendienteCents={seleccion.pendiente}
          senalCents={seleccion.totalSenas}
          titulo={`Cobrar ${seleccion.count} cita${seleccion.count > 1 ? 's' : ''}`}
          onClose={() => setShowCobroModal(false)}
          onSuccess={handleCobroSuccess}
        />
      )}
      {canSeeAll && showWalkin && (
        <CobroSheet
          mode="walkin"
          onClose={() => setShowWalkin(false)}
          onSuccess={handleWalkinSuccess}
        />
      )}
      {canSeeAll && cobroPresupuesto && (
        <CobroSheet
          mode="presupuesto"
          presupuestoId={cobroPresupuesto.id}
          pendienteCents={cobroPresupuesto.total_cents}
          titulo={`Cobrar presupuesto P-${cobroPresupuesto.numero}`}
          subtitulo={cobroPresupuesto.contacto_nombre || undefined}
          onClose={() => setCobroPresupuesto(null)}
          onSuccess={handleCobroPresupuestoSuccess}
        />
      )}

      {/* === PANEL VENTA RÁPIDA DE PRODUCTOS === */}
      {canSeeAll && showVentaProductos && (
        <div
          onClick={() => { if (!ventaEnviando) { setShowVentaProductos(false); setCarrito([]); } }}
          className="ca-modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ca-modal"
            style={{ background: T.panel, border: `1px solid ${T.borderHi}`, borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}
          >
            {/* Header */}
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="wallet" size={18} color={T.primary} /> Venta rápida
                </h4>
                <button onClick={() => { setShowVentaProductos(false); setCarrito([]); }} style={{ background: 'none', border: 'none', color: T.textTer, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
              </div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Toca un producto para añadirlo. Rápido y sin complicaciones.</div>
            </div>

            {/* Product grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {productosDisponibles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: T.textSec, fontSize: 13 }}>
                  No hay productos en el inventario. Añádelos desde la pestaña Inventario.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {productosDisponibles.map((prod) => {
                    const enCarrito = carrito.find(c => c.id === prod.id);
                    return (
                      <button
                        key={prod.id}
                        onClick={() => {
                          setCarrito(prev => {
                            const idx = prev.findIndex(c => c.id === prod.id);
                            if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, cantidad: c.cantidad + 1 } : c);
                            return [...prev, { ...prod, cantidad: 1 }];
                          });
                        }}
                        className="ca-btn"
                        style={{
                          position: 'relative',
                          background: enCarrito ? T.primarySoft : T.card,
                          border: `1px solid ${enCarrito ? T.primary : T.border}`,
                          borderRadius: 12, padding: '14px 10px', textAlign: 'center',
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        {enCarrito && (
                          <span style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 22, height: 22, borderRadius: '50%',
                            background: T.primary, color: '#fff',
                            fontSize: 11, fontWeight: 800,
                            display: 'grid', placeItems: 'center',
                            boxShadow: '0 2px 6px rgba(244,80,30,0.4)',
                          }}>{enCarrito.cantidad}</span>
                        )}
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.nombre}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: T.primary, marginTop: 4 }}>{(prod.precio_cents / 100).toFixed(2)}€</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mini-cart + checkout */}
            {carrito.length > 0 && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: '14px 20px', background: T.cardHi }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {carrito.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ flex: 1, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</span>
                      <button onClick={() => setCarrito(prev => prev.map(c => c.id === item.id ? { ...c, cantidad: Math.max(1, c.cantidad - 1) } : c))} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, width: 24, height: 24, fontSize: 14, cursor: 'pointer', color: T.text, display: 'grid', placeItems: 'center' }}>−</button>
                      <span style={{ fontWeight: 700, color: T.text, minWidth: 20, textAlign: 'center' }}>{item.cantidad}</span>
                      <button onClick={() => setCarrito(prev => prev.map(c => c.id === item.id ? { ...c, cantidad: c.cantidad + 1 } : c))} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, width: 24, height: 24, fontSize: 14, cursor: 'pointer', color: T.text, display: 'grid', placeItems: 'center' }}>+</button>
                      <span style={{ color: T.textSec, minWidth: 55, textAlign: 'right', fontWeight: 600 }}>{((item.precio_cents * item.cantidad) / 100).toFixed(2)}€</span>
                      <button onClick={() => setCarrito(prev => prev.filter(c => c.id !== item.id))} style={{ background: 'none', border: 'none', color: T.danger, fontSize: 16, cursor: 'pointer', padding: '0 2px' }}>×</button>
                    </div>
                  ))}
                </div>

                {/* Total + método + cobrar */}
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: isMobile ? '100%' : 'auto' }}>
                    <div>
                      <div style={{ fontSize: 11, color: T.textSec, fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>
                        {(carrito.reduce((s, c) => s + c.precio_cents * c.cantidad, 0) / 100).toFixed(2)}€
                      </div>
                    </div>
                    {isMobile && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['efectivo', 'datafono', 'bizum'] as const).map(m => (
                          <button key={m} onClick={() => setVentaMetodo(m)} className="ca-btn" style={{
                            padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                            background: ventaMetodo === m ? T.text : T.card,
                            color: ventaMetodo === m ? '#fff' : T.textSec,
                            border: `1px solid ${ventaMetodo === m ? T.text : T.border}`,
                          }}>{m === 'efectivo' ? 'Efectivo' : m === 'datafono' ? 'Datáfono' : 'Bizum'}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!isMobile && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['efectivo', 'datafono', 'bizum'] as const).map(m => (
                        <button key={m} onClick={() => setVentaMetodo(m)} className="ca-btn" style={{
                          padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: ventaMetodo === m ? T.text : T.card,
                          color: ventaMetodo === m ? '#fff' : T.textSec,
                          border: `1px solid ${ventaMetodo === m ? T.text : T.border}`,
                        }}>{m === 'efectivo' ? 'Efectivo' : m === 'datafono' ? 'Datáfono' : 'Bizum'}</button>
                      ))}
                    </div>
                  )}
                  <button
                    disabled={ventaEnviando}
                    onClick={async () => {
                      setVentaEnviando(true);
                      try {
                        const lineasPayload = carrito.map(c => ({
                          nombre: c.nombre,
                          precio_cents: c.precio_cents,
                          cantidad: c.cantidad,
                          ref_id: c.id,
                        }));
                        const { error: rpcErr } = await supabase.rpc('crear_cobro_walkin', {
                          p_lineas: lineasPayload,
                          p_metodo: ventaMetodo,
                          p_propina_cents: 0,
                          p_descuento_cents: 0,
                        });
                        if (rpcErr) throw rpcErr;
                        setShowVentaProductos(false);
                        setCarrito([]);
                        setMensaje({ type: 'success', text: `Venta registrada · ${(carrito.reduce((s, c) => s + c.precio_cents * c.cantidad, 0) / 100).toFixed(2)}€` });
                        setTimeout(() => setMensaje(null), 4000);
                        cargarCitas();
                      } catch (err: any) {
                        setMensaje({ type: 'error', text: mensajeDeError(err, 'Error al registrar la venta.') });
                      } finally {
                        setVentaEnviando(false);
                      }
                    }}
                    className="ca-btn"
                    style={{
                      padding: '11px 22px', background: T.primary, color: '#fff',
                      border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                      cursor: ventaEnviando ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      width: isMobile ? '100%' : 'auto',
                    }}
                  >
                    <Icon name="check" size={16} color="#fff" />
                    {ventaEnviando ? 'Cobrando...' : 'Cobrar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualCaja}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

export default withClientDataGate(CajaScreen, 'Caja');
