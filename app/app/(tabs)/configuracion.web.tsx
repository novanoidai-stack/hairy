import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, canAccessConfig } from '@/lib/auth';
import { CATEGORIAS_PROFESIONAL } from '@/lib/constants';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import {
  Section, FieldRow, FieldStack, Toggle, NumberInput, STextInput, SSelect,
  Segmented, TimeInput, Badge, SoonBadge, SoonBanner, StatBox,
  Btn, IconBtn, ScopeChip, SettingsIcon,
} from '@/components/ui/SettingsAtoms';

const T = DESIGN_TOKENS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Servicio {
  id?: string;
  nombre: string;
  precio: number;
  duracion_activa_min: number;
  categoria: string;
  duracion_espera_min?: number;
  duracion_activa_extra_min?: number;
  duracion?: number;
  min_antelacion_min?: number;
  activo?: boolean;
  reservable_online?: boolean;
  prepago_requerido?: boolean;
  prepago_porcentaje?: number | null;
  prepago_cantidad_fija?: number | null;
  cancelacion_horas?: number | null;
  categoria_minima?: string | null;
}

interface Override {
  id?: string;
  professional_id: string;
  service_id: string;
  duracion?: number | null;
  duracion_espera_min?: number | null;
  duracion_activa_extra_min?: number | null;
  precio?: number | null;
  activo?: boolean | null;
}

interface DiaHorario {
  abierto: boolean;
  apertura: string;
  cierre: string;
  pausa_inicio: string;
  pausa_fin: string;
}

interface ConfigState {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  moneda: string;
  timezone: string;
  brandColor: string;
  theme: string;
  slotInterval: number;
  defaultView: string;
  startOfWeek: string;
  showOutsideHours: boolean;
  compactEmpty: boolean;
  antelacionGlobal: number;
  antelacionMax: number;
  permitirMismoDia: boolean;
  solapamiento: string;
  confirmacionModo: string;
  confirmacionTimeout: number;
  confirmacionNotificar: boolean;
  noShowGrace: number;
  retrasoGrace: number;
  contadorRetraso: boolean;
  reposoMargen: number;
  alertaReposo: boolean;
  alertaReposoUmbral: number;
  aprovecharReposo: boolean;
  comisionBase: number;
  comisionBaseImporte: string;
  comisionAddons: boolean;
  comisionPropinas: boolean;
  comisionPeriodo: string;
  bonusProducto: number;
  bonusObjetivo: boolean;
  bonusObjetivoImporte: number;
  bonusEstrella: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  icon: string;
  section: string;
  soon?: boolean;
}

const TABS: TabDef[] = [
  { id: 'general',        label: 'General',        icon: 'building',  section: 'Negocio' },
  { id: 'horarios',       label: 'Horarios',       icon: 'clock',     section: 'Negocio' },
  { id: 'servicios',      label: 'Servicios',      icon: 'scissors',  section: 'Operativa' },
  { id: 'agenda',         label: 'Agenda',         icon: 'calendar',  section: 'Operativa' },
  { id: 'comisiones',     label: 'Comisiones',     icon: 'percent',   section: 'Operativa' },
  { id: 'notificaciones', label: 'Notificaciones', icon: 'bell',      section: 'Comunicacion', soon: true },
  { id: 'politicas',      label: 'Politicas',      icon: 'shield',    section: 'Comunicacion', soon: true },
  { id: 'reserva',        label: 'Reserva online', icon: 'globe',     section: 'Comunicacion', soon: true },
];

const TAB_SECTIONS = [
  { name: 'Negocio',       items: TABS.filter(t => t.section === 'Negocio') },
  { name: 'Operativa',     items: TABS.filter(t => t.section === 'Operativa') },
  { name: 'Comunicacion',  items: TABS.filter(t => t.section === 'Comunicacion') },
];

const DAY_LABELS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

const DEFAULT_CONFIG: ConfigState = {
  nombre: '', direccion: '', telefono: '', email: '',
  moneda: 'EUR', timezone: 'Europe/Madrid',
  brandColor: '#6366f1', theme: 'dark',
  slotInterval: 15, defaultView: 'dia', startOfWeek: 'lun',
  showOutsideHours: false, compactEmpty: true,
  antelacionGlobal: 60, antelacionMax: 60, permitirMismoDia: true,
  solapamiento: 'reposo', confirmacionModo: 'manual',
  confirmacionTimeout: 120, confirmacionNotificar: true,
  noShowGrace: 15, retrasoGrace: 10, contadorRetraso: true,
  reposoMargen: 5, alertaReposo: true, alertaReposoUmbral: 3, aprovecharReposo: true,
  comisionBase: 30, comisionBaseImporte: 'neto',
  comisionAddons: true, comisionPropinas: false, comisionPeriodo: 'mensual',
  bonusProducto: 10, bonusObjetivo: true, bonusObjetivoImporte: 250, bonusEstrella: false,
};

const DEFAULT_DIA: DiaHorario = { abierto: false, apertura: '09:00', cierre: '20:00', pausa_inicio: '', pausa_fin: '' };

const INITIAL_HORARIOS: Record<number, DiaHorario> = {
  0: { abierto: true,  apertura: '09:00', cierre: '20:00', pausa_inicio: '14:00', pausa_fin: '16:00' },
  1: { abierto: true,  apertura: '09:00', cierre: '20:00', pausa_inicio: '14:00', pausa_fin: '16:00' },
  2: { abierto: true,  apertura: '09:00', cierre: '20:00', pausa_inicio: '14:00', pausa_fin: '16:00' },
  3: { abierto: true,  apertura: '10:00', cierre: '21:00', pausa_inicio: '',      pausa_fin: '' },
  4: { abierto: true,  apertura: '10:00', cierre: '21:00', pausa_inicio: '',      pausa_fin: '' },
  5: { abierto: true,  apertura: '09:00', cierre: '15:00', pausa_inicio: '',      pausa_fin: '' },
  6: { abierto: false, apertura: '10:00', cierre: '14:00', pausa_inicio: '',      pausa_fin: '' },
};

