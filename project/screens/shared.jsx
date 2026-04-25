// Shared design tokens + primitive components
const TOKENS = {
  bg:        '#0b1220',
  bgPanel:   '#0f172a',
  bgCard:    '#141f33',
  bgCardHi:  '#1a2540',
  border:    'rgba(148,163,184,0.10)',
  borderHi:  'rgba(148,163,184,0.18)',
  text:      '#f8fafc',
  textSec:   '#94a3b8',
  textTer:   '#64748b',
  primary:   '#6366f1',
  primaryHi: '#818cf8',
  primarySoft:'rgba(99,102,241,0.14)',
  primaryGlow:'rgba(99,102,241,0.45)',
  success:   '#10b981',
  successSoft:'rgba(16,185,129,0.14)',
  warning:   '#f59e0b',
  warningSoft:'rgba(245,158,11,0.14)',
  danger:    '#ef4444',
  dangerSoft:'rgba(239,68,68,0.14)',
  violet:    '#8b5cf6',
  violetSoft:'rgba(139,92,246,0.14)',
  cyan:      '#06b6d4',
  cyanSoft:  'rgba(6,182,212,0.14)',
  rose:      '#ec4899',
};

// Mock seed data
const PROFESIONALES = [
  { id: 'p1', nombre: 'Carla Mendoza',   rol: 'Estilista Senior',  color: '#6366f1', activo: true,  citas: 32, exp: '6 años' },
  { id: 'p2', nombre: 'Diego Ramos',      rol: 'Barbero',           color: '#10b981', activo: true,  citas: 28, exp: '4 años' },
  { id: 'p3', nombre: 'Sofía León',       rol: 'Colorista',         color: '#f59e0b', activo: true,  citas: 21, exp: '3 años' },
  { id: 'p4', nombre: 'Marco Torres',     rol: 'Barbero Junior',    color: '#06b6d4', activo: true,  citas: 17, exp: '1 año'  },
  { id: 'p5', nombre: 'Lucía Iglesias',   rol: 'Estilista',         color: '#ec4899', activo: false, citas: 0,  exp: '5 años' },
];

const SERVICIOS = [
  { id: 's1', nombre: 'Corte Caballero',         precio: 18, duracion: 30, categoria: 'Corte' },
  { id: 's2', nombre: 'Corte + Barba',           precio: 28, duracion: 45, categoria: 'Corte' },
  { id: 's3', nombre: 'Corte Dama',              precio: 32, duracion: 45, categoria: 'Corte' },
  { id: 's4', nombre: 'Coloración Completa',     precio: 75, duracion: 120, categoria: 'Color' },
  { id: 's5', nombre: 'Mechas Babylights',       precio: 95, duracion: 150, categoria: 'Color' },
  { id: 's6', nombre: 'Tratamiento Keratina',    precio: 110, duracion: 90, categoria: 'Tratamiento' },
  { id: 's7', nombre: 'Lavado + Peinado',        precio: 22, duracion: 30, categoria: 'Peinado' },
  { id: 's8', nombre: 'Recogido / Evento',       precio: 55, duracion: 60, categoria: 'Peinado' },
];

const CLIENTES = [
  { id:'c1', nombre:'Ana García Pérez',     tel:'+34 612 345 678', visitas: 14, ultimaVisita:'hace 5 días',  gastado: 482, fav:'Coloración', tag: 'VIP' },
  { id:'c2', nombre:'Roberto Silva',         tel:'+34 633 221 109', visitas: 8,  ultimaVisita:'hace 2 sem',   gastado: 184, fav:'Corte + Barba', tag: 'Habitual' },
  { id:'c3', nombre:'María Jiménez',         tel:'+34 654 777 234', visitas: 22, ultimaVisita:'ayer',         gastado: 836, fav:'Mechas', tag: 'VIP' },
  { id:'c4', nombre:'Javier Moreno',         tel:'+34 622 119 088', visitas: 3,  ultimaVisita:'hace 3 días',  gastado: 84,  fav:'Corte Caballero', tag: 'Nuevo' },
  { id:'c5', nombre:'Carmen Vázquez',        tel:'+34 691 545 921', visitas: 11, ultimaVisita:'hace 1 sem',   gastado: 392, fav:'Keratina', tag: 'Habitual' },
  { id:'c6', nombre:'Pablo Castro',          tel:'+34 678 332 445', visitas: 6,  ultimaVisita:'hace 4 días',  gastado: 168, fav:'Corte + Barba', tag: 'Habitual' },
  { id:'c7', nombre:'Elena Ruiz',            tel:'+34 645 882 117', visitas: 19, ultimaVisita:'hoy',          gastado: 712, fav:'Coloración', tag: 'VIP' },
  { id:'c8', nombre:'Tomás Herrera',         tel:'+34 611 223 994', visitas: 1,  ultimaVisita:'hace 1 día',   gastado: 28,  fav:'Corte Caballero', tag: 'Nuevo' },
];

