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
  activo?: boolean;
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

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }
      setNegocioId(profile.negocio_id);
      setBusinessInfo(profile);

      const [{ data: srvData }, { data: profData }] = await Promise.all([
        supabase.from('servicios').select('*').eq('negocio_id', profile.negocio_id).order('categoria'),
        supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre'),
      ]);

      setServicios(srvData ?? []);
      setProfesionales(profData ?? []);
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
      .then(({ data }) => {
        setBloqueos(data ?? []);
        setLoadingBloqueos(false);
      });
  }, [selectedProfHorarios]);

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
    try {
      await supabase.from('servicios').delete().eq('id', id);
      setServicios(services.filter((s) => s.id !== id));
      setEdit(null);
    } catch (error) {
      console.error('Error eliminando servicio:', error);
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
      alert('Error al guardar ausencia: ' + e.message);
    }
  };

  const handleDeleteBloqueo = async (id: string) => {
    try {
      await supabase.from('bloqueos_profesional').delete().eq('id', id);
      setBloqueos(prev => prev.filter(b => b.id !== id));
    } catch (e: any) {
      alert('Error al eliminar ausencia: ' + e.message);
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: TOKENS.text }}>Cargando...</div>;

  const profSelNombre = profesionales.find(p => p.id === selectedProfHorarios)?.nombre ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Configuración</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>Ajusta tu negocio, servicios y preferencias</p>
        </div>
        <button style={{ padding: '9px 14px', background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Guardar cambios
        </button>
      </div>

      {/* Main grid: sidebar + content */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
        {/* Tabs rail */}
        <div style={{ borderRight: `1px solid ${TOKENS.border}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                onMouseEnter={(e) => { e.currentTarget.style.background = active ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.05)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'rgba(99,102,241,0.10)' : 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
                style={{ padding: '10px 12px', borderRadius: 10, textAlign: 'left', background: active ? 'rgba(99,102,241,0.10)' : 'transparent', border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'transparent'}`, color: active ? TOKENS.text : TOKENS.textSec, fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s ease', transform: 'translateX(0)' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body: content + right panel */}
        <div style={{ overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          <div>
            {tab === 'services' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>Servicios del catálogo</h2>
                    <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4 }}>{services.length} servicios activos · agrupados por categoría</div>
                  </div>
                  <button
                    onClick={() => setEdit({ nombre: '', precio: 0, duracion_activa_min: 30, categoria: 'Corte' })}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = `0 8px 32px rgba(99,102,241,0.6)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = `0 6px 20px rgba(99,102,241,0.45)`; }}
                    style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s ease', transform: 'scale(1)' }}
                  >
                    + Nuevo servicio
                  </button>
                </div>
                {services.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: TOKENS.textSec }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>No hay servicios todavía</div>
                    <div style={{ fontSize: 12 }}>Crea tu primer servicio para empezar</div>
                  </div>
                ) : (
                  [...new Set(services.map((s) => s.categoria))].map((cat) => (
                    <div key={cat} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{cat}</span>
                        <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
                        <span>{services.filter((s) => s.categoria === cat).length}</span>
                      </div>
                      <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
                        {services.filter((s) => s.categoria === cat).map((s, i, arr) => (
                          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 80px', padding: '14px 16px', alignItems: 'center', borderBottom: i < arr.length - 1 ? `1px solid ${TOKENS.border}` : 'none', transition: 'all 0.2s ease', background: 'transparent', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; e.currentTarget.style.transform = 'scale(1.01)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.nombre}</div>
                              <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 2 }}>SKU-{s.id?.toUpperCase()}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: TOKENS.textSec, fontSize: 12 }}>
                              <span>{s.duracion_activa_min + (s.duracion_espera_min || 0) + (s.duracion_activa_extra_min || 0)} min</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.success }}>{s.precio} €</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 32, height: 18, borderRadius: 999, background: 'rgba(99,102,241,0.30)', position: 'relative' }}>
                                <div style={{ position: 'absolute', top: 2, left: 16, width: 14, height: 14, borderRadius: 999, background: TOKENS.primary, boxShadow: `0 0 6px ${TOKENS.primary}` }} />
                              </div>
                              <span style={{ fontSize: 11, color: TOKENS.success, fontWeight: 600 }}>Activo</span>
                            </div>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <button onClick={() => setEdit(s)} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.borderColor = TOKENS.textSec; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = TOKENS.border; }} style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 16, transition: 'all 0.2s ease', transform: 'scale(1)' }}>⚙</button>
                              <button onClick={() => s.id && handleDeleteService(s.id)} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.borderColor = TOKENS.danger; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = 'transparent'; }} style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.danger, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 16, transition: 'all 0.2s ease', transform: 'scale(1)' }}>✕</button>
                            </div>
                          </div>
                        ))}
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
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>Ausencias del equipo</h2>
                    <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4 }}>
                      Vacaciones, bajas, reuniones y formaciones bloquean la agenda de forma permanente
                    </div>
                  </div>
                  {selectedProfHorarios && (
                    <button
                      onClick={() => setShowAddBloqueo(true)}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = `0 8px 32px rgba(99,102,241,0.6)`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = `0 6px 20px rgba(99,102,241,0.45)`; }}
                      style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s ease', transform: 'scale(1)' }}
                    >
                      + Añadir ausencia
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14 }}>
                  {/* Professional selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {profesionales.length === 0 ? (
                      <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '12px 0' }}>Sin profesionales</div>
                    ) : profesionales.map(p => {
                      const active = selectedProfHorarios === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProfHorarios(p.id)}
                          onMouseEnter={(e) => { e.currentTarget.style.background = active ? `${p.color}22` : 'rgba(99,102,241,0.05)'; e.currentTarget.style.transform = 'translateX(3px)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = active ? `${p.color}18` : 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, background: active ? `${p.color}18` : 'transparent', border: `1px solid ${active ? p.color + '55' : 'transparent'}`, color: active ? TOKENS.text : TOKENS.textSec, fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s ease', transform: 'translateX(0)', textAlign: 'left' }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: 999, background: p.color, flexShrink: 0, boxShadow: active ? `0 0 8px ${p.color}` : 'none' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Blocks list */}
                  <div>
                    {!selectedProfHorarios ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', color: TOKENS.textSec, background: TOKENS.bgCard, borderRadius: 14, border: `1px dashed ${TOKENS.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Selecciona un profesional</div>
                        <div style={{ fontSize: 12, color: TOKENS.textTer, marginTop: 4 }}>para ver y gestionar sus ausencias</div>
                      </div>
                    ) : loadingBloqueos ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', color: TOKENS.textSec }}>Cargando...</div>
                    ) : bloqueos.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', color: TOKENS.textSec, background: TOKENS.bgCard, borderRadius: 14, border: `1px dashed ${TOKENS.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Sin ausencias registradas</div>
                        <div style={{ fontSize: 12, color: TOKENS.textTer, marginTop: 4 }}>Pulsa "Añadir ausencia" para registrar vacaciones, bajas o reuniones</div>
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

          {/* Right panel: settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {edit !== null && <EditServiceModal service={edit} onClose={() => setEdit(null)} onSave={handleSaveService} onDelete={handleDeleteService} />}
      {showAddBloqueo && selectedProfHorarios && (
        <AddBloqueoModal profNombre={profSelNombre} onClose={() => setShowAddBloqueo(false)} onSave={handleAddBloqueo} />
      )}
    </div>
  );
}

function BloqueoRow({ bloqueo, last, onDelete }: { bloqueo: any; last: boolean; onDelete: (id: string) => void }) {
  const cfg = TIPO_CONFIG[bloqueo.tipo] || { label: bloqueo.tipo, color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' };
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: last ? 'none' : `1px solid ${TOKENS.border}`, transition: 'background 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.04)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 9px', borderRadius: 5, flexShrink: 0 }}>{cfg.label}</span>
          {bloqueo.motivo && <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bloqueo.motivo}</span>}
        </div>
        <div style={{ fontSize: 11, color: TOKENS.textTer }}>
          {fmt(bloqueo.inicio)} → {fmt(bloqueo.fin)}
        </div>
      </div>
      <button
        onClick={() => onDelete(bloqueo.id)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = TOKENS.danger; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; }}
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
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>Añadir ausencia</h3>
            <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 3 }}>{profNombre}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ padding: '20px 22px', display: 'grid', gap: 18 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>Tipo de ausencia</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setTipo(key)}
                  style={{ padding: '7px 13px', borderRadius: 999, background: tipo === key ? cfg.bg : 'rgba(148,163,184,0.06)', border: `1px solid ${tipo === key ? cfg.color + '66' : TOKENS.border}`, color: tipo === key ? cfg.color : TOKENS.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
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
          <button onClick={onClose} style={{ padding: '9px 16px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !inicio || !fin}
            style={{ padding: '9px 16px', background: !inicio || !fin || saving ? 'rgba(99,102,241,0.5)' : `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: !inicio || !fin || saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: !inicio || !fin ? 'none' : `0 4px 12px rgba(99,102,241,0.4)` }}
          >
            {saving ? 'Guardando...' : 'Guardar ausencia'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: 16, transition: 'all 0.3s ease', transform: 'scale(1)', cursor: 'default' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.boxShadow = `0 8px 24px rgba(99,102,241,0.15)`; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.boxShadow = 'none'; }}>{children}</div>;
}

function ThemeOption({ name, active }: { name: string; active: boolean }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${active ? TOKENS.primary : TOKENS.border}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s ease', transform: 'scale(1)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; if (!active) e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = active ? TOKENS.primary : TOKENS.border; }}>
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
    <div style={{ width: 32, height: 18, borderRadius: 999, background: on ? 'rgba(99,102,241,0.30)' : 'rgba(148,163,184,0.18)', position: 'relative', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: on ? TOKENS.primary : TOKENS.textTer, boxShadow: on ? `0 0 6px ${TOKENS.primary}` : 'none', transition: 'left 0.2s' }} />
    </div>
  );
}

function EditServiceModal({ service, onClose, onSave, onDelete }: { service: Servicio; onClose: () => void; onSave: (s: Servicio) => void; onDelete: (id: string) => void }) {
  const isNew = !service.id;
  const [nombre, setNombre] = useState(service.nombre || '');
  const [precio, setPrecio] = useState(service.precio || '');
  const [durActiva, setDurActiva] = useState(service.duracion_activa_min || 30);
  const [categoria, setCategoria] = useState(service.categoria || 'Corte');
  const [espera, setEspera] = useState(service.duracion_espera_min || 0);
  const [activaExtra, setActivaExtra] = useState(service.duracion_activa_extra_min || 0);
  const [guardando, setGuardando] = useState(false);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0b1220', border: `1px solid ${TOKENS.border}`, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' };

  const handleSave = async () => {
    if (!nombre.trim()) { alert('El nombre del servicio es requerido'); return; }
    setGuardando(true);
    await new Promise(r => setTimeout(r, 500));
    onSave({ ...service, nombre, precio: parseFloat(String(precio)) || 0, duracion_activa_min: durActiva, categoria, duracion_espera_min: espera, duracion_activa_extra_min: activaExtra });
    setGuardando(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24, animation: 'fadeIn 0.2s ease-out', animationFillMode: 'both' } as any}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .modal-button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
        .modal-button:active { transform: translateY(0); }
      `}</style>
      <div style={{ width: 580, maxWidth: '100%', maxHeight: '85vh', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' as any }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 22, paddingBottom: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>{isNew ? 'Nuevo servicio' : 'Editar servicio'}</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: '18px 22px 22px 22px', flex: 1, boxSizing: 'border-box' as any }}>
          <div style={{ display: 'grid', gap: 14, maxWidth: 480, boxSizing: 'border-box' as any, minWidth: 0 }}>
            <FormField label="Nombre del servicio">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Corte + Barba" style={inputStyle} />
            </FormField>
            <FormField label="Categoría">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Corte', 'Color', 'Tratamiento', 'Peinado', 'Otro'].map((c) => (
                  <button key={c} onClick={() => setCategoria(c)} style={{ padding: '6px 12px', borderRadius: 999, background: categoria === c ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${categoria === c ? 'rgba(99,102,241,0.4)' : TOKENS.border}`, color: categoria === c ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease', transform: 'scale(1)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}>{c}</button>
                ))}
              </div>
            </FormField>
            <FormField label="Precio (€)">
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="28" style={inputStyle} />
            </FormField>
            <FormField label="Tiempo activo (min)">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                {[15, 30, 45, 60, 90].map((m) => (
                  <button key={m} onClick={() => setDurActiva(m)} style={{ flex: '1 1 calc(20% - 5px)', minWidth: 0, padding: '8px 6px', borderRadius: 8, background: durActiva === m ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${durActiva === m ? 'rgba(99,102,241,0.4)' : TOKENS.border}`, color: durActiva === m ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease', transform: 'scale(1)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}>{m}</button>
                ))}
              </div>
            </FormField>
            <FormField label="Tiempo de espera (opcional)">
              <input value={espera} onChange={(e) => setEspera(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle} />
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Útil para coloraciones donde el tinte reposa.</div>
            </FormField>
            <FormField label="Tiempo activo extra (opcional)">
              <input value={activaExtra} onChange={(e) => setActivaExtra(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle} />
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Tiempo activo adicional tras la fase de espera.</div>
            </FormField>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 22, paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
          {!isNew ? (
            <button onClick={() => service.id && onDelete(service.id)} style={{ padding: '9px 14px', background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.danger}55`, color: TOKENS.danger, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Eliminar</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="modal-button" style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s ease' }} onClick={onClose}>Cancelar</button>
            <button className="modal-button" onClick={handleSave} disabled={guardando} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: guardando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, transition: 'all 0.2s ease', opacity: guardando ? 0.8 : 1 }}>
              {guardando ? 'Guardando...' : 'Guardar servicio'}
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