const ROL_LABEL: Record<string, string> = {
  auxiliar: 'Auxiliar', oficial: 'Oficial', oficial_mayor: 'Oficial mayor',
  estilista_senior: 'Estilista senior', direccion: 'Direccion',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConfiguracionWeb() {
  const [tab, setTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [negocioId, setNegocioId] = useState('');

  // Config state (JSONB)
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<ConfigState>(DEFAULT_CONFIG);

  // Horarios state
  const [diasHorario, setDiasHorario] = useState<Record<number, DiaHorario>>(INITIAL_HORARIOS);
  const [savedDiasHorario, setSavedDiasHorario] = useState<Record<number, DiaHorario>>(INITIAL_HORARIOS);

  // Comisiones por profesional
  const [comisionesProf, setComisionesProf] = useState<Record<string, number>>({});
  const [savedComisionesProf, setSavedComisionesProf] = useState<Record<string, number>>({});

  // Services state
  const [services, setServicios] = useState<Servicio[]>([]);
  const [edit, setEdit] = useState<Servicio | null>(null);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [profId, setProfId] = useState<string | null>(null);
  const [allOverrides, setAllOverrides] = useState<Override[]>([]);

  // Bloqueo counts for Agenda tab summary
  const [bloqueoCounts, setBloqueoCounts] = useState<Record<string, number>>({});

  // Dirty tracking
  const dirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(savedConfig)
      || JSON.stringify(diasHorario) !== JSON.stringify(savedDiasHorario)
      || JSON.stringify(comisionesProf) !== JSON.stringify(savedComisionesProf);
  }, [config, savedConfig, diasHorario, savedDiasHorario, comisionesProf, savedComisionesProf]);

  const currentTab = TABS.find(t => t.id === tab);

  // ─── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setLoading(false); return; }
      if (!canAccessConfig(profile)) { setAccessDenied(true); setLoading(false); return; }
      const nid = profile.negocio_id;
      setNegocioId(nid);

      const [
        { data: srvData },
        { data: profData },
        { data: cfgRow },
        { data: horariosRows },
      ] = await Promise.all([
        supabase.from('servicios').select('*').eq('negocio_id', nid).order('categoria'),
        supabase.from('profesionales').select('id, nombre, color, categoria, comision_pct, activo').eq('negocio_id', nid).eq('activo', true).order('nombre'),
        supabase.from('negocio_config').select('config').eq('negocio_id', nid).maybeSingle(),
        supabase.from('negocio_horarios').select('*').eq('negocio_id', nid),
      ]);

      setServicios(srvData ?? []);
      setProfesionales(profData ?? []);

      // Config JSONB
      if (cfgRow?.config) {
        const merged = { ...DEFAULT_CONFIG, ...cfgRow.config };
        setConfig(merged);
        setSavedConfig(merged);
      } else {
        // Use profile info for defaults
        const initial = {
          ...DEFAULT_CONFIG,
          nombre: profile.nombre_negocio || '',
          email: profile.email || '',
          telefono: profile.phone || '',
        };
        setConfig(initial);
        setSavedConfig(initial);
      }

      // Horarios
      if (horariosRows && horariosRows.length > 0) {
        const map: Record<number, DiaHorario> = { ...INITIAL_HORARIOS };
        horariosRows.forEach((r: any) => {
          map[r.dia_semana] = {
            abierto: r.abierto,
            apertura: r.apertura || '09:00',
            cierre: r.cierre || '20:00',
            pausa_inicio: r.pausa_inicio || '',
            pausa_fin: r.pausa_fin || '',
          };
        });
        setDiasHorario(map);
        setSavedDiasHorario(map);
      }

      // Comisiones from profesionales.comision_pct
      const comMap: Record<string, number> = {};
      (profData ?? []).forEach((p: any) => {
        if (p.comision_pct != null) comMap[p.id] = p.comision_pct;
      });
      setComisionesProf(comMap);
      setSavedComisionesProf(comMap);

      // Overrides
      if (profData && profData.length > 0) {
        const { data: ovData } = await supabase
          .from('professional_service_overrides')
          .select('*')
          .in('professional_id', profData.map((p: any) => p.id));
        setAllOverrides(ovData ?? []);
      }

      // Bloqueo counts
      const { data: blqData } = await supabase
        .from('bloqueos_profesional')
        .select('tipo')
        .eq('negocio_id', nid)
        .gte('fin', new Date().toISOString());
      const counts: Record<string, number> = {};
      (blqData ?? []).forEach((b: any) => { counts[b.tipo] = (counts[b.tipo] || 0) + 1; });
      setBloqueoCounts(counts);

      setLoading(false);
    }
    cargar();
  }, []);

  // ─── Save handler ──────────────────────────────────────────────────────
  const handleSaveAll = useCallback(async () => {
    if (!negocioId || !dirty) return;
    setSaving(true);
    try {
      const promises: PromiseLike<any>[] = [];

      // 1. Config JSONB
      if (JSON.stringify(config) !== JSON.stringify(savedConfig)) {
        promises.push(
          supabase.from('negocio_config').upsert({
            negocio_id: negocioId,
            config,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'negocio_id' })
        );
      }

      // 2. Horarios
      if (JSON.stringify(diasHorario) !== JSON.stringify(savedDiasHorario)) {
        const rows = Object.entries(diasHorario).map(([dia, d]) => ({
          negocio_id: negocioId,
          dia_semana: parseInt(dia),
          abierto: d.abierto,
          apertura: d.apertura || null,
          cierre: d.cierre || null,
          pausa_inicio: d.pausa_inicio || null,
          pausa_fin: d.pausa_fin || null,
        }));
        promises.push(
          supabase.from('negocio_horarios').upsert(rows, { onConflict: 'negocio_id,dia_semana' })
        );
      }

      // 3. Comisiones
      if (JSON.stringify(comisionesProf) !== JSON.stringify(savedComisionesProf)) {
        const allIds = new Set([...Object.keys(comisionesProf), ...Object.keys(savedComisionesProf)]);
        allIds.forEach(pid => {
          const newVal = comisionesProf[pid] ?? null;
          const oldVal = savedComisionesProf[pid] ?? null;
          if (newVal !== oldVal) {
            promises.push(
              supabase.from('profesionales').update({ comision_pct: newVal }).eq('id', pid)
            );
          }
        });
      }

      await Promise.all(promises);
      setSavedConfig({ ...config });
      setSavedDiasHorario({ ...diasHorario });
      setSavedComisionesProf({ ...comisionesProf });
    } catch (e: any) {
      alert('Error al guardar: ' + e.message);
    }
    setSaving(false);
  }, [negocioId, dirty, config, savedConfig, diasHorario, savedDiasHorario, comisionesProf, savedComisionesProf]);

  const handleDiscard = useCallback(() => {
    setConfig({ ...savedConfig });
    setDiasHorario({ ...savedDiasHorario });
    setComisionesProf({ ...savedComisionesProf });
  }, [savedConfig, savedDiasHorario, savedComisionesProf]);

  // ─── Service CRUD handlers (preserved) ─────────────────────────────────
  const getOverride = (serviceId: string): Override | undefined =>
    profId ? allOverrides.find(o => o.professional_id === profId && o.service_id === serviceId) : undefined;

  const handleSaveService = async (service: Servicio) => {
    if (!negocioId) return;
    try {
      const payload: Record<string, any> = {
        nombre: service.nombre,
        precio: service.precio,
        duracion_activa_min: service.duracion_activa_min,
        categoria: service.categoria,
        duracion_espera_min: service.duracion_espera_min || 0,
        duracion_activa_extra_min: service.duracion_activa_extra_min || 0,
        min_antelacion_min: service.min_antelacion_min || 0,
        activo: service.activo !== false,
        reservable_online: service.reservable_online ?? false,
        prepago_requerido: service.prepago_requerido ?? false,
        prepago_porcentaje: service.prepago_porcentaje ?? null,
        prepago_cantidad_fija: service.prepago_cantidad_fija ?? null,
        cancelacion_horas: service.cancelacion_horas ?? null,
        categoria_minima: service.categoria_minima ?? null,
      };
      if (service.id) {
        const { error } = await supabase.from('servicios').update(payload).eq('id', service.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('servicios').insert({ ...payload, negocio_id: negocioId });
        if (error) throw error;
      }
      const { data, error: fetchError } = await supabase.from('servicios').select('*').eq('negocio_id', negocioId).order('categoria');
      if (fetchError) throw fetchError;
      setServicios(data ?? []);
      setEdit(null);
    } catch (error) {
      alert('Error al guardar: ' + (error instanceof Error ? error.message : 'Intenta de nuevo'));
    }
  };

  const handleDeleteService = async (id: string) => {
    const service = services.find(s => s.id === id);
    const nombre = service?.nombre || 'este servicio';
    const { count } = await supabase
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('servicio_id', id);
    if (count && count > 0) {
      const ok = window.confirm(
        `"${nombre}" se usa en ${count} cita${count === 1 ? '' : 's'}. ` +
        `No se puede eliminar sin borrar los datos historicos.\n\n` +
        `Se desactivara en su lugar (no aparecera al crear nuevas citas, pero las citas pasadas seguiran mostrando su nombre).\n\n` +
        `Continuar?`
      );
      if (!ok) return;
      try {
        const { error } = await supabase.from('servicios').update({ activo: false }).eq('id', id);
        if (error) throw error;
        setServicios(prev => prev.map(s => s.id === id ? { ...s, activo: false } : s));
        setEdit(null);
      } catch (e: any) {
        alert('Error desactivando servicio: ' + e.message);
      }
      return;
    }
    const ok = window.confirm(`Eliminar "${nombre}"? Esta accion no se puede deshacer.`);
    if (!ok) return;
    try {
      const { error } = await supabase.from('servicios').delete().eq('id', id);
      if (error) throw error;
      setServicios(prev => prev.filter(s => s.id !== id));
      setEdit(null);
    } catch (e: any) {
      alert('Error eliminando servicio: ' + e.message);
    }
  };

  const handleSaveOverride = async (serviceId: string, patch: Partial<Override>) => {
    if (!profId) return;
    try {
      const { data, error } = await supabase
        .from('professional_service_overrides')
        .upsert(
          { professional_id: profId, service_id: serviceId, ...patch },
          { onConflict: 'professional_id,service_id' }
        )
        .select()
        .single();
      if (error) throw error;
      setAllOverrides(prev => {
        const rest = prev.filter(o => !(o.professional_id === profId && o.service_id === serviceId));
        return [...rest, data];
      });
      setEdit(null);
    } catch (e: any) {
      if (e.message?.includes('foreign key')) {
        const { data } = await supabase.from('servicios').select('*').eq('negocio_id', negocioId).order('categoria');
        if (data) setServicios(data);
      } else {
        alert('Error al guardar: ' + e.message);
      }
    }
  };

  const handleToggleServicio = async (s: Servicio) => {
    if (!s.id) return;
    const nuevoActivo = s.activo === false;
    try {
      await supabase.from('servicios').update({ activo: nuevoActivo }).eq('id', s.id);
      setServicios(prev => prev.map(x => x.id === s.id ? { ...x, activo: nuevoActivo } : x));
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const handleResetOverride = async (serviceId: string) => {
    if (!profId) return;
    try {
      await supabase
        .from('professional_service_overrides')
        .delete()
        .eq('professional_id', profId)
        .eq('service_id', serviceId);
      setAllOverrides(prev => prev.filter(o => !(o.professional_id === profId && o.service_id === serviceId)));
      setEdit(null);
    } catch (e: any) {
      alert('Error al restablecer: ' + e.message);
    }
  };

  // ─── Config setter helpers ─────────────────────────────────────────────
  const setC = useCallback((key: keyof ConfigState, val: any) => {
    setConfig(prev => ({ ...prev, [key]: val }));
  }, []);

  const profSelData = profesionales.find(p => p.id === profId) ?? null;

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.text, fontFamily: 'Inter, sans-serif' }}>
      Cargando...
    </div>
  );

  if (accessDenied) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.textSecondary, flexDirection: 'column', gap: 8, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Acceso restringido</div>
      <div style={{ fontSize: 13 }}>Solo los administradores pueden acceder a la configuracion.</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, color: T.text, fontFamily: 'Inter, sans-serif' }}>
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header style={{
        padding: '18px 28px 16px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: T.textTertiary, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
            <span>Configuracion</span>
            <SettingsIcon name="chevR" size={9} />
            <span style={{ color: T.textSecondary }}>{currentTab?.section}</span>
            <SettingsIcon name="chevR" size={9} />
            <span style={{ color: T.text }}>{currentTab?.label}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{currentTab?.label}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dirty ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px 5px 8px', borderRadius: 999,
              background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,.28)', color: T.warning,
              fontSize: 11.5, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: T.warning, animation: 'pulseDot 1.4s ease-in-out infinite' }} />
              Cambios sin guardar
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 999,
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,.22)', color: T.success,
              fontSize: 11.5, fontWeight: 600,
            }}>
              <SettingsIcon name="check" size={11} /> Todo guardado
            </div>
          )}
          <Btn variant="ghost" size="md" disabled={!dirty} onClick={handleDiscard}>Descartar</Btn>
          <Btn variant="primary" size="md" icon="check" disabled={!dirty || saving} onClick={handleSaveAll}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Btn>
        </div>
      </header>

      {/* ── Grid: tabs rail + content ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '232px 1fr', overflow: 'hidden' }}>
        {/* Tabs rail */}
        <nav style={{
          borderRight: `1px solid ${T.border}`,
          padding: '24px 14px',
          display: 'flex', flexDirection: 'column', gap: 6,
          overflowY: 'auto', background: T.bgPanel,
        }}>
          {TAB_SECTIONS.map((sec, sIdx) => (
            <div key={sec.name}>
              <div style={{
                fontSize: 9.5, letterSpacing: 1.6, color: T.textTertiary, fontWeight: 700,
                textTransform: 'uppercase', padding: '8px 12px 4px',
                marginTop: sIdx === 0 ? 0 : 14,
              }}>{sec.name}</div>
              {sec.items.map(t => (
                <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />
              ))}
            </div>
          ))}

          {/* Footer help card */}
          <div style={{ marginTop: 'auto', padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <SettingsIcon name="info" size={13} color={T.primary} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: T.text }}>Centro de ayuda</span>
            </div>
            <div style={{ fontSize: 10.5, color: T.textTertiary, lineHeight: 1.55, marginBottom: 10 }}>
              Guias y videos cortos para configurar tu salon.
            </div>
          </div>
        </nav>

        {/* Content */}
        <div key={tab} style={{ overflowY: 'auto', padding: '24px 28px 60px' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            {tab === 'general' && (
              <TabGeneral config={config} setC={setC} />
            )}
            {tab === 'horarios' && (
              <TabHorarios
                config={config} setC={setC}
                diasHorario={diasHorario} setDiasHorario={setDiasHorario}
              />
            )}
            {tab === 'servicios' && (
              <TabServicios
                services={services} profesionales={profesionales}
                profId={profId} setProfId={setProfId}
                allOverrides={allOverrides} getOverride={getOverride}
                profSelData={profSelData}
                onEdit={setEdit} onToggle={handleToggleServicio}
                onDelete={handleDeleteService} onSaveOverride={handleSaveOverride}
                onResetOverride={handleResetOverride}
              />
            )}
            {tab === 'agenda' && (
              <TabAgenda config={config} setC={setC} bloqueoCounts={bloqueoCounts} />
            )}
            {tab === 'comisiones' && (
              <TabComisiones
                config={config} setC={setC}
                profesionales={profesionales}
                comisionesProf={comisionesProf} setComisionesProf={setComisionesProf}
              />
            )}
            {tab === 'notificaciones' && <TabNotificaciones />}
            {tab === 'politicas' && <TabPoliticas />}
            {tab === 'reserva' && <TabReservaOnline />}
          </div>
        </div>
      </div>

      {/* ── Edit modal ─────────────────────────────────────────────────── */}
      {edit !== null && (
        <EditServiceModal
          service={edit}
          onClose={() => setEdit(null)}
          onSave={handleSaveService}
          onDelete={handleDeleteService}
          prof={profSelData}
          override={edit.id ? getOverride(edit.id) : undefined}
          onSaveOverride={handleSaveOverride}
          onResetOverride={handleResetOverride}
          negocioId={negocioId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({ t, active, onClick }: { t: TabDef; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '9px 12px', borderRadius: 10, position: 'relative',
        background: active ? T.primarySoft : (hov ? 'rgba(148,163,184,0.05)' : 'transparent'),
        border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
        color: active ? T.text : T.textSecondary,
        fontSize: 13, fontWeight: active ? 600 : 500,
        cursor: 'pointer', transition: 'all .2s ease',
        transform: hov && !active ? 'translateX(4px)' : 'translateX(0)',
        textAlign: 'left', width: '100%',
      }}>
      <span style={{ color: active ? T.primaryHi : T.textTertiary, display: 'inline-flex' }}>
        <SettingsIcon name={t.icon} size={15} />
      </span>
      <span style={{ flex: 1 }}>{t.label}</span>
      {t.soon && (
        <span style={{
          width: 6, height: 6, borderRadius: 999, background: T.warning, flexShrink: 0,
          boxShadow: `0 0 6px ${T.warning}`,
        }} />
      )}
      {active && (
        <span style={{
          position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: 16, borderRadius: '0 3px 3px 0', background: T.primary,
        }} />
      )}
    </button>
  );
}

// ===========================================================================
// Tab: General
// ===========================================================================

function TabGeneral({ config, setC }: { config: ConfigState; setC: (k: keyof ConfigState, v: any) => void }) {
  return (
    <>
      <Section title="Datos del negocio" desc="Informacion publica del salon. Aparece en recordatorios, facturas y la futura pagina de reserva online.">
        <FieldRow label="Nombre del salon" hint="Como se muestra a clientes y en notificaciones.">
          <STextInput value={config.nombre} onChange={v => setC('nombre', v)} width={340} />
        </FieldRow>
        <FieldRow label="Direccion" hint="Calle, numero, codigo postal y ciudad.">
          <STextInput value={config.direccion} onChange={v => setC('direccion', v)} width={420} leadingIcon="map" />
        </FieldRow>
        <FieldRow label="Telefono" hint="Numero publico de contacto.">
          <STextInput value={config.telefono} onChange={v => setC('telefono', v)} width={220} leadingIcon="phone" mono />
        </FieldRow>
        <FieldRow label="Email del salon" hint="Direccion para confirmaciones y respuestas de clientes.">
          <STextInput value={config.email} onChange={v => setC('email', v)} width={340} leadingIcon="mail" type="email" />
        </FieldRow>
        <FieldRow label="Moneda" hint="Se usa en todos los precios, comisiones e informes.">
          <SSelect width={180} value={config.moneda} onChange={v => setC('moneda', v)} options={[
            { value: 'EUR', label: 'EUR -- Euro' },
            { value: 'GBP', label: 'GBP -- Libra' },
            { value: 'USD', label: 'USD -- Dolar' },
            { value: 'MXN', label: 'MXN -- Peso mexicano' },
          ]} />
        </FieldRow>
        <FieldRow label="Zona horaria" hint="Define cuando se cierra el dia y cuando se envian recordatorios.">
          <SSelect width={280} value={config.timezone} onChange={v => setC('timezone', v)} options={[
            { value: 'Europe/Madrid', label: 'Europe/Madrid (UTC+1)' },
            { value: 'Europe/London', label: 'Europe/London (UTC)' },
            { value: 'Europe/Lisbon', label: 'Europe/Lisbon (UTC)' },
            { value: 'America/Mexico_City', label: 'America/Mexico_City (UTC-6)' },
          ]} />
        </FieldRow>
      </Section>

      <Section title="Identidad visual" desc="El logo aparece en la barra lateral, en la cabecera de los recordatorios y en la pagina publica de reserva.">
        <FieldRow label="Logo" hint="PNG o SVG. Fondo transparente recomendado. Max. 2 MB.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 14,
              background: `linear-gradient(135deg, ${T.primaryHi}, ${T.primary})`,
              display: 'grid', placeItems: 'center',
              boxShadow: '0 8px 28px rgba(99,102,241,.35)', color: '#fff',
            }}>
              <SettingsIcon name="scissors" size={28} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Btn icon="upload" variant="soft" size="sm">Subir nuevo logo</Btn>
              <div style={{ fontSize: 11, color: T.textTertiary }}>Recomendado 512 x 512 px</div>
            </div>
          </div>
        </FieldRow>
        <FieldRow label="Color de marca" hint="Acento usado en botones primarios y estados activos.">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { v: '#6366f1', name: 'Indigo' },
              { v: '#8b5cf6', name: 'Violeta' },
              { v: '#ec4899', name: 'Rosa' },
              { v: '#06b6d4', name: 'Cian' },
              { v: '#10b981', name: 'Verde' },
              { v: '#f59e0b', name: 'Ambar' },
            ].map(c => {
              const active = config.brandColor === c.v;
              return (
                <button key={c.v} title={c.name} onClick={() => setC('brandColor', c.v)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                  style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: c.v, border: `2px solid ${active ? '#fff' : 'transparent'}`,
                    cursor: 'pointer', position: 'relative', transition: 'transform .15s',
                    boxShadow: active ? `0 0 0 2px ${T.bg}, 0 0 0 4px ${c.v}80` : 'none',
                    display: 'grid', placeItems: 'center',
                  }}>
                  {active && <SettingsIcon name="check" size={14} color="#fff" />}
                </button>
              );
            })}
          </div>
        </FieldRow>
        <FieldRow label="Tema de la app" hint="El modo claro esta en desarrollo y se activara pronto.">
          <Segmented value={config.theme} onChange={v => setC('theme', v)} options={[
            { value: 'dark', label: 'Oscuro' },
            { value: 'light', label: 'Claro - proximamente' },
          ]} />
        </FieldRow>
      </Section>

      <Section title="Cuenta y suscripcion" desc="Informacion del plan contratado. Para cambios de facturacion, contacta con soporte.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <StatBox label="Plan actual" value="Studio - Pro" sub="Renovacion 14 jul" accent={T.primaryHi} />
          <StatBox label="Profesionales" value="6 / 10" sub="4 plazas disponibles" />
          <StatBox label="Citas este mes" value="--" sub="Datos en informes" accent={T.success} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" size="sm">Gestionar plan</Btn>
        </div>
      </Section>
    </>
  );
}

