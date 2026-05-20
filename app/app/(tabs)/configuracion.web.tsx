import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { DateTimePicker } from '@/components/ui/Pickers';

const TOKENS = {
  bg: '#0b1220',
  bgPanel: '#0f172a',
  bgCard: '#141f33',
  border: 'rgba(148,163,184,0.10)',
  borderHi: 'rgba(148,163,184,0.18)',
  text: '#f8fafc',
  textSec: '#94a3b8',
  textTer: '#64748b',
  primary: '#6366f1',
  primaryHi: '#818cf8',
  primarySoft: 'rgba(99,102,241,0.14)',
  success: '#10b981',
  danger: '#ef4444',
  dangerSoft: 'rgba(239,68,68,0.14)',
};

const TIPO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  vacaciones: { label: 'Vacaciones', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  reunion:    { label: 'Reunión',    color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' },
  baja:       { label: 'Baja',       color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
  formacion:  { label: 'Formación',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)' },
  descanso:   { label: 'Descanso',   color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
};

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

const TABS = [
  { id: 'general',    label: 'General' },
  { id: 'services',   label: 'Servicios' },
  { id: 'horarios',   label: 'Horarios' },
  { id: 'pagos',      label: 'Pagos' },
  { id: 'apariencia', label: 'Apariencia' },
];

export default function ConfiguracionWeb() {
  const [tab, setTab] = useState('services');
  const [edit, setEdit] = useState<Servicio | null>(null);
  const [services, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState('');
  const [businessInfo, setBusinessInfo] = useState<any>(null);

  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [selectedProfHorarios, setSelectedProfHorarios] = useState<string | null>(null);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [loadingBloqueos, setLoadingBloqueos] = useState(false);
  const [showAddBloqueo, setShowAddBloqueo] = useState(false);

  const [profId, setProfId] = useState<string | null>(null);
  const [allOverrides, setAllOverrides] = useState<Override[]>([]);

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setLoading(false); return; }
      setNegocioId(profile.negocio_id);
      setBusinessInfo(profile);

      const [{ data: srvData }, { data: profData }] = await Promise.all([
        supabase.from('servicios').select('*').eq('negocio_id', profile.negocio_id).order('categoria'),
        supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre'),
      ]);

      setServicios(srvData ?? []);
      setProfesionales(profData ?? []);

      if (profData && profData.length > 0) {
        const { data: ovData } = await supabase
          .from('professional_service_overrides')
          .select('*')
          .in('professional_id', profData.map((p: any) => p.id));
        setAllOverrides(ovData ?? []);
      }

      setLoading(false);
    }
    cargar();
  }, []);

  useEffect(() => {
    if (!selectedProfHorarios) { setBloqueos([]); return; }
    setLoadingBloqueos(true);
    supabase
      .from('bloqueos_profesional')
      .select('*')
      .eq('profesional_id', selectedProfHorarios)
      .order('inicio')
      .then(({ data }) => { setBloqueos(data ?? []); setLoadingBloqueos(false); });
  }, [selectedProfHorarios]);

  const getOverride = (serviceId: string): Override | undefined =>
    profId ? allOverrides.find(o => o.professional_id === profId && o.service_id === serviceId) : undefined;

  const handleSaveService = async (service: Servicio) => {
    if (!negocioId) return;
    try {
      const payload = {
        nombre: service.nombre,
        precio: service.precio,
        duracion_activa_min: service.duracion_activa_min,
        categoria: service.categoria,
        duracion_espera_min: service.duracion_espera_min || 0,
        duracion_activa_extra_min: service.duracion_activa_extra_min || 0,
        min_antelacion_min: service.min_antelacion_min || 0,
        activo: service.activo !== false,
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

    // 1. Comprobar si hay citas que usan este servicio
    const { count } = await supabase
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('servicio_id', id);

    if (count && count > 0) {
      const ok = window.confirm(
        `"${nombre}" se usa en ${count} cita${count === 1 ? '' : 's'}. ` +
        `No se puede eliminar sin borrar los datos historicos.\n\n` +
        `Se desactivara en su lugar (no aparecera al crear nuevas citas, pero las citas pasadas seguiran mostrando su nombre).\n\n` +
        `¿Continuar?`
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

    // 2. Sin citas asociadas: confirmar y borrar duro
    const ok = window.confirm(`¿Eliminar "${nombre}"? Esta accion no se puede deshacer.`);
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
        // El servicio fue eliminado de la BD — limpiar estado obsoleto
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

  const handleAddBloqueo = async (b: { tipo: string; inicio: string; fin: string; motivo: string }) => {
    if (!selectedProfHorarios || !negocioId) return;
    try {
      const { data, error } = await supabase
        .from('bloqueos_profesional')
        .insert({ negocio_id: negocioId, profesional_id: selectedProfHorarios, tipo: b.tipo, inicio: b.inicio, fin: b.fin, motivo: b.motivo || null })
        .select()
        .single();
      if (error) throw error;
      setBloqueos(prev => [...prev, data].sort((a, c) => a.inicio.localeCompare(c.inicio)));
      setShowAddBloqueo(false);
    } catch (e: any) {
      alert('Error al guardar bloqueo: ' + e.message);
    }
  };

  const handleDeleteBloqueo = async (id: string) => {
    try {
      await supabase.from('bloqueos_profesional').delete().eq('id', id);
      setBloqueos(prev => prev.filter(b => b.id !== id));
    } catch (e: any) {
      alert('Error al eliminar bloqueo: ' + e.message);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0b1220', color: TOKENS.text }}>
      Cargando...
    </div>
  );

  const profSelNombre = profesionales.find(p => p.id === selectedProfHorarios)?.nombre ?? '';
  const profSelData = profesionales.find(p => p.id === profId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Configuración</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>Ajusta tu negocio, servicios y preferencias</p>
        </div>
        <button
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
          style={{ padding: '9px 14px', background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
        >
          Guardar cambios
        </button>
      </div>

      {/* Main grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
        {/* Tabs rail */}
        <div style={{ borderRight: `1px solid ${TOKENS.border}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                onMouseEnter={e => { e.currentTarget.style.background = active ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.05)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(99,102,241,0.10)' : 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
                style={{ padding: '10px 12px', borderRadius: 10, textAlign: 'left', background: active ? 'rgba(99,102,241,0.10)' : 'transparent', border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'transparent'}`, color: active ? TOKENS.text : TOKENS.textSec, fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          <div>
            {tab === 'services' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>Servicios del catálogo</h2>
                    <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4 }}>
                      {services.length} servicios · agrupados por categoría
                    </div>
                  </div>
                  {!profId && (
                    <button
                      className="m-btn-primary"
                      onClick={() => setEdit({ nombre: '', precio: 0, duracion_activa_min: 30, categoria: 'Corte' })}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.6)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)'; }}
                      style={{ padding: '9px 14px', background: 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(99,102,241,0.45)', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease', transform: 'scale(1)' }}
                    >
                      + Nuevo servicio
                    </button>
                  )}
                </div>

                <ScopeSelector
                  profesionales={profesionales}
                  profId={profId}
                  setProfId={setProfId}
                  allOverrides={allOverrides}
                />

                {services.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: TOKENS.textSec }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>No hay servicios todavía</div>
                    <div style={{ fontSize: 12 }}>Crea tu primer servicio para empezar</div>
                  </div>
                ) : (
                  [...new Set(services.map(s => s.categoria))].map(cat => (
                    <div key={cat} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{cat}</span>
                        <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
                        <span>{services.filter(s => s.categoria === cat).length}</span>
                      </div>
                      <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
                        {services.filter(s => s.categoria === cat).map((s, i, arr) => {
                          const ov = s.id ? getOverride(s.id) : undefined;
                          const profColor = profSelData?.color;
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
                              style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 80px', padding: '14px 16px', alignItems: 'center', borderBottom: i < arr.length - 1 ? `1px solid ${TOKENS.border}` : 'none', transition: 'background 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.04)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              {/* Nombre */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                {profId && hasOv && (
                                  <div style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: profColor, boxShadow: `0 0 8px ${profColor}` }} />
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nombre}</div>
                                  <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 2 }}>SKU-{s.id?.slice(0, 6).toUpperCase()}</div>
                                </div>
                              </div>

                              {/* Duración */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {durChanged ? (
                                  <>
                                    <span style={{ fontSize: 12, color: profColor, fontWeight: 600 }}>{efectivoDur} min</span>
                                    <span style={{ fontSize: 10, color: TOKENS.textTer, textDecoration: 'line-through' }}>{catalogDur} min</span>
                                  </>
                                ) : (
                                  <span style={{ fontSize: 12, color: TOKENS.textSec }}>{catalogDur} min</span>
                                )}
                              </div>

                              {/* Precio */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {profId && ov?.precio != null ? (
                                  <>
                                    <span style={{ fontSize: 13, color: profColor, fontWeight: 700 }}>{Number(efectivoPrecio).toFixed(0)} €</span>
                                    <span style={{ fontSize: 10, color: TOKENS.textTer, textDecoration: 'line-through' }}>{s.precio} €</span>
                                  </>
                                ) : (
                                  <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.success }}>{s.precio} €</span>
                                )}
                              </div>

                              {/* Toggle */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                  onClick={() => {
                                    if (profId && s.id) handleSaveOverride(s.id, { activo: !activoEfectivo });
                                    else if (!profId) handleToggleServicio(s);
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(99,102,241,0.3)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                                  style={{ width: 32, height: 18, borderRadius: 999, background: activoEfectivo ? 'rgba(99,102,241,0.30)' : 'rgba(148,163,184,0.18)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s ease', transform: 'scale(1)' }}
                                >
                                  <div style={{ position: 'absolute', top: 2, left: activoEfectivo ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: activoEfectivo ? TOKENS.primary : TOKENS.textTer, boxShadow: activoEfectivo ? `0 0 6px ${TOKENS.primary}` : 'none', transition: 'left 0.2s' }} />
                                </div>
                                <span style={{ fontSize: 11, color: activoEfectivo ? TOKENS.success : TOKENS.textSec, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {activoEfectivo ? 'Activo' : (profId ? 'No lo hace' : 'Inactivo')}
                                </span>
                              </div>

                              {/* Acciones */}
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                <button
                                  className="m-btn-icon"
                                  onClick={() => setEdit(s)}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = TOKENS.primaryHi; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; e.currentTarget.style.transform = 'scale(1)'; }}
                                  style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s ease', transform: 'scale(1)' }}
                                >
                                  ✎
                                </button>
                                {profId ? (
                                  hasOv && (
                                    <button
                                      className="m-btn-icon"
                                      onClick={() => s.id && handleResetOverride(s.id)}
                                      title="Restablecer a catálogo"
                                      onMouseEnter={e => { e.currentTarget.style.background = `${profColor}18`; e.currentTarget.style.borderColor = `${profColor}55`; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'scale(1)'; }}
                                      style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: profColor, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 14, transition: 'all 0.15s ease', transform: 'scale(1)' }}
                                    >
                                      ✕
                                    </button>
                                  )
                                ) : (
                                  <button
                                    className="m-btn-danger"
                                    onClick={() => s.id && handleDeleteService(s.id)}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = `${TOKENS.danger}55`; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'scale(1)'; }}
                                    style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.danger, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 14, transition: 'all 0.15s ease', transform: 'scale(1)' }}
                                  >
                                    ✕
                                  </button>
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
            )}

            {tab === 'horarios' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>Bloqueos del equipo</h2>
                    <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4 }}>
                      Vacaciones, bajas, reuniones y formaciones bloquean la agenda de forma permanente
                    </div>
                  </div>
                  {selectedProfHorarios && (
                    <button
                      onClick={() => setShowAddBloqueo(true)}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.6)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)'; }}
                      style={{ padding: '9px 14px', background: 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(99,102,241,0.45)', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s ease' }}
                    >
                      + Añadir bloqueo
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {profesionales.length === 0 ? (
                      <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '12px 0' }}>Sin profesionales</div>
                    ) : profesionales.map(p => {
                      const active = selectedProfHorarios === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProfHorarios(p.id)}
                          onMouseEnter={e => { e.currentTarget.style.background = active ? `${p.color}22` : 'rgba(99,102,241,0.05)'; e.currentTarget.style.transform = 'translateX(3px)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = active ? `${p.color}18` : 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, background: active ? `${p.color}18` : 'transparent', border: `1px solid ${active ? p.color + '55' : 'transparent'}`, color: active ? TOKENS.text : TOKENS.textSec, fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left' }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: 999, background: p.color, flexShrink: 0, boxShadow: active ? `0 0 8px ${p.color}` : 'none' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    {!selectedProfHorarios ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', color: TOKENS.textSec, background: TOKENS.bgCard, borderRadius: 14, border: `1px dashed ${TOKENS.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Selecciona un profesional</div>
                        <div style={{ fontSize: 12, color: TOKENS.textTer, marginTop: 4 }}>para ver y gestionar sus bloqueos</div>
                      </div>
                    ) : loadingBloqueos ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', color: TOKENS.textSec }}>Cargando...</div>
                    ) : bloqueos.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', color: TOKENS.textSec, background: TOKENS.bgCard, borderRadius: 14, border: `1px dashed ${TOKENS.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Sin bloqueos registrados</div>
                        <div style={{ fontSize: 12, color: TOKENS.textTer, marginTop: 4 }}>Pulsa "Añadir bloqueo" para registrar vacaciones, bajas o reuniones</div>
                      </div>
                    ) : (
                      <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
                        {bloqueos.map((b, i) => (
                          <BloqueoRow key={b.id} bloqueo={b} last={i === bloqueos.length - 1} onDelete={handleDeleteBloqueo} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tab === 'services' && profSelData && (
              <ScopeHelpCard prof={profSelData} />
            )}

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Apariencia</div>
              <div style={{ fontSize: 11, color: TOKENS.textSec, marginBottom: 14 }}>Modo visual de la app</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ThemeOption name="Oscuro" active={true} />
                <ThemeOption name="Claro" active={false} />
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Negocio</div>
              <Field label="Nombre" value={businessInfo?.business_name || 'Salón Bonita'} />
              <Field label="Email" value={businessInfo?.email || 'hola@salonbonita.es'} />
              <Field label="Teléfono" value={businessInfo?.phone || '+34 911 234 567'} />
              <Field label="Dirección" value={businessInfo?.address || 'C/ Mayor 12, Madrid'} last={true} />
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Notificaciones</div>
              {[
                { l: 'Recordatorios SMS a clientes', on: true },
                { l: 'Email de confirmación', on: true },
                { l: 'Alertas de no-show', on: false },
                { l: 'Resumen diario por email', on: true },
              ].map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i > 0 ? `1px solid ${TOKENS.border}` : 'none' }}>
                  <span style={{ fontSize: 12, color: TOKENS.text }}>{n.l}</span>
                  <Toggle on={n.on} />
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>

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
      {showAddBloqueo && selectedProfHorarios && (
        <AddBloqueoModal profNombre={profSelNombre} onClose={() => setShowAddBloqueo(false)} onSave={handleAddBloqueo} />
      )}
    </div>
  );
}

// ─── Scope components ────────────────────────────────────────────────────────

function ScopeChip({ label, active, color, badge, avatar, onClick }: {
  label: string; active: boolean; color?: string; badge?: number; avatar?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = active ? `0 4px 12px ${(color || TOKENS.primary)}33` : '0 4px 12px rgba(0,0,0,0.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 999,
        background: active ? (color ? `${color}1a` : 'rgba(99,102,241,0.15)') : 'rgba(148,163,184,0.06)',
        border: `1px solid ${active ? ((color || TOKENS.primary) + '55') : TOKENS.border}`,
        color: active ? (color || TOKENS.primaryHi) : TOKENS.textSec,
        fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
        transition: 'all 0.15s ease', transform: 'translateY(0)',
      }}
    >
      {avatar && color && (
        <div style={{
          width: 18, height: 18, borderRadius: 6, flexShrink: 0,
          background: `linear-gradient(135deg, ${color}cc, ${color})`,
          display: 'grid', placeItems: 'center',
          fontSize: 8, fontWeight: 700, color: '#fff',
        }}>
          {avatar}
        </div>
      )}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <div style={{
          minWidth: 16, height: 16, borderRadius: 999,
          background: color || TOKENS.primary,
          color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'grid', placeItems: 'center', padding: '0 4px',
        }}>
          {badge}
        </div>
      )}
    </button>
  );
}

function ScopeSelector({ profesionales, profId, setProfId, allOverrides }: {
  profesionales: any[]; profId: string | null; setProfId: (id: string | null) => void; allOverrides: Override[];
}) {
  if (profesionales.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <ScopeChip label="Todos" active={profId === null} onClick={() => setProfId(null)} />
      {profesionales.map(p => {
        const badge = allOverrides.filter(o => o.professional_id === p.id).length;
        return (
          <ScopeChip
            key={p.id}
            label={p.nombre}
            active={profId === p.id}
            color={p.color}
            badge={badge}
            avatar={p.nombre.substring(0, 2).toUpperCase()}
            onClick={() => setProfId(p.id)}
          />
        );
      })}
    </div>
  );
}

function ScopeHelpCard({ prof }: { prof: { nombre: string; color: string } }) {
  return (
    <div style={{ background: `${prof.color}0d`, border: `1px solid ${prof.color}33`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `linear-gradient(135deg, ${prof.color}cc, ${prof.color})`,
          display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
        }}>
          {prof.nombre.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text }}>{prof.nombre}</div>
          <div style={{ fontSize: 11, color: TOKENS.textSec }}>Modo personalización activo</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: TOKENS.textSec, lineHeight: 1.6, marginBottom: 10 }}>
        Los cambios solo afectan a <span style={{ color: prof.color, fontWeight: 600 }}>{prof.nombre}</span>. El catálogo global no se modifica.
      </div>
      {[
        'Precio y duración propios por servicio',
        'Desactivar servicios que no realiza',
        'Restablecer para volver al catálogo',
      ].map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: TOKENS.textTer, marginTop: 5 }}>
          <div style={{ width: 4, height: 4, borderRadius: 999, background: prof.color, flexShrink: 0 }} />
          {item}
        </div>
      ))}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function BloqueoRow({ bloqueo, last, onDelete }: { bloqueo: any; last: boolean; onDelete: (id: string) => void }) {
  const cfg = TIPO_CONFIG[bloqueo.tipo] || { label: bloqueo.tipo, color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' };
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: last ? 'none' : `1px solid ${TOKENS.border}`, transition: 'background 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 9px', borderRadius: 5, flexShrink: 0 }}>{cfg.label}</span>
          {bloqueo.motivo && <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bloqueo.motivo}</span>}
        </div>
        <div style={{ fontSize: 11, color: TOKENS.textTer }}>{fmt(bloqueo.inicio)} → {fmt(bloqueo.fin)}</div>
      </div>
      <button
        onClick={() => onDelete(bloqueo.id)}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = TOKENS.danger; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; }}
        style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.danger, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 14, transition: 'all 0.2s ease', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

