import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

// Iconos SVG simples
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    moreVertical: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

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
};

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  rol?: string;
  citas?: number;
  exp?: string;
}

export default function EquipoWeb() {
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProf, setShowNewProf] = useState(false);
  const [negocioId, setNegocioId] = useState('');

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      setNegocioId(profile.negocio_id);

      const [{ data: profs }, { data: citsData }] = await Promise.all([
        supabase.from('profesionales').select('id, nombre, color, activo, rol').eq('negocio_id', profile.negocio_id).order('nombre'),
        supabase.from('citas').select('id, profesional_id').eq('negocio_id', profile.negocio_id).neq('estado', 'cancelada'),
      ]);

      // Enriquecer profesionales con datos reales de citas
      const enriched = (profs ?? []).map((p) => {
        const profCitas = (citsData ?? []).filter((c) => c.profesional_id === p.id).length;
        return { ...p, citas: profCitas, exp: '' };
      });

      setProfesionales(enriched);
      setSelected(enriched.length > 0 ? enriched[0].id : null);
      setLoading(false);
    }
    cargar();
  }, []);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: TOKENS.text }}>Cargando...</div>;

  const profSel = profesionales.find((p) => p.id === selected);

  const BLOQUES = [
    { tipo: 'vacaciones', label: 'Vacaciones', color: '#f59e0b', desde: 'Lun 26 Oct', hasta: 'Dom 01 Nov', dur: '7 días' },
    { tipo: 'formacion', label: 'Formación', color: '#8b5cf6', desde: 'Vie 23 Oct', hasta: 'Vie 23 Oct', dur: '14:00 - 18:00' },
    { tipo: 'descanso', label: 'Descanso', color: '#10b981', desde: 'Lun (todas)', hasta: '—', dur: 'Día completo · semanal' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Equipo</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>5 profesionales · 4 activos · gestiona disponibilidad y bloqueos</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" size={16} color={TOKENS.text} />
            Horarios base
          </button>
          <button onClick={() => setShowNewProf(true)} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={16} color="#fff" />
            Añadir profesional
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', overflow: 'hidden' }}>
        {/* Cards grid */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {profesionales.map((p) => {
              const isSel = p.id === selected;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  style={{
                    background: TOKENS.bgCard,
                    border: `1px solid ${isSel ? `${p.color}66` : TOKENS.border}`,
                    borderRadius: 16,
                    padding: 18,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: isSel ? `0 0 0 1px ${p.color}66, 0 8px 30px ${p.color}22` : 'none',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.color }} />
                  <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 999, background: `radial-gradient(circle, ${p.color}22, transparent 70%)` }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, position: 'relative' }}>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 999,
                        background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 16,
                        boxShadow: `0 4px 12px ${p.color}55, 0 0 0 1px rgba(255,255,255,0.06)`,
                      }}
                    >
                      {p.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{p.nombre}</div>
                        {!p.activo && <Pill color={TOKENS.textTer}>Inactivo</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 2 }}>
                        {p.rol} · {p.exp}
                      </div>
                    </div>
                    <button
                      onClick={() => console.log('Opciones de', p.nombre)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: 'transparent',
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textTer,
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name="moreVertical" size={16} color={TOKENS.textTer} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: 'rgba(148,163,184,0.06)', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, fontWeight: 600 }}>CITAS / MES</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{p.citas}</div>
                    </div>
                    <div style={{ background: 'rgba(148,163,184,0.06)', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, fontWeight: 600 }}>OCUPACIÓN</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: p.activo ? TOKENS.success : TOKENS.textTer }}>
                        {p.activo ? `${Math.min(95, 50 + (p.citas || 0))}%` : '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 32 }}>
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => {
                      const h = p.activo ? [60, 80, 50, 95, 70, 40, 0][i] : 0;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <div style={{ width: '100%', height: 24, borderRadius: 4, background: 'rgba(148,163,184,0.08)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${h}%`, background: p.color, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 9, color: TOKENS.textTer, fontWeight: 600 }}>{d}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Add card */}
            <div
              onClick={() => setShowNewProf(true)}
              style={{
                background: 'transparent',
                border: `1.5px dashed ${TOKENS.borderHi}`,
                borderRadius: 16,
                padding: 18,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
                gap: 8,
                color: TOKENS.textSec,
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 999, background: TOKENS.primarySoft, color: TOKENS.primaryHi, display: 'grid', placeItems: 'center' }}>
                <Icon name="plus" size={24} color={TOKENS.primaryHi} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>Añadir profesional</div>
              <div style={{ fontSize: 11, color: TOKENS.textTer }}>Estilista, barbero, colorista…</div>
            </div>
          </div>
        </div>

        {/* Right: blocks panel */}
        {profSel && selected && (
          <div style={{ borderLeft: `1px solid ${TOKENS.border}`, padding: 24, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${profSel.color}, ${profSel.color}aa)`,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  boxShadow: `0 4px 12px ${profSel.color}55`,
                }}
              >
                {profSel.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{profSel.nombre}</div>
                <div style={{ fontSize: 11, color: TOKENS.textSec }}>{profSel.rol}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 18 }}>Disponibilidad y bloqueos en el calendario.</div>

            {/* Horario base */}
            <Section title="Horario base">
              <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {[
                  { d: 'Lun', h: '9-18' },
                  { d: 'Mar', h: '9-18' },
                  { d: 'Mié', h: '9-18' },
                  { d: 'Jue', h: '10-20' },
                  { d: 'Vie', h: '9-20' },
                  { d: 'Sáb', h: '9-15' },
                  { d: 'Dom', h: null },
                ].map((x, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: x.h ? 'rgba(99,102,241,0.10)' : 'rgba(148,163,184,0.05)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: x.h ? TOKENS.primaryHi : TOKENS.textTer }}>{x.d}</div>
                    <div style={{ fontSize: 9, color: x.h ? TOKENS.textSec : TOKENS.textTer, marginTop: 2 }}>{x.h || 'Cerrado'}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Bloques header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>Bloqueos próximos</div>
              <button
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: TOKENS.primaryHi,
                  background: 'rgba(99,102,241,0.10)',
                  border: `1px solid rgba(99,102,241,0.25)`,
                  padding: '5px 10px',
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                + Nuevo
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {BLOQUES.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: 12, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12 }}>
                  <div style={{ width: 4, borderRadius: 2, background: b.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Pill color={b.color}>{b.label}</Pill>
                      <span style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}>{b.dur}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>
                      {b.desde}
                      {b.hasta !== '—' ? ` → ${b.hasta}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => console.log('Opciones de bloqueo')}
                    style={{
                      width: 24,
                      height: 24,
                      alignSelf: 'center',
                      borderRadius: 6,
                      background: 'transparent',
                      border: 'none',
                      color: TOKENS.textTer,
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Icon name="moreVertical" size={16} color={TOKENS.textTer} />
                  </button>
                </div>
              ))}
            </div>

            {/* Tipos de bloqueo */}
            <Section title="Tipos de bloqueo">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { l: 'Vacaciones', c: '#f59e0b' },
                  { l: 'Formación', c: '#8b5cf6' },
                  { l: 'Reunión', c: '#3b82f6' },
                  { l: 'Baja', c: '#ef4444' },
                  { l: 'Descanso', c: '#10b981' },
                  { l: 'Otro', c: '#94a3b8' },
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: t.c, boxShadow: `0 0 8px ${t.c}66` }} />
                    <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>{t.l}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

      {showNewProf && <NewProfModal onClose={() => setShowNewProf(false)} negocioId={negocioId} onCreated={() => { setShowNewProf(false); location.reload(); }} />}
      </div>
    </div>
  );
}

function NewProfModal({ onClose, negocioId, onCreated }: any) {
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('Estilista');
  const [color, setColor] = useState('#6366f1');
  const [loading, setLoading] = useState(false);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      alert('Por favor ingresa el nombre del profesional');
      return;
    }

    setLoading(true);
    try {
      await supabase.from('profesionales').insert({
        negocio_id: negocioId,
        nombre: nombre.trim(),
        rol: rol.trim(),
        color: color,
        activo: true,
      });

      onCreated();
    } catch (error) {
      console.error('Error creando profesional:', error);
      alert('Error al crear el profesional');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: 420, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>Nuevo profesional</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 }}>
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Nombre*</div>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Carla Mendoza"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Rol*</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {['Estilista', 'Barbero', 'Colorista', 'Recepción'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRol(r)}
                  style={{
                    padding: '8px 12px',
                    background: rol === r ? 'rgba(99,102,241,0.18)' : TOKENS.bgCard,
                    border: `1px solid ${rol === r ? 'rgba(99,102,241,0.4)' : TOKENS.border}`,
                    borderRadius: 8,
                    color: rol === r ? TOKENS.primaryHi : TOKENS.text,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Color*</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: c,
                    border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                    cursor: 'pointer',
                    boxShadow: `0 0 8px ${c}66`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 14px',
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.text,
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={loading}
            style={{
              padding: '9px 14px',
              background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: `0 6px 20px rgba(99,102,241,0.45)`,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Creando...' : 'Crear profesional'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, color = TOKENS.primary }: any) {
  const bg = `${color}22`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, background: bg, color: color, fontSize: 11, fontWeight: 600, letterSpacing: 0.2, border: `1px solid ${color}33` }}>
      {children}
    </span>
  );
}

function Section({ title, children }: any) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