// ===========================================================================
// Tab: Horarios
// ===========================================================================

function TabHorarios({ config, setC, diasHorario, setDiasHorario }: {
  config: ConfigState; setC: (k: keyof ConfigState, v: any) => void;
  diasHorario: Record<number, DiaHorario>; setDiasHorario: (v: Record<number, DiaHorario>) => void;
}) {
  const toggleDay = (i: number) => {
    setDiasHorario({ ...diasHorario, [i]: { ...diasHorario[i], abierto: !diasHorario[i].abierto } });
  };
  const setDayValue = (i: number, field: keyof DiaHorario, val: string) => {
    setDiasHorario({ ...diasHorario, [i]: { ...diasHorario[i], [field]: val } });
  };
  const copyToAll = (sourceIdx: number) => {
    const src = diasHorario[sourceIdx];
    const next = { ...diasHorario };
    [0, 1, 2, 3, 4, 5, 6].forEach(i => {
      next[i] = { ...next[i], apertura: src.apertura, cierre: src.cierre, pausa_inicio: src.pausa_inicio, pausa_fin: src.pausa_fin };
    });
    setDiasHorario(next);
  };

  const applyTemplate = (tpl: string) => {
    if (tpl === 'l-v') {
      const next: Record<number, DiaHorario> = {};
      [0, 1, 2, 3, 4].forEach(i => { next[i] = { abierto: true, apertura: '09:00', cierre: '20:00', pausa_inicio: '14:00', pausa_fin: '16:00' }; });
      [5, 6].forEach(i => { next[i] = { abierto: false, apertura: '10:00', cierre: '14:00', pausa_inicio: '', pausa_fin: '' }; });
      setDiasHorario(next);
    } else if (tpl === 'l-s') {
      const next: Record<number, DiaHorario> = {};
      [0, 1, 2, 3, 4].forEach(i => { next[i] = { abierto: true, apertura: '09:00', cierre: '20:00', pausa_inicio: '', pausa_fin: '' }; });
      next[5] = { abierto: true, apertura: '09:00', cierre: '15:00', pausa_inicio: '', pausa_fin: '' };
      next[6] = { abierto: false, apertura: '10:00', cierre: '14:00', pausa_inicio: '', pausa_fin: '' };
      setDiasHorario(next);
    }
  };

  return (
    <>
      <Section
        title="Horario semanal del salon"
        desc="Define que dias abre el salon y a que horas. Las citas no podran crearse fuera de este rango."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textTertiary }}>Plantilla rapida</span>
            <SSelect width={200} value="" onChange={applyTemplate} options={[
              { value: 'l-v', label: 'L-V con pausa 14-16' },
              { value: 'l-s', label: 'L-V completo, S corto' },
            ]} placeholder="Cargar plantilla..." />
          </div>
        }
      >
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => {
            const d = diasHorario[i] || DEFAULT_DIA;
            const open = d.abierto;
            const isWeekend = i >= 5;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr auto',
                alignItems: 'center', gap: 16,
                padding: '12px 0',
                borderBottom: i < 6 ? `1px solid ${T.border}` : 'none',
                opacity: open ? 1 : 0.55,
                transition: 'opacity .2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Toggle on={open} onChange={() => toggleDay(i)} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: open ? T.text : T.textSecondary }}>{DAY_LABELS[i]}</div>
                    <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 1 }}>
                      {open ? 'Abierto' : isWeekend ? 'Cerrado (fin de semana)' : 'Cerrado'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: T.textTertiary, width: 28 }}>De</span>
                    <TimeInput value={d.apertura || ''} onChange={v => setDayValue(i, 'apertura', v)} disabled={!open} />
                    <span style={{ fontSize: 11, color: T.textTertiary, padding: '0 4px' }}>a</span>
                    <TimeInput value={d.cierre || ''} onChange={v => setDayValue(i, 'cierre', v)} disabled={!open} />
                  </div>
                  <div style={{ width: 1, height: 24, background: T.border, margin: '0 4px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: T.textTertiary }}>Pausa</span>
                    <TimeInput value={d.pausa_inicio || ''} onChange={v => setDayValue(i, 'pausa_inicio', v)} disabled={!open} />
                    <span style={{ fontSize: 11, color: T.textTertiary, padding: '0 4px' }}>--</span>
                    <TimeInput value={d.pausa_fin || ''} onChange={v => setDayValue(i, 'pausa_fin', v)} disabled={!open} />
                  </div>
                </div>

                <div>
                  <IconBtn icon="copy" size={28} title="Copiar este horario al resto de la semana" onClick={() => copyToAll(i)} disabled={!open} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Slots y vista del calendario" desc="Granularidad de la agenda y que se muestra al abrir la pantalla de citas.">
        <FieldRow label="Intervalo de slots" hint="Cuantos minutos ocupa cada fila en la cuadricula de la agenda. Afecta a la precision visual, no a las duraciones reales.">
          <Segmented value={config.slotInterval} onChange={v => setC('slotInterval', v)} options={[
            { value: 15, label: '15 min' },
            { value: 30, label: '30 min' },
            { value: 60, label: '60 min' },
          ]} />
        </FieldRow>
        <FieldRow label="Vista por defecto" hint="Que se muestra al abrir la agenda. Dia es lo recomendado para mas de 4 profesionales.">
          <Segmented value={config.defaultView} onChange={v => setC('defaultView', v)} options={[
            { value: 'dia', label: 'Dia' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mes' },
          ]} />
        </FieldRow>
        <FieldRow label="Inicio de semana" hint="Primer dia de la columna semanal y de los informes.">
          <Segmented value={config.startOfWeek} onChange={v => setC('startOfWeek', v)} options={[
            { value: 'lun', label: 'Lunes' },
            { value: 'dom', label: 'Domingo' },
          ]} />
        </FieldRow>
        <FieldRow label="Mostrar horas no laborables" hint="Si esta desactivado, la agenda muestra solo el rango de apertura. Activarlo es util para crear citas excepcionales.">
          <Toggle on={config.showOutsideHours} onChange={v => setC('showOutsideHours', v)}
            label={config.showOutsideHours ? 'Mostrando 24 h' : 'Solo horas abiertas'} />
        </FieldRow>
        <FieldRow label="Compactar horas vacias" hint="Colapsa automaticamente las franjas sin citas en la vista de semana. Mejora la densidad visual.">
          <Toggle on={config.compactEmpty} onChange={v => setC('compactEmpty', v)}
            label={config.compactEmpty ? 'Compactado' : 'Mostrar todas las franjas'} />
        </FieldRow>
      </Section>
    </>
  );
}

// ===========================================================================
// Tab: Servicios
// ===========================================================================

function TabServicios({ services, profesionales, profId, setProfId, allOverrides, getOverride, profSelData, onEdit, onToggle, onDelete, onSaveOverride, onResetOverride }: {
  services: Servicio[]; profesionales: any[];
  profId: string | null; setProfId: (id: string | null) => void;
  allOverrides: Override[]; getOverride: (sid: string) => Override | undefined;
  profSelData: any;
  onEdit: (s: Servicio) => void; onToggle: (s: Servicio) => void;
  onDelete: (id: string) => void;
  onSaveOverride: (sid: string, patch: Partial<Override>) => Promise<void>;
  onResetOverride: (sid: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return services;
    const q = search.toLowerCase();
    return services.filter(s => s.nombre.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q));
  }, [services, search]);

  const categories = useMemo(() => [...new Set(filtered.map(s => s.categoria))], [filtered]);
  const profColor = profSelData?.color;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2, color: T.text }}>Servicios del catalogo</h2>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
            {services.length} servicios -- agrupados por categoria
          </div>
        </div>
        {!profId && (
          <Btn variant="primary" size="md" icon="plus"
            onClick={() => onEdit({ nombre: '', precio: 0, duracion_activa_min: 30, categoria: 'Corte' })}>
            Nuevo servicio
          </Btn>
        )}
      </div>

      {/* Scope selector */}
      {profesionales.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <ScopeChip label="Todos" active={profId === null} onClick={() => setProfId(null)} icon="list" />
          {profesionales.map(p => {
            const badge = allOverrides.filter(o => o.professional_id === p.id).length;
            return (
              <ScopeChip key={p.id} label={p.nombre} active={profId === p.id}
                color={p.color} badge={badge} initials={p.nombre.substring(0, 2).toUpperCase()}
                onClick={() => setProfId(p.id)} />
            );
          })}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <STextInput value={search} onChange={setSearch} placeholder="Buscar servicio..." width={300} leadingIcon="search" />
      </div>

      {/* Scope help card */}
      {profSelData && (
        <div style={{ background: `${profSelData.color}0d`, border: `1px solid ${profSelData.color}33`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: `linear-gradient(135deg, ${profSelData.color}cc, ${profSelData.color})`,
              display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
            }}>
              {profSelData.nombre.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{profSelData.nombre}</div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>Modo personalizacion activo</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.6 }}>
            Los cambios solo afectan a <span style={{ color: profSelData.color, fontWeight: 600 }}>{profSelData.nombre}</span>. El catalogo global no se modifica.
          </div>
        </div>
      )}

      {/* Service list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textSecondary }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No hay servicios todavia</div>
          <div style={{ fontSize: 12 }}>Crea tu primer servicio para empezar</div>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: T.textTertiary, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{cat}</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <span>{filtered.filter(s => s.categoria === cat).length}</span>
            </div>
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {filtered.filter(s => s.categoria === cat).map((s, i, arr) => {
                const ov = s.id ? getOverride(s.id) : undefined;
                const catalogDur = (s.duracion_activa_min || s.duracion || 0) + (s.duracion_espera_min || 0) + (s.duracion_activa_extra_min || 0);
                const ovActiva = profId && ov?.duracion != null ? ov.duracion : (s.duracion_activa_min || s.duracion || 0);
                const ovEspera = profId && ov?.duracion_espera_min != null ? ov.duracion_espera_min : s.duracion_espera_min || 0;
                const ovExtra = profId && ov?.duracion_activa_extra_min != null ? ov.duracion_activa_extra_min : s.duracion_activa_extra_min || 0;
                const efectivoDur = profId && ov ? (ovActiva + ovEspera + ovExtra) : catalogDur;
                const durChanged = profId && ov && efectivoDur !== catalogDur;
                const efectivoPrecio = (profId && ov?.precio != null) ? ov.precio : s.precio;
                const activoEfectivo = (profId && ov?.activo != null) ? ov.activo : (s.activo !== false);
                const hasOv = !!ov;

                return (
                  <div
                    key={s.id}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 80px', padding: '14px 16px', alignItems: 'center', borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Nombre */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {profId && hasOv && (
                        <div style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: profColor, boxShadow: `0 0 8px ${profColor}` }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>{s.nombre}</div>
                      </div>
                    </div>

                    {/* Duracion */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {durChanged ? (
                        <>
                          <span style={{ fontSize: 12, color: profColor, fontWeight: 600 }}>{efectivoDur} min</span>
                          <span style={{ fontSize: 10, color: T.textTertiary, textDecoration: 'line-through' }}>{catalogDur} min</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: T.textSecondary }}>{catalogDur} min</span>
                      )}
                    </div>

                    {/* Precio */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {profId && ov?.precio != null ? (
                        <>
                          <span style={{ fontSize: 13, color: profColor, fontWeight: 700 }}>{Number(efectivoPrecio).toFixed(0)} EUR</span>
                          <span style={{ fontSize: 10, color: T.textTertiary, textDecoration: 'line-through' }}>{s.precio} EUR</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.success }}>{s.precio} EUR</span>
                      )}
                    </div>

                    {/* Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Toggle
                        on={activoEfectivo !== false}
                        onChange={() => {
                          if (profId && s.id) onSaveOverride(s.id, { activo: !activoEfectivo });
                          else if (!profId) onToggle(s);
                        }}
                      />
                      <span style={{ fontSize: 11, color: activoEfectivo ? T.success : T.textSecondary, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {activoEfectivo ? 'Activo' : (profId ? 'No lo hace' : 'Inactivo')}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <IconBtn icon="edit" size={28} onClick={() => onEdit(s)} title="Editar" />
                      {profId ? (
                        hasOv && <IconBtn icon="x" size={28} tone="primary" onClick={() => s.id && onResetOverride(s.id)} title="Restablecer a catalogo" />
                      ) : (
                        <IconBtn icon="trash" size={28} tone="danger" onClick={() => s.id && onDelete(s.id)} title="Eliminar" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ===========================================================================
// Tab: Agenda
// ===========================================================================

function TabAgenda({ config, setC, bloqueoCounts }: {
  config: ConfigState; setC: (k: keyof ConfigState, v: any) => void;
  bloqueoCounts: Record<string, number>;
}) {
  return (
    <>
      <Section title="Reservas y antelacion" desc="Como y con cuanta antelacion se pueden crear, mover o cancelar citas.">
        <FieldRow label="Antelacion minima global" hint="Tiempo previo a una cita necesario para que un cliente pueda reservarla. Los servicios pueden tener su propia antelacion.">
          <NumberInput value={config.antelacionGlobal} onChange={v => setC('antelacionGlobal', v)} unit="min" step={15} max={2880} />
        </FieldRow>
        <FieldRow label="Antelacion maxima" hint="Hasta cuantos dias en el futuro puede reservarse una cita.">
          <NumberInput value={config.antelacionMax} onChange={v => setC('antelacionMax', v)} unit="dias" max={365} />
        </FieldRow>
        <FieldRow label="Permitir reservas el mismo dia" hint="Si esta desactivado, hoy nunca aparece como opcion al reservar online.">
          <Toggle on={config.permitirMismoDia} onChange={v => setC('permitirMismoDia', v)}
            label={config.permitirMismoDia ? 'Permitido' : 'Bloqueado'} />
        </FieldRow>
        <FieldRow label="Solapamiento de citas" hint="Permitir o bloquear que dos citas se monten en el mismo profesional. Util para servicios encadenados con reposo.">
          <Segmented value={config.solapamiento} onChange={v => setC('solapamiento', v)} options={[
            { value: 'nunca', label: 'Nunca' },
            { value: 'reposo', label: 'Solo en reposo' },
            { value: 'siempre', label: 'Sin restriccion' },
          ]} />
        </FieldRow>
      </Section>

      <Section title="Confirmacion de citas" desc="Como pasa una cita de estado pendiente a confirmada cuando entra por la web publica o por WhatsApp.">
        <FieldRow label="Modo de confirmacion" hint={config.confirmacionModo === 'auto'
          ? 'Las citas entran ya confirmadas. Recomendado si tu equipo no quiere revisar manualmente.'
          : 'Las citas entran como pendientes y un miembro del equipo debe confirmarlas desde la agenda.'}>
          <Segmented value={config.confirmacionModo} onChange={v => setC('confirmacionModo', v)} options={[
            { value: 'auto', label: 'Automatica' },
            { value: 'manual', label: 'Manual' },
          ]} />
        </FieldRow>
        <FieldRow label="Tiempo maximo sin confirmar" hint="Si una cita pendiente lleva demasiado tiempo sin confirmarse, se marca como caducada y libera el hueco."
          disabled={config.confirmacionModo === 'auto'}>
          <NumberInput disabled={config.confirmacionModo === 'auto'} value={config.confirmacionTimeout} onChange={v => setC('confirmacionTimeout', v)} unit="min" step={15} max={1440} />
        </FieldRow>
        <FieldRow label="Avisar al equipo en pendientes nuevas" hint="Una notificacion interna cuando entra una cita pendiente de confirmacion.">
          <Toggle on={config.confirmacionNotificar} onChange={v => setC('confirmacionNotificar', v)} disabled={config.confirmacionModo === 'auto'} />
        </FieldRow>
      </Section>

      <Section title="No-show y retrasos" desc="Que hace la agenda cuando una clienta no aparece o llega tarde. La cita pasa a un estado especial que afecta a los informes.">
        <FieldRow label="Tiempo para marcar no-show" hint="Minutos desde la hora prevista de la cita antes de marcarla automaticamente como NO_PRESENTADA.">
          <NumberInput value={config.noShowGrace} onChange={v => setC('noShowGrace', v)} unit="min" min={5} max={120} step={5} />
        </FieldRow>
        <FieldRow label="Tiempo de gracia para retraso" hint="Cuantos minutos esperar antes de mostrar opciones de reorganizacion (mover, acortar, derivar a otro profesional).">
          <NumberInput value={config.retrasoGrace} onChange={v => setC('retrasoGrace', v)} unit="min" min={0} max={60} step={5} />
        </FieldRow>
        <FieldRow label="Mostrar contador en cita" hint="Un contador visible en la cita cuando supera la hora de inicio sin check-in.">
          <Toggle on={config.contadorRetraso} onChange={v => setC('contadorRetraso', v)} />
        </FieldRow>
      </Section>

      <Section title="Tiempos muertos y reposo" desc="Reglas para servicios que tienen un periodo de espera (color, decoloracion, keratina) en el que el profesional queda libre.">
        <FieldRow label="Margen de seguridad para reposo" hint="Tiempo extra que se anade antes de que se cumpla el reposo para reservar al cliente con margen.">
          <NumberInput value={config.reposoMargen} onChange={v => setC('reposoMargen', v)} unit="min" min={0} max={30} step={1} />
        </FieldRow>
        <FieldRow label="Alertar en exceso de reposos simultaneos" hint="Avisa al equipo si un profesional tiene mas de N clientes en reposo a la vez. Evita cuellos de botella.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Toggle on={config.alertaReposo} onChange={v => setC('alertaReposo', v)} />
            <span style={{ fontSize: 11.5, color: T.textSecondary }}>Umbral</span>
            <NumberInput value={config.alertaReposoUmbral} onChange={v => setC('alertaReposoUmbral', v)} unit="reposos" min={2} max={10} step={1} disabled={!config.alertaReposo} width={130} />
          </div>
        </FieldRow>
        <FieldRow label="Permitir aprovechar reposo en otra clienta" hint="Sugerir automaticamente huecos productivos durante un reposo (servicios cortos como flequillo o brushing).">
          <Toggle on={config.aprovecharReposo} onChange={v => setC('aprovecharReposo', v)} />
        </FieldRow>
      </Section>

      <Section title="Bloqueos y descansos" desc="Vacaciones, formaciones y reuniones. Se gestionan en la pantalla de Equipo.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 4 }}>
          {[
            { l: 'Vacaciones', c: '#10b981', k: 'vacaciones' },
            { l: 'Formacion',  c: '#8b5cf6', k: 'formacion' },
            { l: 'Baja',       c: '#ef4444', k: 'baja' },
            { l: 'Reunion',    c: '#3b82f6', k: 'reunion' },
            { l: 'Descanso',   c: '#f59e0b', k: 'descanso' },
          ].map(b => (
            <div key={b.l} style={{
              padding: '10px 12px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: b.c }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{b.l}</div>
                <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 1 }}>{bloqueoCounts[b.k] || 0} activos</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ===========================================================================
// Tab: Comisiones
// ===========================================================================

function TabComisiones({ config, setC, profesionales, comisionesProf, setComisionesProf }: {
  config: ConfigState; setC: (k: keyof ConfigState, v: any) => void;
  profesionales: any[];
  comisionesProf: Record<string, number>; setComisionesProf: (v: Record<string, number>) => void;
}) {
  const setProfCom = (id: string, val: number) => {
    setComisionesProf({ ...comisionesProf, [id]: val });
  };
  const resetProf = (id: string) => {
    const next = { ...comisionesProf };
    delete next[id];
    setComisionesProf(next);
  };

  return (
    <>
      <Section title="Comisiones por defecto" desc="Porcentaje que aplica a cada profesional sobre los servicios cobrados. Se usa en los informes de Equipo. Puedes definir un valor distinto por profesional mas abajo.">
        <FieldRow label="Porcentaje base" hint="Aplica a todos los profesionales que no tienen un porcentaje personalizado.">
          <NumberInput value={config.comisionBase} onChange={v => setC('comisionBase', v)} unit="%" min={0} max={100} step={1} />
        </FieldRow>
        <FieldRow label="Base de calculo" hint="Sobre que importe se calcula la comision.">
          <Segmented value={config.comisionBaseImporte} onChange={v => setC('comisionBaseImporte', v)} options={[
            { value: 'bruto', label: 'Sobre bruto' },
            { value: 'neto', label: 'Sin IVA' },
          ]} />
        </FieldRow>
        <FieldRow label="Incluir add-ons" hint="Si los complementos opcionales tambien suman a la base de comision.">
          <Toggle on={config.comisionAddons} onChange={v => setC('comisionAddons', v)} />
        </FieldRow>
        <FieldRow label="Incluir propinas" hint="Activar si las propinas registradas en checkout cuentan para la comision.">
          <Toggle on={config.comisionPropinas} onChange={v => setC('comisionPropinas', v)} />
        </FieldRow>
        <FieldRow label="Periodo de liquidacion" hint="Periodicidad de cierre de comisiones. Define el rango de los informes mensuales y quincenales.">
          <Segmented value={config.comisionPeriodo} onChange={v => setC('comisionPeriodo', v)} options={[
            { value: 'semanal', label: 'Semanal' },
            { value: 'quincenal', label: 'Quincenal' },
            { value: 'mensual', label: 'Mensual' },
          ]} />
        </FieldRow>
      </Section>

      <Section
        title="Comision por profesional"
        desc="Sobrescribe el porcentaje base para profesionales concretos. Los que estan sin override usan el valor base."
        action={
          <span style={{ fontSize: 11, color: T.textTertiary }}>
            {Object.keys(comisionesProf).length} con override -- {profesionales.length - Object.keys(comisionesProf).length} usan base
          </span>
        }
      >
        <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 110px 80px',
            padding: '10px 14px', borderBottom: `1px solid ${T.border}`,
            fontSize: 10, letterSpacing: 1.2, color: T.textTertiary, fontWeight: 700, textTransform: 'uppercase',
          }}>
            <div>Profesional</div>
            <div>Rol</div>
            <div style={{ textAlign: 'center' }}>Comision</div>
            <div style={{ textAlign: 'right' }} />
          </div>
          {/* Rows */}
          {profesionales.map(p => {
            const ov = comisionesProf[p.id];
            const effective = ov ?? config.comisionBase;
            return (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 130px 110px 80px',
                alignItems: 'center', padding: '12px 14px',
                borderBottom: `1px solid ${T.border}`,
                transition: 'background .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(148,163,184,0.04)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: `linear-gradient(135deg, ${p.color}cc, ${p.color})`,
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    display: 'grid', placeItems: 'center',
                  }}>{p.nombre.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>{p.nombre}</div>
                    {ov != null && <div style={{ fontSize: 10.5, color: p.color, marginTop: 1, fontWeight: 600 }}>override activo</div>}
                  </div>
                </div>

                <div style={{ fontSize: 11.5, color: T.textSecondary }}>{ROL_LABEL[p.categoria] || p.categoria || '--'}</div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <CommissionEditor value={effective} isOverride={ov != null} accent={p.color}
                    onChange={v => setProfCom(p.id, v)} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {ov != null && (
                    <IconBtn icon="x" size={26} tone="primary" title="Volver al valor base" onClick={() => resetProf(p.id)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Bonus y excepciones" desc="Reglas adicionales para incentivar venta de producto, servicios estrella o cumplimiento de objetivos.">
        <FieldRow label="Bonus por venta de producto" hint="Porcentaje adicional aplicado solo a productos fisicos vendidos en checkout.">
          <NumberInput value={config.bonusProducto} onChange={v => setC('bonusProducto', v)} unit="%" min={0} max={50} step={1} />
        </FieldRow>
        <FieldRow label="Bonus por objetivo mensual" hint="Pago extra cuando un profesional supera su objetivo de facturacion mensual.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Toggle on={config.bonusObjetivo} onChange={v => setC('bonusObjetivo', v)} />
            <NumberInput value={config.bonusObjetivoImporte} onChange={v => setC('bonusObjetivoImporte', v)} unit="EUR" min={0} max={2000} step={25} disabled={!config.bonusObjetivo} />
          </div>
        </FieldRow>
        <FieldRow label="Comision doble en servicios estrella" hint="Marcar servicios concretos del catalogo como 'estrella' y aplicarles doble comision.">
          <Toggle on={config.bonusEstrella} onChange={v => setC('bonusEstrella', v)} />
        </FieldRow>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// CommissionEditor inline
// ---------------------------------------------------------------------------

function CommissionEditor({ value, isOverride, accent, onChange }: {
  value: number; isOverride: boolean; accent: string; onChange: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const num = v === '' ? 0 : Number(v);
    onChange(Math.max(0, Math.min(100, num)));
  };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 8,
      background: focus ? T.bg : 'transparent',
      border: `1px solid ${focus ? (accent || T.primary) : 'transparent'}`,
      minWidth: 88, justifyContent: 'center',
    }}>
      <input value={v} onChange={e => setV(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit(); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{
          width: 36, background: 'transparent', border: 'none', outline: 'none',
          color: isOverride ? accent : T.text, fontSize: 14, fontWeight: isOverride ? 700 : 600,
          textAlign: 'right', fontFamily: 'ui-monospace, monospace',
        }} />
      <span style={{ fontSize: 11, color: isOverride ? accent : T.textTertiary, fontWeight: 700 }}>%</span>
    </div>
  );
}

// ===========================================================================
// Future tabs (disabled)
// ===========================================================================

function TabNotificaciones() {
  return (
    <>
      <SoonBanner icon="bell" title="Notificaciones -- fase 4"
        desc="Los campos siguientes estan reservados para la proxima fase. Podras configurarlos cuando se libere el modulo de mensajeria." />
      <Section soon disabled title="Canal preferido" desc="Por que medio se envian los recordatorios y confirmaciones.">
        <FieldRow label="Canal principal" hint="El primero al que se intenta enviar. Si falla, se cae al siguiente.">
          <Segmented disabled value="whatsapp" onChange={() => {}} options={[
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'sms', label: 'SMS' },
            { value: 'email', label: 'Email' },
          ]} />
        </FieldRow>
        <FieldRow label="Canal de respaldo" hint="Se intenta solo si el principal falla.">
          <SSelect disabled width={200} value="email" onChange={() => {}} options={[
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'sms', label: 'SMS' },
            { value: 'email', label: 'Email' },
            { value: 'none', label: 'Ninguno' },
          ]} />
        </FieldRow>
        <FieldRow label="Remitente" hint="Nombre que aparece como remitente en SMS y emails. Limitado por carrier.">
          <STextInput disabled value="Salon Bonita" onChange={() => {}} width={240} />
        </FieldRow>
      </Section>

      <Section soon disabled title="Recordatorios automaticos" desc="Cuando se envian los avisos a la clienta antes de su cita.">
        {[
          { l: '48 h antes', on: true },
          { l: '24 h antes', on: true },
          { l: '2 h antes', on: true },
          { l: 'En el momento de la cita', on: false },
        ].map((r, i) => (
          <FieldRow key={i} label={r.l} hint="Aviso con detalles de hora y profesional.">
            <Toggle disabled on={r.on} onChange={() => {}} />
          </FieldRow>
        ))}
        <FieldRow label="Horario de no molestar" hint="No se envian mensajes en este rango horario. Se guardan en cola y se entregan al abrir.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TimeInput disabled value="22:00" onChange={() => {}} />
            <span style={{ fontSize: 11, color: T.textTertiary }}>a</span>
            <TimeInput disabled value="08:00" onChange={() => {}} />
          </div>
        </FieldRow>
      </Section>

      <Section soon disabled title="Plantillas de mensaje" desc="Texto base que se personaliza con datos de la cita. Las variables se sustituyen automaticamente.">
        {[
          { l: 'Confirmacion de cita', body: 'Hola {nombre}, tu cita de {servicio} con {profesional} esta confirmada para el {fecha} a las {hora}.' },
          { l: 'Recordatorio 24 h', body: 'Hasta manana, {nombre}! Te esperamos para tu {servicio} a las {hora}.' },
          { l: 'Cancelacion', body: 'Hemos cancelado tu cita del {fecha}. Reagendamos? Pulsa aqui: {link_reagendar}' },
          { l: 'Agradecimiento post-visita', body: 'Gracias por confiar en {salon}, {nombre}. Esperamos que estes encantada con el resultado.' },
        ].map((t, i) => (
          <div key={i} style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{t.l}</div>
              <Btn disabled size="sm" variant="ghost" icon="edit">Editar</Btn>
            </div>
            <div style={{ fontSize: 11.5, color: T.textSecondary, lineHeight: 1.55, padding: 10, background: '#0a111f', borderRadius: 8, border: `1px solid ${T.border}` }}>
              {t.body.split(/(\{[^}]+\})/).map((part, idx) => part.startsWith('{') ?
                <span key={idx} style={{ color: T.primaryHi, fontWeight: 600 }}>{part}</span> :
                <span key={idx}>{part}</span>
              )}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}

function TabPoliticas() {
  return (
    <>
      <SoonBanner icon="shield" title="Politicas de cancelacion y depositos -- fase 4"
        desc="Reglas que protegen el calendario frente a cancelaciones tardias y no-shows. Se activaran junto con el modulo de pagos." />
      <Section soon disabled title="Cancelacion de citas" desc="Reglas que se aplican cuando una clienta cancela su propia cita desde el portal o por mensaje.">
        <FieldRow label="Antelacion minima para cancelar sin penalizacion" hint="Si la clienta cancela con menos antelacion, se le aplica la penalizacion configurada abajo.">
          <NumberInput disabled value={24} onChange={() => {}} unit="h" max={168} />
        </FieldRow>
        <FieldRow label="Aplicar penalizacion por cancelacion tardia" hint="Si esta activo, se cobra un cargo cuando la cancelacion se hace fuera del plazo.">
          <Toggle disabled on={true} onChange={() => {}} />
        </FieldRow>
        <FieldRow label="Importe de la penalizacion" hint="Puede ser un porcentaje del servicio o un importe fijo.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Segmented disabled value="pct" onChange={() => {}} options={[
              { value: 'pct', label: '% del servicio' },
              { value: 'eur', label: 'Importe fijo' },
            ]} />
            <NumberInput disabled value={50} onChange={() => {}} unit="%" max={100} />
          </div>
        </FieldRow>
      </Section>

      <Section soon disabled title="Depositos y senales" desc="Cuando se solicita pago anticipado para asegurar una reserva.">
        <FieldRow label="Solicitar deposito" hint="Antes de confirmar la cita, pedir un pago parcial.">
          <Segmented disabled value="caso" onChange={() => {}} options={[
            { value: 'no', label: 'Nunca' },
            { value: 'caso', label: 'Solo en servicios marcados' },
            { value: 'todos', label: 'En todas las citas' },
          ]} />
        </FieldRow>
        <FieldRow label="Importe del deposito" hint="Importe o porcentaje del servicio.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Segmented disabled value="pct" onChange={() => {}} options={[
              { value: 'pct', label: '%' },
              { value: 'eur', label: 'EUR' },
            ]} />
            <NumberInput disabled value={25} onChange={() => {}} unit="%" max={100} />
          </div>
        </FieldRow>
        <FieldRow label="Reembolso por cancelacion a tiempo" hint="Devolver el deposito si se cancela dentro del plazo permitido.">
          <Toggle disabled on={true} onChange={() => {}} />
        </FieldRow>
      </Section>

      <Section soon disabled title="No-shows reincidentes" desc="Como proteger la agenda de clientes que no se presentan repetidamente.">
        <FieldRow label="Maximo de no-shows tolerados" hint="A partir de este numero, la clienta no podra reservar sin pago anticipado.">
          <NumberInput disabled value={2} onChange={() => {}} unit="en 6 meses" min={1} max={10} width={170} />
        </FieldRow>
        <FieldRow label="Avisar al cliente del bloqueo" hint="Enviar un mensaje al cliente explicando la nueva restriccion.">
          <Toggle disabled on={true} onChange={() => {}} />
        </FieldRow>
      </Section>
    </>
  );
}

function TabReservaOnline() {
  return (
    <>
      <SoonBanner icon="globe" title="Reserva online -- fase 7"
        desc="Tu propia pagina publica en la que las clientas pueden reservar 24/7. Configuraras aqui que se muestra y que servicios se exponen." />
      <Section soon disabled title="Portal publico" desc="Activacion de la pagina y URL en la que reciben las clientas para reservar.">
        <FieldRow label="Portal activo" hint="Si esta apagado, el enlace devuelve un mensaje de 'proximamente'.">
          <Toggle disabled on={false} onChange={() => {}} />
        </FieldRow>
        <FieldRow label="URL publica" hint="Dominio en el que se aloja el portal. Puedes vincular un dominio propio mas adelante.">
          <STextInput disabled value="reservas.hairy.studio/salon-bonita" onChange={() => {}} width={360} leadingIcon="link" />
        </FieldRow>
        <FieldRow label="Idioma del portal" hint="Idioma por defecto en el que se muestra a las clientas.">
          <SSelect disabled width={180} value="es" onChange={() => {}} options={[
            { value: 'es', label: 'Espanol' },
            { value: 'ca', label: 'Catala' },
            { value: 'en', label: 'English' },
            { value: 'pt', label: 'Portugues' },
          ]} />
        </FieldRow>
      </Section>

      <Section soon disabled title="Visibilidad" desc="Que informacion se ensena a la clienta antes de cerrar la reserva.">
        <FieldRow label="Mostrar precios" hint="Mostrar el precio en el listado o solo despues de seleccionar profesional y horario.">
          <Segmented disabled value="catalogo" onChange={() => {}} options={[
            { value: 'catalogo', label: 'En el catalogo' },
            { value: 'final', label: 'Solo al confirmar' },
            { value: 'nunca', label: 'Nunca' },
          ]} />
        </FieldRow>
        <FieldRow label="Mostrar duracion" hint="Indicar a la clienta cuanto va a durar el servicio aproximadamente.">
          <Toggle disabled on={true} onChange={() => {}} />
        </FieldRow>
        <FieldRow label="Mostrar profesional asignado" hint="Si esta apagado, la clienta no puede elegir profesional.">
          <Toggle disabled on={true} onChange={() => {}} />
        </FieldRow>
      </Section>
    </>
  );
}

// ===========================================================================
// EditServiceModal (preserved from original)
// ===========================================================================

function EditServiceModal({ service, onClose, onSave, onDelete, prof, override, onSaveOverride, onResetOverride, negocioId }: {
  service: Servicio;
  onClose: () => void;
  onSave: (s: Servicio) => void;
  onDelete: (id: string) => void;
  prof?: { id: string; nombre: string; color: string } | null;
  override?: Override;
  onSaveOverride?: (serviceId: string, patch: Partial<Override>) => Promise<void>;
  onResetOverride?: (serviceId: string) => Promise<void>;
  negocioId?: string;
}) {
  const isNew = !service.id;
  const isProfMode = !!prof;
  const catalogActiva = service.duracion_activa_min || 30;

  // Catalog mode state
  const [nombre, setNombre] = useState(service.nombre || '');
  const [precio, setPrecio] = useState<string | number>(service.precio ?? '');
  const [durActiva, setDurActiva] = useState(catalogActiva);
  const [categoria, setCategoria] = useState(service.categoria || 'Corte');
  const [espera, setEspera] = useState(service.duracion_espera_min || 0);
  const [activaExtra, setActivaExtra] = useState(service.duracion_activa_extra_min || 0);
  const [minAntelacion, setMinAntelacion] = useState(service.min_antelacion_min || 0);
  const [reservableOnline, setReservableOnline] = useState(service.reservable_online ?? false);
  const [prepagoRequerido, setPrepagoRequerido] = useState(service.prepago_requerido ?? false);
  const [prepagoPorcentaje, setPrepagoPorcentaje] = useState<string>(service.prepago_porcentaje != null ? String(service.prepago_porcentaje) : '');
  const [prepagoCantidad, setPrepagoCantidad] = useState<string>(service.prepago_cantidad_fija != null ? String(service.prepago_cantidad_fija) : '');
  const [cancelacionHoras, setCancelacionHoras] = useState<string>(service.cancelacion_horas != null ? String(service.cancelacion_horas) : '');
  const [categoriaMinima, setCategoriaMinima] = useState(service.categoria_minima ?? '');

  // Add-ons state
  const [addons, setAddons] = useState<any[]>([]);
  const [newAddonNombre, setNewAddonNombre] = useState('');
  const [newAddonDur, setNewAddonDur] = useState(10);
  const [newAddonPrecio, setNewAddonPrecio] = useState('');
  const [addingAddon, setAddingAddon] = useState(false);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [editAddonNombre, setEditAddonNombre] = useState('');
  const [editAddonDur, setEditAddonDur] = useState(10);
  const [editAddonPrecio, setEditAddonPrecio] = useState('');

  // Category pricing state
  const [catPrices, setCatPrices] = useState<Record<string, string>>({});
  const [catPricesDb, setCatPricesDb] = useState<Record<string, number | null>>({});
  const [savingCatPrice, setSavingCatPrice] = useState<string | null>(null);

  useEffect(() => {
    if (!service.id || isProfMode) return;
    supabase
      .from('service_addons')
      .select('id, nombre, duracion_min, precio, activo')
      .eq('servicio_id', service.id)
      .order('nombre')
      .then(({ data }) => setAddons(data ?? []));
  }, [service.id, isProfMode]);

  useEffect(() => {
    if (!service.id || isProfMode) return;
    supabase
      .from('service_category_pricing')
      .select('categoria, precio')
      .eq('servicio_id', service.id)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        const db: Record<string, number | null> = {};
        (data ?? []).forEach((d: any) => {
          map[d.categoria] = String(d.precio);
          db[d.categoria] = d.precio;
        });
        setCatPrices(map);
        setCatPricesDb(db);
      });
  }, [service.id, isProfMode]);

  async function saveCatPrice(cat: string) {
    if (!service.id || !negocioId) return;
    setSavingCatPrice(cat);
    const raw = catPrices[cat]?.trim() ?? '';
    const val = parseFloat(raw);
    if (raw === '' || isNaN(val)) {
      await supabase.from('service_category_pricing')
        .delete()
        .eq('servicio_id', service.id)
        .eq('categoria', cat);
      setCatPricesDb(prev => { const n = { ...prev }; delete n[cat]; return n; });
      setCatPrices(prev => { const n = { ...prev }; delete n[cat]; return n; });
    } else {
      await supabase.from('service_category_pricing')
        .upsert({
          servicio_id: service.id,
          categoria: cat,
          precio: val,
          negocio_id: negocioId,
        }, { onConflict: 'servicio_id,categoria' });
      setCatPricesDb(prev => ({ ...prev, [cat]: val }));
    }
    setSavingCatPrice(null);
  }

  // Variants state
  const [variants, setVariants] = useState<any[]>([]);
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVarNombre, setNewVarNombre] = useState('');
  const [newVarPrecio, setNewVarPrecio] = useState('');
  const [newVarDur, setNewVarDur] = useState(30);
  const [newVarEspera, setNewVarEspera] = useState(0);
  const [newVarExtra, setNewVarExtra] = useState(0);
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editVarNombre, setEditVarNombre] = useState('');
  const [editVarPrecio, setEditVarPrecio] = useState('');
  const [editVarDur, setEditVarDur] = useState(30);
  const [editVarEspera, setEditVarEspera] = useState(0);
  const [editVarExtra, setEditVarExtra] = useState(0);

  useEffect(() => {
    if (!service.id || isProfMode) return;
    supabase
      .from('service_variants')
      .select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, activo')
      .eq('servicio_id', service.id)
      .order('nombre')
      .then(({ data }) => setVariants(data ?? []));
  }, [service.id, isProfMode]);

  // Prof mode state
  const [ovPrecio, setOvPrecio] = useState<string | number>(override?.precio ?? service.precio ?? '');
  const [ovDur, setOvDur] = useState<number>(override?.duracion ?? catalogActiva);
  const [ovEspera, setOvEspera] = useState<number>(override?.duracion_espera_min ?? service.duracion_espera_min ?? 0);
  const [ovExtra, setOvExtra] = useState<number>(override?.duracion_activa_extra_min ?? service.duracion_activa_extra_min ?? 0);
  const [ovActivo, setOvActivo] = useState<boolean>(override?.activo !== false);

  const [guardando, setGuardando] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: '#0b1220', border: `1px solid ${T.border}`,
    color: T.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const accentColor = isProfMode ? prof!.color : T.primary;
  const accentSoft = isProfMode ? `${prof!.color}1a` : 'rgba(99,102,241,0.18)';
  const accentBorder = isProfMode ? `${prof!.color}55` : 'rgba(99,102,241,0.4)';
  const accentText = isProfMode ? prof!.color : T.primaryHi;

  const handleSave = async () => {
    setGuardando(true);
    if (isProfMode && service.id && onSaveOverride) {
      await onSaveOverride(service.id, {
        duracion: ovDur,
        duracion_espera_min: ovEspera,
        duracion_activa_extra_min: ovExtra,
        precio: parseFloat(String(ovPrecio)) || 0,
        activo: ovActivo,
      });
    } else {
      if (!nombre.trim()) { alert('El nombre del servicio es requerido'); setGuardando(false); return; }
      onSave({
        ...service, nombre, precio: parseFloat(String(precio)) || 0, duracion_activa_min: durActiva, categoria,
        duracion_espera_min: espera, duracion_activa_extra_min: activaExtra, min_antelacion_min: minAntelacion,
        reservable_online: reservableOnline, prepago_requerido: prepagoRequerido,
        prepago_porcentaje: prepagoPorcentaje.trim() ? parseFloat(prepagoPorcentaje) : null,
        prepago_cantidad_fija: prepagoCantidad.trim() ? parseFloat(prepagoCantidad) : null,
        cancelacion_horas: cancelacionHoras.trim() ? parseInt(cancelacionHoras) : null,
        categoria_minima: categoriaMinima || null,
      });
    }
    setGuardando(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: 520, maxWidth: '100%', maxHeight: '85vh', background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px', paddingBottom: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text }}>
            {isProfMode ? `Personalizar -- ${service.nombre}` : isNew ? 'Nuevo servicio' : 'Editar servicio'}
          </h3>
          <button
            onClick={onClose}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(148,163,184,0.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bgCard; }}
            style={{ width: 32, height: 32, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}`, color: T.textSecondary, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 16, transition: 'all 0.15s ease' }}
          >x</button>
        </div>

        <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, padding: '18px 22px 4px' }}>
          {/* Banner prof */}
          {isProfMode && (
            <div style={{ background: `${prof!.color}14`, border: `1px solid ${prof!.color}33`, borderRadius: 10, padding: '11px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${prof!.color}cc, ${prof!.color})`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                {prof!.nombre.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{prof!.nombre}</div>
                <div style={{ fontSize: 11, color: T.textSecondary }}>Los cambios solo afectan a este profesional</div>
              </div>
            </div>
          )}

          {isProfMode ? (
            <div style={{ display: 'grid', gap: 14, paddingBottom: 4 }}>
              <FormField label="Precio (EUR)">
                <input value={ovPrecio} onChange={e => setOvPrecio(e.target.value)} placeholder={String(service.precio)} style={inputStyle} />
                {service.precio != null && (
                  <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Catalogo: {service.precio} EUR</div>
                )}
              </FormField>
              <FormField label="Tiempo activo (min)">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[15, 30, 45, 60, 90].map(m => (
                    <button key={m} onClick={() => setOvDur(m)}
                      style={{ flex: '1 1 calc(20% - 5px)', padding: '8px 6px', borderRadius: 8, background: ovDur === m ? accentSoft : 'rgba(148,163,184,0.06)', border: `1px solid ${ovDur === m ? accentBorder : T.border}`, color: ovDur === m ? accentText : T.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Catalogo: {catalogActiva} min</div>
              </FormField>
              <FormField label="Tiempo de reposo (min)">
                <input value={ovEspera} onChange={e => setOvEspera(parseInt(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Catalogo: {service.duracion_espera_min || 0} min</div>
              </FormField>
              <FormField label="Tiempo activo extra (min)">
                <input value={ovExtra} onChange={e => setOvExtra(parseInt(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Catalogo: {service.duracion_activa_extra_min || 0} min</div>
              </FormField>
              <FormField label="Estado para este profesional">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Toggle on={ovActivo} onChange={() => setOvActivo(!ovActivo)} />
                  <span style={{ fontSize: 12, color: ovActivo ? T.success : T.textSecondary, fontWeight: 600 }}>
                    {ovActivo ? 'Activo' : 'No lo hace'}
                  </span>
                </div>
              </FormField>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14, maxWidth: 480, paddingBottom: 4 }}>
              <FormField label="Nombre del servicio">
                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Corte + Barba" style={inputStyle} />
              </FormField>
              <FormField label="Categoria">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Corte', 'Color', 'Tratamiento', 'Peinado', 'Otro'].map(c => (
                    <button key={c} onClick={() => setCategoria(c)}
                      style={{ padding: '6px 12px', borderRadius: 999, background: categoria === c ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${categoria === c ? 'rgba(99,102,241,0.4)' : T.border}`, color: categoria === c ? T.primaryHi : T.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                      {c}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Precio (EUR)">
                <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="28" style={inputStyle} />
              </FormField>
              <FormField label="Tiempo activo (min)">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[15, 30, 45, 60, 90].map(m => (
                    <button key={m} onClick={() => setDurActiva(m)}
                      style={{ flex: '1 1 calc(20% - 5px)', padding: '8px 6px', borderRadius: 8, background: durActiva === m ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${durActiva === m ? 'rgba(99,102,241,0.4)' : T.border}`, color: durActiva === m ? T.primaryHi : T.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Tiempo de reposo (opcional)">
                <input value={espera} onChange={e => setEspera(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle} />
                <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Util para coloraciones donde el tinte reposa.</div>
              </FormField>
              <FormField label="Tiempo activo extra (opcional)">
                <input value={activaExtra} onChange={e => setActivaExtra(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle} />
                <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Tiempo activo adicional tras la fase de reposo.</div>
              </FormField>
              <FormField label="Antelacion minima (min)">
                <input value={minAntelacion} onChange={e => setMinAntelacion(parseInt(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>Tiempo minimo de antelacion para reservar este servicio. 0 = sin restriccion.</div>
              </FormField>

              {/* Add-ons */}
              {!isNew && (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add-ons opcionales</div>
                  <div style={{ fontSize: 10, color: T.textTertiary, marginBottom: 10 }}>Extras que el cliente puede anadir a este servicio. Suman duracion y precio.</div>

                  {addons.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {addons.map((a: any) => editingAddonId === a.id ? (
                        <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: T.bgCard, borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)' }}>
                          <input value={editAddonNombre} onChange={e => setEditAddonNombre(e.target.value)} placeholder="Nombre" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Duracion (min)</div>
                              <input value={editAddonDur} onChange={e => setEditAddonDur(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Precio (EUR)</div>
                              <input value={editAddonPrecio} onChange={e => setEditAddonPrecio(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Btn variant="ghost" size="sm" onClick={() => setEditingAddonId(null)}>Cancelar</Btn>
                            <Btn variant="primary" size="sm" disabled={!editAddonNombre.trim()} onClick={async () => {
                              if (!editAddonNombre.trim()) return;
                              const { error } = await supabase.from('service_addons').update({
                                nombre: editAddonNombre.trim(), duracion_min: editAddonDur, precio: parseFloat(editAddonPrecio) || 0,
                              }).eq('id', a.id);
                              if (!error) {
                                setAddons(prev => prev.map(x => x.id === a.id ? { ...x, nombre: editAddonNombre.trim(), duracion_min: editAddonDur, precio: parseFloat(editAddonPrecio) || 0 } : x));
                                setEditingAddonId(null);
                              }
                            }}>Guardar</Btn>
                          </div>
                        </div>
                      ) : (
                        <div key={a.id}
                          onClick={() => { setEditingAddonId(a.id); setEditAddonNombre(a.nombre); setEditAddonDur(a.duracion_min); setEditAddonPrecio(String(a.precio)); }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{a.nombre}</span>
                            <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 8 }}>+{a.duracion_min}min -- {a.precio}EUR</span>
                          </div>
                          <button onClick={async (ev) => { ev.stopPropagation(); await supabase.from('service_addons').delete().eq('id', a.id); setAddons(prev => prev.filter(x => x.id !== a.id)); }}
                            style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!addingAddon ? (
                    <button onClick={() => setAddingAddon(true)}
                      style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      + Nuevo add-on
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <input value={newAddonNombre} onChange={e => setNewAddonNombre(e.target.value)} placeholder="Nombre (ej: Hidratacion profunda)" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Duracion (min)</div>
                          <input value={newAddonDur} onChange={e => setNewAddonDur(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Precio (EUR)</div>
                          <input value={newAddonPrecio} onChange={e => setNewAddonPrecio(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Btn variant="ghost" size="sm" onClick={() => { setAddingAddon(false); setNewAddonNombre(''); setNewAddonDur(10); setNewAddonPrecio(''); }}>Cancelar</Btn>
                        <Btn variant="primary" size="sm" disabled={!newAddonNombre.trim()} onClick={async () => {
                          if (!newAddonNombre.trim() || !negocioId) return;
                          const { data, error } = await supabase.from('service_addons').insert({
                            negocio_id: negocioId, servicio_id: service.id,
                            nombre: newAddonNombre.trim(), duracion_min: newAddonDur, precio: parseFloat(newAddonPrecio) || 0,
                          }).select().single();
                          if (!error && data) {
                            setAddons(prev => [...prev, data]);
                            setNewAddonNombre(''); setNewAddonDur(10); setNewAddonPrecio('');
                            setAddingAddon(false);
                          }
                        }}>Guardar</Btn>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Variantes */}
              {!isNew && (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Variantes</div>
                  <div style={{ fontSize: 10, color: T.textTertiary, marginBottom: 10 }}>Sub-tipos con diferente precio y duracion (ej: Tinte raiz, Tinte completo, Mechas).</div>

                  {variants.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {variants.map((v: any) => editingVarId === v.id ? (
                        <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: T.bgCard, borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)' }}>
                          <input value={editVarNombre} onChange={e => setEditVarNombre(e.target.value)} placeholder="Nombre variante" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Precio (EUR)</div><input value={editVarPrecio} onChange={e => setEditVarPrecio(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                            <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Activo (min)</div><input value={editVarDur} onChange={e => setEditVarDur(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Reposo (min)</div><input value={editVarEspera} onChange={e => setEditVarEspera(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                            <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Extra (min)</div><input value={editVarExtra} onChange={e => setEditVarExtra(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Btn variant="ghost" size="sm" onClick={() => setEditingVarId(null)}>Cancelar</Btn>
                            <Btn variant="primary" size="sm" disabled={!editVarNombre.trim()} onClick={async () => {
                              if (!editVarNombre.trim()) return;
                              const { error } = await supabase.from('service_variants').update({
                                nombre: editVarNombre.trim(), precio: parseFloat(editVarPrecio) || 0,
                                duracion_activa_min: editVarDur, duracion_espera_min: editVarEspera, duracion_activa_extra_min: editVarExtra,
                              }).eq('id', v.id);
                              if (!error) {
                                setVariants(prev => prev.map(x => x.id === v.id ? { ...x, nombre: editVarNombre.trim(), precio: parseFloat(editVarPrecio) || 0, duracion_activa_min: editVarDur, duracion_espera_min: editVarEspera, duracion_activa_extra_min: editVarExtra } : x));
                                setEditingVarId(null);
                              }
                            }}>Guardar</Btn>
                          </div>
                        </div>
                      ) : (
                        <div key={v.id}
                          onClick={() => { setEditingVarId(v.id); setEditVarNombre(v.nombre); setEditVarPrecio(String(v.precio)); setEditVarDur(v.duracion_activa_min); setEditVarEspera(v.duracion_espera_min); setEditVarExtra(v.duracion_activa_extra_min); }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{v.nombre}</span>
                            <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 8 }}>{v.duracion_activa_min + v.duracion_espera_min + v.duracion_activa_extra_min}min -- {v.precio}EUR</span>
                          </div>
                          <button onClick={async (ev) => { ev.stopPropagation(); await supabase.from('service_variants').delete().eq('id', v.id); setVariants(prev => prev.filter(x => x.id !== v.id)); }}
                            style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!addingVariant ? (
                    <button onClick={() => setAddingVariant(true)}
                      style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      + Nueva variante
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <input value={newVarNombre} onChange={e => setNewVarNombre(e.target.value)} placeholder="Nombre (ej: Tinte raiz)" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Precio (EUR)</div><input value={newVarPrecio} onChange={e => setNewVarPrecio(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Activo (min)</div><input value={newVarDur} onChange={e => setNewVarDur(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Reposo (min)</div><input value={newVarEspera} onChange={e => setNewVarEspera(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: T.textTertiary, marginBottom: 3 }}>Extra (min)</div><input value={newVarExtra} onChange={e => setNewVarExtra(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Btn variant="ghost" size="sm" onClick={() => { setAddingVariant(false); setNewVarNombre(''); setNewVarPrecio(''); setNewVarDur(30); setNewVarEspera(0); setNewVarExtra(0); }}>Cancelar</Btn>
                        <Btn variant="primary" size="sm" disabled={!newVarNombre.trim()} onClick={async () => {
                          if (!newVarNombre.trim() || !negocioId) return;
                          const { data, error } = await supabase.from('service_variants').insert({
                            negocio_id: negocioId, servicio_id: service.id,
                            nombre: newVarNombre.trim(), precio: parseFloat(newVarPrecio) || 0,
                            duracion_activa_min: newVarDur, duracion_espera_min: newVarEspera, duracion_activa_extra_min: newVarExtra,
                          }).select().single();
                          if (!error && data) {
                            setVariants(prev => [...prev, data]);
                            setNewVarNombre(''); setNewVarPrecio(''); setNewVarDur(30); setNewVarEspera(0); setNewVarExtra(0);
                            setAddingVariant(false);
                          }
                        }}>Guardar</Btn>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Precios por categoria */}
              {!isNew && (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Precios por categoria</div>
                  <div style={{ fontSize: 10, color: T.textTertiary, marginBottom: 10 }}>Precio diferente segun la categoria del profesional. Dejar vacio para usar el precio base.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {CATEGORIAS_PROFESIONAL.map((cat) => {
                      const dbVal = catPricesDb[cat.value];
                      const inputVal = catPrices[cat.value] ?? '';
                      const changed = inputVal !== (dbVal != null ? String(dbVal) : '');
                      const isSaving = savingCatPrice === cat.value;
                      return (
                        <div key={cat.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 110, fontSize: 11, fontWeight: 600, color: dbVal != null ? T.text : T.textTertiary, flexShrink: 0 }}>{cat.label}</div>
                          <div style={{ flex: 1 }}>
                            <input
                              value={inputVal}
                              onChange={e => setCatPrices(prev => ({ ...prev, [cat.value]: e.target.value }))}
                              onBlur={() => { if (changed) saveCatPrice(cat.value); }}
                              onKeyDown={e => { if (e.key === 'Enter' && changed) saveCatPrice(cat.value); }}
                              placeholder={String(precio || '--')}
                              style={{
                                width: '100%', padding: '6px 10px', borderRadius: 6,
                                background: T.bg, border: `1px solid ${changed ? 'rgba(99,102,241,0.4)' : T.border}`,
                                color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
                                boxSizing: 'border-box' as const, transition: 'border-color 0.15s ease',
                              }}
                            />
                          </div>
                          <div style={{ width: 16, fontSize: 11, color: T.textTertiary }}>EUR</div>
                          {isSaving && <div style={{ fontSize: 10, color: T.primary, fontWeight: 600 }}>...</div>}
                          {!isSaving && dbVal != null && !changed && (
                            <div style={{ width: 12, height: 12, borderRadius: 999, background: T.success, opacity: 0.5 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reserva online y prepago */}
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Reserva y pagos</div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Reservable online</div>
                    <div style={{ fontSize: 10, color: T.textTertiary }}>Visible en el portal de reservas del salon</div>
                  </div>
                  <button
                    onClick={() => setReservableOnline(!reservableOnline)}
                    style={{ width: 40, height: 22, borderRadius: 11, background: reservableOnline ? T.primary : 'rgba(148,163,184,0.2)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease' }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 3, left: reservableOnline ? 21 : 3, transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Prepago requerido</div>
                    <div style={{ fontSize: 10, color: T.textTertiary }}>Cobrar senal al reservar este servicio</div>
                  </div>
                  <button
                    onClick={() => setPrepagoRequerido(!prepagoRequerido)}
                    style={{ width: 40, height: 22, borderRadius: 11, background: prepagoRequerido ? '#f59e0b' : 'rgba(148,163,184,0.2)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease' }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 3, left: prepagoRequerido ? 21 : 3, transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>

                {prepagoRequerido && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10, paddingLeft: 12, borderLeft: `2px solid rgba(245,158,11,0.3)` }}>
                    <FormField label="Porcentaje (%)">
                      <input value={prepagoPorcentaje} onChange={e => setPrepagoPorcentaje(e.target.value)} placeholder="Ej. 30" type="number" min="0" max="100" style={inputStyle} />
                    </FormField>
                    <FormField label="O cantidad fija (EUR)">
                      <input value={prepagoCantidad} onChange={e => setPrepagoCantidad(e.target.value)} placeholder="Ej. 20" type="number" min="0" style={inputStyle} />
                    </FormField>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FormField label="Cancelacion minima (horas)">
                    <input value={cancelacionHoras} onChange={e => setCancelacionHoras(e.target.value)} placeholder="24" type="number" min="0" style={inputStyle} />
                  </FormField>
                  <FormField label="Categoria minima">
                    <select value={categoriaMinima} onChange={e => setCategoriaMinima(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Sin restriccion</option>
                      {CATEGORIAS_PROFESIONAL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </FormField>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderTop: `1px solid ${T.border}` }}>
          {isProfMode ? (
            override ? (
              <Btn variant="ghost" size="md" onClick={() => service.id && onResetOverride?.(service.id)}>
                Restablecer
              </Btn>
            ) : <span />
          ) : (
            !isNew ? (
              <Btn variant="danger" size="md" onClick={() => service.id && onDelete(service.id)}>
                Eliminar
              </Btn>
            ) : <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" size="md" onClick={onClose}>Cancelar</Btn>
            <Btn variant="primary" size="md" icon="check" disabled={guardando} onClick={handleSave}>
              {guardando ? 'Guardando...' : isProfMode ? `Guardar para ${prof!.nombre}` : 'Guardar servicio'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormField helper
// ---------------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: T.textTertiary, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
