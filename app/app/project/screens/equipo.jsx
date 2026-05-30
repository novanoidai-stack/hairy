// Equipo screen — professionals + availability blocks
function ScreenEquipo() {
  const [selected, setSelected] = React.useState('p1');
  const profSel = window.PROFESIONALES.find(p => p.id === selected);

  const BLOQUES = [
    { tipo:'vacaciones', label:'Vacaciones', color:'#f59e0b', desde:'Lun 26 Oct', hasta:'Dom 01 Nov', dur:'7 días' },
    { tipo:'formacion',  label:'Formación', color:'#8b5cf6', desde:'Vie 23 Oct', hasta:'Vie 23 Oct', dur:'14:00 - 18:00' },
    { tipo:'descanso',   label:'Descanso',  color:'#10b981', desde:'Lun (todas)', hasta:'—', dur:'Día completo · semanal' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background: window.TOKENS.bg, color: window.TOKENS.text, fontFamily:'Inter, sans-serif' }}>
      <window.Topbar
        title="Equipo"
        sub="5 profesionales · 4 activos · gestiona disponibilidad y bloqueos"
        right={<>
          <window.Btn variant="ghost" icon={window.I.cal}>Horarios base</window.Btn>
          <window.Btn variant="primary" icon={window.I.plus}>Añadir profesional</window.Btn>
        </>}
      />

      <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 420px', overflow:'hidden' }}>
        {/* Cards grid */}
        <div style={{ overflowY:'auto', padding: 24 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap: 16 }}>
            {window.PROFESIONALES.map(p => {
              const isSel = p.id === selected;
              return (
                <div key={p.id} onClick={() => setSelected(p.id)} style={{
                  background: window.TOKENS.bgCard,
                  border: `1px solid ${isSel ? `${p.color}66` : window.TOKENS.border}`,
                  borderRadius: 16, padding: 18, cursor:'pointer',
                  position:'relative', overflow:'hidden',
                  boxShadow: isSel ? `0 0 0 1px ${p.color}66, 0 8px 30px ${p.color}22` : 'none',
                }}>
                  {/* Color stripe */}
                  <div style={{ position:'absolute', top:0, left:0, right:0, height: 3, background: p.color }} />
                  {/* Decorative blob */}
                  <div style={{ position:'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 999, background: `radial-gradient(circle, ${p.color}22, transparent 70%)` }} />

                  <div style={{ display:'flex', alignItems:'center', gap: 14, marginBottom: 14, position:'relative' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 999,
                      background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`,
                      display:'grid', placeItems:'center', color:'#fff', fontWeight: 700, fontSize: 16,
                      boxShadow: `0 4px 12px ${p.color}55, 0 0 0 1px rgba(255,255,255,0.06)`,
                    }}>{p.nombre.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{p.nombre}</div>
                        {!p.activo && <window.Pill color={window.TOKENS.textTer}>Inactivo</window.Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: window.TOKENS.textSec, marginTop: 2 }}>{p.rol} · {p.exp}</div>
                    </div>
                    <button style={{
                      width: 28, height: 28, borderRadius: 8, background:'transparent',
                      border: `1px solid ${window.TOKENS.border}`, color: window.TOKENS.textTer,
                      display:'grid', placeItems:'center', cursor:'pointer',
                    }}>{window.I.more}</button>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ background:'rgba(148,163,184,0.06)', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, color: window.TOKENS.textTer, fontWeight: 600 }}>CITAS / MES</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{p.citas}</div>
                    </div>
                    <div style={{ background:'rgba(148,163,184,0.06)', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, color: window.TOKENS.textTer, fontWeight: 600 }}>OCUPACIÓN</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: p.activo ? window.TOKENS.success : window.TOKENS.textTer }}>
                        {p.activo ? `${Math.min(95, 50 + p.citas)}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Week bar */}
                  <div style={{ display:'flex', gap: 4, alignItems:'flex-end', height: 32 }}>
                    {['L','M','X','J','V','S','D'].map((d, i) => {
                      const h = p.activo ? [60, 80, 50, 95, 70, 40, 0][i] : 0;
                      return (
                        <div key={i} style={{ flex: 1, display:'flex', flexDirection:'column', alignItems:'center', gap: 3 }}>
                          <div style={{ width:'100%', height: 24, borderRadius: 4, background:'rgba(148,163,184,0.08)', position:'relative', overflow:'hidden' }}>
                            <div style={{ position:'absolute', bottom: 0, left: 0, right: 0, height: `${h}%`, background: p.color, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 9, color: window.TOKENS.textTer, fontWeight: 600 }}>{d}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Add card */}
            <div style={{
              background: 'transparent', border: `1.5px dashed ${window.TOKENS.borderHi}`,
              borderRadius: 16, padding: 18, cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight: 200, gap: 8,
              color: window.TOKENS.textSec,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, background: window.TOKENS.primarySoft, color: window.TOKENS.primaryHi, display:'grid', placeItems:'center' }}>{window.I.plus}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: window.TOKENS.text }}>Añadir profesional</div>
              <div style={{ fontSize: 11, color: window.TOKENS.textTer }}>Estilista, barbero, colorista…</div>
            </div>
          </div>
        </div>

        {/* Right: blocks panel */}
        <div style={{ borderLeft:`1px solid ${window.TOKENS.border}`, padding: 24, overflowY:'auto', background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)' }}>
          <div style={{ display:'flex', alignItems:'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(135deg, ${profSel.color}, ${profSel.color}aa)`,
              display:'grid', placeItems:'center', color:'#fff', fontWeight: 700, fontSize: 13,
              boxShadow: `0 4px 12px ${profSel.color}55`,
            }}>{profSel.nombre.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{profSel.nombre}</div>
              <div style={{ fontSize: 11, color: window.TOKENS.textSec }}>{profSel.rol}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: window.TOKENS.textSec, marginBottom: 18 }}>Disponibilidad y bloqueos en el calendario.</div>

          {/* Horario base */}
          <Section title="Horario base">
            <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 12, padding: 14, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 4 }}>
              {[
                {d:'Lun', h:'9-18'},{d:'Mar', h:'9-18'},{d:'Mié', h:'9-18'},{d:'Jue', h:'10-20'},{d:'Vie', h:'9-20'},{d:'Sáb', h:'9-15'},{d:'Dom', h:null},
              ].map((x,i) => (
                <div key={i} style={{ textAlign:'center', padding: 6, borderRadius: 8, background: x.h ? 'rgba(99,102,241,0.10)' : 'rgba(148,163,184,0.05)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: x.h ? window.TOKENS.primaryHi : window.TOKENS.textTer }}>{x.d}</div>
                  <div style={{ fontSize: 9, color: x.h ? window.TOKENS.textSec : window.TOKENS.textTer, marginTop: 2 }}>{x.h || 'Cerrado'}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Bloques header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight: 600 }}>Bloqueos próximos</div>
            <button style={{
              fontSize: 11, fontWeight: 600, color: window.TOKENS.primaryHi,
              background:'rgba(99,102,241,0.10)', border:`1px solid rgba(99,102,241,0.25)`,
              padding:'5px 10px', borderRadius: 8, display:'inline-flex', alignItems:'center', gap: 5, cursor:'pointer',
            }}>{window.I.plus}Nuevo</button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap: 8, marginBottom: 18 }}>
            {BLOQUES.map((b,i) => (
              <div key={i} style={{
                display:'flex', alignItems:'stretch', gap: 12, padding: 12,
                background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 12,
              }}>
                <div style={{ width: 4, borderRadius: 2, background: b.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 4 }}>
                    <window.Pill color={b.color}>{b.label}</window.Pill>
                    <span style={{ fontSize: 11, color: window.TOKENS.textTer, fontWeight: 600 }}>{b.dur}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: window.TOKENS.text }}>{b.desde}{b.hasta !== '—' ? ` → ${b.hasta}` : ''}</div>
                </div>
                <button style={{ width: 24, height: 24, alignSelf:'center', borderRadius: 6, background:'transparent', border:'none', color: window.TOKENS.textTer, cursor:'pointer' }}>{window.I.more}</button>
              </div>
            ))}
          </div>

          {/* Tipos de bloqueo */}
          <Section title="Tipos de bloqueo">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
              {[
                { l:'Vacaciones', c:'#f59e0b' },
                { l:'Formación',  c:'#8b5cf6' },
                { l:'Reunión',    c:'#3b82f6' },
                { l:'Baja',       c:'#ef4444' },
                { l:'Descanso',   c:'#10b981' },
                { l:'Otro',       c:'#94a3b8' },
              ].map((t,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap: 8, padding: 10, background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: t.c, boxShadow:`0 0 8px ${t.c}66` }} />
                  <span style={{ fontSize: 12, color: window.TOKENS.text, fontWeight: 500 }}>{t.l}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

window.ScreenEquipo = ScreenEquipo;
