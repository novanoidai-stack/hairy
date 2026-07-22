import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { esConfirmada, esPendiente, esNoShow, esCompletada } from '@/lib/citasMetrics';
import { PageLoader } from '@/components/ui/DesignComponents';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { SSelect, STextInput } from '@/components/ui/SettingsAtoms';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualCitas } from '@/lib/manuals/citas';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

// Pagina CITAS (barra inferior): CRM/historial unificado de TODAS las citas con
// filtros (rango de fecha, estado, profesional, servicio, confirmacion, canal) y
// buscador. Solo lectura + salto a la Agenda del dia. Reescrita 12 jul: la version
// previa consultaba columnas inexistentes (clientes.notas_internas, servicios.precio_eur,
// servicios.color, citas.precio_final_eur) y referenciaba un DetalleCitaModal que no
// existia => la pagina no cargaba datos y petaba al abrir una fila.

const T = DESIGN_TOKENS;

// Estados canonicos en BD (alineados con CITA_STATUS). El no-show es 'no_presentada'
// (termino oficial del glosario); el antiguo 'no_show' se unifico en la migracion
// kpi-a-unificar-no-show.
const ESTADOS: Array<{ value: string; label: string; color: string }> = [
  { value: 'pendiente', label: 'Pendiente', color: T.warning },
  { value: 'confirmada', label: 'Confirmada', color: T.success },
  { value: 'completada', label: 'Completada', color: T.primary },
  { value: 'cancelada', label: 'Cancelada', color: T.danger },
  { value: 'no_presentada', label: 'No presentada', color: T.danger },
];
const ESTADO_META = new Map(ESTADOS.map((e) => [e.value, e]));

const CANAL_LABEL: Record<string, string> = {
  manual: 'Mostrador', web: 'Web', whatsapp: 'WhatsApp', agente_voz: 'Voz IA', asistente_ia: 'Chispa',
};

const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const icons: Record<string, string> = {
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    external: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    phone: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  };
  return <span dangerouslySetInnerHTML={{ __html: icons[name] || '' }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} />;
};

interface Cita {
  id: string; inicio: string; fin: string; estado: string;
  profesional_id: string | null; servicio_id: string | null; cliente_id: string | null;
  confirmada_cliente: boolean | null; notas: string | null; importe_final: number | null;
  cobrada: boolean | null; canal: string | null; created_at: string;
}

function eur(n: number | null | undefined): string {
  if (n == null) return '-';
  return `${Number(n).toFixed(2)} €`;
}