function AddBloqueoModal({ profNombre, onClose, onSave }: { profNombre: string; onClose: () => void; onSave: (b: any) => Promise<void> }) {
  const [tipo, setTipo] = useState('vacaciones');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!inicio || !fin) { alert('Completa la fecha de inicio y fin'); return; }
    if (new Date(fin) <= new Date(inicio)) { alert('La fecha de fin debe ser posterior al inicio'); return; }
    setSaving(true);
    await onSave({ tipo, inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString(), motivo });
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0b1220', border: `1px solid ${TOKENS.border}`, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: 480, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px', borderBottom: `1px solid ${TOKENS.border}` }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>Añadir bloqueo</h3>
            <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 3 }}>{profNombre}</div>
          </div>
          <button
            onClick={onClose}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(148,163,184,0.15)'; e.currentTarget.style.borderColor = TOKENS.textSec; e.currentTarget.style.color = TOKENS.text; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = TOKENS.bgCard; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; e.currentTarget.style.transform = 'scale(1)'; }}
            style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18, transition: 'all 0.15s ease', transform: 'scale(1)' }}
          >✕</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'grid', gap: 18 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>Tipo de bloqueo</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setTipo(key)}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; if (tipo !== key) { e.currentTarget.style.background = 'rgba(148,163,184,0.12)'; e.currentTarget.style.borderColor = cfg.color + '44'; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (tipo !== key) { e.currentTarget.style.background = 'rgba(148,163,184,0.06)'; e.currentTarget.style.borderColor = TOKENS.border; } }}
                  style={{ padding: '7px 13px', borderRadius: 999, background: tipo === key ? cfg.bg : 'rgba(148,163,184,0.06)', border: `1px solid ${tipo === key ? cfg.color + '66' : TOKENS.border}`, color: tipo === key ? cfg.color : TOKENS.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', transform: 'scale(1)' }}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Inicio</div>
              <DateTimePicker value={inicio} onChange={setInicio} />
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Fin</div>
              <DateTimePicker value={fin} onChange={setFin} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Motivo (opcional)</div>
            <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Semana Santa, revisión médica..." style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 22px', borderTop: `1px solid ${TOKENS.border}` }}>
          <button
            onClick={onClose}
            onMouseEnter={e => { e.currentTarget.style.borderColor = TOKENS.textSec; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
            style={{ padding: '9px 16px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
          >Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !inicio || !fin}
            onMouseEnter={e => { if (!saving && inicio && fin) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.6)'; } }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = !inicio || !fin ? 'none' : '0 4px 12px rgba(99,102,241,0.4)'; }}
            style={{ padding: '9px 16px', background: !inicio || !fin || saving ? 'rgba(99,102,241,0.5)' : 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: !inicio || !fin || saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: !inicio || !fin ? 'none' : '0 4px 12px rgba(99,102,241,0.4)', transition: 'all 0.15s ease', transform: 'translateY(0)' }}
          >
            {saving ? 'Guardando...' : 'Guardar bloqueo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: 16, transition: 'all 0.3s ease' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {children}
    </div>
  );
}

function ThemeOption({ name, active }: { name: string; active: boolean }) {
  return (
    <div
      style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${active ? TOKENS.primary : TOKENS.border}`, cursor: 'pointer', transition: 'all 0.2s ease' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? TOKENS.primary : TOKENS.border; }}
    >
      <div style={{ height: 50, background: name === 'Oscuro' ? 'linear-gradient(135deg, #0f172a, #1a2540)' : 'linear-gradient(135deg, #f8fafc, #e2e8f0)', display: 'flex', alignItems: 'flex-end', padding: 6, gap: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: TOKENS.primary }} />
        <div style={{ width: 18, height: 4, borderRadius: 2, background: name === 'Oscuro' ? '#475569' : '#cbd5e1' }} />
      </div>
      <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{name}</span>
        {active && <div style={{ width: 14, height: 14, borderRadius: 999, background: TOKENS.primary, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8 }}>✓</div>}
      </div>
    </div>
  );
}

function Field({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 10 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ background: '#0b1220', border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: TOKENS.text }}>{value}</div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(99,102,241,0.3)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
      style={{ width: 32, height: 18, borderRadius: 999, background: on ? 'rgba(99,102,241,0.30)' : 'rgba(148,163,184,0.18)', position: 'relative', cursor: 'pointer', transition: 'all 0.15s ease', transform: 'scale(1)' }}
    >
      <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: on ? TOKENS.primary : TOKENS.textTer, boxShadow: on ? `0 0 6px ${TOKENS.primary}` : 'none', transition: 'left 0.2s' }} />
    </div>
  );
}

// ─── EditServiceModal ─────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (!service.id || isProfMode) return;
    supabase
      .from('service_addons')
      .select('id, nombre, duracion_min, precio, activo')
      .eq('servicio_id', service.id)
      .order('nombre')
      .then(({ data }) => setAddons(data ?? []));
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
    background: '#0b1220', border: `1px solid ${TOKENS.border}`,
    color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const accentColor = isProfMode ? prof!.color : TOKENS.primary;
  const accentSoft = isProfMode ? `${prof!.color}1a` : 'rgba(99,102,241,0.18)';
  const accentBorder = isProfMode ? `${prof!.color}55` : 'rgba(99,102,241,0.4)';
  const accentText = isProfMode ? prof!.color : TOKENS.primaryHi;

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
      onSave({ ...service, nombre, precio: parseFloat(String(precio)) || 0, duracion_activa_min: durActiva, categoria, duracion_espera_min: espera, duracion_activa_extra_min: activaExtra, min_antelacion_min: minAntelacion });
    }
    setGuardando(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: 520, maxWidth: '100%', maxHeight: '85vh', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px', paddingBottom: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>
            {isProfMode ? `Personalizar · ${service.nombre}` : isNew ? 'Nuevo servicio' : 'Editar servicio'}
          </h3>
          <button
            onClick={onClose}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(148,163,184,0.15)'; e.currentTarget.style.borderColor = TOKENS.textSec; e.currentTarget.style.color = TOKENS.text; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = TOKENS.bgCard; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; e.currentTarget.style.transform = 'scale(1)'; }}
            style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 16, transition: 'all 0.15s ease', transform: 'scale(1)' }}
          >✕</button>
        </div>

        <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, padding: '18px 22px 4px' }}>
          {/* Banner prof */}
          {isProfMode && (
            <div style={{ background: `${prof!.color}14`, border: `1px solid ${prof!.color}33`, borderRadius: 10, padding: '11px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${prof!.color}cc, ${prof!.color})`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                {prof!.nombre.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text }}>{prof!.nombre}</div>
                <div style={{ fontSize: 11, color: TOKENS.textSec }}>Los cambios solo afectan a este profesional</div>
              </div>
            </div>
          )}

          {isProfMode ? (
            <div style={{ display: 'grid', gap: 14, paddingBottom: 4 }}>
              <FormField label="Precio (€)">
                <input value={ovPrecio} onChange={e => setOvPrecio(e.target.value)} placeholder={String(service.precio)} style={inputStyle} />
                {service.precio != null && (
                  <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Catálogo: {service.precio} €</div>
                )}
              </FormField>

              <FormField label="Tiempo activo (min)">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[15, 30, 45, 60, 90].map(m => (
                    <button key={m} onClick={() => setOvDur(m)} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }} style={{ flex: '1 1 calc(20% - 5px)', padding: '8px 6px', borderRadius: 8, background: ovDur === m ? accentSoft : 'rgba(148,163,184,0.06)', border: `1px solid ${ovDur === m ? accentBorder : TOKENS.border}`, color: ovDur === m ? accentText : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', transform: 'scale(1)' }}>
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Catálogo: {catalogActiva} min</div>
              </FormField>

              <FormField label="Tiempo de reposo (min)">
                <input value={ovEspera} onChange={e => setOvEspera(parseInt(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Catálogo: {service.duracion_espera_min || 0} min · útil para coloraciones donde el tinte reposa</div>
              </FormField>

              <FormField label="Tiempo activo extra (min)">
                <input value={ovExtra} onChange={e => setOvExtra(parseInt(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Catálogo: {service.duracion_activa_extra_min || 0} min</div>
              </FormField>

              <FormField label="Estado para este profesional">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div onClick={() => setOvActivo(!ovActivo)} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = `0 0 0 3px ${ovActivo ? 'rgba(99,102,241,0.2)' : 'rgba(148,163,184,0.1)'}`; }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }} style={{ width: 32, height: 18, borderRadius: 999, background: ovActivo ? 'rgba(99,102,241,0.30)' : 'rgba(148,163,184,0.18)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s ease', transform: 'scale(1)' }}>
                    <div style={{ position: 'absolute', top: 2, left: ovActivo ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: ovActivo ? TOKENS.primary : TOKENS.textTer, boxShadow: ovActivo ? `0 0 6px ${TOKENS.primary}` : 'none', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 12, color: ovActivo ? TOKENS.success : TOKENS.textSec, fontWeight: 600 }}>
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
              <FormField label="Categoría">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Corte', 'Color', 'Tratamiento', 'Peinado', 'Otro'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCategoria(c)}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; if (categoria !== c) { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (categoria !== c) { e.currentTarget.style.background = 'rgba(148,163,184,0.06)'; e.currentTarget.style.borderColor = TOKENS.border; } }}
                      style={{ padding: '6px 12px', borderRadius: 999, background: categoria === c ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${categoria === c ? 'rgba(99,102,241,0.4)' : TOKENS.border}`, color: categoria === c ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', transform: 'scale(1)' }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Precio (€)">
                <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="28" style={inputStyle} />
              </FormField>
              <FormField label="Tiempo activo (min)">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[15, 30, 45, 60, 90].map(m => (
                    <button
                      key={m}
                      onClick={() => setDurActiva(m)}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; if (durActiva !== m) { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (durActiva !== m) { e.currentTarget.style.background = 'rgba(148,163,184,0.06)'; e.currentTarget.style.borderColor = TOKENS.border; } }}
                      style={{ flex: '1 1 calc(20% - 5px)', padding: '8px 6px', borderRadius: 8, background: durActiva === m ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${durActiva === m ? 'rgba(99,102,241,0.4)' : TOKENS.border}`, color: durActiva === m ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', transform: 'scale(1)' }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Tiempo de reposo (opcional)">
                <input value={espera} onChange={e => setEspera(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle} />
                <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Útil para coloraciones donde el tinte reposa.</div>
              </FormField>
              <FormField label="Tiempo activo extra (opcional)">
                <input value={activaExtra} onChange={e => setActivaExtra(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle} />
                <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Tiempo activo adicional tras la fase de reposo.</div>
              </FormField>
              <FormField label="Antelacion minima (min)">
                <input value={minAntelacion} onChange={e => setMinAntelacion(parseInt(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Tiempo minimo de antelacion para reservar este servicio. 0 = sin restriccion.</div>
              </FormField>

              {/* Add-ons */}
              {!isNew && (
                <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add-ons opcionales</div>
                  <div style={{ fontSize: 10, color: TOKENS.textTer, marginBottom: 10 }}>Extras que el cliente puede anadir a este servicio. Suman duracion y precio.</div>

                  {addons.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {addons.map((a: any) => editingAddonId === a.id ? (
                        <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: TOKENS.bgCard, borderRadius: 8, border: `1px solid rgba(99,102,241,0.4)` }}>
                          <input
                            value={editAddonNombre}
                            onChange={e => setEditAddonNombre(e.target.value)}
                            placeholder="Nombre"
                            style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: TOKENS.textTer, marginBottom: 3 }}>Duracion (min)</div>
                              <input value={editAddonDur} onChange={e => setEditAddonDur(parseInt(e.target.value) || 0)} placeholder="10" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: TOKENS.textTer, marginBottom: 3 }}>Precio (EUR)</div>
                              <input value={editAddonPrecio} onChange={e => setEditAddonPrecio(e.target.value)} placeholder="8" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setEditingAddonId(null)}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = TOKENS.textSec; e.currentTarget.style.color = TOKENS.text; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; e.currentTarget.style.transform = 'translateY(0)'; }}
                              style={{ padding: '5px 12px', background: 'none', border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
                            >Cancelar</button>
                            <button
                              onClick={async () => {
                                if (!editAddonNombre.trim()) return;
                                const { error } = await supabase.from('service_addons').update({
                                  nombre: editAddonNombre.trim(),
                                  duracion_min: editAddonDur,
                                  precio: parseFloat(editAddonPrecio) || 0,
                                }).eq('id', a.id);
                                if (!error) {
                                  setAddons(prev => prev.map(x => x.id === a.id ? { ...x, nombre: editAddonNombre.trim(), duracion_min: editAddonDur, precio: parseFloat(editAddonPrecio) || 0 } : x));
                                  setEditingAddonId(null);
                                }
                              }}
                              disabled={!editAddonNombre.trim()}
                              onMouseEnter={e => { if (editAddonNombre.trim()) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.5)'; } }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                              style={{ padding: '5px 12px', background: !editAddonNombre.trim() ? 'rgba(99,102,241,0.3)' : 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)', color: '#fff', border: 'none', borderRadius: 6, cursor: !editAddonNombre.trim() ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
                            >Guardar</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={a.id}
                          onClick={() => { setEditingAddonId(a.id); setEditAddonNombre(a.nombre); setEditAddonDur(a.duracion_min); setEditAddonPrecio(String(a.precio)); }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.background = 'rgba(99,102,241,0.04)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = TOKENS.bgCard; }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s ease' }}
                        >
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{a.nombre}</span>
                            <span style={{ fontSize: 10, color: TOKENS.textTer, marginLeft: 8 }}>+{a.duracion_min}min · {a.precio}EUR</span>
                          </div>
                          <button
                            onClick={async (ev) => {
                              ev.stopPropagation();
                              await supabase.from('service_addons').delete().eq('id', a.id);
                              setAddons(prev => prev.filter(x => x.id !== a.id));
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.transform = 'scale(1.15)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
                            style={{ background: 'none', border: 'none', color: TOKENS.danger, cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '2px 6px', borderRadius: 4, transition: 'all 0.15s ease', transform: 'scale(1)' }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!addingAddon ? (
                    <button
                      onClick={() => setAddingAddon(true)}
                      onMouseEnter={e => { e.currentTarget.style.color = TOKENS.primaryHi; e.currentTarget.style.transform = 'translateX(2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = TOKENS.primary; e.currentTarget.style.transform = 'translateX(0)'; }}
                      style={{ background: 'none', border: 'none', color: TOKENS.primary, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, transition: 'all 0.15s ease', transform: 'translateX(0)' }}
                    >
                      + Nuevo add-on
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px', background: TOKENS.bgCard, borderRadius: 8, border: `1px solid ${TOKENS.border}` }}>
                      <input
                        value={newAddonNombre}
                        onChange={e => setNewAddonNombre(e.target.value)}
                        placeholder="Nombre (ej: Hidratacion profunda)"
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: TOKENS.textTer, marginBottom: 3 }}>Duracion (min)</div>
                          <input
                            value={newAddonDur}
                            onChange={e => setNewAddonDur(parseInt(e.target.value) || 0)}
                            placeholder="10"
                            style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: TOKENS.textTer, marginBottom: 3 }}>Precio (EUR)</div>
                          <input
                            value={newAddonPrecio}
                            onChange={e => setNewAddonPrecio(e.target.value)}
                            placeholder="8"
                            style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setAddingAddon(false); setNewAddonNombre(''); setNewAddonDur(10); setNewAddonPrecio(''); }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = TOKENS.textSec; e.currentTarget.style.color = TOKENS.text; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; e.currentTarget.style.transform = 'translateY(0)'; }}
                          style={{ padding: '5px 12px', background: 'none', border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={async () => {
                            if (!newAddonNombre.trim() || !negocioId) return;
                            const { data, error } = await supabase.from('service_addons').insert({
                              negocio_id: negocioId,
                              servicio_id: service.id,
                              nombre: newAddonNombre.trim(),
                              duracion_min: newAddonDur,
                              precio: parseFloat(newAddonPrecio) || 0,
                            }).select().single();
                            if (!error && data) {
                              setAddons(prev => [...prev, data]);
                              setNewAddonNombre('');
                              setNewAddonDur(10);
                              setNewAddonPrecio('');
                              setAddingAddon(false);
                            }
                          }}
                          disabled={!newAddonNombre.trim()}
                          onMouseEnter={e => { if (newAddonNombre.trim()) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.5)'; } }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                          style={{
                            padding: '5px 12px',
                            background: !newAddonNombre.trim() ? 'rgba(99,102,241,0.3)' : 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)',
                            color: '#fff', border: 'none', borderRadius: 6,
                            cursor: !newAddonNombre.trim() ? 'not-allowed' : 'pointer',
                            fontSize: 11, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)',
                          }}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderTop: `1px solid ${TOKENS.border}` }}>
          {isProfMode ? (
            override ? (
              <button
                onClick={() => service.id && onResetOverride?.(service.id)}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = TOKENS.textSec; e.currentTarget.style.color = TOKENS.text; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; }}
                style={{ padding: '9px 14px', background: 'rgba(148,163,184,0.06)', border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
              >
                Restablecer
              </button>
            ) : <span />
          ) : (
            !isNew ? (
              <button
                onClick={() => service.id && onDelete(service.id)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; e.currentTarget.style.borderColor = TOKENS.danger; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = TOKENS.dangerSoft; e.currentTarget.style.borderColor = `${TOKENS.danger}55`; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ padding: '9px 14px', background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.danger}55`, color: TOKENS.danger, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
              >
                Eliminar
              </button>
            ) : <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = TOKENS.textSec; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = TOKENS.border; }}
              style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease', transform: 'translateY(0)' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={guardando}
              onMouseEnter={e => { if (!guardando) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 28px ${accentColor}66`; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 6px 20px ${accentColor}44`; }}
              style={{ padding: '9px 18px', background: isProfMode ? `linear-gradient(180deg, ${accentColor}ee 0%, ${accentColor} 100%)` : 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: guardando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${accentColor}44`, opacity: guardando ? 0.8 : 1, transition: 'all 0.2s ease', transform: 'translateY(0)' }}
            >
              {guardando ? 'Guardando...' : isProfMode ? `Guardar para ${prof!.nombre}` : 'Guardar servicio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
