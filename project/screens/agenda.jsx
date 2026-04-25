// Agenda screen — month calendar + day timeline + appointments
function ScreenAgenda() {
  const [selectedDate, setSelectedDate] = React.useState(15); // 15th
  const [selectedProf, setSelectedProf] = React.useState('todos');

  // Mini calendar grid for October 2026
  const MONTH_NAMES = ['Octubre 2026'];
  const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  // Oct 1 2026 is Thursday → offset 3
  const offset = 3;
  const days = 31;
  const cells = [];
  for (let i=0;i<offset;i++) cells.push(null);
  for (let d=1;d<=days;d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  // counts (mock)
  const counts = { 1:2, 3:5, 6:7, 8:4, 9:3, 10:6, 13:4, 14:8, 15:9, 16:6, 17:11, 20:5, 21:7, 22:4, 23:6, 24:9, 27:3, 28:5, 29:8, 30:6 };

  const visibleProfs = window.PROFESIONALES.filter(p => p.activo);
  const filtered = window.CITAS_HOY.filter(c => selectedProf === 'todos' || c.prof === selectedProf);

  return (
    <div style={{ display:'flex', flexDirection:'column', height: '100%', background: window.TOKENS.bg, color: window.TOKENS.text, fontFamily:'Inter, sans-serif' }}>
      <window.Topbar
        title="Agenda"
        sub="Jueves, 15 octubre · 9 citas hoy · 4 confirmadas"
        right={<>
          <button style={{ padding:8, background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 10, color: window.TOKENS.textSec, position:'relative' }}>
            {window.I.bell}
            <span style={{ position:'absolute', top: 5, right: 5, width: 7, height: 7, background: window.TOKENS.danger, borderRadius: 999, boxShadow:'0 0 0 2px '+window.TOKENS.bg }} />
          </button>
          <window.Btn variant="ghost" icon={window.I.cal}>Hoy</window.Btn>
          <window.Btn variant="primary" icon={window.I.plus}>Nueva cita</window.Btn>
        </>}
      />

      <div style={{ flex: 1, display:'grid', gridTemplateColumns:'380px 1fr', overflow:'hidden' }}>

        {/* Left rail */}
        <div style={{ borderRight: `1px solid ${window.TOKENS.border}`, padding: 24, overflowY:'auto', display:'flex', flexDirection:'column', gap: 20 }}>

          {/* Mini stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
            <Stat label="Hoy" value="9" sub="citas" tone={window.TOKENS.primary} />
            <Stat label="Ingresos" value="487 €" sub="estimado día" tone={window.TOKENS.success} />
            <Stat label="Mes" value="187" sub="citas / 240" tone={window.TOKENS.warning} progress={0.78} />
            <Stat label="Ocupación" value="78%" sub="esta semana" tone={window.TOKENS.violet} progress={0.78} />
          </div>

          {/* Mini calendar */}
          <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 16, padding: 16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
              <button style={navBtn}>{window.I.chevronL}</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: window.TOKENS.text }}>{MONTH_NAMES[0]}</div>
              <button style={navBtn}>{window.I.chevronR}</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
              {DAY_NAMES.map(d => <div key={d} style={{ textAlign:'center', fontSize: 10, fontWeight: 600, color: window.TOKENS.textTer, letterSpacing: 0.5, padding: 4 }}>{d}</div>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 4 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} style={{ height: 40 }} />;
                const isSel = d === selectedDate;
                const isToday = d === 15;
                const cnt = counts[d] || 0;
                return (
                  <button key={i} onClick={() => setSelectedDate(d)} style={{
                    height: 40, borderRadius: 9,
                    background: isToday ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : isSel ? 'rgba(99,102,241,0.16)' : 'transparent',
                    border: isSel && !isToday ? `1px solid ${window.TOKENS.primary}` : '1px solid transparent',
                    color: isToday ? '#fff' : isSel ? window.TOKENS.primaryHi : window.TOKENS.textSec,
                    fontSize: 12, fontWeight: isToday || isSel ? 700 : 500,
                    cursor:'pointer', position:'relative',
                    display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column',
                    boxShadow: isToday ? '0 4px 14px rgba(99,102,241,0.5)' : 'none',
                  }}>
                    <span>{d}</span>
                    {cnt > 0 && (
                      <div style={{
                        marginTop: 1, height: 3, width: 3, borderRadius:999,
                        background: isToday ? '#fff' : window.TOKENS.primaryHi,
                        boxShadow: cnt > 5 ? `8px 0 0 ${isToday?'#fff':window.TOKENS.primaryHi}, -8px 0 0 ${isToday?'#fff':window.TOKENS.primaryHi}` : cnt > 2 ? `5px 0 0 ${isToday?'#fff':window.TOKENS.primaryHi}` : 'none',
                      }}/>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Profesionales filter */}
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: window.TOKENS.textTer, textTransform:'uppercase', marginBottom: 10, fontWeight: 600 }}>Profesionales</div>
            <div style={{ display:'flex', flexDirection:'column', gap: 6 }}>
              <ProfRow id="todos" name="Todos" color={window.TOKENS.primary} count={9} selected={selectedProf==='todos'} onSel={() => setSelectedProf('todos')} icon="dots" />
              {visibleProfs.map(p => (
                <ProfRow key={p.id} id={p.id} name={p.nombre} role={p.rol} color={p.color}
                  count={window.CITAS_HOY.filter(c => c.prof === p.id).length}
                  selected={selectedProf===p.id} onSel={() => setSelectedProf(p.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Day timeline */}
        <div style={{ overflowY:'auto', padding: 24 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ display:'flex', alignItems:'baseline', gap: 12 }}>
                <h2 style={{ margin:0, fontSize: 22, fontWeight: 700, letterSpacing:-0.3 }}>Jueves, 15 oct</h2>
                <window.Pill color={window.TOKENS.primary}>HOY</window.Pill>
              </div>
              <div style={{ fontSize: 13, color: window.TOKENS.textSec, marginTop: 4 }}>9 citas programadas · 487 € estimados</div>
            </div>
            <div style={{ display:'flex', gap: 8 }}>
              <ViewTab active>Día</ViewTab>
              <ViewTab>Semana</ViewTab>
              <ViewTab>Mes</ViewTab>
            </div>
          </div>

          <DayTimeline citas={filtered} />
        </div>

      </div>
    </div>
  );
}

const navBtn = {
  width: 28, height: 28, borderRadius: 8,
  background: 'transparent', border: `1px solid ${window.TOKENS.border}`, color: window.TOKENS.textSec,
  cursor:'pointer', display:'grid', placeItems:'center',
};

function Stat({ label, value, sub, tone, progress }) {
  return (
    <div style={{
      background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 14, padding: 14,
      position:'relative', overflow:'hidden',
    }}>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight:600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: window.TOKENS.text, marginTop: 4, letterSpacing:-0.3 }}>{value}</div>
      <div style={{ fontSize: 11, color: window.TOKENS.textSec, marginTop: 2 }}>{sub}</div>
      {progress != null && (
        <div style={{ marginTop: 8, height: 3, borderRadius: 99, background:'rgba(148,163,184,0.12)' }}>
          <div style={{ width: `${progress*100}%`, height:'100%', borderRadius: 99, background: tone }} />
        </div>
      )}
      <div style={{ position:'absolute', top: 12, right: 12, width: 6, height: 6, borderRadius: 999, background: tone, boxShadow: `0 0 10px ${tone}` }} />
    </div>
  );
}

function ProfRow({ name, role, color, count, selected, onSel, icon }) {
  return (
    <button onClick={onSel} style={{
      display:'flex', alignItems:'center', gap: 10, padding: '8px 10px',
      background: selected ? 'rgba(99,102,241,0.10)' : 'transparent',
      border: `1px solid ${selected ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
      borderRadius: 10, cursor:'pointer', textAlign:'left',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 999,
        background: icon === 'dots' ? `linear-gradient(135deg, #818cf8, ${color})` : `linear-gradient(135deg, ${color}, ${color}cc)`,
        display:'grid', placeItems:'center', color:'#fff', fontSize: 11, fontWeight: 700,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.06)`,
      }}>
        {icon === 'dots' ? '••' : name.split(' ').map(n => n[0]).slice(0,2).join('')}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? window.TOKENS.text : window.TOKENS.textSec, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
        {role && <div style={{ fontSize: 11, color: window.TOKENS.textTer }}>{role}</div>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: window.TOKENS.textSec, padding:'2px 7px', borderRadius: 6, background:'rgba(148,163,184,0.10)' }}>{count}</div>
    </button>
  );
}

function ViewTab({ children, active }) {
  return (
    <button style={{
      padding:'7px 14px', fontSize: 12, fontWeight: 600,
      background: active ? window.TOKENS.bgCard : 'transparent',
      border: `1px solid ${active ? window.TOKENS.borderHi : window.TOKENS.border}`,
      borderRadius: 8, color: active ? window.TOKENS.text : window.TOKENS.textSec, cursor:'pointer',
    }}>{children}</button>
  );
}

function DayTimeline({ citas }) {
  // Hours from 9 to 19
  const HOURS = [];
  for (let h = 9; h <= 19; h++) HOURS.push(h);
  const ROW_H = 64; // pixels per hour
  const START_H = 9;

  const profsActivos = window.PROFESIONALES.filter(p => p.activo);
  // Place each cita in its prof column
  const totalH = (HOURS.length - 1) * ROW_H + ROW_H;

  // current time line at 11:20
  const nowTop = (11 - START_H) * ROW_H + (20/60) * ROW_H;

  return (
    <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 16, overflow:'hidden' }}>
      {/* Header row with profs */}
      <div style={{ display:'grid', gridTemplateColumns:`56px repeat(${profsActivos.length}, 1fr)`, borderBottom:`1px solid ${window.TOKENS.border}`, background: 'rgba(99,102,241,0.04)' }}>
        <div />
        {profsActivos.map(p => (
          <div key={p.id} style={{ padding:'12px 14px', borderLeft:`1px solid ${window.TOKENS.border}`, display:'flex', alignItems:'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: window.TOKENS.text }}>{p.nombre.split(' ')[0]}</div>
              <div style={{ fontSize: 10, color: window.TOKENS.textTer }}>{p.rol}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ position:'relative', display:'grid', gridTemplateColumns:`56px repeat(${profsActivos.length}, 1fr)` }}>
        {/* Hour gutter */}
        <div>
          {HOURS.map(h => (
            <div key={h} style={{ height: ROW_H, padding: '6px 8px', borderTop: `1px solid ${window.TOKENS.border}`, fontSize: 10, color: window.TOKENS.textTer, fontWeight: 600, textAlign:'right' }}>
              {String(h).padStart(2,'0')}:00
            </div>
          ))}
        </div>

        {profsActivos.map(p => (
          <div key={p.id} style={{ position:'relative', borderLeft:`1px solid ${window.TOKENS.border}` }}>
            {HOURS.map((h, i) => (
              <div key={h} style={{
                height: ROW_H,
                borderTop: `1px solid ${window.TOKENS.border}`,
                background: (i % 2 === 1) ? 'rgba(255,255,255,0.012)' : 'transparent',
              }} />
            ))}
            {/* citas for this prof */}
            {citas.filter(c => c.prof === p.id).map(cita => {
              const [hh, mm] = cita.hora.split(':').map(Number);
              const top = (hh - START_H) * ROW_H + (mm/60) * ROW_H;
              const height = (cita.dur / 60) * ROW_H - 3;
              const meta = window.ESTADO_META[cita.estado];
              return (
                <div key={cita.id} style={{
                  position:'absolute', top, left: 4, right: 4, height,
                  background: `linear-gradient(180deg, ${p.color}28, ${p.color}18)`,
                  border: `1px solid ${p.color}55`,
                  borderLeft: `3px solid ${p.color}`,
                  borderRadius: 8, padding: '6px 8px',
                  overflow:'hidden', cursor:'pointer',
                  display:'flex', flexDirection:'column', gap: 2,
                  boxShadow: `0 4px 14px ${p.color}22`,
                }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 6 }}>
                    <span style={{ fontSize: 10, color: window.TOKENS.textTer, fontWeight: 600 }}>{cita.hora}</span>
                    <div style={{ width: 5, height: 5, borderRadius: 999, background: meta.color }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: window.TOKENS.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cita.cliente}</div>
                  {height > 38 && <div style={{ fontSize: 10, color: window.TOKENS.textSec, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cita.servicio}</div>}
                </div>
              );
            })}
          </div>
        ))}

        {/* now line */}
        <div style={{ position:'absolute', left: 56, right: 0, top: nowTop, height: 0, borderTop:`2px dashed ${window.TOKENS.danger}`, pointerEvents:'none' }}>
          <div style={{ position:'absolute', left: -8, top: -7, width: 12, height: 12, borderRadius: 999, background: window.TOKENS.danger, boxShadow: `0 0 12px ${window.TOKENS.danger}` }} />
          <div style={{ position:'absolute', left: 8, top: -10, fontSize: 9, fontWeight: 700, color: window.TOKENS.danger, background: window.TOKENS.bg, padding:'2px 6px', borderRadius: 4, border:`1px solid ${window.TOKENS.danger}55` }}>11:20 AHORA</div>
        </div>
      </div>
    </div>
  );
}

window.ScreenAgenda = ScreenAgenda;
