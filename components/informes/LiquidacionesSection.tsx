// LiquidacionesSection — Sección de liquidaciones de comisiones en Informes
//
// Basado en el patrón de informes.web.tsx, añade gestión de liquidaciones:
// - Selector de mes (periodo)
// - Toggle: "Todas" vs "Por profesional"
// - Lista de profesionales con comisiones calculadas
// - Modal de detalle con desglose completo
// - Integración con RPCs: calcular_comisiones_periodo, generar_liquidacion, obtener_liquidaciones

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, canAccessInformes } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { startOfMonth, endOfMonth, format, parseISO, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// Design tokens (locales para consistency con informes.web.tsx)
const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.14)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.16)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
  amber: '#e08a00',
  amberSoft: 'rgba(224,138,0,0.16)',
  cyan: '#0891b2',
  cyanSoft: 'rgba(8,145,178,0.14)',
};

// ---------------------------------------------------------------------------
// SVG Icons (minimal set)
// ---------------------------------------------------------------------------
const Icon = ({ name, size = 20, color = '#1c1814' }: { name: string; size?: number; color?: string }) => {
  const icons: Record<string, string> = {
    percent: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
    dollar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    download: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    users: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    eye: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    refresh: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    fileText: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Liquidacion {
  id: string;
  profesional_id: string;
  profesional_nombre: string;
  periodo_inicio: string;
  periodo_fin: string;
  base_calculo_cents: number;
  porcentaje_aplicado: number;
  importe_comision_cents: number;
  estado: 'pendiente' | 'pagada' | 'anulada';
  created_at: string;
  pagada_en?: string;
  detalles?: any;
}

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  comision_pct?: number;
  activo: boolean;
}

interface CalculoComision {
  profesional_id: string;
  profesional_nombre: string;
  base_cents: number;
  porcentaje_aplicado: number;
  comision_cents: number;
  comision_base: string;
  incluir_addons: boolean;
  incluir_propinas: boolean;
  num_cobros: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${n.toFixed(2).replace('.', ',')}%`;
}

// CSV export
function descargarCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿';
  const csv = bom + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Modal Detalle de Liquidación
// ---------------------------------------------------------------------------
interface LiquidacionDetalleModalProps {
  open: boolean;
  onClose: () => void;
  liquidacion: Liquidacion | null;
}

function LiquidacionDetalleModal({ open, onClose, liquidacion }: LiquidacionDetalleModalProps) {
  const { isMobile } = useResponsive();
  if (!open || !liquidacion) return null;

  const detalle = liquidacion.detalles || {};
  const periodoLabel = `${format(parseISO(liquidacion.periodo_inicio), 'd MMM', { locale: es })} - ${format(parseISO(liquidacion.periodo_fin), 'd MMM yyyy', { locale: es })}`;

  return (
    <div
      style={{
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(28,24,20,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 16 : 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: TOKENS.bgCard,
          borderRadius: 14,
          width: '100%',
          maxWidth: 600,
          maxHeight: '90vh',
          overflowY: 'auto' as const,
          boxShadow: '0 20px 60px rgba(28,24,20,0.3)',
          padding: isMobile ? 18 : 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>
              Detalle de liquidación
            </h2>
            <div style={{ fontSize: 13, color: TOKENS.textTer, marginTop: 4 }}>
              {liquidacion.profesional_nombre} · {periodoLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${TOKENS.border}`,
              background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            <Icon name="x" size={16} color={TOKENS.textSec} />
          </button>
        </div>

        {/* Resumen */}
        <div style={{
          padding: 16, borderRadius: 12, background: TOKENS.bgPanel,
          border: `1px solid ${TOKENS.border}`, marginBottom: 16,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Base de cálculo
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.text }}>
                {fmtEur(liquidacion.base_calculo_cents)} €
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Porcentaje aplicado
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.primary }}>
                {fmtPct(liquidacion.porcentaje_aplicado)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Comisión final
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.success }}>
                {fmtEur(liquidacion.importe_comision_cents)} €
              </div>
            </div>
          </div>
        </div>

        {/* Detalles de configuración */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TOKENS.text }}>
            Configuración aplicada
          </h3>
          <div style={{
            padding: 12, borderRadius: 10, background: TOKENS.bgPanel,
            border: `1px solid ${TOKENS.border}`, fontSize: 13,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: TOKENS.textSec }}>Tipo de base</span>
              <span style={{ fontWeight: 600, color: TOKENS.text }}>
                {detalle.comision_base === 'neto' ? 'Neto (sin IVA)' : 'Bruto'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: TOKENS.textSec }}>Incluir addons</span>
              <span style={{ fontWeight: 600, color: TOKENS.text }}>
                {detalle.incluir_addons ? 'Si' : 'No'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: TOKENS.textSec }}>Incluir propinas</span>
              <span style={{ fontWeight: 600, color: TOKENS.text }}>
                {detalle.incluir_propinas ? 'Si' : 'No'}
              </span>
            </div>
            {detalle.propinas_cents !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${TOKENS.border}` }}>
                <span style={{ color: TOKENS.textSec }}>Propinas acumuladas</span>
                <span style={{ fontWeight: 600, color: TOKENS.success }}>
                  {fmtEur(detalle.propinas_cents)} €
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Detalle de cobros */}
        {detalle.num_cobros !== undefined && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TOKENS.text }}>
              Resumen de actividad
            </h3>
            <div style={{
              padding: 12, borderRadius: 10, background: TOKENS.bgPanel,
              border: `1px solid ${TOKENS.border}`, fontSize: 13,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: TOKENS.textSec }}>Cobros en el periodo</span>
                <span style={{ fontWeight: 600, color: TOKENS.text }}>
                  {detalle.num_cobros}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Estado y fechas */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TOKENS.text }}>
            Estado
          </h3>
          <div style={{
            padding: 12, borderRadius: 10, background: TOKENS.bgPanel,
            border: `1px solid ${TOKENS.border}`, fontSize: 13,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: TOKENS.textSec }}>Estado actual</span>
              <span style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
                background: liquidacion.estado === 'pagada' ? TOKENS.successSoft : TOKENS.warningSoft,
                color: liquidacion.estado === 'pagada' ? TOKENS.success : TOKENS.warning,
              }}>
                {liquidacion.estado === 'pagada' ? 'Pagada' : liquidacion.estado === 'pendiente' ? 'Pendiente' : 'Anulada'}
              </span>
            </div>
            {liquidacion.created_at && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: TOKENS.textSec }}>Creada el</span>
                <span style={{ fontWeight: 600, color: TOKENS.text }}>
                  {format(parseISO(liquidacion.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                </span>
              </div>
            )}
            {liquidacion.pagada_en && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: TOKENS.textSec }}>Pagada el</span>
                <span style={{ fontWeight: 600, color: TOKENS.success }}>
                  {format(parseISO(liquidacion.pagada_en), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {liquidacion.estado === 'pendiente' && (
            <button
              onClick={async () => {
                const { data, error } = await supabase.rpc('marcar_liquidacion_pagada', { p_liquidacion_id: liquidacion.id });
                if (error) {
                  console.error('Error marcando como pagada:', error);
                  alert('Error al marcar como pagada');
                } else {
                  onClose();
                }
              }}
              style={{
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: TOKENS.primarySoft, color: TOKENS.primaryHi, fontSize: 13, fontWeight: 600,
              }}
            >
              Marcar como pagada
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 9, border: `1px solid ${TOKENS.border}`,
              background: 'transparent', cursor: 'pointer', color: TOKENS.text, fontSize: 13, fontWeight: 600,
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
interface LiquidacionesSectionProps {
  negocioId?: string;
}

export function LiquidacionesSection({ negocioId: propNegocioId }: LiquidacionesSectionProps) {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState(propNegocioId || '');
  const [mesSeleccionado, setMesSeleccionado] = useState<Date>(new Date());
  const [vistaTodas, setVistaTodas] = useState(true);
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState<string | null>(null);

  // Data
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [calculosPreview, setCalculosPreview] = useState<CalculoComision[]>([]);
  const [generando, setGenerando] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [liquidacionSeleccionada, setLiquidacionSeleccionada] = useState<Liquidacion | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    cargarNegocioYProfesionales();
  }, []);

  // Recargar liquidaciones cuando cambia el mes
  useEffect(() => {
    if (negocioId) {
      cargarLiquidaciones();
      cargarPreviewCalculos();
    }
  }, [negocioId, mesSeleccionado, vistaTodas]);

  async function cargarNegocioYProfesionales() {
    setLoading(true);
    try {
      const profile = await getUserProfile();
      if (!canAccessInformes(profile)) {
        setLoading(false);
        return;
      }
      const nId = propNegocioId || profile?.negocio_id || NEGOCIO_ID_FALLBACK;
      setNegocioId(nId);

      const { data: profs } = await supabase
        .from('profesionales')
        .select('profile_id, nombre, color, comision_pct, activo')
        .eq('negocio_id', nId)
        .order('nombre');

      if (profs) {
        setProfesionales(profs.map(p => ({
          id: p.profile_id,
          nombre: p.nombre,
          color: p.color,
          comision_pct: p.comision_pct,
          activo: p.activo,
        })));
      }
    } catch (error) {
      console.error('Error cargando profesionales:', error);
    } finally {
      setLoading(false);
    }
  }

  async function cargarLiquidaciones() {
    if (!negocioId) return;

    const { desde, hasta } = getRangoMes(mesSeleccionado);

    const { data, error } = await supabase.rpc('obtener_liquidaciones', {
      p_profesional_id: vistaTodas ? null : profesionalSeleccionado,
      p_estado: null,
    });

    if (error) {
      console.error('Error cargando liquidaciones:', error);
      setLiquidaciones([]);
    } else if (data) {
      const liqus = (data as any).liquidaciones || [];
      // Filtrar por periodo seleccionado
      const filtradas = liqus.filter((l: Liquidacion) => {
        const inicio = parseISO(l.periodo_inicio);
        const fin = parseISO(l.periodo_fin);
        return inicio >= desde && fin <= hasta;
      });
      setLiquidaciones(filtradas);
    }
  }

  async function cargarPreviewCalculos() {
    if (!negocioId || vistaTodas) {
      setCalculosPreview([]);
      return;
    }

    const { desde, hasta } = getRangoMes(mesSeleccionado);
    const profId = profesionalSeleccionado;

    if (!profId) {
      setCalculosPreview([]);
      return;
    }

    const { data, error } = await supabase.rpc('calcular_comisiones_periodo', {
      p_profesional_id: profId,
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
    });

    if (error) {
      console.error('Error calculando comisiones:', error);
      setCalculosPreview([]);
    } else if (data && (data as any).ok) {
      setCalculosPreview([(data as any).resultado]);
    }
  }

  function getRangoMes(fecha: Date): { desde: Date; hasta: Date } {
    return {
      desde: startOfMonth(fecha),
      hasta: endOfMonth(fecha),
    };
  }

  // Handlers
  const handleGenerarLiquidacion = async (profesionalId: string) => {
    setGenerando(true);
    try {
      const { desde, hasta } = getRangoMes(mesSeleccionado);

      const { data, error } = await supabase.rpc('generar_liquidacion', {
        p_profesional_id: profesionalId,
        p_periodo_inicio: desde.toISOString(),
        p_periodo_fin: hasta.toISOString(),
      });

      if (error) {
        console.error('Error generando liquidación:', error);
        alert(error.message || 'Error al generar liquidación');
      } else if (data && !(data as any).ok) {
        alert((data as any).error || 'Error al generar liquidación');
      } else {
        await cargarLiquidaciones();
      }
    } finally {
      setGenerando(false);
    }
  };

  const handleGenerarTodas = async () => {
    if (!negocioId) return;
    setGenerando(true);
    try {
      const { desde, hasta } = getRangoMes(mesSeleccionado);

      for (const prof of profesionales.filter(p => p.activo)) {
        await supabase.rpc('generar_liquidacion', {
          p_profesional_id: prof.id,
          p_periodo_inicio: desde.toISOString(),
          p_periodo_fin: hasta.toISOString(),
        });
      }

      await cargarLiquidaciones();
    } catch (error) {
      console.error('Error generando liquidaciones:', error);
      alert('Error al generar liquidaciones');
    } finally {
      setGenerando(false);
    }
  };

  const handleMarcarPagada = async (liquidacionId: string) => {
    const { data, error } = await supabase.rpc('marcar_liquidacion_pagada', {
      p_liquidacion_id: liquidacionId,
    });

    if (error) {
      console.error('Error marcando como pagada:', error);
      alert('Error al marcar como pagada');
    } else {
      await cargarLiquidaciones();
    }
  };

  const handleVerDetalle = (liquidacion: Liquidacion) => {
    setLiquidacionSeleccionada(liquidacion);
    setModalOpen(true);
  };

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const headers = ['Profesional', 'Periodo', 'Base (EUR)', 'Porcentaje', 'Comisión (EUR)', 'Propinas (EUR)', 'Total (EUR)', 'Estado', 'Creada', 'Pagada'];
    const rows = liquidaciones.map(l => [
      l.profesional_nombre,
      `${format(parseISO(l.periodo_inicio), 'dd/MM/yyyy')} - ${format(parseISO(l.periodo_fin), 'dd/MM/yyyy')}`,
      fmtEur(l.base_calculo_cents),
      fmtPct(l.porcentaje_aplicado),
      fmtEur(l.importe_comision_cents),
      fmtEur(l.detalles?.propinas_cents || 0),
      fmtEur(l.importe_comision_cents + (l.detalles?.propinas_cents || 0)),
      l.estado,
      format(parseISO(l.created_at), 'dd/MM/yyyy HH:mm'),
      l.pagada_en ? format(parseISO(l.pagada_en), 'dd/MM/yyyy HH:mm') : '',
    ]);
    descargarCSV(`liquidaciones_${format(mesSeleccionado, 'yyyy-MM')}.csv`, headers, rows);
  }, [liquidaciones, mesSeleccionado]);

  // Lista de meses para el selector
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: d, label: format(d, "MMMM yyyy", { locale: es }) };
  });

  const periodoLabel = `${format(startOfMonth(mesSeleccionado), 'd MMM', { locale: es })} - ${format(endOfMonth(mesSeleccionado), 'd MMM yyyy', { locale: es })}`;

  // Calculo de totales
  const totalBase = liquidaciones.reduce((s, l) => s + l.base_calculo_cents, 0);
  const totalComision = liquidaciones.reduce((s, l) => s + l.importe_comision_cents, 0);
  const totalPropinas = liquidaciones.reduce((s, l) => s + (l.detalles?.propinas_cents || 0), 0);
  const pendientesCount = liquidaciones.filter(l => l.estado === 'pendiente').length;
  const pagadasCount = liquidaciones.filter(l => l.estado === 'pagada').length;

  // Datos a mostrar (liquidaciones guardadas o preview)
  const datosAMostrar = vistaTodas
    ? liquidaciones
    : (calculosPreview.length > 0
        ? calculosPreview.map((c, i) => ({
            id: `preview-${i}`,
            profesional_id: c.profesional_id,
            profesional_nombre: c.profesional_nombre,
            periodo_inicio: startOfMonth(mesSeleccionado).toISOString(),
            periodo_fin: endOfMonth(mesSeleccionado).toISOString(),
            base_calculo_cents: c.base_cents,
            porcentaje_aplicado: c.porcentaje_aplicado,
            importe_comision_cents: c.comision_cents,
            estado: 'preview' as const,
            created_at: new Date().toISOString(),
            detalles: c,
          }))
        : []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <div style={{ width: 24, height: 24, border: `2px solid ${TOKENS.primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 13, color: TOKENS.textSec }}>Cargando liquidaciones...</span>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: isMobile ? 10 : 14 }}>
        {/* Header con controles */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12,
          padding: isMobile ? '11px 13px' : '14px 18px',
          borderRadius: '14px 14px 0 0', background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`, borderBottom: `1px solid ${TOKENS.border}`,
        }}>
          <div style={{
            width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${TOKENS.amber}18`, flexShrink: 0,
          }}>
            <Icon name="percent" size={isMobile ? 16 : 18} color={TOKENS.amber} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 13.5 : 14, fontWeight: 700, color: TOKENS.text }}>
              Liquidaciones de comisiones
            </div>
            <div style={{ fontSize: isMobile ? 10.5 : 11, color: TOKENS.textTer, marginTop: 1 }}>
              {periodoLabel}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{
          padding: isMobile ? 13 : 18, borderRadius: '0 0 14px 14px', background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`, borderTop: 'none', marginTop: 0,
        }}>
          {/* Controles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {/* Fila 1: Selector de mes y vista */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Selector de mes */}
              <div style={{ display: 'flex', gap: 4, background: TOKENS.bgPanel, borderRadius: 10, padding: 3, border: `1px solid ${TOKENS.border}` }}>
                {meses.slice(0, 6).map(m => (
                  <button
                    key={m.label}
                    onClick={() => setMesSeleccionado(m.value)}
                    style={{
                      padding: isMobile ? '6px 11px' : '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: isMobile ? 11.5 : 12, fontWeight: startOfMonth(mesSeleccionado).getTime() === startOfMonth(m.value).getTime() ? 600 : 400,
                      background: startOfMonth(mesSeleccionado).getTime() === startOfMonth(m.value).getTime() ? TOKENS.amber : 'transparent',
                      color: startOfMonth(mesSeleccionado).getTime() === startOfMonth(m.value).getTime() ? '#000' : TOKENS.textSec,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                  </button>
                ))}
              </div>

              {/* Toggle vista */}
              <div style={{ display: 'flex', gap: 4, background: TOKENS.bgPanel, borderRadius: 10, padding: 3, border: `1px solid ${TOKENS.border}` }}>
                <button
                  onClick={() => setVistaTodas(true)}
                  style={{
                    padding: isMobile ? '6px 11px' : '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: isMobile ? 11.5 : 12, fontWeight: vistaTodas ? 600 : 400,
                    background: vistaTodas ? TOKENS.primarySoft : 'transparent',
                    color: vistaTodas ? TOKENS.primaryHi : TOKENS.textSec,
                    transition: 'all 0.2s ease',
                  }}
                >
                  Todas
                </button>
                <button
                  onClick={() => setVistaTodas(false)}
                  style={{
                    padding: isMobile ? '6px 11px' : '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: isMobile ? 11.5 : 12, fontWeight: !vistaTodas ? 600 : 400,
                    background: !vistaTodas ? TOKENS.primarySoft : 'transparent',
                    color: !vistaTodas ? TOKENS.primaryHi : TOKENS.textSec,
                    transition: 'all 0.2s ease',
                  }}
                >
                  Por profesional
                </button>
              </div>
            </div>

            {/* Fila 2: Selector de profesional (solo en vista por profesional) */}
            {!vistaTodas && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: TOKENS.textTer }}>Profesional:</span>
                <select
                  value={profesionalSeleccionado || ''}
                  onChange={e => setProfesionalSeleccionado(e.target.value || null)}
                  style={{
                    padding: '6px 10px', borderRadius: 8, border: `1px solid ${TOKENS.border}`,
                    background: TOKENS.bgPanel, fontSize: 13, color: TOKENS.text,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Selecciona...</option>
                  {profesionales.filter(p => p.activo).map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Resumen del periodo */}
          {liquidaciones.length > 0 && (
            <div style={{
              padding: 14, borderRadius: 12, background: TOKENS.bgPanel,
              border: `1px solid ${TOKENS.border}`, marginBottom: 16,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                    Total base
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.text }}>
                    {fmtEur(totalBase)} €
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                    Total comisiones
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.success }}>
                    {fmtEur(totalComision)} €
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                    Propinas
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.primaryHi }}>
                    {fmtEur(totalPropinas)} €
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                    Pendientes
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.warning }}>
                    {pendientesCount}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                    Pagadas
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.success }}>
                    {pagadasCount}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Acciones globales */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {vistaTodas && (
              <button
                onClick={handleGenerarTodas}
                disabled={generando}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: TOKENS.primarySoft, color: TOKENS.primaryHi,
                  fontSize: 13, fontWeight: 600, opacity: generando ? 0.6 : 1,
                }}
              >
                <Icon name="refresh" size={14} color={TOKENS.primaryHi} />
                {generando ? 'Generando...' : 'Generar todas las liquidaciones'}
              </button>
            )}
            {liquidaciones.length > 0 && (
              <button
                onClick={handleExportCSV}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 9, border: `1px solid ${TOKENS.border}`,
                  background: 'transparent', cursor: 'pointer',
                  color: TOKENS.textSec, fontSize: 13, fontWeight: 600,
                }}
              >
                <Icon name="download" size={14} color={TOKENS.textSec} />
                Exportar CSV
              </button>
            )}
          </div>

          {/* Lista de liquidaciones */}
          {datosAMostrar.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center', borderRadius: 12,
              background: TOKENS.bgPanel, border: `1px solid ${TOKENS.border}`,
            }}>
              <Icon name="alert" size={32} color={TOKENS.textTer} />
              <div style={{ marginTop: 12, fontSize: 14, color: TOKENS.textSec }}>
                {vistaTodas
                  ? 'No hay liquidaciones para este periodo. Genera las liquidaciones para ver el desglose.'
                  : 'Selecciona un profesional para ver su calculo de comisiones.'}
              </div>
            </div>
          ) : (
            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${TOKENS.border}` }}>
              {/* Header tabla */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1.5fr 0.8fr 1fr 1fr'
                  : '1.5fr 1fr 1fr 1fr 1.2fr 1fr',
                padding: isMobile ? '9px 10px' : '10px 14px',
                background: TOKENS.bgPanel, borderBottom: `1px solid ${TOKENS.border}`,
                fontSize: isMobile ? 10 : 11, fontWeight: 600, color: TOKENS.textTer,
                textTransform: 'uppercase', letterSpacing: isMobile ? 0.2 : 0.5,
              }}>
                <div>Profesional</div>
                {!isMobile && <div style={{ textAlign: 'right' }}>Base</div>}
                <div style={{ textAlign: 'right' }}>Comisión</div>
                <div style={{ textAlign: 'right' }}>Propinas</div>
                <div style={{ textAlign: 'right', color: TOKENS.text }}>Total</div>
                <div style={{ textAlign: 'right' }}>Estado</div>
              </div>

              {/* Filas */}
              {datosAMostrar.map((l, i) => {
                const esPreview = l.estado === 'preview';
                return (
                  <div
                    key={l.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile
                        ? '1.5fr 0.8fr 1fr 1fr'
                        : '1.5fr 1fr 1fr 1fr 1.2fr 1fr',
                      padding: isMobile ? '9px 10px' : '10px 14px',
                      borderBottom: i < datosAMostrar.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                      background: esPreview ? TOKENS.amberSoft : 'transparent',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>
                        {l.profesional_nombre}
                      </span>
                      {esPreview && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: TOKENS.warning,
                          background: TOKENS.warningSoft, border: `1px solid ${TOKENS.warning}40`,
                          borderRadius: 999, padding: '1px 6px',
                        }}>
                          PREVIEW
                        </span>
                      )}
                    </div>
                    {!isMobile && (
                      <div style={{ fontSize: 12, color: TOKENS.text, textAlign: 'right' }}>
                        {fmtEur(l.base_calculo_cents)} €
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: TOKENS.success, textAlign: 'right' }}>
                      {fmtEur(l.importe_comision_cents)} €
                    </div>
                    <div style={{ fontSize: 12, color: TOKENS.primaryHi, textAlign: 'right' }}>
                      {l.detalles?.propinas_cents ? '+' + fmtEur(l.detalles.propinas_cents) + ' €' : '-'}
                    </div>
                    <div style={{ fontSize: 13, color: TOKENS.text, fontWeight: 700, textAlign: 'right' }}>
                      {fmtEur(l.importe_comision_cents + (l.detalles?.propinas_cents || 0))} €
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
                        padding: '2px 8px', borderRadius: 999,
                        background: l.estado === 'pagada' ? TOKENS.successSoft : (esPreview ? TOKENS.warningSoft : TOKENS.warningSoft),
                        color: l.estado === 'pagada' ? TOKENS.success : TOKENS.warning,
                      }}>
                        {esPreview ? 'Calculada' : l.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                      </span>
                      {!esPreview && (
                        <button
                          onClick={() => handleVerDetalle(l)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: `1px solid ${TOKENS.border}`,
                            background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
                            padding: 0,
                          }}
                          title="Ver detalle"
                        >
                          <Icon name="eye" size={12} color={TOKENS.textSec} />
                        </button>
                      )}
                      {esPreview && (
                        <button
                          onClick={() => handleGenerarLiquidacion(l.profesional_id)}
                          disabled={generando}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontSize: 11, fontWeight: 600, background: TOKENS.primarySoft,
                            color: TOKENS.primaryHi, opacity: generando ? 0.6 : 1,
                          }}
                        >
                          Generar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <LiquidacionDetalleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        liquidacion={liquidacionSeleccionada}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

export default LiquidacionesSection;