const CITAS_HOY = [
  { id:'a1', hora:'09:00', dur: 30,  cliente:'Roberto Silva',     servicio:'Corte + Barba',         prof:'p2', estado:'completada', precio: 28 },
  { id:'a2', hora:'09:30', dur: 45,  cliente:'Elena Ruiz',         servicio:'Coloración Completa',   prof:'p3', estado:'completada', precio: 75 },
  { id:'a3', hora:'10:30', dur: 30,  cliente:'Pablo Castro',       servicio:'Corte Caballero',       prof:'p2', estado:'confirmada', precio: 18 },
  { id:'a4', hora:'10:45', dur: 60,  cliente:'María Jiménez',      servicio:'Mechas Babylights',     prof:'p1', estado:'confirmada', precio: 95 },
  { id:'a5', hora:'12:00', dur: 30,  cliente:'Javier Moreno',      servicio:'Corte Caballero',       prof:'p4', estado:'pendiente',  precio: 18 },
  { id:'a6', hora:'13:00', dur: 45,  cliente:'Ana García',         servicio:'Corte Dama',            prof:'p1', estado:'confirmada', precio: 32 },
  { id:'a7', hora:'15:30', dur: 90,  cliente:'Carmen Vázquez',     servicio:'Tratamiento Keratina',  prof:'p1', estado:'confirmada', precio:110 },
  { id:'a8', hora:'16:00', dur: 30,  cliente:'Tomás Herrera',      servicio:'Corte Caballero',       prof:'p4', estado:'pendiente',  precio: 18 },
  { id:'a9', hora:'17:00', dur: 60,  cliente:'Lucía Pérez',        servicio:'Recogido / Evento',     prof:'p3', estado:'confirmada', precio: 55 },
];

const ESTADO_META = {
  pendiente:  { label:'Pendiente',  color:'#f59e0b', soft:'rgba(245,158,11,0.14)' },
  confirmada: { label:'Confirmada', color:'#6366f1', soft:'rgba(99,102,241,0.14)' },
  completada: { label:'Completada', color:'#10b981', soft:'rgba(16,185,129,0.14)' },
  no_show:    { label:'No-show',    color:'#ef4444', soft:'rgba(239,68,68,0.14)'  },
  cancelada:  { label:'Cancelada',  color:'#94a3b8', soft:'rgba(148,163,184,0.14)'},
};

// ── Logo
function HairyLogo({ size = 28 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
      <div style={{
        width: size, height: size, borderRadius: 8,
        background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 60%,#4f46e5 100%)',
        display:'grid', placeItems:'center',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 6px 18px rgba(99,102,241,0.45)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.45), transparent 60%)' }} />
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
          <path d="M5 4 C5 14, 5 18, 9 20 M9 4 C9 14, 9 18, 5 20 M15 4 C15 14, 15 18, 19 20 M19 4 C19 14, 19 18, 15 20" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ display:'flex', flexDirection:'column', lineHeight: 1 }}>
        <span style={{ fontFamily:'"Instrument Serif", serif', fontSize: 22, color:'#f8fafc', letterSpacing:-0.5 }}>hairy</span>
        <span style={{ fontSize: 9, letterSpacing: 2, color:'#64748b', textTransform:'uppercase', marginTop: 2 }}>studio · pro</span>
      </div>
    </div>
  );
}

