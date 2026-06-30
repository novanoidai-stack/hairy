import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { supabase } from '@/lib/supabase';
import { getUserProfile, can } from '@/lib/auth';
import { NEGOCIO_ID_FALLBACK } from '@/lib/constants';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';


// Iconos SVG simples
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    moreVertical: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    arrowLeft: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    phone: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    mail: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>`,
    percent: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  success: '#0f9d6b',
};

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  profile_id?: string | null;
  rol?: string;
  citas?: number;
  exp?: string;
  categoria?: string;
  especialidades?: string[];
  comision_pct?: number;
  tipo_relacion?: string;
  telefono?: string;
  email?: string;
  ocupacion?: number;
  dayPcts?: number[];
  ingresos?: number;
  ticketMedio?: number;
  comisionesDevengadas?: number;
  clientesUnicos?: number;
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
  @media (max-width: 1100px) {
    .equipo-detail-grid { grid-template-columns: 1fr !important; }
  }
`;

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  vacaciones: { label: 'Vacaciones', color: '#e08a00' },
  formacion:  { label: 'Formación',  color: '#c0260a' },
  reunion:    { label: 'Reunión',    color: '#3b82f6' },
  baja:       { label: 'Baja',       color: '#e23b34' },
  descanso:   { label: 'Descanso',   color: '#0f9d6b' },
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// dia_semana en BD: 0=Dom,1=Lun…6=Sáb → índice display: Lun=1,Mar=2,Mié=3,Jue=4,Vie=5,Sáb=6,Dom=0
const DB_DIA_TO_IDX: Record<number, number> = { 1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 0:6 };

function fmtHora(h: string) { return h?.slice(0, 5) ?? ''; }
function fmtFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtRecurrencia(json: string | null): string | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json);
    const diasNombres: Record<number, string> = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mie', 4: 'Jue', 5: 'Vie', 6: 'Sab' };
    const freq = r.frecuencia === 'diaria' ? 'Diaria' : r.frecuencia === 'semanal' ? 'Semanal' : r.frecuencia === 'bisemanal' ? 'Bisemanal' : 'Mensual';
    if ((r.frecuencia === 'semanal' || r.frecuencia === 'bisemanal') && r.dias_semana?.length) {
      return `${freq} (${r.dias_semana.map((d: number) => diasNombres[d] ?? d).join(', ')})`;
    }
    if (r.frecuencia === 'mensual' && r.dia_mes) return `${freq} (dia ${r.dia_mes})`;
    return freq;
  } catch { return null; }
}

