import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

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

interface Servicio {
  id?: string;
  nombre: string;
  precio: number;
  duracion_activa_min?: number;
  duracion: number;
  categoria: string;
  duracion_espera_min?: number;
  duracion_activa_extra_min?: number;
  activo?: boolean;
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'horarios', label: 'Horarios' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'apariencia', label: 'Apariencia' },
];

export default function ConfiguracionWeb() {
  const [tab, setTab] = useState('servicios');
  const [edit, setEdit] = useState<Servicio | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState('');
  const [businessInfo, setBusinessInfo] = useState<any>(null);

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      setNegocioId(profile.negocio_id);
      setBusinessInfo(profile);

      const { data } = await supabase
        .from('servicios')
        .select('id, nombre, precio, duracion, categoria, duracion_espera_min, duracion_activa_extra_min, activo')
        .eq('negocio_id', profile.negocio_id)
        .order('categoria');

      setServicios(data ?? []);
      setLoading(false);
    }
    cargar();
  }, []);

  const handleSaveService = async (service: Servicio) => {
    if (!negocioId) return;

    try {
      if (service.id) {
        // Editar
        await supabase
          .from('servicios')
          .update(service)
          .eq('id', service.id);
      } else {
        // Crear
        await supabase
          .from('servicios')
          .insert({ ...service, negocio_id: negocioId });
      }

      // Recargar servicios
      const { data } = await supabase
        .from('servicios')
        .select('id, nombre, precio, duracion, categoria, duracion_espera_min, duracion_activa_extra_min, activo')
        .eq('negocio_id', negocioId)
        .order('categoria');

      setServicios(data ?? []);
      setEdit(null);
    } catch (error) {
      console.error('Error guardando servicio:', error);
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      await supabase.from('servicios').delete().eq('id', id);
      setServicios(servicios.filter((s) => s.id !== id));
      setEdit(null);
    } catch (error) {
      console.error('Error eliminando servicio:', error);
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: TOKENS.text }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Configuración</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>Ajusta tu negocio, servicios y preferencias</p>
        </div>
        <button style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Guardar cambios
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
        <div style={{ borderRight: `1px solid ${TOKENS.border}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  textAlign: 'left',
                  background: active ? 'rgba(99,102,241,0.10)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
                  color: active ? TOKENS.text : TOKENS.textSec,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>Servicios del catálogo</h2>
                <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4 }}>{servicios.length} servicios activos · agrupados por categoría</div>
              </div>
              <button style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEdit({ nombre: '', precio: 0, duracion: 30, categoria: 'Corte' })}>
                + Nuevo servicio
              </button>
            </div>

            {servicios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: TOKENS.textSec }}>
                <div style={{ fontSize: 14, marginBottom: 8 }}>No hay servicios todavía</div>
                <div style={{ fontSize: 12 }}>Crea tu primer servicio para empezar</div>
              </div>
            ) : (
              [...new Set(servicios.map((s) => s.categoria))].map((cat) => (
                <div key={cat} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{cat}</span>
                    <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
                    <span>{servicios.filter((s) => s.categoria === cat).length}</span>
                  </div>
                  <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
                    {servicios.filter((s) => s.categoria === cat).map((s, i, arr) => (
                      <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 80px', padding: '14px 16px', alignItems: 'center', borderBottom: i < arr.length - 1 ? `1px solid ${TOKENS.border}` : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{s.nombre}</div>
                          <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 2 }}>SKU-{s.id?.toUpperCase()}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: TOKENS.textSec, fontSize: 12 }}>
                          🕐<span>{s.duracion} min</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.success }}>{s.precio} €</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 18, borderRadius: 999, background: 'rgba(99,102,241,0.30)', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 2, left: 16, width: 14, height: 14, borderRadius: 999, background: TOKENS.primary, boxShadow: `0 0 6px ${TOKENS.primary}` }} />
                          </div>
                          <span style={{ fontSize: 11, color: TOKENS.success, fontWeight: 600 }}>Activo</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEdit(s)} style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                            ✏️
                          </button>
                          <button onClick={() => s.id && handleDeleteService(s.id)} style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.danger, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Apariencia</div>
              <div style={{ fontSize: 11, color: TOKENS.textSec, marginBottom: 14 }}>Modo visual de la app</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ThemeOption name="Oscuro" active />
                <ThemeOption name="Claro" />
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Negocio</div>
              <Field label="Nombre" value={businessInfo?.business_name || '-'} />
              <Field label="Email" value={businessInfo?.email || '-'} />
              <Field label="Teléfono" value={businessInfo?.phone || '-'} />
              <Field label="Código postal" value={businessInfo?.codigo_postal || '-'} last />
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
    </div>
  );
}

function Card({ children }: any) {
  return <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: 16 }}>{children}</div>;
}

function ThemeOption({ name, active }: any) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${active ? TOKENS.primary : TOKENS.border}`, cursor: 'pointer', position: 'relative' }}>
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

function Field({ label, value, last }: any) {
  return (
    <div style={{ marginBottom: last ? 0 : 10 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ background: '#0b1220', border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: TOKENS.text }}>{value}</div>
    </div>
  );
}

function Toggle({ on }: any) {
  return (
    <div style={{ width: 32, height: 18, borderRadius: 999, background: on ? 'rgba(99,102,241,0.30)' : 'rgba(148,163,184,0.18)', position: 'relative', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: on ? TOKENS.primary : TOKENS.textTer, boxShadow: on ? `0 0 6px ${TOKENS.primary}` : 'none', transition: 'left 0.2s' }} />
    </div>
  );
}

function EditServiceModal({ service, onClose, onSave, onDelete }: any) {
  const isNew = !service.id;
  const [nombre, setNombre] = useState(service.nombre || '');
  const [precio, setPrecio] = useState(service.precio || '');
  const [dur, setDur] = useState(service.duracion || 30);
  const [categoria, setCategoria] = useState(service.categoria || 'Corte');
  const [espera, setEspera] = useState(service.duracion_espera_min || 0);
  const [activaExtra, setActivaExtra] = useState(service.duracion_activa_extra_min || 0);

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0b1220', border: `1px solid ${TOKENS.border}`, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' };

  const handleSave = () => {
    onSave({
      ...service,
      nombre,
      precio: parseInt(precio) || 0,
      duracion: dur,
      categoria,
      duracion_espera_min: espera,
      duracion_activa_extra_min: activaExtra,
    });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: 520, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>{isNew ? 'Nuevo servicio' : 'Editar servicio'}</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 }}>
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <FormField label="Nombre del servicio">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Corte + Barba" style={inputStyle as any} />
          </FormField>
          <FormField label="Categoría">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Corte', 'Color', 'Tratamiento', 'Peinado', 'Otro'].map((c) => (
                <button key={c} onClick={() => setCategoria(c)} style={{ padding: '6px 12px', borderRadius: 999, background: categoria === c ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${categoria === c ? 'rgba(99,102,241,0.4)' : TOKENS.border}`, color: categoria === c ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {c}
                </button>
              ))}
            </div>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Precio (€)">
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="28" style={inputStyle as any} />
            </FormField>
            <FormField label="Duración (min)">
              <div style={{ display: 'flex', gap: 6 }}>
                {[15, 30, 45, 60, 90].map((m) => (
                  <button key={m} onClick={() => setDur(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: dur === m ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${dur === m ? 'rgba(99,102,241,0.4)' : TOKENS.border}`, color: dur === m ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {m}
                  </button>
                ))}
              </div>
            </FormField>
          </div>
          <FormField label="Tiempo de espera (opcional)">
            <input value={espera} onChange={(e) => setEspera(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle as any} />
            <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Útil para coloraciones donde el tinte reposa.</div>
          </FormField>
          <FormField label="Tiempo activo extra (opcional)">
            <input value={activaExtra} onChange={(e) => setActivaExtra(parseInt(e.target.value) || 0)} placeholder="0 min" style={inputStyle as any} />
            <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4 }}>Tiempo activo adicional tras la fase de espera.</div>
          </FormField>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
          {!isNew ? (
            <button onClick={() => onDelete(service.id)} style={{ padding: '9px 14px', background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.danger}55`, color: TOKENS.danger, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              🗑️ Eliminar
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }} onClick={onClose}>
              Cancelar
            </button>
            <button onClick={handleSave} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✓ Guardar servicio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: any) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
