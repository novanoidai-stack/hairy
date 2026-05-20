import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';

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
  categoria?: string;
  ocupacion?: number;
  dayPcts?: number[];
}

const ANIMATIONS = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(24px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }
  .equipo-card {
    animation: slideInUp 0.55s cubic-bezier(0.16,1,0.3,1) both;
  }
  .equipo-panel {
    animation: slideInRight 0.5s cubic-bezier(0.16,1,0.3,1) both;
  }
  .equipo-topbar {
    animation: fadeIn 0.5s ease both;
  }
  .equipo-section {
    animation: fadeIn 0.5s ease both;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.15; }
  }
`;

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  vacaciones: { label: 'Vacaciones', color: '#f59e0b' },
  formacion:  { label: 'Formación',  color: '#8b5cf6' },
  reunion:    { label: 'Reunión',    color: '#3b82f6' },
  baja:       { label: 'Baja',       color: '#ef4444' },
  descanso:   { label: 'Descanso',   color: '#10b981' },
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// dia_semana en BD: 0=Dom,1=Lun…6=Sáb → índice display: Lun=1,Mar=2,Mié=3,Jue=4,Vie=5,Sáb=6,Dom=0
const DB_DIA_TO_IDX: Record<number, number> = { 1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 0:6 };

function fmtHora(h: string) { return h?.slice(0, 5) ?? ''; }
function fmtFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function EquipoWeb() {
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProf, setShowNewProf] = useState(false);
  const [negocioId, setNegocioId] = useState('');
  const [horarios, setHorarios] = useState<any[]>([]);
  const [bloqueos, setBloqueos] = useState<any[]>([]);

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      const negocioId = profile?.negocio_id ?? NEGOCIO_ID_FALLBACK;
      setNegocioId(negocioId);

      const now = new Date();
      const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const mesFin = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const [{ data: profsRaw }, { data: citsData }] = await Promise.all([
        supabase.from('profesionales').select('id, nombre, color, activo, categoria').eq('negocio_id', negocioId),
        supabase.from('citas').select('id, profesional_id, inicio')
          .eq('negocio_id', negocioId)
          .neq('estado', 'cancelada')
          .gte('inicio', mesInicio)
          .lte('inicio', mesFin),
      ]);
      const profs = profsRaw ? [...profsRaw].sort((a, b) => a.nombre.localeCompare(b.nombre)) : null;

      const totalCitas = (citsData ?? []).length;

      const enriched = (profs ?? []).map((p) => {
        const profCitas = (citsData ?? []).filter((c) => c.profesional_id === p.id);
        const citas = profCitas.length;

        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        profCitas.forEach((c) => {
          const dow = new Date(c.inicio).getDay();
          const idx = dow === 0 ? 6 : dow - 1;
          dayCounts[idx]++;
        });
        const maxDay = Math.max(...dayCounts, 1);
        const dayPcts = dayCounts.map((d) => Math.round((d / maxDay) * 100));

        const ocupacion = totalCitas > 0 ? Math.round((citas / totalCitas) * 100) : 0;

        return { ...p, citas, dayPcts, ocupacion, exp: '' };
      });

      setProfesionales(enriched);
      setSelected(enriched.length > 0 ? enriched[0].id : null);
      setLoading(false);
    }
    cargar();
  }, []);

  useEffect(() => {
    if (!selected) return;
    async function cargarPanelDerecho() {
      const [{ data: hor }, { data: bloq }] = await Promise.all([
        supabase.from('horarios_profesional').select('dia_semana, hora_inicio, hora_fin, activo').eq('profesional_id', selected),
        supabase.from('bloqueos_profesional').select('id, tipo, inicio, fin, motivo, recurrencia')
          .eq('profesional_id', selected)
          .gte('fin', new Date().toISOString())
          .order('inicio', { ascending: true })
          .limit(5),
      ]);
      setHorarios(hor ?? []);
      setBloqueos(bloq ?? []);
    }
    cargarPanelDerecho();
  }, [selected]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style>{ANIMATIONS}</style>
      <div className="equipo-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Equipo</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>Cargando...</p>
        </div>
      </div>
      <div style={{ flex: 1, padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignContent: 'start' }}>
        {[1,2,3].map((i) => (
          <div key={i} style={{ background: TOKENS.bgCard, borderRadius: 16, height: 200, opacity: 0.4, animation: 'pulse 1.5s ease infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );

  const profSel = profesionales.find((p) => p.id === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style>{ANIMATIONS}</style>
      {/* Topbar */}
      <div className="equipo-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Equipo</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>5 profesionales · 4 activos · gestiona disponibilidad y bloqueos</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="m-btn-secondary"
            style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" size={16} color={TOKENS.text} />
            Horarios base
          </button>
          <button
            className="m-btn-primary"
            onClick={() => setShowNewProf(true)}
            style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(99,102,241,0.45)`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={16} color="#fff" />
            Añadir profesional
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', overflow: 'hidden' }}>
        {/* Cards grid */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '1fr', gap: 16 }}>
            {profesionales.map((p, idx) => {
              const isSel = p.id === selected;
              return (
                <div
                  key={p.id}
                  className="equipo-card"
                  onClick={() => setSelected(p.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'; e.currentTarget.style.boxShadow = `0 12px 40px ${p.color}33, 0 0 0 1px ${p.color}44`; e.currentTarget.style.borderColor = `${p.color}88`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = isSel ? `0 0 0 1px ${p.color}66, 0 8px 30px ${p.color}22` : 'none'; e.currentTarget.style.borderColor = isSel ? `${p.color}66` : TOKENS.border; }}
                  style={{
                    background: TOKENS.bgCard,
                    border: `1px solid ${isSel ? `${p.color}66` : TOKENS.border}`,
                    borderRadius: 16,
                    padding: '18px 18px 10px 18px',
                    animationDelay: `${idx * 0.1}s`,
                    transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease, border-color 0.2s ease',
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
                        {CATEGORIAS_PROF.find(c => c.value === p.categoria)?.label || 'Oficial'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(148,163,184,0.12)'; e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; }}
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
                        transition: 'background 0.15s ease, border-color 0.15s ease',
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
                        {p.activo ? `${p.ocupacion}%` : '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 32, marginTop: 18 }}>
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => {
                      const h = p.activo ? (p.dayPcts?.[i] ?? 0) : 0;
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
              onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.primarySoft; e.currentTarget.style.borderColor = `rgba(99,102,241,0.4)`; e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.borderHi; e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
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
                gap: 8,
                color: TOKENS.textSec,
                transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), background 0.2s ease, border-color 0.2s ease',
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 999, background: TOKENS.primarySoft, color: TOKENS.primaryHi, display: 'grid', placeItems: 'center' }}>
                <Icon name="plus" size={24} color={TOKENS.primaryHi} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>Añadir profesional</div>
              <div style={{ fontSize: 11, color: TOKENS.textTer }}>Estilista, colorista, esteticista…</div>
            </div>
          </div>
        </div>

        {/* Right: blocks panel */}
        {profSel && selected && (
          <div className="equipo-panel" style={{ borderLeft: `1px solid ${TOKENS.border}`, padding: 24, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)' }}>
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
                <div style={{ fontSize: 11, color: TOKENS.textSec }}>Profesional</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 18 }}>Disponibilidad y bloqueos en el calendario.</div>

            {/* Horario base */}
            <Section title="Horario base">
              <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {DIAS_SEMANA.map((dia, i) => {
                  // i=0→Lun(db=1), i=1→Mar(db=2)… i=6→Dom(db=0)
                  const dbDia = i === 6 ? 0 : i + 1;
                  const h = horarios.find((x) => x.dia_semana === dbDia && x.activo);
                  const label = h ? `${fmtHora(h.hora_inicio)}-${fmtHora(h.hora_fin)}` : null;
                  return (
                    <div key={i}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = label ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = label ? 'rgba(99,102,241,0.10)' : 'rgba(148,163,184,0.05)'; }}
                      style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: label ? 'rgba(99,102,241,0.10)' : 'rgba(148,163,184,0.05)', transition: 'transform 0.15s ease, background 0.15s ease', cursor: 'default' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: label ? TOKENS.primaryHi : TOKENS.textTer }}>{dia}</div>
                      <div style={{ fontSize: 9, color: label ? TOKENS.textSec : TOKENS.textTer, marginTop: 2 }}>{label || 'Cerrado'}</div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Bloques header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>Bloqueos próximos</div>
              <button
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; e.currentTarget.style.background = 'rgba(99,102,241,0.18)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(99,102,241,0.35)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; e.currentTarget.style.boxShadow = 'none'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; }}
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
                  transition: 'transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                + Nuevo
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {bloqueos.length === 0 && (
                <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin bloqueos próximos</div>
              )}
              {bloqueos.map((b) => {
                const cfg = TIPO_CONFIG[b.tipo] ?? { label: b.tipo, color: '#94a3b8' };
                const mismodia = new Date(b.inicio).toDateString() === new Date(b.fin).toDateString();
                const fechaStr = mismodia
                  ? fmtFecha(b.inicio)
                  : `${fmtFecha(b.inicio)} → ${fmtFecha(b.fin)}`;
                const horaStr = mismodia
                  ? `${new Date(b.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${new Date(b.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                  : '';
                return (
                <div key={b.id}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(148,163,184,0.06)'; e.currentTarget.style.borderColor = 'rgba(148,163,184,0.18)'; e.currentTarget.style.transform = 'translateX(3px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = TOKENS.bgCard; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateX(0)'; }}
                  style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: 12, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.15s ease' }}>
                  <div style={{ width: 4, borderRadius: 2, background: cfg.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Pill color={cfg.color}>{cfg.label}</Pill>
                      {horaStr && <span style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}>{horaStr}</span>}
                      {b.recurrencia && <span style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}>· {b.recurrencia}</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{fechaStr}</div>
                    {b.motivo && <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>{b.motivo}</div>}
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
                );
              })}
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

const CATEGORIAS_PROF = [
  { value: 'auxiliar',        label: 'Auxiliar' },
  { value: 'oficial',         label: 'Oficial' },
  { value: 'oficial_mayor',   label: 'Oficial Mayor' },
  { value: 'estilista_senior',label: 'Estilista Senior' },
  { value: 'direccion',       label: 'Direccion' },
];

function NewProfModal({ onClose, negocioId, onCreated }: any) {
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [categoria, setCategoria] = useState('oficial');
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
        color: color,
        categoria: categoria,
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
            x
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
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Categoria*</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIAS_PROF.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoria(cat.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: categoria === cat.value ? 'rgba(99,102,241,0.18)' : TOKENS.bgCard,
                    border: `1px solid ${categoria === cat.value ? 'rgba(99,102,241,0.5)' : TOKENS.border}`,
                    color: categoria === cat.value ? '#818cf8' : TOKENS.textSec,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {cat.label}
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