export default function EquipoWeb() {
  const { isMobile, isTablet } = useResponsive();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showNewProf, setShowNewProf] = useState(false);
  const [showNewBloqueo, setShowNewBloqueo] = useState(false);
  const [negocioId, setNegocioId] = useState('');
  const [horarios, setHorarios] = useState<any[]>([]);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  // Horario editor
  const [editDia, setEditDia] = useState<number | null>(null); // dia_semana DB (0-6)
  const [editTurno, setEditTurno] = useState<1 | 2>(1);
  const [editHIni, setEditHIni] = useState('09:00');
  const [editHFin, setEditHFin] = useState('18:00');
  const [savingHorario, setSavingHorario] = useState(false);
  // Bloqueo context menu
  const [menuBloqueoId, setMenuBloqueoId] = useState<string | null>(null);
  const [editBloqueo, setEditBloqueo] = useState<any | null>(null);
  // Card context menu + edit
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const [editingProf, setEditingProf] = useState<Profesional | null>(null);

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      // Gating de rol: solo recepcion/direccion/propietario gestionan equipo
      // (Modular 3). Defensivo: sin perfil real no se bloquea (demo/fallback).
      if (profile && !can(profile, 'equipo.ver')) { setAccessDenied(true); setLoading(false); return; }
      const negocioId = profile?.negocio_id ?? NEGOCIO_ID_FALLBACK;
      setNegocioId(negocioId);

      const now = new Date();
      const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const mesFin = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const [{ data: profsRaw }, { data: citsData }, { data: srvData }] = await Promise.all([
        supabase.from('profesionales').select('id, nombre, color, activo, categoria, especialidades, comision_pct, tipo_relacion, telefono, email, profile_id').eq('negocio_id', negocioId),
        supabase.from('citas').select('id, profesional_id, cliente_id, servicio_id, inicio, estado')
          .eq('negocio_id', negocioId)
          .gte('inicio', mesInicio)
          .lte('inicio', mesFin),
        supabase.from('servicios').select('id, precio').eq('negocio_id', negocioId),
      ]);
      const profs = profsRaw ? [...profsRaw].sort((a, b) => a.nombre.localeCompare(b.nombre)) : null;
      const srvMap: Record<string, number> = {};
      (srvData ?? []).forEach((s: any) => { srvMap[s.id] = s.precio ?? 0; });

      const confirmedCitas = (citsData ?? []).filter((c: any) => c.estado === 'confirmada' || c.estado === 'completada');
      const totalCitas = confirmedCitas.length;

      const enriched = (profs ?? []).map((p) => {
        const profCitas = confirmedCitas.filter((c: any) => c.profesional_id === p.id);
        const citas = profCitas.length;

        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        profCitas.forEach((c: any) => {
          const dow = new Date(c.inicio).getDay();
          const idx = dow === 0 ? 6 : dow - 1;
          dayCounts[idx]++;
        });
        const maxDay = Math.max(...dayCounts, 1);
        const dayPcts = dayCounts.map((d) => Math.round((d / maxDay) * 100));

        const ocupacion = totalCitas > 0 ? Math.round((citas / totalCitas) * 100) : 0;

        // Metricas
        const ingresos = profCitas.reduce((sum: number, c: any) => sum + (srvMap[c.servicio_id] ?? 0), 0);
        const ticketMedio = citas > 0 ? Math.round(ingresos / citas) : 0;
        const comisionPct = p.comision_pct ?? 0;
        const comisionesDevengadas = Math.round(ingresos * comisionPct / 100);
        const clientesUnicos = new Set(profCitas.map((c: any) => c.cliente_id).filter(Boolean)).size;

        return { ...p, citas, dayPcts, ocupacion, ingresos, ticketMedio, comisionesDevengadas, clientesUnicos, exp: '' };
      });

      setProfesionales(enriched);
      // No auto-abrir: el grid de miembros queda a pantalla completa hasta que se pulse uno.
      setLoading(false);
    }
    cargar();
  }, []);

  async function toggleActivo(prof: Profesional) {
    await supabase.from('profesionales').update({ activo: !prof.activo }).eq('id', prof.id);
    setProfesionales(prev => prev.map(p => p.id === prof.id ? { ...p, activo: !p.activo } : p));
    setMenuCardId(null);
  }

  async function cargarPanelDerecho(profId?: string) {
    const id = profId ?? selected;
    if (!id) return;
    const [{ data: hor }, { data: bloq }] = await Promise.all([
      supabase.from('horarios_profesional').select('id, dia_semana, hora_inicio, hora_fin, turno').eq('profesional_id', id),
      supabase.from('bloqueos_profesional').select('id, tipo, inicio, fin, motivo, recurrencia, recurrencia_padre_id')
        .eq('profesional_id', id)
        .gte('fin', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('inicio', { ascending: true })
        .limit(10),
    ]);
    setHorarios(hor ?? []);
    setBloqueos(bloq ?? []);
    setEditDia(null);
    setMenuBloqueoId(null);
  }

  useEffect(() => {
    if (!selected) return;
    cargarPanelDerecho(selected);
  }, [selected]);

  // Deep-link desde el onboarding (?focus=horarios): abre la ficha del primer
  // profesional activo para que el dueno configure su horario sin tener que buscarlo.
  const focusParams = useLocalSearchParams<{ focus?: string }>();
  const focusHandled = useRef(false);
  useEffect(() => {
    if (focusHandled.current) return;
    const f = Array.isArray(focusParams.focus) ? focusParams.focus[0] : focusParams.focus;
    if (f === 'horarios' && profesionales.length > 0) {
      focusHandled.current = true;
      const target = profesionales.find((p) => p.activo) ?? profesionales[0];
      if (target) setSelected(target.id);
    }
  }, [focusParams.focus, profesionales]);

  if (accessDenied) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: TOKENS.bg, color: TOKENS.textSec, flexDirection: 'column', gap: 8, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>Acceso restringido</div>
      <div style={{ fontSize: 13 }}>Solo recepcion y direccion pueden ver la gestion de equipo.</div>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style>{ANIMATIONS}</style>
      <div className="equipo-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Equipo</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>Cargando...</p>
        </div>
      </div>
      <div style={{ flex: 1, padding: isMobile ? 16 : 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'), gap: 16, alignContent: 'start' }}>
        {[1,2,3].map((i) => (
          <div key={i} style={{ background: TOKENS.bgCard, borderRadius: 16, height: 200, opacity: 0.4, animation: 'pulse 1.5s ease infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );

  const profSel = profesionales.find((p) => p.id === selected);

  const DIAS_SEMANA_FULL = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

  function openEditDia(dbDia: number, turno: 1 | 2 = 1) {
    const existing = horarios.find((x) => x.dia_semana === dbDia && (x.turno ?? 1) === turno);
    if (existing) {
      setEditHIni(fmtHora(existing.hora_inicio));
      setEditHFin(fmtHora(existing.hora_fin));
    } else {
      setEditHIni(turno === 2 ? '16:00' : '09:00');
      setEditHFin(turno === 2 ? '20:00' : '14:00');
    }
    setEditTurno(turno);
    setEditDia(dbDia);
  }

  function adjustEditH(field: 'ini' | 'fin', hDelta: number, mDelta: number) {
    const setter = field === 'ini' ? setEditHIni : setEditHFin;
    const current = field === 'ini' ? editHIni : editHFin;
    const [hh, mm] = current.split(':').map(Number);
    let nh = hh + hDelta;
    let nm = mm + mDelta;
    if (nm >= 60) { nm -= 60; nh++; }
    if (nm < 0) { nm += 60; nh--; }
    if (nh < 0) nh = 0;
    if (nh > 23) nh = 23;
    setter(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);
  }

  async function guardarHorario() {
    if (!selected || editDia === null) return;
    setSavingHorario(true);
    const existing = horarios.find((x) => x.dia_semana === editDia && (x.turno ?? 1) === editTurno);
    if (existing) {
      await supabase.from('horarios_profesional')
        .update({ hora_inicio: editHIni, hora_fin: editHFin })
        .eq('id', existing.id);
    } else {
      await supabase.from('horarios_profesional').insert({
        profesional_id: selected,
        dia_semana: editDia,
        turno: editTurno,
        hora_inicio: editHIni,
        hora_fin: editHFin,
      });
    }
    setSavingHorario(false);
    setEditDia(null);
    await cargarPanelDerecho();
  }

  async function cerrarTurno() {
    if (!selected || editDia === null) return;
    const existing = horarios.find((x) => x.dia_semana === editDia && (x.turno ?? 1) === editTurno);
    if (existing) {
      await supabase.from('horarios_profesional').delete().eq('id', existing.id);
    }
    setEditDia(null);
    await cargarPanelDerecho();
  }

  async function cerrarDia() {
    if (!selected || editDia === null) return;
    const diaHorarios = horarios.filter((x) => x.dia_semana === editDia);
    for (const h of diaHorarios) {
      await supabase.from('horarios_profesional').delete().eq('id', h.id);
    }
    setEditDia(null);
    await cargarPanelDerecho();
  }

  async function eliminarBloqueo(bloqId: string) {
    await supabase.from('bloqueos_profesional').delete().eq('id', bloqId);
    await cargarPanelDerecho();
  }

  async function eliminarSerieBloqueo(bloq: any) {
    const padreId = bloq.recurrencia_padre_id ?? bloq.id;
    await supabase.from('bloqueos_profesional').delete().or(`id.eq.${padreId},recurrencia_padre_id.eq.${padreId}`);
    await cargarPanelDerecho();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style>{ANIMATIONS}</style>
      {/* Topbar */}
      <div className="equipo-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '12px 16px' : '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 700, letterSpacing: -0.4 }}>Equipo</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: isMobile ? 12 : 13, color: TOKENS.textSec }}>
            {isMobile ? 'Profesionales y disponibilidad' : '5 profesionales · 4 activos · gestiona disponibilidad y bloqueos'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="m-btn-secondary"
            style={{ padding: isMobile ? '8px 10px' : '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" size={16} color={TOKENS.text} />
            {isMobile ? 'Horarios' : 'Horarios base'}
          </button>
          <button
            className="m-btn-primary"
            onClick={() => setShowNewProf(true)}
            style={{ padding: isMobile ? '8px 10px' : '9px 14px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px rgba(244,80,30,0.45)`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={16} color="#fff" />
            {isMobile ? 'Añadir' : 'Añadir profesional'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Cards grid — visible cuando no hay miembro seleccionado */}
        {!(profSel && selected) && (
        <div style={{ overflowY: 'auto', padding: isMobile ? '12px 12px 88px' : 24, height: '100%' }}>
          <div onClick={() => menuCardId && setMenuCardId(null)} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'), gap: isMobile ? 12 : 16 }}>
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
                    padding: isMobile ? '14px 14px 8px 14px' : '18px 18px 10px 18px',
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 14, marginBottom: isMobile ? 12 : 14, position: 'relative' }}>
                    <div
                      style={{
                        width: isMobile ? 44 : 52,
                        height: isMobile ? 44 : 52,
                        borderRadius: 999,
                        background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: isMobile ? 14 : 16,
                        flexShrink: 0,
                        boxShadow: `0 4px 12px ${p.color}55, 0 0 0 1px rgba(255,255,255,0.06)`,
                      }}
                    >
                      {p.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{p.nombre}</div>
                        {!p.activo && <Pill color={TOKENS.textTer}>Inactivo</Pill>}
                        {!p.profile_id && <Pill color="#e08a00">Sin cuenta</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 2 }}>
                        {CATEGORIAS_PROF.find(c => c.value === p.categoria)?.label || 'Oficial'}
                      </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuCardId(menuCardId === p.id ? null : p.id); }}
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
                      {menuCardId === p.id && (
                        <div style={{ position: 'absolute', right: 0, top: 32, background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 10, padding: 4, minWidth: 170, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'scaleIn 0.15s ease' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingProf(p); setMenuCardId(null); }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,80,30,0.12)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7, color: TOKENS.text, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                            <Icon name="edit" size={14} color={TOKENS.textSec} /> Editar profesional
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleActivo(p); }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = p.activo ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7, color: p.activo ? '#f87171' : TOKENS.success, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                            {p.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      )}
                    </div>
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

                  {p.especialidades && p.especialidades.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                      {p.especialidades.slice(0, 3).map((esp: string) => (
                        <span key={esp} style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.20)', color: '#06b6d4', fontSize: 9, fontWeight: 600 }}>{esp}</span>
                      ))}
                      {p.especialidades.length > 3 && (
                        <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(148,163,184,0.06)', color: TOKENS.textTer, fontSize: 9, fontWeight: 600 }}>+{p.especialidades.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Footer: rendimiento del mes */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.text }}>{p.activo ? `${p.ingresos ?? 0}€` : '—'}</span>
                      <span style={{ fontSize: 9, color: TOKENS.textTer, fontWeight: 600, letterSpacing: 0.5 }}>INGRESOS</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.text }}>{p.activo ? (p.clientesUnicos ?? 0) : '—'}</span>
                      <span style={{ fontSize: 9, color: TOKENS.textTer, fontWeight: 600, letterSpacing: 0.5 }}>CLIENTAS</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add card */}
            <div
              onClick={() => setShowNewProf(true)}
              onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.primarySoft; e.currentTarget.style.borderColor = `rgba(244,80,30,0.4)`; e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'; }}
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
        )}

        {/* Detalle del miembro a pantalla completa */}
        {profSel && selected && (
          <div className="equipo-panel" onClick={() => setMenuBloqueoId(null)} style={{ position: 'absolute', inset: 0, padding: isMobile ? '12px 16px 88px' : '20px 32px 36px', overflowY: 'auto', background: TOKENS.bg }}>
            {/* Cabecera: volver · identidad · acciones */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelected(null)}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.bgCard; e.currentTarget.style.borderColor = TOKENS.borderHi; e.currentTarget.style.transform = 'translateX(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateX(0)'; }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.15s ease' }}>
                <Icon name="arrowLeft" size={16} color={TOKENS.textSec} />
                Volver al equipo
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: isMobile ? '100%' : 240, order: isMobile ? 3 : 'unset' }}>
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 16,
                    background: `linear-gradient(135deg, ${profSel.color}, ${profSel.color}aa)`,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 19,
                    boxShadow: `0 6px 18px ${profSel.color}55`,
                  }}
                >
                  {profSel.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: -0.4 }}>{profSel.nombre}</div>
                    {!profSel.activo && <Pill color={TOKENS.textTer}>Inactivo</Pill>}
                  </div>
                  <div style={{ fontSize: 13, color: TOKENS.textSec, marginTop: 3 }}>
                    {CATEGORIAS_PROF.find(c => c.value === profSel.categoria)?.label || 'Oficial'}
                    {profSel.tipo_relacion === 'autonomo' ? ' · Autónomo' : profSel.tipo_relacion === 'formacion' ? ' · En formación' : ''}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                <button
                  onClick={() => setEditingProf(profSel)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.bgCard; e.currentTarget.style.borderColor = TOKENS.borderHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = TOKENS.border; }}
                  style={{ flex: isMobile ? 1 : 'none', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 7, padding: '9px 15px', background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease' }}>
                  <Icon name="edit" size={15} color={TOKENS.textSec} />
                  Editar
                </button>
                <button
                  onClick={() => toggleActivo(profSel)}
                  style={{ flex: isMobile ? 1 : 'none', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 7, padding: '9px 15px', background: profSel.activo ? 'rgba(226,59,52,0.08)' : 'rgba(15,157,107,0.10)', border: `1px solid ${profSel.activo ? 'rgba(226,59,52,0.22)' : 'rgba(15,157,107,0.25)'}`, borderRadius: 10, color: profSel.activo ? '#e23b34' : TOKENS.success, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {profSel.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>

            {/* Layout 2 columnas */}
            <div className="equipo-detail-grid" style={{ display: 'grid', gridTemplateColumns: (isMobile || isTablet) ? '1fr' : 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 24, alignItems: 'start' }}>
              {/* Columna izquierda: identidad · metricas · horario */}
              <div>

            {/* Info de contacto / contrato */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {profSel.comision_pct != null && profSel.comision_pct > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, background: 'rgba(15,157,107,0.08)', border: '1px solid rgba(15,157,107,0.18)', fontSize: 12, fontWeight: 600, color: TOKENS.success }}>
                  <Icon name="percent" size={13} color={TOKENS.success} />
                  Comisión {profSel.comision_pct}%
                </div>
              )}
              {profSel.telefono ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, fontSize: 12, color: TOKENS.textSec }}>
                  <Icon name="phone" size={13} color={TOKENS.textTer} />
                  {profSel.telefono}
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, fontSize: 12, color: TOKENS.textTer }}>
                  <Icon name="phone" size={13} color={TOKENS.textTer} />
                  Sin teléfono
                </div>
              )}
              {profSel.email && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, fontSize: 12, color: TOKENS.textSec }}>
                  <Icon name="mail" size={13} color={TOKENS.textTer} />
                  {profSel.email}
                </div>
              )}
            </div>

            {/* Especialidades */}
            {profSel.especialidades && profSel.especialidades.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Especialidades</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profSel.especialidades.map((esp: string) => (
                    <span key={esp} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)', color: '#06b6d4', fontSize: 11, fontWeight: 600 }}>{esp}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Metricas del mes */}
            <Section title="Métricas del mes">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
                <MetricCard label="Citas" value={String(profSel.citas ?? 0)} color={TOKENS.primary} />
                <MetricCard label="Ingresos" value={`${profSel.ingresos ?? 0}€`} color={TOKENS.success} />
                <MetricCard label="Ticket medio" value={`${profSel.ticketMedio ?? 0}€`} color="#06b6d4" />
                <MetricCard label="Comisiones" value={`${profSel.comisionesDevengadas ?? 0}€`} color="#f59e0b" />
                <MetricCard label="Ocupación" value={`${profSel.ocupacion ?? 0}%`} color="#c0260a" />
                <MetricCard label="Clientes" value={String(profSel.clientesUnicos ?? 0)} color="#ec4899" />
              </div>
            </Section>

            {/* Horario base — en movil lista vertical por dia (cabe sin scroll
                horizontal); en escritorio rejilla de 7 columnas. */}
            <Section title="Horario base">
              <div style={{ width: '100%', paddingBottom: 6 }}>
                <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: isMobile ? 6 : 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(7,1fr)', gap: isMobile ? 2 : 4 }}>
                  {DIAS_SEMANA.map((dia, i) => {
                    const dbDia = i === 6 ? 0 : i + 1;
                    const dayH = horarios.filter((x) => x.dia_semana === dbDia).sort((a, b) => (a.turno ?? 1) - (b.turno ?? 1));
                    const hasH = dayH.length > 0;
                    const isEditing = editDia === dbDia;
                    const horasTxt = hasH ? dayH.map((h) => `${fmtHora(h.hora_inicio)}-${fmtHora(h.hora_fin)}`).join(' · ') : 'Cerrado';
                    if (isMobile) {
                      // Fila: nombre del dia a la izquierda, horas a la derecha.
                      return (
                        <div key={i}
                          onClick={() => openEditDia(dbDia)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 11px', borderRadius: 8, background: isEditing ? 'rgba(244,80,30,0.22)' : hasH ? 'rgba(244,80,30,0.08)' : 'rgba(148,163,184,0.05)', cursor: 'pointer', outline: isEditing ? `2px solid ${TOKENS.primary}` : 'none' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: isEditing ? TOKENS.text : hasH ? TOKENS.primaryHi : TOKENS.textTer }}>{DIAS_SEMANA_FULL[dbDia]}</span>
                          <span style={{ fontSize: 12, color: hasH ? TOKENS.textSec : TOKENS.textTer, textAlign: 'right' }}>{horasTxt}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i}
                        onClick={() => openEditDia(dbDia)}
                        onMouseEnter={(e) => { if (!isEditing) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = hasH ? 'rgba(244,80,30,0.18)' : 'rgba(148,163,184,0.1)'; }}}
                        onMouseLeave={(e) => { if (!isEditing) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = isEditing ? 'rgba(244,80,30,0.22)' : hasH ? 'rgba(244,80,30,0.10)' : 'rgba(148,163,184,0.05)'; }}}
                        style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: isEditing ? 'rgba(244,80,30,0.22)' : hasH ? 'rgba(244,80,30,0.10)' : 'rgba(148,163,184,0.05)', transition: 'transform 0.15s ease, background 0.15s ease', cursor: 'pointer', outline: isEditing ? `2px solid ${TOKENS.primary}` : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isEditing ? TOKENS.text : hasH ? TOKENS.primaryHi : TOKENS.textTer }}>{dia}</div>
                        {dayH.length === 0 && <div style={{ fontSize: 9, color: TOKENS.textTer, marginTop: 2 }}>Cerrado</div>}
                        {dayH.map((h, hi) => (
                          <div key={hi} style={{ fontSize: dayH.length > 1 ? 8 : 9, color: TOKENS.textSec, marginTop: hi === 0 ? 2 : 0, lineHeight: 1.3 }}>
                            {fmtHora(h.hora_inicio)}-{fmtHora(h.hora_fin)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Editor inline de horario */}
              {editDia !== null && (() => {
                const dayTurnos = horarios.filter((x) => x.dia_semana === editDia);
                const hasTurno2 = dayTurnos.some((x) => (x.turno ?? 1) === 2);
                const currentTurnoExists = dayTurnos.some((x) => (x.turno ?? 1) === editTurno);
                return (
                <div style={{ marginTop: 10, padding: 14, background: TOKENS.bgCard, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 12, animation: 'scaleIn 0.2s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text }}>{DIAS_SEMANA_FULL[editDia]}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEditDia(editDia!, 1)}
                        style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${editTurno === 1 ? TOKENS.primary : TOKENS.border}`, background: editTurno === 1 ? TOKENS.primarySoft : 'transparent', color: editTurno === 1 ? TOKENS.primaryHi : TOKENS.textTer, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                        Turno 1
                      </button>
                      {hasTurno2 ? (
                        <button onClick={() => openEditDia(editDia!, 2)}
                          style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${editTurno === 2 ? TOKENS.primary : TOKENS.border}`, background: editTurno === 2 ? TOKENS.primarySoft : 'transparent', color: editTurno === 2 ? TOKENS.primaryHi : TOKENS.textTer, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                          Turno 2
                        </button>
                      ) : editTurno !== 2 ? (
                        <button onClick={() => openEditDia(editDia!, 2)}
                          style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px dashed ${TOKENS.border}`, background: 'transparent', color: TOKENS.textTer, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                          + Turno 2
                        </button>
                      ) : (
                        <button onClick={() => openEditDia(editDia!, 2)}
                          style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${TOKENS.primary}`, background: TOKENS.primarySoft, color: TOKENS.primaryHi, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                          Turno 2
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Entrada</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, background: TOKENS.bg, border: `1px solid ${TOKENS.border}` }}>
                        <BtnFlecha onClick={() => adjustEditH('ini', -1, 0)} />
                        <NumBox value={editHIni.split(':')[0]} label="h" />
                        <BtnFlecha onClick={() => adjustEditH('ini', 1, 0)} plus />
                        <span style={{ color: TOKENS.textTer, fontSize: 14, fontWeight: 700 }}>:</span>
                        <BtnFlecha onClick={() => adjustEditH('ini', 0, -15)} />
                        <NumBox value={editHIni.split(':')[1]} label="m" />
                        <BtnFlecha onClick={() => adjustEditH('ini', 0, 15)} plus />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Salida</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, background: TOKENS.bg, border: `1px solid ${TOKENS.border}` }}>
                        <BtnFlecha onClick={() => adjustEditH('fin', -1, 0)} />
                        <NumBox value={editHFin.split(':')[0]} label="h" />
                        <BtnFlecha onClick={() => adjustEditH('fin', 1, 0)} plus />
                        <span style={{ color: TOKENS.textTer, fontSize: 14, fontWeight: 700 }}>:</span>
                        <BtnFlecha onClick={() => adjustEditH('fin', 0, -15)} />
                        <NumBox value={editHFin.split(':')[1]} label="m" />
                        <BtnFlecha onClick={() => adjustEditH('fin', 0, 15)} plus />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={guardarHorario} disabled={savingHorario}
                      style={{ flex: 1, padding: '7px 0', background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {savingHorario ? 'Guardando...' : 'Guardar'}
                    </button>
                    {currentTurnoExists && hasTurno2 && (
                      <button onClick={cerrarTurno}
                        style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.08)', color: '#f87171', border: `1px solid rgba(239,68,68,0.18)`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Quitar turno
                      </button>
                    )}
                    {dayTurnos.length > 0 && (
                      <button onClick={cerrarDia}
                        style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {hasTurno2 ? 'Cerrar dia completo' : 'Cerrar dia'}
                      </button>
                    )}
                    <button onClick={() => setEditDia(null)}
                      style={{ padding: '7px 12px', background: 'transparent', color: TOKENS.textSec, border: `1px solid ${TOKENS.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
                );
              })()}
            </Section>
              </div>
              {/* Columna derecha: bloqueos · leyenda */}
              <div>

            {/* Bloques header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>Bloqueos próximos</div>
              <button
                onClick={() => setShowNewBloqueo(true)}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; e.currentTarget.style.background = 'rgba(244,80,30,0.18)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(244,80,30,0.35)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.background = 'rgba(244,80,30,0.10)'; e.currentTarget.style.boxShadow = 'none'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: TOKENS.primaryHi,
                  background: 'rgba(244,80,30,0.10)',
                  border: `1px solid rgba(244,80,30,0.25)`,
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
                const cfg = TIPO_CONFIG[b.tipo] ?? { label: b.tipo, color: TOKENS.textTer };
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
                      {b.recurrencia && <span style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}>· {fmtRecurrencia(b.recurrencia) ?? b.recurrencia}</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{fechaStr}</div>
                    {b.motivo && <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>{b.motivo}</div>}
                  </div>
                  <div style={{ position: 'relative', alignSelf: 'center' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuBloqueoId(menuBloqueoId === b.id ? null : b.id); }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: menuBloqueoId === b.id ? 'rgba(148,163,184,0.12)' : 'transparent',
                        border: 'none',
                        color: TOKENS.textTer,
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Icon name="moreVertical" size={16} color={TOKENS.textTer} />
                    </button>
                    {menuBloqueoId === b.id && (
                      <div style={{ position: 'absolute', right: 0, top: 44, background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 10, padding: 4, minWidth: 160, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'scaleIn 0.15s ease' }}>
                        <button
                          onClick={() => { setEditBloqueo(b); setMenuBloqueoId(null); }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,80,30,0.12)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7, color: TOKENS.text, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                          <Icon name="edit" size={14} color={TOKENS.textSec} /> Editar bloqueo
                        </button>
                        {(b.recurrencia || b.recurrencia_padre_id) && (
                          <button
                            onClick={() => { eliminarSerieBloqueo(b); }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7, color: '#f87171', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                            <Icon name="trash" size={14} color="#f87171" /> Eliminar toda la serie
                          </button>
                        )}
                        <button
                          onClick={() => { eliminarBloqueo(b.id); }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7, color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                          <Icon name="trash" size={14} color="#ef4444" /> Eliminar bloqueo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            {/* Tipos de bloqueo */}
            <Section title="Tipos de bloqueo">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { l: 'Vacaciones', c: '#f59e0b' },
                  { l: 'Formación', c: '#c0260a' },
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
              </div>{/* fin columna derecha */}
            </div>{/* fin grid 2 columnas */}
          </div>
        )}

      {showNewProf && <NewProfModal onClose={() => setShowNewProf(false)} negocioId={negocioId} onCreated={() => { setShowNewProf(false); location.reload(); }} />}
      {editingProf && <EditProfModal prof={editingProf} negocioId={negocioId} onClose={() => setEditingProf(null)} onSaved={() => { setEditingProf(null); location.reload(); }} />}
      {showNewBloqueo && <NewBloqueoModal profesionales={profesionales} selectedId={selected} negocioId={negocioId} onClose={() => setShowNewBloqueo(false)} onCreated={() => { setShowNewBloqueo(false); location.reload(); }} />}
      {editBloqueo && <EditBloqueoModal bloqueo={editBloqueo} onClose={() => setEditBloqueo(null)} onSaved={() => { setEditBloqueo(null); cargarPanelDerecho(); }} />}
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

const ESPECIALIDADES_CATALOGO = [
  'Color', 'Mechas y tecnicas', 'Decoloracion', 'Corte mujer', 'Corte hombre',
  'Peinados evento', 'Tratamientos', 'Recogidos y novias', 'Alisados',
];

function NewProfModal({ onClose, negocioId, onCreated }: any) {
  const { isMobile } = useResponsive();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#f4501e');
  const [categoria, setCategoria] = useState('oficial');
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [comisionPct, setComisionPct] = useState('');
  const [loading, setLoading] = useState(false);

  const COLORS = ['#f4501e', '#c0260a', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];

  function toggleEspecialidad(esp: string) {
    setEspecialidades(prev => prev.includes(esp) ? prev.filter(e => e !== esp) : [...prev, esp]);
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      alert('Por favor ingresa el nombre del profesional');
      return;
    }

    setLoading(true);
    try {
      const comision = comisionPct.trim() ? parseFloat(comisionPct.trim()) : null;
      await supabase.from('profesionales').insert({
        negocio_id: negocioId,
        nombre: nombre.trim(),
        color: color,
        categoria: categoria,
        especialidades: especialidades.length > 0 ? especialidades : null,
        comision_pct: comision,
        activo: true,
      });

      onCreated();
    } catch (error) {
      console.error('Error creando profesional:', error);
      alert(mensajeDeError(error, 'No se pudo crear el profesional.'));
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: isMobile ? 12 : 24 }}>
      <div style={{ width: isMobile ? '100%' : 420, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: isMobile ? 16 : 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,80,30,0.15)' }}>
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
                    background: categoria === cat.value ? 'rgba(244,80,30,0.18)' : TOKENS.bgCard,
                    border: `1px solid ${categoria === cat.value ? 'rgba(244,80,30,0.5)' : TOKENS.border}`,
                    color: categoria === cat.value ? '#ff7a2e' : TOKENS.textSec,
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
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Especialidades</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ESPECIALIDADES_CATALOGO.map((esp) => {
                const sel = especialidades.includes(esp);
                return (
                  <button
                    key={esp}
                    onClick={() => toggleEspecialidad(esp)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      background: sel ? 'rgba(6,182,212,0.14)' : TOKENS.bgCard,
                      border: `1px solid ${sel ? 'rgba(6,182,212,0.40)' : TOKENS.border}`,
                      color: sel ? '#06b6d4' : TOKENS.textSec,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {esp}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Comision (%)</div>
            <input
              value={comisionPct}
              onChange={(e) => setComisionPct(e.target.value)}
              placeholder="Ej. 35"
              type="number"
              min="0"
              max="100"
              style={{
                width: 120,
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
              background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: `0 6px 20px rgba(244,80,30,0.45)`,
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

interface CuentaNegocio { id: string; nombre: string | null; apellido: string | null; email: string | null; role: string; }

function EditProfModal({ prof, negocioId, onClose, onSaved }: { prof: Profesional; negocioId: string; onClose: () => void; onSaved: () => void }) {
  const { isMobile } = useResponsive();
  const [nombre, setNombre] = useState(prof.nombre);
  const [color, setColor] = useState(prof.color);
  const [categoria, setCategoria] = useState(prof.categoria ?? 'oficial');
  const [especialidades, setEspecialidades] = useState<string[]>(prof.especialidades ?? []);
  const [comisionPct, setComisionPct] = useState(prof.comision_pct != null ? String(prof.comision_pct) : '');
  const [telefono, setTelefono] = useState(prof.telefono ?? '');
  const [email, setEmail] = useState(prof.email ?? '');
  const [tipoRelacion, setTipoRelacion] = useState(prof.tipo_relacion ?? 'empleado');
  const [loading, setLoading] = useState(false);

  // Cuenta de acceso: vincula esta ficha con una cuenta de login del negocio
  // (profesionales.profile_id). Permite vincular una existente o invitar una nueva.
  const [cuentaId, setCuentaId] = useState<string>(prof.profile_id ?? '');
  const [cuentas, setCuentas] = useState<CuentaNegocio[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [invitando, setInvitando] = useState(false);
  const [cuentaMsg, setCuentaMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!negocioId) return;
      const [{ data: profs }, { data: links }] = await Promise.all([
        supabase.from('profiles').select('id, nombre, apellido, email, role').eq('negocio_id', negocioId),
        supabase.from('profesionales').select('profile_id').eq('negocio_id', negocioId).not('profile_id', 'is', null),
      ]);
      setCuentas((profs as CuentaNegocio[]) ?? []);
      // Cuentas ya vinculadas a OTRA ficha (no a esta) — no se pueden reasignar a la ligera.
      const taken = new Set<string>();
      (links ?? []).forEach((l: any) => { if (l.profile_id && l.profile_id !== prof.profile_id) taken.add(l.profile_id); });
      setLinkedIds(taken);
    })();
  }, [negocioId, prof.profile_id]);

  const invitarCuenta = async () => {
    setCuentaMsg(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setCuentaMsg({ ok: false, text: 'Indica un email válido en la ficha para invitar.' }); return; }
    if (!nombre.trim()) { setCuentaMsg({ ok: false, text: 'Indica el nombre.' }); return; }
    setInvitando(true);
    const { data, error } = await supabase.functions.invoke('crear-acceso-empleado', {
      body: { email: mail, nombre: nombre.trim(), rol: 'employee' },
    });
    setInvitando(false);
    if (error || (data && (data as any).error)) {
      const code = (data && (data as any).error) || 'error';
      const msg = code === 'email_exists'
        ? 'Ya existe una cuenta con ese email: selecciónala en la lista.'
        : 'No se pudo invitar. Revisa el email o créala en Ajustes → Accesos y roles.';
      setCuentaMsg({ ok: false, text: msg });
      return;
    }
    const newId = (data as any).user_id as string;
    // Refrescar lista y dejar la nueva cuenta seleccionada.
    const { data: profs } = await supabase.from('profiles').select('id, nombre, apellido, email, role').eq('negocio_id', negocioId);
    setCuentas((profs as CuentaNegocio[]) ?? []);
    if (newId) setCuentaId(newId);
    setCuentaMsg({ ok: true, text: 'Cuenta invitada por email. Quedará vinculada al guardar.' });
  };

  const COLORS = ['#f4501e', '#c0260a', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];
  const TIPOS_REL = [
    { value: 'empleado', label: 'Empleado' },
    { value: 'autonomo', label: 'Autonomo' },
    { value: 'formacion', label: 'En formacion' },
  ];

  function toggleEspecialidad(esp: string) {
    setEspecialidades(prev => prev.includes(esp) ? prev.filter(e => e !== esp) : [...prev, esp]);
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) return;
    setLoading(true);
    const comision = comisionPct.trim() ? parseFloat(comisionPct.trim()) : null;
    await supabase.from('profesionales').update({
      nombre: nombre.trim(),
      color,
      categoria,
      especialidades: especialidades.length > 0 ? especialidades : null,
      comision_pct: comision,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      tipo_relacion: tipoRelacion,
      profile_id: cuentaId || null,
    }).eq('id', prof.id);
    setLoading(false);
    onSaved();
  };

  const handleEliminar = async () => {
    if (!window.confirm(`¿Seguro que quieres eliminar al profesional "${prof.nombre}"? Si tiene citas asociadas, el sistema impedirá el borrado físico para preservar tus datos históricos.`)) return;
    setLoading(true);
    const { error } = await supabase.from('profesionales').delete().eq('id', prof.id);
    setLoading(false);
    if (error) {
      alert(`No se pudo eliminar al profesional: ${mensajeDeError(error, 'Puede que tenga citas asociadas.')}`);
    } else {
      onSaved();
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: isMobile ? 12 : 24 }}>
      <div style={{ width: isMobile ? '100%' : 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: isMobile ? 16 : 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,80,30,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>Editar profesional</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 }}>x</button>
        </div>

        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <div>
            <div style={labelStyle}>Nombre*</div>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Categoria*</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIAS_PROF.map((cat) => (
                <button key={cat.value} onClick={() => setCategoria(cat.value)} style={{ padding: '6px 12px', borderRadius: 8, background: categoria === cat.value ? 'rgba(244,80,30,0.18)' : TOKENS.bgCard, border: `1px solid ${categoria === cat.value ? 'rgba(244,80,30,0.5)' : TOKENS.border}`, color: categoria === cat.value ? '#ff7a2e' : TOKENS.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{cat.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Especialidades</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ESPECIALIDADES_CATALOGO.map((esp) => {
                const sel = especialidades.includes(esp);
                return (
                  <button key={esp} onClick={() => toggleEspecialidad(esp)} style={{ padding: '5px 10px', borderRadius: 999, background: sel ? 'rgba(6,182,212,0.14)' : TOKENS.bgCard, border: `1px solid ${sel ? 'rgba(6,182,212,0.40)' : TOKENS.border}`, color: sel ? '#06b6d4' : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{esp}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelStyle}>Comision (%)</div>
              <input value={comisionPct} onChange={(e) => setComisionPct(e.target.value)} placeholder="35" type="number" min="0" max="100" style={{ ...inputStyle, width: 120 }} />
            </div>
            <div>
              <div style={labelStyle}>Tipo de relacion</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {TIPOS_REL.map((t) => (
                  <button key={t.value} onClick={() => setTipoRelacion(t.value)} style={{ padding: '6px 10px', borderRadius: 8, background: tipoRelacion === t.value ? 'rgba(244,80,30,0.18)' : TOKENS.bgCard, border: `1px solid ${tipoRelacion === t.value ? 'rgba(244,80,30,0.5)' : TOKENS.border}`, color: tipoRelacion === t.value ? '#ff7a2e' : TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelStyle}>Telefono</div>
              <PhoneInput value={telefono} onChange={(e164) => setTelefono(e164)} placeholder="600 000 000" />
            </div>
            <div>
              <div style={labelStyle}>Email</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@salon.com" style={inputStyle} />
            </div>
          </div>
          {/* Cuenta de acceso al software: vincula esta ficha con un login del negocio */}
          <div>
            <div style={labelStyle}>Cuenta de acceso</div>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Sin cuenta vinculada</option>
              {cuentas.map((c) => {
                const taken = linkedIds.has(c.id);
                const nom = `${c.nombre ?? ''} ${c.apellido ?? ''}`.trim() || c.email || 'Cuenta';
                return <option key={c.id} value={c.id} disabled={taken}>{nom}{c.email ? ` · ${c.email}` : ''}{taken ? ' (otra ficha)' : ''}</option>;
              })}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={invitarCuenta} disabled={invitando} style={{ padding: '7px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.borderHi}`, color: TOKENS.text, borderRadius: 9, cursor: invitando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                {invitando ? 'Invitando...' : 'Invitar nueva por email'}
              </button>
              <span style={{ fontSize: 11.5, color: TOKENS.textTer }}>Usa el email de la ficha; la persona pone su contraseña desde el correo.</span>
            </div>
            {cuentaMsg && <div style={{ fontSize: 11.5, marginTop: 6, color: cuentaMsg.ok ? TOKENS.success : '#e23b34' }}>{cuentaMsg.text}</div>}
            <div style={{ fontSize: 11.5, marginTop: 6, color: TOKENS.textTer }}>
              Vincúlala para que vea sus citas, cobros y rendimiento en Mi jornada.
            </div>
          </div>
          <div>
            <div style={labelStyle}>Color*</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', boxShadow: `0 0 8px ${c}66` }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
          <button
            onClick={handleEliminar}
            disabled={loading}
            style={{ padding: '9px 14px', background: 'transparent', border: `1px solid rgba(239,68,68,0.35)`, color: '#ef4444', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ✕ Eliminar profesional
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
            <button onClick={handleGuardar} disabled={loading} style={{ padding: '9px 14px', background: 'linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(244,80,30,0.45)', opacity: loading ? 0.6 : 1 }}>{loading ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TIPOS_BLOQUEO = [
  { value: 'vacaciones', label: 'Vacaciones', color: '#e08a00' },
  { value: 'formacion',  label: 'Formacion',  color: '#c0260a' },
  { value: 'reunion',    label: 'Reunion',    color: '#3b82f6' },
  { value: 'baja',       label: 'Baja',       color: '#e23b34' },
  { value: 'descanso',   label: 'Descanso',   color: '#0f9d6b' },
  { value: 'otro',       label: 'Otro',       color: '#8a7d70' },
];

const FRECUENCIAS = [
  { value: 'diaria',     label: 'Diaria' },
  { value: 'semanal',    label: 'Semanal' },
  { value: 'bisemanal',  label: 'Bisemanal' },
  { value: 'mensual',    label: 'Mensual' },
];

const DIAS_SEMANA_FULL = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
];

function BtnFlecha({ onClick, plus }: { onClick: () => void; plus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'rgba(148,163,184,0.08)',
        border: `1px solid ${TOKENS.border}`,
        color: TOKENS.textSec,
        cursor: 'pointer',
        fontSize: 16, fontWeight: 700,
        display: 'grid', placeItems: 'center',
        fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      {plus ? '+' : '-'}
    </button>
  );
}

function NumBox({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 2,
      padding: '5px 10px', borderRadius: 8,
      background: 'rgba(244,80,30,0.13)',
      border: '1px solid rgba(244,80,30,0.22)',
      minWidth: label === 'h' ? 46 : 52,
      justifyContent: 'center',
    }}>
      <span style={{ fontSize: 17, fontWeight: 700, color: TOKENS.primary, fontFamily: 'inherit' }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: TOKENS.primary, fontFamily: 'inherit' }}>{label}</span>
    </div>
  );
}

function NewBloqueoModal({ profesionales, selectedId, negocioId, onClose, onCreated }: {
  profesionales: Profesional[];
  selectedId: string | null;
  negocioId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { isMobile } = useResponsive();
  const [tipo, setTipo] = useState('vacaciones');
  const [fechaInicio, setFechaInicio] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [fechaFin, setFechaFin] = useState('');
  const [horaFin, setHoraFin] = useState('18:00');
  const [motivo, setMotivo] = useState('');
  const [todoElDia, setTodoElDia] = useState(false);
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [frecuencia, setFrecuencia] = useState('semanal');
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [diaMes, setDiaMes] = useState(1);
  const [fechaFinRecurrencia, setFechaFinRecurrencia] = useState('');
  const [profsSeleccionados, setProfsSeleccionados] = useState<string[]>(
    selectedId ? [selectedId] : []
  );
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState(0);
  const [conflictos, setConflictos] = useState<any[]>([]);
  const [accionesConflicto, setAccionesConflicto] = useState<Record<string, 'cancelar' | 'mantener'>>({});

  const dateInicioRef = useRef<HTMLInputElement>(null);
  const dateFinRef = useRef<HTMLInputElement>(null);
  const dateRecurrenciaRef = useRef<HTMLInputElement>(null);

  function adjustFechaInicio(delta: number) {
    setFechaInicio((prev) => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }
  function adjustFechaFin(delta: number) {
    setFechaFin((prev) => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }
  function adjustFechaRecurrencia(delta: number) {
    setFechaFinRecurrencia((prev) => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }
  function adjustHoraInicio(hDelta: number, mDelta: number) {
    setHoraInicio((prev) => {
      const [h, m] = prev.split(':').map(Number);
      let totalMin = h * 60 + m + hDelta * 60 + mDelta;
      if (totalMin < 0) totalMin = 0;
      if (totalMin > 1439) totalMin = 1439;
      return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    });
  }
  function adjustHoraFin(hDelta: number, mDelta: number) {
    setHoraFin((prev) => {
      const [h, m] = prev.split(':').map(Number);
      let totalMin = h * 60 + m + hDelta * 60 + mDelta;
      if (totalMin < 0) totalMin = 0;
      if (totalMin > 1439) totalMin = 1439;
      return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    });
  }

  function fmtFechaDisplay(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  useEffect(() => {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const f = `${yyyy}-${mm}-${dd}`;
    setFechaInicio(f);
    setFechaFin(f);
    const fin90 = new Date(hoy);
    fin90.setDate(fin90.getDate() + 90);
    const fy = fin90.getFullYear();
    const fm = String(fin90.getMonth() + 1).padStart(2, '0');
    const fd = String(fin90.getDate()).padStart(2, '0');
    setFechaFinRecurrencia(`${fy}-${fm}-${fd}`);
  }, []);

  const toggleDia = (d: number) => {
    setDiasSemana((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const toggleProf = (id: string) => {
    setProfsSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  function generarInstancias(desde: Date, hasta: Date): { inicio: Date; fin: Date }[] {
    const instancias: { inicio: Date; fin: Date }[] = [];
    const hInicio = todoElDia ? 0 : parseInt(horaInicio.split(':')[0]);
    const mInicio = todoElDia ? 0 : parseInt(horaInicio.split(':')[1]);
    const hFin = todoElDia ? 23 : parseInt(horaFin.split(':')[0]);
    const mFin = todoElDia ? 59 : parseInt(horaFin.split(':')[1]);

    let cursor = new Date(desde);
    const limite = new Date(hasta);
    limite.setDate(limite.getDate() + 1);

    while (cursor < limite && instancias.length < 400) {
      const dow = cursor.getDay();
      let incluir = false;

      if (frecuencia === 'diaria') {
        incluir = true;
      } else if (frecuencia === 'semanal') {
        incluir = diasSemana.includes(dow);
      } else if (frecuencia === 'bisemanal') {
        const weeksDiff = Math.floor((cursor.getTime() - desde.getTime()) / (7 * 86400000));
        incluir = weeksDiff % 2 === 0 && diasSemana.includes(dow);
      } else if (frecuencia === 'mensual') {
        incluir = cursor.getDate() === diaMes;
      }

      if (incluir) {
        const ini = new Date(cursor);
        ini.setHours(hInicio, mInicio, 0, 0);
        const fin = new Date(cursor);
        fin.setHours(hFin, mFin, 0, 0);
        instancias.push({ inicio: ini, fin: fin });
      }

      cursor.setDate(cursor.getDate() + 1);
    }
    return instancias;
  }

  function getRangosBloqueo(): { inicio: string; fin: string }[] {
    if (!esRecurrente) {
      const ini = todoElDia
        ? new Date(`${fechaInicio}T00:00:00`).toISOString()
        : new Date(`${fechaInicio}T${horaInicio}:00`).toISOString();
      const fin = todoElDia
        ? new Date(`${fechaFin}T23:59:00`).toISOString()
        : new Date(`${fechaFin}T${horaFin}:00`).toISOString();
      return [{ inicio: ini, fin }];
    }
    return generarInstancias(new Date(fechaInicio), new Date(fechaFinRecurrencia)).map((inst) => ({
      inicio: inst.inicio.toISOString(),
      fin: inst.fin.toISOString(),
    }));
  }

  async function detectarConflictos() {
    if (profsSeleccionados.length === 0 || !fechaInicio || !fechaFin) return;
    setLoading(true);

    const rangos = getRangosBloqueo();
    const minInicio = rangos.reduce((a, b) => a < b.inicio ? a : b.inicio, rangos[0].inicio);
    const maxFin = rangos.reduce((a, b) => a > b.fin ? a : b.fin, rangos[0].fin);

    const { data: citas } = await supabase
      .from('citas')
      .select('id, profesional_id, inicio, fin, cliente:clientes(nombre), servicio:servicios(nombre)')
      .eq('negocio_id', negocioId)
      .eq('estado', 'confirmada')
      .in('profesional_id', profsSeleccionados)
      .gte('fin', minInicio)
      .lte('inicio', maxFin);

    const citasConflicto = (citas ?? []).filter((c: any) =>
      rangos.some((r) => c.inicio < r.fin && c.fin > r.inicio)
    );

    setLoading(false);

    if (citasConflicto.length === 0) {
      await ejecutarCreacion();
    } else {
      setConflictos(citasConflicto);
      const acciones: Record<string, 'cancelar' | 'mantener'> = {};
      citasConflicto.forEach((c: any) => { acciones[c.id] = 'cancelar'; });
      setAccionesConflicto(acciones);
      setPaso(1);
    }
  }

  async function ejecutarCreacion() {
    setLoading(true);
    try {
      for (const [citaId, accion] of Object.entries(accionesConflicto)) {
        if (accion === 'cancelar') {
          await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', citaId);
        }
      }

      const grupoId = profsSeleccionados.length > 1 ? crypto.randomUUID() : null;

      for (const profId of profsSeleccionados) {
        if (!esRecurrente) {
          const ini = todoElDia
            ? new Date(`${fechaInicio}T00:00:00`).toISOString()
            : new Date(`${fechaInicio}T${horaInicio}:00`).toISOString();
          const fin = todoElDia
            ? new Date(`${fechaFin}T23:59:00`).toISOString()
            : new Date(`${fechaFin}T${horaFin}:00`).toISOString();

          await supabase.from('bloqueos_profesional').insert({
            profesional_id: profId,
            negocio_id: negocioId,
            tipo,
            inicio: ini,
            fin: fin,
            motivo: motivo || null,
            grupo_bloqueo_id: grupoId,
          });
        } else {
          const recurrenciaJson = JSON.stringify({
            frecuencia,
            dias_semana: frecuencia === 'semanal' || frecuencia === 'bisemanal' ? diasSemana : undefined,
            dia_mes: frecuencia === 'mensual' ? diaMes : undefined,
            fecha_fin: fechaFinRecurrencia,
          });

          const { data: padre } = await supabase.from('bloqueos_profesional').insert({
            profesional_id: profId,
            negocio_id: negocioId,
            tipo,
            inicio: todoElDia
              ? new Date(`${fechaInicio}T00:00:00`).toISOString()
              : new Date(`${fechaInicio}T${horaInicio}:00`).toISOString(),
            fin: todoElDia
              ? new Date(`${fechaInicio}T23:59:00`).toISOString()
              : new Date(`${fechaInicio}T${horaFin}:00`).toISOString(),
            motivo: motivo || null,
            recurrencia: recurrenciaJson,
            grupo_bloqueo_id: grupoId,
          }).select('id').single();

          if (padre?.id) {
            const instancias = generarInstancias(
              new Date(fechaInicio),
              new Date(fechaFinRecurrencia)
            );
            const hijas = instancias.slice(1).map((inst) => ({
              profesional_id: profId,
              negocio_id: negocioId,
              tipo,
              inicio: inst.inicio.toISOString(),
              fin: inst.fin.toISOString(),
              motivo: motivo || null,
              recurrencia_padre_id: padre.id,
              grupo_bloqueo_id: grupoId,
            }));
            if (hijas.length > 0) {
              await supabase.from('bloqueos_profesional').insert(hijas);
            }
          }
        }
      }
      onCreated();
    } catch {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: TOKENS.bgCard,
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: 8,
    color: TOKENS.text,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: TOKENS.textSec,
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 480,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: TOKENS.bgPanel,
          border: `1px solid ${TOKENS.borderHi}`,
          borderRadius: 16,
          padding: isMobile ? 16 : 28,
          animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {paso === 1 && (
          <div>
            <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>
              Conflictos detectados
            </h3>
            <p style={{ margin: 0, marginBottom: 18, fontSize: 12, color: TOKENS.textSec }}>
              {conflictos.length} cita{conflictos.length > 1 ? 's' : ''} confirmada{conflictos.length > 1 ? 's' : ''} solapan con el bloqueo. Elige que hacer con cada una.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, maxHeight: 340, overflowY: 'auto' }}>
              {conflictos.map((c: any) => {
                const profData = profesionales.find((p) => p.id === c.profesional_id);
                const accion = accionesConflicto[c.id] ?? 'cancelar';
                const ini = new Date(c.inicio);
                const fin = new Date(c.fin);
                return (
                  <div key={c.id} style={{
                    padding: 14,
                    background: TOKENS.bgCard,
                    border: `1px solid ${accion === 'cancelar' ? '#ef444466' : TOKENS.border}`,
                    borderRadius: 12,
                    transition: 'border-color 0.15s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {profData && <div style={{ width: 8, height: 8, borderRadius: 4, background: profData.color }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{c.cliente?.nombre ?? 'Cliente'}</span>
                      <span style={{ fontSize: 11, color: TOKENS.textTer }}>{c.servicio?.nombre ?? ''}</span>
                    </div>
                    <div style={{ fontSize: 11, color: TOKENS.textSec, marginBottom: 10 }}>
                      {ini.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · {ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {profData && <span> · {profData.nombre}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setAccionesConflicto((prev) => ({ ...prev, [c.id]: 'cancelar' }))}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 8,
                          border: accion === 'cancelar' ? '2px solid #ef4444' : `1px solid ${TOKENS.border}`,
                          background: accion === 'cancelar' ? '#ef444418' : 'transparent',
                          color: accion === 'cancelar' ? '#ef4444' : TOKENS.textSec,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Cancelar cita
                      </button>
                      <button
                        onClick={() => setAccionesConflicto((prev) => ({ ...prev, [c.id]: 'mantener' }))}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 8,
                          border: accion === 'mantener' ? `2px solid ${TOKENS.primary}` : `1px solid ${TOKENS.border}`,
                          background: accion === 'mantener' ? TOKENS.primarySoft : 'transparent',
                          color: accion === 'mantener' ? TOKENS.primaryHi : TOKENS.textSec,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Mantener
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen */}
            {(() => {
              const cancelar = Object.values(accionesConflicto).filter((a) => a === 'cancelar').length;
              const mantener = Object.values(accionesConflicto).filter((a) => a === 'mantener').length;
              return (
                <div style={{ padding: 12, background: 'rgba(244,80,30,0.08)', borderRadius: 10, marginBottom: 18, fontSize: 12, color: TOKENS.textSec }}>
                  {cancelar > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{cancelar} se cancelar{cancelar > 1 ? 'an' : 'a'}</span>}
                  {cancelar > 0 && mantener > 0 && <span> · </span>}
                  {mantener > 0 && <span style={{ color: TOKENS.primaryHi, fontWeight: 600 }}>{mantener} se mantiene{mantener > 1 ? 'n' : ''}</span>}
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPaso(0)}
                style={{
                  padding: '9px 14px',
                  background: 'transparent',
                  color: TOKENS.textSec,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Volver
              </button>
              <button
                onClick={ejecutarCreacion}
                disabled={loading}
                style={{
                  padding: '9px 14px',
                  background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: `0 6px 20px rgba(244,80,30,0.45)`,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Aplicando...' : 'Confirmar y crear bloqueo'}
              </button>
            </div>
          </div>
        )}

        {paso === 0 && <h3 style={{ margin: 0, marginBottom: 20, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>
          Nuevo bloqueo
        </h3>}

        {paso === 0 && <>
        {/* Tipo */}
        <div style={{ marginBottom: 16 }}>
          <span style={labelStyle}>Tipo</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {TIPOS_BLOQUEO.map((t) => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                style={{
                  padding: '7px 0',
                  borderRadius: 8,
                  border: tipo === t.value ? `2px solid ${t.color}` : `1px solid ${TOKENS.border}`,
                  background: tipo === t.value ? `${t.color}18` : TOKENS.bgCard,
                  color: tipo === t.value ? t.color : TOKENS.textSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Todo el dia toggle */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setTodoElDia(!todoElDia)}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              border: 'none',
              background: todoElDia ? TOKENS.primary : TOKENS.bgCard,
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            <div style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: todoElDia ? 18 : 2,
              transition: 'left 0.2s ease',
            }} />
          </button>
          <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>Todo el dia</span>
        </div>

        {/* Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={labelStyle}>Fecha inicio</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
              <BtnFlecha onClick={() => adjustFechaInicio(-1)} />
              <div
                onClick={() => dateInicioRef.current?.showPicker?.()}
                style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: TOKENS.text, cursor: 'pointer', userSelect: 'none', textTransform: 'capitalize' }}
              >
                {fmtFechaDisplay(fechaInicio)}
              </div>
              <BtnFlecha onClick={() => adjustFechaInicio(1)} plus />
              <input ref={dateInicioRef} type="date" value={fechaInicio} onChange={(e) => e.target.value && setFechaInicio(e.target.value)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>Fecha fin</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
              <BtnFlecha onClick={() => adjustFechaFin(-1)} />
              <div
                onClick={() => dateFinRef.current?.showPicker?.()}
                style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: TOKENS.text, cursor: 'pointer', userSelect: 'none', textTransform: 'capitalize' }}
              >
                {fmtFechaDisplay(fechaFin)}
              </div>
              <BtnFlecha onClick={() => adjustFechaFin(1)} plus />
              <input ref={dateFinRef} type="date" value={fechaFin} onChange={(e) => e.target.value && setFechaFin(e.target.value)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            </div>
          </div>
        </div>

        {!todoElDia && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div>
              <span style={labelStyle}>Hora inicio</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
                <BtnFlecha onClick={() => adjustHoraInicio(-1, 0)} />
                <NumBox value={horaInicio.split(':')[0]} label="h" />
                <BtnFlecha onClick={() => adjustHoraInicio(1, 0)} plus />
                <span style={{ color: TOKENS.textTer, fontSize: 17, fontWeight: 700, margin: '0 2px' }}>:</span>
                <BtnFlecha onClick={() => adjustHoraInicio(0, -5)} />
                <NumBox value={horaInicio.split(':')[1]} label="min" />
                <BtnFlecha onClick={() => adjustHoraInicio(0, 5)} plus />
              </div>
            </div>
            <div>
              <span style={labelStyle}>Hora fin</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
                <BtnFlecha onClick={() => adjustHoraFin(-1, 0)} />
                <NumBox value={horaFin.split(':')[0]} label="h" />
                <BtnFlecha onClick={() => adjustHoraFin(1, 0)} plus />
                <span style={{ color: TOKENS.textTer, fontSize: 17, fontWeight: 700, margin: '0 2px' }}>:</span>
                <BtnFlecha onClick={() => adjustHoraFin(0, -5)} />
                <NumBox value={horaFin.split(':')[1]} label="min" />
                <BtnFlecha onClick={() => adjustHoraFin(0, 5)} plus />
              </div>
            </div>
          </div>
        )}

        {/* Motivo */}
        <div style={{ marginBottom: 16 }}>
          <span style={labelStyle}>Motivo (opcional)</span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Cita medica, vacaciones de verano..."
            style={inputStyle}
          />
        </div>

        {/* Recurrente toggle */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setEsRecurrente(!esRecurrente)}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              border: 'none',
              background: esRecurrente ? TOKENS.primary : TOKENS.bgCard,
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            <div style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: esRecurrente ? 18 : 2,
              transition: 'left 0.2s ease',
            }} />
          </button>
          <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>Recurrente</span>
        </div>

        {esRecurrente && (
          <div style={{
            background: TOKENS.bgCard,
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}>
            {/* Frecuencia */}
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Frecuencia</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {FRECUENCIAS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFrecuencia(f.value)}
                    style={{
                      padding: '6px 0',
                      borderRadius: 8,
                      border: frecuencia === f.value ? `2px solid ${TOKENS.primary}` : `1px solid ${TOKENS.border}`,
                      background: frecuencia === f.value ? TOKENS.primarySoft : 'transparent',
                      color: frecuencia === f.value ? TOKENS.primaryHi : TOKENS.textSec,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dias de semana (semanal/bisemanal) */}
            {(frecuencia === 'semanal' || frecuencia === 'bisemanal') && (
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Dias de la semana</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DIAS_SEMANA_FULL.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => toggleDia(d.value)}
                      style={{
                        width: 38,
                        height: 34,
                        borderRadius: 8,
                        border: diasSemana.includes(d.value) ? `2px solid ${TOKENS.primary}` : `1px solid ${TOKENS.border}`,
                        background: diasSemana.includes(d.value) ? TOKENS.primarySoft : 'transparent',
                        color: diasSemana.includes(d.value) ? TOKENS.primaryHi : TOKENS.textSec,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dia del mes (mensual) */}
            {frecuencia === 'mensual' && (
              <div style={{ marginBottom: 12 }}>
                <span style={labelStyle}>Dia del mes</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaMes}
                  onChange={(e) => setDiaMes(parseInt(e.target.value) || 1)}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
            )}

            {/* Fecha fin recurrencia */}
            <div>
              <span style={labelStyle}>Hasta</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: 'transparent', border: `1px solid ${TOKENS.border}` }}>
                <BtnFlecha onClick={() => adjustFechaRecurrencia(-7)} />
                <div
                  onClick={() => dateRecurrenciaRef.current?.showPicker?.()}
                  style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: TOKENS.text, cursor: 'pointer', userSelect: 'none', textTransform: 'capitalize' }}
                >
                  {fmtFechaDisplay(fechaFinRecurrencia)}
                </div>
                <BtnFlecha onClick={() => adjustFechaRecurrencia(7)} plus />
                <input ref={dateRecurrenciaRef} type="date" value={fechaFinRecurrencia} onChange={(e) => e.target.value && setFechaFinRecurrencia(e.target.value)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
              </div>
            </div>
          </div>
        )}

        {/* Profesionales */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelStyle}>Profesionales</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {profesionales.filter((p) => p.activo).map((p) => {
              const sel = profsSeleccionados.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProf(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: sel ? `2px solid ${p.color}` : `1px solid ${TOKENS.border}`,
                    background: sel ? `${p.color}18` : TOKENS.bgCard,
                    color: sel ? TOKENS.text : TOKENS.textSec,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                  {p.nombre}
                </button>
              );
            })}
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 14px',
              background: 'transparent',
              color: TOKENS.textSec,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={detectarConflictos}
            disabled={loading || profsSeleccionados.length === 0}
            style={{
              padding: '9px 14px',
              background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: `0 6px 20px rgba(244,80,30,0.45)`,
              opacity: loading || profsSeleccionados.length === 0 ? 0.6 : 1,
            }}
          >
            {loading ? 'Comprobando...' : 'Crear bloqueo'}
          </button>
        </div>
        </>}
      </div>
    </div>
  );
}

function EditBloqueoModal({ bloqueo, onClose, onSaved }: { bloqueo: any; onClose: () => void; onSaved: () => void }) {
  const { isMobile } = useResponsive();
  const [tipo, setTipo] = useState(bloqueo.tipo || 'vacaciones');
  const [motivo, setMotivo] = useState(bloqueo.motivo || '');
  const dIni = new Date(bloqueo.inicio);
  const dFin = new Date(bloqueo.fin);
  const hIni = `${String(dIni.getHours()).padStart(2, '0')}:${String(dIni.getMinutes()).padStart(2, '0')}`;
  const hFin = `${String(dFin.getHours()).padStart(2, '0')}:${String(dFin.getMinutes()).padStart(2, '0')}`;
  const isFullDay = hIni === '00:00' && hFin === '23:59';
  const [todoElDia, setTodoElDia] = useState(isFullDay);
  const [fechaInicio, setFechaInicio] = useState(
    `${dIni.getFullYear()}-${String(dIni.getMonth() + 1).padStart(2, '0')}-${String(dIni.getDate()).padStart(2, '0')}`
  );
  const [fechaFin, setFechaFin] = useState(
    `${dFin.getFullYear()}-${String(dFin.getMonth() + 1).padStart(2, '0')}-${String(dFin.getDate()).padStart(2, '0')}`
  );
  const [horaInicio, setHoraInicio] = useState(isFullDay ? '09:00' : hIni);
  const [horaFin, setHoraFin] = useState(isFullDay ? '18:00' : hFin);
  const [saving, setSaving] = useState(false);
  const dateInicioRef = useRef<HTMLInputElement>(null);
  const dateFinRef = useRef<HTMLInputElement>(null);

  function fmtFechaDisplay(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function adjustFI(delta: number) {
    setFechaInicio((prev: string) => { const d = new Date(prev + 'T12:00:00'); d.setDate(d.getDate() + delta); const r = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; if (r > fechaFin) setFechaFin(r); return r; });
  }
  function adjustFF(delta: number) {
    setFechaFin((prev: string) => { const d = new Date(prev + 'T12:00:00'); d.setDate(d.getDate() + delta); const r = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; return r < fechaInicio ? fechaInicio : r; });
  }
  function adjustH(field: 'ini' | 'fin', hD: number, mD: number) {
    const setter = field === 'ini' ? setHoraInicio : setHoraFin;
    const current = field === 'ini' ? horaInicio : horaFin;
    const [hh, mm] = current.split(':').map(Number);
    let nh = hh + hD, nm = mm + mD;
    if (nm >= 60) { nm -= 60; nh++; } if (nm < 0) { nm += 60; nh--; }
    nh = Math.max(0, Math.min(23, nh));
    setter(`${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`);
  }

  async function guardar() {
    setSaving(true);
    const ini = todoElDia
      ? new Date(`${fechaInicio}T00:00:00`).toISOString()
      : new Date(`${fechaInicio}T${horaInicio}:00`).toISOString();
    const fin = todoElDia
      ? new Date(`${fechaFin}T23:59:00`).toISOString()
      : new Date(`${fechaFin}T${horaFin}:00`).toISOString();
    await supabase.from('bloqueos_profesional').update({ tipo, motivo: motivo || null, inicio: ini, fin }).eq('id', bloqueo.id);
    setSaving(false);
    onSaved();
  }

  const TIPOS = ['vacaciones', 'formacion', 'reunion', 'baja', 'descanso', 'otro'];
  const TIPO_LABELS: Record<string,string> = { vacaciones:'Vacaciones', formacion:'Formacion', reunion:'Reunion', baja:'Baja', descanso:'Descanso', otro:'Otro' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: TOKENS.textSec, fontWeight: 600, marginBottom: 6 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease', padding: isMobile ? 12 : 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 16, padding: isMobile ? 16 : 28, width: isMobile ? '100%' : 440, maxHeight: '80vh', overflowY: 'auto', animation: 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Editar bloqueo</h2>

        {/* Tipo */}
        <div style={{ marginBottom: 16 }}>
          <span style={labelStyle}>Tipo</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {TIPOS.map((t) => (
              <button key={t} onClick={() => setTipo(t)}
                style={{ padding: '7px 0', borderRadius: 8, border: tipo === t ? `2px solid ${TOKENS.primary}` : `1px solid ${TOKENS.border}`, background: tipo === t ? TOKENS.primarySoft : TOKENS.bgCard, color: tipo === t ? TOKENS.primaryHi : TOKENS.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {TIPO_LABELS[t] || t}
              </button>
            ))}
          </div>
        </div>

        {/* Todo el dia */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div onClick={() => setTodoElDia(!todoElDia)} style={{ width: 36, height: 20, borderRadius: 10, background: todoElDia ? TOKENS.primary : TOKENS.bgCard, border: `1px solid ${todoElDia ? TOKENS.primary : TOKENS.borderHi}`, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 1, left: todoElDia ? 18 : 2, transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>Todo el dia</span>
        </div>

        {/* Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={labelStyle}>Fecha inicio</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
              <BtnFlecha onClick={() => adjustFI(-1)} />
              <div onClick={() => dateInicioRef.current?.showPicker?.()} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: TOKENS.text, cursor: 'pointer', userSelect: 'none', textTransform: 'capitalize' }}>{fmtFechaDisplay(fechaInicio)}</div>
              <BtnFlecha onClick={() => adjustFI(1)} plus />
              <input ref={dateInicioRef} type="date" value={fechaInicio} onChange={(e) => { if (e.target.value) { setFechaInicio(e.target.value); if (e.target.value > fechaFin) setFechaFin(e.target.value); }}} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>Fecha fin</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
              <BtnFlecha onClick={() => adjustFF(-1)} />
              <div onClick={() => dateFinRef.current?.showPicker?.()} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: TOKENS.text, cursor: 'pointer', userSelect: 'none', textTransform: 'capitalize' }}>{fmtFechaDisplay(fechaFin)}</div>
              <BtnFlecha onClick={() => adjustFF(1)} plus />
              <input ref={dateFinRef} type="date" value={fechaFin} onChange={(e) => { if (e.target.value) setFechaFin(e.target.value < fechaInicio ? fechaInicio : e.target.value); }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            </div>
          </div>
        </div>

        {/* Horas */}
        {!todoElDia && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div>
              <span style={labelStyle}>Hora inicio</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
                <BtnFlecha onClick={() => adjustH('ini', -1, 0)} />
                <NumBox value={horaInicio.split(':')[0]} label="h" />
                <BtnFlecha onClick={() => adjustH('ini', 1, 0)} plus />
                <span style={{ color: TOKENS.textTer, fontSize: 14, fontWeight: 700 }}>:</span>
                <BtnFlecha onClick={() => adjustH('ini', 0, -5)} />
                <NumBox value={horaInicio.split(':')[1]} label="m" />
                <BtnFlecha onClick={() => adjustH('ini', 0, 5)} plus />
              </div>
            </div>
            <div>
              <span style={labelStyle}>Hora fin</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
                <BtnFlecha onClick={() => adjustH('fin', -1, 0)} />
                <NumBox value={horaFin.split(':')[0]} label="h" />
                <BtnFlecha onClick={() => adjustH('fin', 1, 0)} plus />
                <span style={{ color: TOKENS.textTer, fontSize: 14, fontWeight: 700 }}>:</span>
                <BtnFlecha onClick={() => adjustH('fin', 0, -5)} />
                <NumBox value={horaFin.split(':')[1]} label="m" />
                <BtnFlecha onClick={() => adjustH('fin', 0, 5)} plus />
              </div>
            </div>
          </div>
        )}

        {/* Motivo */}
        <div style={{ marginBottom: 20 }}>
          <span style={labelStyle}>Motivo (opcional)</span>
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Cita medica..."
            style={{ width: '100%', padding: '8px 10px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 14px', background: 'transparent', color: TOKENS.textSec, border: `1px solid ${TOKENS.border}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(244,80,30,0.45)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
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

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: `${color}0a`, border: `1px solid ${color}22`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 9, letterSpacing: 0.8, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
    </div>
  );
}