// ── Sidebar (desktop)
function Sidebar({ active = 'agenda' }) {
  const items = [
    { id:'agenda',   label:'Agenda',        icon:'M4 6h16M4 12h16M4 18h16' },
    { id:'clientes', label:'Clientes',      icon:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0' },
    { id:'equipo',   label:'Equipo',        icon:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.7M22 21a7 7 0 0 0-5-6.7' },
    { id:'informes', label:'Informes',      icon:'M3 3v18h18M7 14l4-4 4 4 5-6' },
  ];
  const Icon = ({ d, active }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? TOKENS.primaryHi : TOKENS.textSec} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
  return (
    <aside style={{
      width: 240, background: TOKENS.bgPanel, borderRight: `1px solid ${TOKENS.border}`,
      padding: 22, display:'flex', flexDirection:'column', gap: 28,
      flexShrink: 0,
    }}>
      <HairyLogo />

      {/* Search shortcut */}
      <div style={{
        display:'flex', alignItems:'center', gap: 10,
        background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
        padding: '8px 10px', color: TOKENS.textTer, fontSize: 13,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <span style={{ flex: 1 }}>Buscar…</span>
        <kbd style={{ fontSize: 10, padding:'2px 6px', borderRadius: 4, background:'#0b1220', border:`1px solid ${TOKENS.border}`, color: TOKENS.textSec }}>⌘K</kbd>
      </div>

      <nav style={{ display:'flex', flexDirection:'column', gap: 4, flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform:'uppercase', padding:'4px 12px 8px' }}>Principal</div>
        {items.map(it => {
          const isAct = it.id === active;
          return (
            <div key={it.id} style={{
              display:'flex', alignItems:'center', gap: 12,
              padding:'10px 12px', borderRadius: 10,
              background: isAct ? TOKENS.primarySoft : 'transparent',
              border: `1px solid ${isAct ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
              color: isAct ? TOKENS.text : TOKENS.textSec,
              fontSize: 14, fontWeight: isAct ? 600 : 500,
              position:'relative',
            }}>
              {isAct && <div style={{ position:'absolute', left:-22, top:'50%', transform:'translateY(-50%)', width: 3, height: 18, background: TOKENS.primary, borderRadius: '0 3px 3px 0' }} />}
              <Icon d={it.icon} active={isAct} />
              <span>{it.label}</span>
            </div>
          );
        })}
      </nav>

      <div style={{ display:'flex', flexDirection:'column', gap: 4 }}>
        <div style={{
          display:'flex', alignItems:'center', gap: 12,
          padding:'10px 12px', borderRadius: 10, color: TOKENS.textSec, fontSize: 14,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
          <span>Configuración</span>
        </div>

        {/* Account card */}
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 12,
          background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
          display:'flex', alignItems:'center', gap: 10,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, background:'linear-gradient(135deg,#818cf8,#6366f1)', display:'grid', placeItems:'center', color:'#fff', fontWeight:700, fontSize: 13 }}>RM</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>Rosa Mendoza</div>
            <div style={{ fontSize: 11, color: TOKENS.textTer }}>Salón Bonita · Admin</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.textTer} strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
    </aside>
  );
}

// ── Generic chrome
function Pill({ children, color = TOKENS.primary, soft }) {
  const bg = soft || `${color}22`;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap: 6,
      padding:'4px 9px', borderRadius: 999,
      background: bg, color: color,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
      border: `1px solid ${color}33`,
    }}>{children}</span>
  );
}

function Btn({ children, variant='primary', icon, onClick, style }) {
  const map = {
    primary: {
      bg: 'linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.12)',
      shadow: '0 6px 20px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
    },
    ghost: {
      bg: TOKENS.bgCard,
      color: TOKENS.text,
      border: `1px solid ${TOKENS.border}`,
      shadow: 'none',
    },
    danger: {
      bg: 'transparent',
      color: TOKENS.danger,
      border: `1px solid ${TOKENS.danger}55`,
      shadow: 'none',
    },
  };
  const s = map[variant];
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap: 8,
      padding:'9px 14px', borderRadius: 10,
      background: s.bg, color: s.color, border: s.border, boxShadow: s.shadow,
      fontSize: 13, fontWeight: 600, cursor:'pointer',
      ...style,
    }}>
      {icon}
      {children}
    </button>
  );
}

// Tiny icon helpers
const I = {
  plus:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  search:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  filter:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h18l-7 9v7l-4-2v-5L3 4Z"/></svg>,
  chevronL:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  chevronR:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  more:    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>,
  phone:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>,
  star:    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z"/></svg>,
  clock:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  euro:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 7a7 7 0 1 0 0 10M5 10h9M5 14h9"/></svg>,
  close:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>,
  edit:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>,
  trash:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>,
  check:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5"/></svg>,
  bell:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>,
  cal:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
};

// Topbar shared
function Topbar({ title, sub, right }) {
  return (
    <header style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: '20px 32px',
      borderBottom: `1px solid ${TOKENS.border}`,
      background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent)',
    }}>
      <div>
        <h1 style={{ margin:0, fontSize: 26, fontWeight: 700, color: TOKENS.text, letterSpacing:-0.4 }}>{title}</h1>
        {sub && <div style={{ marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>{sub}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
        {right}
      </div>
    </header>
  );
}

Object.assign(window, { TOKENS, PROFESIONALES, SERVICIOS, CLIENTES, CITAS_HOY, ESTADO_META, HairyLogo, Sidebar, Pill, Btn, I, Topbar });
