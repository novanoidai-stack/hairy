import { useState, useEffect, useMemo, useCallback } from 'react';
import { View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { PageLoader } from '@/components/ui/DesignComponents';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { SSelect, STextInput } from '@/components/ui/SettingsAtoms';
import { CITA_STATUS } from '@/lib/constants';
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Icon } from '@/components/ui/Icon';
import { DetalleCitaModal } from '@/components/agenda/AgendaCalendar.web';

const T = DESIGN_TOKENS;

function CitasCRMScreen() {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);

  // Filtros
  const [dateRange, setDateRange] = useState<'hoy' | 'semana' | 'mes' | 'todo'>('semana');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [profFilter, setProfFilter] = useState('todos');
  const [search, setSearch] = useState('');

  // Modal
  const [selectedCita, setSelectedCita] = useState<any>(null);

  const fetchBaseData = useCallback(async () => {
    try {
      const [cliRes, srvRes, profRes, catRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre, telefono, email, notas_internas, vip, conflictivo, color'),
        supabase.from('servicios').select('id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, precio_eur, color, categoria_id'),
        supabase.from('profesionales').select('id, nombre, color, activo').eq('activo', true),
        supabase.from('categorias').select('id, nombre, color')
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
        .select('id, inicio, fin, estado, profesional_id, servicio_id, cliente_id, confirmada_cliente, notas, precio_final_eur, created_at')
        .order('inicio', { ascending: false });
        
      if (dateRange !== 'todo') {
        const now = new Date();
        let start, end;
        if (dateRange === 'hoy') {
          start = startOfDay(now);
          end = endOfDay(now);
        } else if (dateRange === 'semana') {
          start = startOfWeek(now, { weekStartsOn: 1 });
          end = endOfWeek(now, { weekStartsOn: 1 });
        } else if (dateRange === 'mes') {
          start = startOfMonth(now);
          end = endOfMonth(now);
        }
        if (start && end) {
          q = q.gte('inicio', start.toISOString()).lte('inicio', end.toISOString());
        }
      }

      if (statusFilter !== 'todos') {
        q = q.eq('estado', statusFilter);
      }
      if (profFilter !== 'todos') {
        q = q.eq('profesional_id', profFilter);
      }

      // Limit to 500 records to prevent extreme payloads if 'todo' is selected
      q = q.limit(500);

      const { data } = await q;
      if (data) {
        setCitas(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateRange, statusFilter, profFilter]);

  useEffect(() => {
    fetchBaseData().then(() => fetchCitas());
  }, [fetchBaseData, fetchCitas]);

  const srvMap = useMemo(() => new Map(servicios.map(s => [s.id, s])), [servicios]);
  const cliMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const profMap = useMemo(() => new Map(profesionales.map(p => [p.id, p])), [profesionales]);

  const filteredCitas = useMemo(() => {
    if (!search.trim()) return citas;
    const lowerSearch = search.toLowerCase();
    return citas.filter(c => {
      const cli = cliMap.get(c.cliente_id);
      const srv = srvMap.get(c.servicio_id);
      const cliName = cli?.nombre?.toLowerCase() || '';
      const srvName = srv?.nombre?.toLowerCase() || '';
      return cliName.includes(lowerSearch) || srvName.includes(lowerSearch);
    });
  }, [citas, search, cliMap, srvMap]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', background: T.bgPanel, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.5 }}>Citas (CRM)</h1>
          <p style={{ margin: 0, fontSize: 14, color: T.textSec, marginTop: 4 }}>Historial y panel de control masivo de citas</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div style={{ padding: '16px 32px', background: T.bgCard, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, overflowX: 'auto' }}>
        <div style={{ width: 200 }}>
          <STextInput
            value={search}
            onChange={(v) => setSearch(v)}
            placeholder="Buscar por cliente o servicio..."
          />
        </div>
        <div style={{ width: 160 }}>
          <SSelect
            value={dateRange}
            onChange={(v) => setDateRange(v as any)}
            options={[
              { value: 'hoy', label: 'Hoy' },
              { value: 'semana', label: 'Esta Semana' },
              { value: 'mes', label: 'Este Mes' },
              { value: 'todo', label: 'Histórico (ult 500)' },
            ]}
          />
        </div>
        <div style={{ width: 180 }}>
          <SSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'todos', label: 'Todos los estados' },
              { value: CITA_STATUS.PENDIENTE, label: 'Pendiente' },
              { value: CITA_STATUS.CONFIRMADA, label: 'Confirmada' },
              { value: CITA_STATUS.COMPLETADA, label: 'Completada' },
              { value: CITA_STATUS.CANCELADA, label: 'Cancelada' },
              { value: CITA_STATUS.NO_PRESENTADA, label: 'No Presentada' },
            ]}
          />
        </div>
        <div style={{ width: 180 }}>
          <SSelect
            value={profFilter}
            onChange={setProfFilter}
            options={[
              { value: 'todos', label: 'Todos los prof.' },
              ...profesionales.map(p => ({ value: p.id, label: p.nombre }))
            ]}
          />
        </div>
      </div>

      {/* Table Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px', position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PageLoader />
          </div>
        ) : filteredCitas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>
            No se encontraron citas con los filtros actuales.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}`, textAlign: 'left' }}>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Fecha / Hora</th>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Cliente</th>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Servicio</th>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Profesional</th>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Estado</th>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Importe</th>
                <th style={{ padding: '12px 8px', color: T.textSec, fontSize: 13, fontWeight: 600 }}>Confirmada SMS</th>
              </tr>
            </thead>
            <tbody>
              {filteredCitas.map(c => {
                const cli = cliMap.get(c.cliente_id);
                const srv = srvMap.get(c.servicio_id);
                const prof = profMap.get(c.profesional_id);
                const dateObj = parseISO(c.inicio);
                
                let estadoColor = T.textSec;
                if (c.estado === CITA_STATUS.CONFIRMADA) estadoColor = T.success;
                else if (c.estado === CITA_STATUS.COMPLETADA) estadoColor = T.primary;
                else if (c.estado === CITA_STATUS.CANCELADA || c.estado === CITA_STATUS.NO_PRESENTADA) estadoColor = T.danger;
                else if (c.estado === CITA_STATUS.PENDIENTE) estadoColor = T.warning;

                return (
                  <tr 
                    key={c.id} 
                    onClick={() => setSelectedCita(c)}
                    style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.2s', background: T.bgPanel }}
                    onMouseEnter={(e) => e.currentTarget.style.background = T.bgCard}
                    onMouseLeave={(e) => e.currentTarget.style.background = T.bgPanel}
                  >
                    <td style={{ padding: '14px 8px', fontSize: 14, color: T.text, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{format(dateObj, 'dd MMM yyyy', { locale: es })}</div>
                      <div style={{ color: T.textSec, fontSize: 12 }}>{format(dateObj, 'HH:mm')}</div>
                    </td>
                    <td style={{ padding: '14px 8px', fontSize: 14, color: T.text }}>
                      <div style={{ fontWeight: 600 }}>{cli?.nombre || 'Anónimo'}</div>
                      {cli?.telefono && <div style={{ color: T.textSec, fontSize: 12 }}>{cli.telefono}</div>}
                    </td>
                    <td style={{ padding: '14px 8px', fontSize: 14, color: T.text }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: srv?.color || T.border }} />
                        {srv?.nombre || 'Sin servicio'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 8px', fontSize: 14, color: T.text }}>{prof?.nombre || '-'}</td>
                    <td style={{ padding: '14px 8px', fontSize: 13 }}>
                      <span style={{ color: estadoColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 8px', background: `${estadoColor}22`, borderRadius: 6 }}>
                        {c.estado}
                      </span>
                    </td>
                    <td style={{ padding: '14px 8px', fontSize: 14, color: T.text, fontWeight: 600 }}>
                      {c.precio_final_eur != null ? `${c.precio_final_eur.toFixed(2)} €` : (srv?.precio_eur ? `${srv.precio_eur.toFixed(2)} €` : '-')}
                    </td>
                    <td style={{ padding: '14px 8px', fontSize: 14 }}>
                      {c.confirmada_cliente ? (
                        <Icon name="check" size={18} color={T.success} />
                      ) : (
                        <span style={{ color: T.textTer }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedCita && (
        <DetalleCitaModal
          cita={selectedCita}
          onClose={() => setSelectedCita(null)}
          onSaved={() => {
            setSelectedCita(null);
            fetchCitas();
          }}
          servicios={servicios}
          categorias={categorias}
          clientes={clientes}
          profesionales={profesionales}
          citasHoy={citas} 
          allCitas={citas}
          retrasosActivo={false}
          avisarRetrasoActivo={false}
        />
      )}
    </div>
  );
}

export default withClientDataGate(CitasCRMScreen, 'Citas');