function CitasCRMScreen() {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);

  // Filtros
  const [dateRange, setDateRange] = useState<'hoy' | 'semana' | 'mes' | 'todo'>('semana');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [profFilter, setProfFilter] = useState('todos');
  const [srvFilter, setSrvFilter] = useState('todos');
  const [soloSinConfirmar, setSoloSinConfirmar] = useState(false);
  const [search, setSearch] = useState('');

  const [selectedCita, setSelectedCita] = useState<Cita | null>(null);
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('citas');

  const fetchBaseData = useCallback(async () => {
    try {
      const [cliRes, srvRes, profRes, catRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre, telefono, email, notas, bloqueado, etiquetas'),
        supabase.from('servicios').select('id, nombre, duracion_activa_min, duracion_espera_min, precio, categoria_id'),
        supabase.from('profesionales').select('id, nombre, color, activo, foto_perfil').eq('activo', true),
        supabase.from('categorias_servicio').select('id, nombre, color, icono'),
      ]);
      if (cliRes.data) setClientes(cliRes.data);
      if (srvRes.data) setServicios(srvRes.data);
      if (profRes.data) setProfesionales(profRes.data);
      if (catRes.data) setCategorias(catRes.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchCitas = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('citas')
        .select('id, inicio, fin, estado, profesional_id, servicio_id, cliente_id, confirmada_cliente, notas, importe_final, cobrada, canal, created_at')
        .order('inicio', { ascending: false });

      if (dateRange !== 'todo') {
        const now = new Date();
        let start: Date | undefined, end: Date | undefined;
        if (dateRange === 'hoy') { start = startOfDay(now); end = endOfDay(now); }
        else if (dateRange === 'semana') { start = startOfWeek(now, { weekStartsOn: 1 }); end = endOfWeek(now, { weekStartsOn: 1 }); }
        else if (dateRange === 'mes') { start = startOfMonth(now); end = endOfMonth(now); }
        if (start && end) q = q.gte('inicio', start.toISOString()).lte('inicio', end.toISOString());
      }
      if (statusFilter !== 'todos') q = q.eq('estado', statusFilter);
      if (profFilter !== 'todos') q = q.eq('profesional_id', profFilter);
      if (srvFilter !== 'todos') q = q.eq('servicio_id', srvFilter);

      q = q.limit(1000);
      const { data } = await q;
      if (data) setCitas(data as Cita[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateRange, statusFilter, profFilter, srvFilter]);

  useEffect(() => { fetchBaseData(); }, [fetchBaseData]);
  useEffect(() => { fetchCitas(); }, [fetchCitas]);

  const srvMap = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios]);
  const cliMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const profMap = useMemo(() => new Map(profesionales.map((p) => [p.id, p])), [profesionales]);
  const catMap = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  // Color del servicio = color de su categoria (categorias_servicio), como la agenda.
  const colorServicio = useCallback((servicioId: string | null): string => {
    const srv = servicioId ? srvMap.get(servicioId) : null;
    const cat = srv?.categoria_id ? catMap.get(srv.categoria_id) : null;
    return cat?.color || T.textTer;
  }, [srvMap, catMap]);

  const filteredCitas = useMemo(() => {
    let list = citas;
    if (soloSinConfirmar) list = list.filter((c) => !c.confirmada_cliente);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((c) => {
        const cli = c.cliente_id ? cliMap.get(c.cliente_id) : null;
        const srv = c.servicio_id ? srvMap.get(c.servicio_id) : null;
        return (cli?.nombre?.toLowerCase() || '').includes(s)
          || (cli?.telefono || '').includes(s)
          || (srv?.nombre?.toLowerCase() || '').includes(s);
      });
    }
    return list;
  }, [citas, search, soloSinConfirmar, cliMap, srvMap]);

  // Resumen (sobre lo filtrado) para dar contexto tipo CRM.
  const stats = useMemo(() => {
    let confirmadas = 0, pendientes = 0, noshows = 0, ingresos = 0;
    for (const c of filteredCitas) {
      if (esConfirmada(c)) confirmadas++;
      else if (esPendiente(c)) pendientes++;
      else if (esNoShow(c)) noshows++;
      if (esCompletada(c) || c.cobrada) {
        const srv = c.servicio_id ? srvMap.get(c.servicio_id) : null;
        ingresos += c.importe_final != null ? Number(c.importe_final) : Number(srv?.precio || 0);
      }
    }
    return { total: filteredCitas.length, confirmadas, pendientes, noshows, ingresos };
  }, [filteredCitas, srvMap]);

  const abrirEnAgenda = (c: Cita) => {
    const fecha = format(parseISO(c.inicio), 'yyyy-MM-dd');
    setSelectedCita(null);
    router.push(`/(tabs)?fecha=${fecha}&cita=${c.id}` as never);
  };

  const pad = isMobile ? '16px' : '24px 32px';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '16px' : '20px 32px', background: T.bgPanel, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: T.text, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
          Citas
          <button
            className="m-btn-icon"
            onClick={() => setShowManualPanel(true)}
            title="Manual de esta pagina"
            style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.borderHi}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: isMobile ? 12.5 : 14, color: T.textSec }}>Historial unificado y filtros de todas las citas del salon.</p>
      </div>

      {!paginaManual.loading && !paginaManual.visto && (
        <div style={{ flexShrink: 0 }}>
          <AvisoPrimeraVisita
            content={manualCitas}
            isMobile={isMobile}
            onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
            onCerrar={paginaManual.marcarVisto}
          />
        </div>
      )}

      {/* Resumen */}
      <div style={{ display: 'flex', gap: isMobile ? 8 : 12, padding: isMobile ? '12px 16px' : '14px 32px', background: T.bg, flexShrink: 0, overflowX: 'auto' }}>
        {[
          { label: 'Citas', value: String(stats.total), color: T.text },
          { label: 'Confirmadas', value: String(stats.confirmadas), color: T.success },
          { label: 'Pendientes', value: String(stats.pendientes), color: T.warning },
          { label: 'No-shows', value: String(stats.noshows), color: T.danger },
          { label: 'Ingresos', value: eur(stats.ingresos), color: T.primary },
        ].map((s) => (
          <div key={s.label} style={{ minWidth: isMobile ? 88 : 120, background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? '8px 10px' : '10px 14px', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: T.textSec, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: s.color, marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ position: 'relative', zIndex: 10, padding: isMobile ? '0 16px 12px' : '0 32px 14px', background: T.bg, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, overflowX: isMobile ? 'auto' : 'visible', flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
        <div style={{ minWidth: 200, flex: isMobile ? '0 0 auto' : '1 1 200px', maxWidth: 280 }}>
          <STextInput value={search} onChange={setSearch} placeholder="Buscar cliente, telefono o servicio..." />
        </div>
        <div style={{ width: 150, flexShrink: 0 }}>
          <SSelect value={dateRange} onChange={(v) => setDateRange(v as any)} options={[
            { value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Esta semana' },
            { value: 'mes', label: 'Este mes' }, { value: 'todo', label: 'Historico' },
          ]} />
        </div>
        <div style={{ width: 170, flexShrink: 0 }}>
          <SSelect value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'todos', label: 'Todos los estados' },
            ...ESTADOS.map((e) => ({ value: e.value, label: e.label })),
          ]} />
        </div>
        <div style={{ width: 170, flexShrink: 0 }}>
          <SSelect value={profFilter} onChange={setProfFilter} options={[
            { value: 'todos', label: 'Todo el equipo' },
            ...profesionales.map((p) => ({ value: p.id, label: p.nombre })),
          ]} />
        </div>
        <div style={{ width: 180, flexShrink: 0 }}>
          <SSelect value={srvFilter} onChange={setSrvFilter} options={[
            { value: 'todos', label: 'Todos los servicios' },
            ...servicios.map((s) => ({ value: s.id, label: s.nombre })),
          ]} />
        </div>
        <button
          onClick={() => setSoloSinConfirmar((v) => !v)}
          style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            background: soloSinConfirmar ? T.primary : T.bgPanel, color: soloSinConfirmar ? '#fff' : T.textSec, border: `1px solid ${soloSinConfirmar ? T.primary : T.border}` }}
        >Sin confirmar</button>
      </div>

      {/* Tabla */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, overflowY: 'auto', padding: isMobile ? '0 16px 96px' : '0 32px 24px' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PageLoader /></div>
        ) : filteredCitas.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: T.textSec }}>
            <Icon name="calendar" size={40} color={T.textTer} />
            <p style={{ marginTop: 12 }}>No hay citas con estos filtros.</p>
          </div>
        ) : isMobile ? (
          // Movil: tarjetas apiladas (una tabla no cabe)
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {filteredCitas.map((c) => {
              const cli = c.cliente_id ? cliMap.get(c.cliente_id) : null;
              const srv = c.servicio_id ? srvMap.get(c.servicio_id) : null;
              const em = ESTADO_META.get(c.estado);
              return (
                <div key={c.id} onClick={() => setSelectedCita(c)}
                  style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderLeft: `4px solid ${colorServicio(c.servicio_id)}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{cli?.nombre || 'Anonimo'}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: em?.color, background: `${em?.color || T.textTer}22`, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{em?.label || c.estado}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 3 }}>{srv?.nombre || 'Sin servicio'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: T.textTer }}>
                    <span>{format(parseISO(c.inicio), "d MMM yyyy, HH:mm", { locale: es })}</span>
                    <span style={{ fontWeight: 700, color: T.text }}>{c.importe_final != null ? eur(c.importe_final) : eur(srv?.precio)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}`, textAlign: 'left' }}>
                {['Fecha / Hora', 'Cliente', 'Servicio', 'Profesional', 'Estado', 'Canal', 'Importe', 'Confirmada'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', color: T.textSec, fontSize: 12.5, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCitas.map((c) => {
                const cli = c.cliente_id ? cliMap.get(c.cliente_id) : null;
                const srv = c.servicio_id ? srvMap.get(c.servicio_id) : null;
                const prof = c.profesional_id ? profMap.get(c.profesional_id) : null;
                const dateObj = parseISO(c.inicio);
                const em = ESTADO_META.get(c.estado);
                return (
                  <tr key={c.id} onClick={() => setSelectedCita(c)}
                    style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: T.bgPanel }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.bgCard)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = T.bgPanel)}>
                    <td style={{ padding: '12px 8px', fontSize: 13.5, color: T.text, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{format(dateObj, 'dd MMM yyyy', { locale: es })}</div>
                      <div style={{ color: T.textSec, fontSize: 12 }}>{format(dateObj, 'HH:mm')}</div>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 13.5, color: T.text }}>
                      <div style={{ fontWeight: 600 }}>{cli?.nombre || 'Anonimo'}</div>
                      {cli?.telefono && <div style={{ color: T.textSec, fontSize: 12 }}>{cli.telefono}</div>}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 13.5, color: T.text }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: colorServicio(c.servicio_id), flexShrink: 0 }} />
                        {srv?.nombre || 'Sin servicio'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 13.5, color: T.text }}>
                      {prof ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: prof.color || T.textTer }} />
                          {prof.nombre}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 12.5 }}>
                      <span style={{ color: em?.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px', background: `${em?.color || T.textTer}22`, borderRadius: 6 }}>{em?.label || c.estado}</span>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 12.5, color: T.textSec }}>{c.canal ? (CANAL_LABEL[c.canal] || c.canal) : '-'}</td>
                    <td style={{ padding: '12px 8px', fontSize: 13.5, color: T.text, fontWeight: 600 }}>
                      {c.importe_final != null ? eur(c.importe_final) : (srv?.precio ? eur(srv.precio) : '-')}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {c.confirmada_cliente ? <Icon name="check" size={18} color={T.success} /> : <span style={{ color: T.textTer }}>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedCita && (() => {
        const c = selectedCita;
        const cli = c.cliente_id ? cliMap.get(c.cliente_id) : null;
        const srv = c.servicio_id ? srvMap.get(c.servicio_id) : null;
        const prof = c.profesional_id ? profMap.get(c.profesional_id) : null;
        const em = ESTADO_META.get(c.estado);
        const Fila = ({ k, v }: { k: string; v: ReactNode }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 13, color: T.textSec }}>{k}</span>
            <span style={{ fontSize: 13.5, color: T.text, fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        );
        return (
          <div onClick={() => setSelectedCita(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'grid', placeItems: isMobile ? 'end stretch' : 'center', padding: isMobile ? 0 : 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: isMobile ? '16px 16px 0 0' : 16, padding: 22, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{cli?.nombre || 'Anonimo'}</div>
                  <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: colorServicio(c.servicio_id) }} />
                    {srv?.nombre || 'Sin servicio'}
                  </div>
                </div>
                <button onClick={() => setSelectedCita(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Icon name="x" size={20} color={T.textSec} /></button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Fila k="Estado" v={<span style={{ color: em?.color }}>{em?.label || c.estado}</span>} />
                <Fila k="Fecha" v={format(parseISO(c.inicio), "d MMM yyyy", { locale: es })} />
                <Fila k="Hora" v={`${format(parseISO(c.inicio), 'HH:mm')} - ${format(parseISO(c.fin), 'HH:mm')}`} />
                <Fila k="Profesional" v={prof?.nombre || '-'} />
                <Fila k="Canal" v={c.canal ? (CANAL_LABEL[c.canal] || c.canal) : '-'} />
                <Fila k="Confirmada por cliente" v={c.confirmada_cliente ? 'Si' : 'No'} />
                <Fila k="Importe" v={c.importe_final != null ? eur(c.importe_final) : (srv?.precio ? eur(srv.precio) : '-')} />
                <Fila k="Cobrada" v={c.cobrada ? 'Si' : 'No'} />
                {cli?.telefono && <Fila k="Telefono" v={cli.telefono} />}
                {c.notas && <Fila k="Notas" v={c.notas} />}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {cli?.telefono && (
                  <a href={`tel:${cli.telefono}`} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
                    <Icon name="phone" size={15} color={T.text} /> Llamar
                  </a>
                )}
                <button onClick={() => abrirEnAgenda(c)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px', background: T.primary, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  <Icon name="external" size={15} color="#fff" /> Abrir en la agenda
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showManualPanel && (
        <ManualPanel
          content={manualCitas}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

export default withClientDataGate(CitasCRMScreen, 'Citas');
