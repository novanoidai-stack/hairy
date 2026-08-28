// Mobile (iOS-style) frame variant of agenda
function MobileAgenda() {
  const T = window.TOKENS;
  const w = 360, h = 760;
  return (
    <div style={{ width: w, height: h, background: T.bg, borderRadius: 38, overflow:'hidden', position:'relative', border:`1px solid ${T.borderHi}`, boxShadow:'0 0 0 8px #1a1f2e, 0 30px 70px rgba(0,0,0,0.5)', fontFamily:'Inter, sans-serif', color: T.text }}>
      {/* Status bar */}
      <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 26px 6px', fontSize: 13, fontWeight: 600 }}>
        <span>9:41</span>
        <div style={{ width: 110, height: 28, background:'#000', borderRadius: 999, position:'absolute', top: 6, left:'50%', transform:'translateX(-50%)' }} />
        <div style={{ display:'flex', gap: 5, alignItems:'center' }}>
          <svg width="15" height="11" viewBox="0 0 24 18" fill="currentColor"><rect x="0" y="6" width="3" height="12" rx="0.5"/><rect x="6" y="3" width="3" height="15" rx="0.5"/><rect x="12" y="0" width="3" height="18" rx="0.5"/><rect x="18" y="0" width="3" height="18" rx="0.5"/></svg>
          <svg width="14" height="11" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="20" height="10" rx="2"/><rect x="3" y="5" width="14" height="6" fill="currentColor"/></svg>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding:'14px 20px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: T.textTer, letterSpacing: 1.5, fontWeight: 600 }}>JUEVES</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing:-0.5 }}>15 Octubre</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 999, background:'linear-gradient(135deg,#818cf8,#6366f1)', display:'grid', placeItems:'center', color:'#fff', fontWeight: 700, fontSize: 13, boxShadow:'0 4px 12px rgba(99,102,241,0.5)' }}>RM</div>
        </div>

        <div style={{ display:'flex', gap: 8, marginBottom: 4 }}>
          <div style={{ flex:1, padding:'10px 12px', background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 12 }}>
            <div style={{ fontSize: 9, color: T.textTer, letterSpacing: 1, fontWeight: 600 }}>HOY</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>9 <span style={{ fontSize: 10, color: T.textSec, fontWeight: 500 }}>citas</span></div>
          </div>
          <div style={{ flex:1, padding:'10px 12px', background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.06))', border:`1px solid rgba(16,185,129,0.30)`, borderRadius: 12 }}>
            <div style={{ fontSize: 9, color:'#10b981', letterSpacing: 1, fontWeight: 600 }}>INGRESOS</div>
            <div style={{ fontSize: 18, fontWeight: 700, color:'#10b981' }}>487 €</div>
          </div>
        </div>
      </div>

      {/* Mini week calendar */}
      <div style={{ padding:'0 20px 16px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 6 }}>
          {[
            {d:'L', n:13},{d:'M', n:14},{d:'X', n:15, sel:true},{d:'J', n:16},{d:'V', n:17},{d:'S', n:18},{d:'D', n:19},
          ].map((x,i) => (
            <div key={i} style={{
              padding:'10px 0', borderRadius: 12, textAlign:'center',
              background: x.sel ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : T.bgCard,
              border:`1px solid ${x.sel ? '#6366f1' : T.border}`,
              boxShadow: x.sel ? '0 6px 18px rgba(99,102,241,0.5)' : 'none',
            }}>
              <div style={{ fontSize: 9, color: x.sel ? 'rgba(255,255,255,0.8)' : T.textTer, fontWeight: 600, letterSpacing: 0.5 }}>{x.d}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: x.sel ? '#fff' : T.text, marginTop: 2 }}>{x.n}</div>
              {[14,15,17,18].includes(x.n) && <div style={{ width: 4, height: 4, borderRadius: 999, background: x.sel ? '#fff' : T.primaryHi, margin:'4px auto 0' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Citas list */}
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap: 10, height: 380, overflow:'hidden' }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: T.textTer, textTransform:'uppercase', fontWeight: 600 }}>Próximas citas</div>
        {window.CITAS_HOY.slice(2, 7).map(c => {
          const meta = window.ESTADO_META[c.estado];
          const prof = window.PROFESIONALES.find(p => p.id === c.prof);
          return (
            <div key={c.id} style={{
              display:'flex', gap: 10, padding: 12,
              background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 14,
              borderLeft: `3px solid ${prof.color}`,
            }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth: 42 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.hora}</div>
                <div style={{ fontSize: 9, color: T.textTer, marginTop: 2 }}>{c.dur}m</div>
              </div>
              <div style={{ width: 1, background: T.border }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.cliente}</div>
                <div style={{ fontSize: 11, color: T.textSec, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.servicio}</div>
                <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 999, background: prof.color }} />
                  <span style={{ fontSize: 10, color: T.textTer }}>{prof.nombre.split(' ')[0]}</span>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 4 }}>
                <window.Pill color={meta.color} soft={meta.soft}>{meta.label}</window.Pill>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{c.precio}€</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* FAB */}
      <button style={{
        position:'absolute', right: 20, bottom: 88,
        width: 56, height: 56, borderRadius: 18,
        background:'linear-gradient(180deg,#7c83ff,#6366f1)',
        border:'1px solid rgba(255,255,255,0.15)', color:'#fff',
        display:'grid', placeItems:'center', cursor:'pointer',
        boxShadow:'0 10px 24px rgba(99,102,241,0.55)',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      {/* Bottom tab bar */}
      <div style={{
        position:'absolute', bottom: 0, left: 0, right: 0,
        background: T.bgPanel, borderTop:`1px solid ${T.border}`,
        padding:'10px 16px 22px',
        display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
      }}>
        {[
          {l:'Agenda', d:'M3 5h18M3 12h18M3 19h18', active:true},
          {l:'Clientes', d:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0'},
          {l:'Equipo', d:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0'},
          {l:'Informes', d:'M3 3v18h18M7 14l4-4 4 4 5-6'},
        ].map((t,i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.active ? T.primaryHi : T.textTer} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.d}/></svg>
            <span style={{ fontSize: 10, color: t.active ? T.primaryHi : T.textTer, fontWeight: 600 }}>{t.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.MobileAgenda = MobileAgenda;
