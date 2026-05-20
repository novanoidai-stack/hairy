// Mobile (iOS-style) frames for all 4 main screens

function PhoneFrame({ children, label }) {
  const T = window.TOKENS;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 14 }}>
      <div style={{
        width: 360, height: 760, background: T.bg, borderRadius: 38,
        overflow:'hidden', position:'relative',
        border:`1px solid ${T.borderHi}`,
        boxShadow:'0 0 0 8px #1a1f2e, 0 30px 70px rgba(0,0,0,0.5)',
        fontFamily:'Inter, sans-serif', color: T.text,
      }}>
        {/* Status bar */}
        <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 26px 6px', fontSize: 13, fontWeight: 600 }}>
          <span>9:41</span>
          <div style={{ width: 110, height: 28, background:'#000', borderRadius: 999, position:'absolute', top: 6, left:'50%', transform:'translateX(-50%)' }} />
          <div style={{ display:'flex', gap: 5, alignItems:'center' }}>
            <svg width="15" height="11" viewBox="0 0 24 18" fill="currentColor"><rect x="0" y="6" width="3" height="12" rx="0.5"/><rect x="6" y="3" width="3" height="15" rx="0.5"/><rect x="12" y="0" width="3" height="18" rx="0.5"/><rect x="18" y="0" width="3" height="18" rx="0.5"/></svg>
            <svg width="14" height="11" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="20" height="10" rx="2"/><rect x="3" y="5" width="14" height="6" fill="currentColor"/></svg>
          </div>
        </div>
        {children}
      </div>
      {label && <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, fontFamily:'Inter, sans-serif' }}>{label}</div>}
    </div>
  );
}

function MobileTabBar({ active }) {
  const T = window.TOKENS;
  return (
    <div style={{
      position:'absolute', bottom: 0, left: 0, right: 0,
      background: T.bgPanel, borderTop:`1px solid ${T.border}`,
      padding:'10px 16px 22px',
      display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
    }}>
      {[
        {id:'agenda', l:'Agenda', d:'M3 5h18M3 12h18M3 19h18'},
        {id:'clientes', l:'Clientes', d:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0'},
        {id:'equipo', l:'Equipo', d:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0'},
        {id:'config', l:'Ajustes', d:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33'},
      ].map(t => {
        const isAct = t.id === active;
        return (
          <div key={t.id} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isAct ? T.primaryHi : T.textTer} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.d}/></svg>
            <span style={{ fontSize: 10, color: isAct ? T.primaryHi : T.textTer, fontWeight: 600 }}>{t.l}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 1. AGENDA
function MobileAgenda() {
  const T = window.TOKENS;
  return (
    <PhoneFrame>
      <div style={{ padding:'14px 20px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: T.textTer, letterSpacing: 1.5, fontWeight: 600 }}>JUEVES</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing:-0.5 }}>15 Octubre</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 999, background:'linear-gradient(135deg,#818cf8,#6366f1)', display:'grid', placeItems:'center', color:'#fff', fontWeight: 700, fontSize: 13, boxShadow:'0 4px 12px rgba(99,102,241,0.5)' }}>RM</div>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
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
      <div style={{ padding:'0 20px 16px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 6 }}>
          {[{d:'L', n:13},{d:'M', n:14},{d:'X', n:15, sel:true},{d:'J', n:16},{d:'V', n:17},{d:'S', n:18},{d:'D', n:19}].map((x,i) => (
            <div key={i} style={{
              padding:'10px 0', borderRadius: 12, textAlign:'center',
              background: x.sel ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : T.bgCard,
              border:`1px solid ${x.sel ? '#6366f1' : T.border}`,
              boxShadow: x.sel ? '0 6px 18px rgba(99,102,241,0.5)' : 'none',
            }}>
              <div style={{ fontSize: 9, color: x.sel ? 'rgba(255,255,255,0.8)' : T.textTer, fontWeight: 600 }}>{x.d}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: x.sel ? '#fff' : T.text, marginTop: 2 }}>{x.n}</div>
              {[14,15,17,18].includes(x.n) && <div style={{ width: 4, height: 4, borderRadius: 999, background: x.sel ? '#fff' : T.primaryHi, margin:'4px auto 0' }} />}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap: 10, height: 380, overflow:'hidden' }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: T.textTer, textTransform:'uppercase', fontWeight: 600 }}>Próximas citas</div>
        {window.CITAS_HOY.slice(2, 7).map(c => {
          const meta = window.ESTADO_META[c.estado];
          const prof = window.PROFESIONALES.find(p => p.id === c.prof);
          return (
            <div key={c.id} style={{ display:'flex', gap: 10, padding: 12, background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 14, borderLeft: `3px solid ${prof.color}` }}>
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
      <button style={{ position:'absolute', right: 20, bottom: 88, width: 56, height: 56, borderRadius: 18, background:'linear-gradient(180deg,#7c83ff,#6366f1)', border:'1px solid rgba(255,255,255,0.15)', color:'#fff', display:'grid', placeItems:'center', cursor:'pointer', boxShadow:'0 10px 24px rgba(99,102,241,0.55)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <MobileTabBar active="agenda" />
    </PhoneFrame>
  );
}

// ── 2. CLIENTES
function MobileClientes() {
  const T = window.TOKENS;
  const TAGS = { VIP:{ color:'#f59e0b' }, Habitual:{ color:'#6366f1' }, Nuevo:{ color:'#10b981' } };
  return (
    <PhoneFrame>
      <div style={{ padding:'14px 20px 12px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing:-0.5 }}>Clientes</div>
            <div style={{ fontSize: 11, color: T.textTer, marginTop: 2 }}>{window.CLIENTES.length} activos · 23 nuevos</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(180deg,#7c83ff,#6366f1)', display:'grid', placeItems:'center', boxShadow:'0 6px 16px rgba(99,102,241,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 10, padding:'10px 12px', background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 12, marginBottom: 12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <span style={{ fontSize: 12, color: T.textTer }}>Buscar cliente…</span>
        </div>
        <div style={{ display:'flex', gap: 6, overflow:'hidden' }}>
          {[{l:'Todos', n:8, active:true, color:T.primary},{l:'VIP', n:3, color:'#f59e0b'},{l:'Habituales', n:14, color:T.primary},{l:'Nuevos', n:23, color:T.success}].map((t,i) => (
            <div key={i} style={{
              display:'inline-flex', alignItems:'center', gap: 5,
              padding:'6px 10px', borderRadius: 999,
              background: t.active ? `${t.color}22` : T.bgCard,
              border:`1px solid ${t.active ? `${t.color}55` : T.border}`,
              color: t.active ? t.color : T.textSec,
              fontSize: 11, fontWeight: 600, flexShrink: 0,
            }}>
              {t.l}<span style={{ fontSize: 9, padding:'1px 5px', borderRadius:99, background: t.active ? `${t.color}44` : 'rgba(148,163,184,0.10)' }}>{t.n}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap: 8, height: 460, overflow:'hidden' }}>
        {window.CLIENTES.slice(0,6).map(cl => (
          <div key={cl.id} style={{ display:'flex', gap: 12, padding: 12, background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 14, alignItems:'center' }}>
            <window.Avatar name={cl.nombre} size={42} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cl.nombre}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 3 }}>
                <window.Pill color={TAGS[cl.tag].color}>{cl.tag}</window.Pill>
                <span style={{ fontSize: 10, color: T.textTer }}>{cl.ultimaVisita}</span>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.success }}>{cl.gastado}€</div>
              <div style={{ fontSize: 9, color: T.textTer, marginTop: 2 }}>{cl.visitas} visitas</div>
            </div>
          </div>
        ))}
      </div>
      <MobileTabBar active="clientes" />
    </PhoneFrame>
  );
}

// ── 3. EQUIPO
function MobileEquipo() {
  const T = window.TOKENS;
  return (
    <PhoneFrame>
      <div style={{ padding:'14px 20px 12px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing:-0.5 }}>Equipo</div>
            <div style={{ fontSize: 11, color: T.textTer, marginTop: 2 }}>5 profesionales · 4 activos</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(180deg,#7c83ff,#6366f1)', display:'grid', placeItems:'center', boxShadow:'0 6px 16px rgba(99,102,241,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
        </div>
        <div style={{ display:'flex', gap: 8, marginBottom: 4 }}>
          <div style={{ flex:1, padding:'10px 12px', background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 12 }}>
            <div style={{ fontSize: 9, color: T.textTer, letterSpacing: 1, fontWeight: 600 }}>OCUPACIÓN</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.primaryHi }}>78%</div>
          </div>
          <div style={{ flex:1, padding:'10px 12px', background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))', border:`1px solid rgba(245,158,11,0.30)`, borderRadius: 12 }}>
            <div style={{ fontSize: 9, color:'#f59e0b', letterSpacing: 1, fontWeight: 600 }}>BLOQUES</div>
            <div style={{ fontSize: 18, fontWeight: 700, color:'#f59e0b' }}>3 <span style={{ fontSize: 10, fontWeight: 500 }}>activos</span></div>
          </div>
        </div>
      </div>
      <div style={{ padding:'14px 20px 0', display:'flex', flexDirection:'column', gap: 10, height: 470, overflow:'hidden' }}>
        {window.PROFESIONALES.map(p => (
          <div key={p.id} style={{ background: T.bgCard, border:`1px solid ${p.activo ? T.border : T.border}`, borderRadius: 14, padding: 12, position:'relative', overflow:'hidden', opacity: p.activo ? 1 : 0.55 }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height: 2, background: p.color }} />
            <div style={{ display:'flex', alignItems:'center', gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: 999, background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`, display:'grid', placeItems:'center', color:'#fff', fontWeight: 700, fontSize: 12, boxShadow: `0 4px 10px ${p.color}55` }}>
                {p.nombre.split(' ').map(n=>n[0]).slice(0,2).join('')}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.nombre}</div>
                <div style={{ fontSize: 10, color: T.textTer, marginTop: 1 }}>{p.rol} · {p.exp}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: p.activo ? T.text : T.textTer }}>{p.citas}</div>
                <div style={{ fontSize: 9, color: T.textTer }}>citas/mes</div>
              </div>
            </div>
            {p.activo && (
              <div style={{ display:'flex', gap: 3, marginTop: 10, alignItems:'flex-end', height: 18 }}>
                {[60,80,50,95,70,40,0].map((h, i) => (
                  <div key={i} style={{ flex:1, height: 16, borderRadius: 3, background:'rgba(148,163,184,0.08)', position:'relative', overflow:'hidden' }}>
                    <div style={{ position:'absolute', bottom: 0, left: 0, right: 0, height: `${h}%`, background: p.color }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <MobileTabBar active="equipo" />
    </PhoneFrame>
  );
}

// ── 4. CONFIGURACIÓN
function MobileConfig() {
  const T = window.TOKENS;
  return (
    <PhoneFrame>
      <div style={{ padding:'14px 20px 16px' }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing:-0.5 }}>Ajustes</div>
        <div style={{ fontSize: 11, color: T.textTer, marginTop: 2 }}>Salón Bonita · Madrid</div>
      </div>
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap: 14, height: 540, overflow:'hidden' }}>
        {/* Profile */}
        <div style={{ background:'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.04))', border:`1px solid rgba(99,102,241,0.30)`, borderRadius: 14, padding: 14, display:'flex', alignItems:'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 999, background:'linear-gradient(135deg,#818cf8,#6366f1)', display:'grid', placeItems:'center', color:'#fff', fontWeight: 700, fontSize: 15, boxShadow:'0 4px 12px rgba(99,102,241,0.5)' }}>RM</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Rosa Mendoza</div>
            <div style={{ fontSize: 11, color: T.textSec }}>Admin · hola@salonbonita.es</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>

        {/* Servicios */}
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: T.textTer, textTransform:'uppercase', fontWeight: 600, marginBottom: 8, padding:'0 4px' }}>Servicios · 8</div>
          <div style={{ background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 14, overflow:'hidden' }}>
            {window.SERVICIOS.slice(0,4).map((s, i, arr) => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap: 10, padding:'10px 12px', borderBottom: i < arr.length-1 ? `1px solid ${T.border}` : 'none' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{s.nombre}</div>
                  <div style={{ fontSize: 10, color: T.textTer, marginTop: 1 }}>{s.duracion} min</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.success }}>{s.precio}€</div>
                <div style={{ width: 28, height: 16, borderRadius: 999, background:'rgba(99,102,241,0.30)', position:'relative' }}>
                  <div style={{ position:'absolute', top: 2, left: 14, width: 12, height: 12, borderRadius: 999, background: T.primary, boxShadow:`0 0 6px ${T.primary}` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings rows */}
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: T.textTer, textTransform:'uppercase', fontWeight: 600, marginBottom: 8, padding:'0 4px' }}>Preferencias</div>
          <div style={{ background: T.bgCard, border:`1px solid ${T.border}`, borderRadius: 14, overflow:'hidden' }}>
            {[
              {l:'Apariencia', v:'Oscuro', icon:'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z'},
              {l:'Notificaciones', v:'Activas', icon:'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'},
              {l:'Horarios', v:'L-S 9:00-20:00', icon:'M12 6v6l4 2'},
              {l:'Pagos', v:'Stripe', icon:'M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1M3 10h18'},
            ].map((r, i, arr) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap: 12, padding:'12px 12px', borderBottom: i < arr.length-1 ? `1px solid ${T.border}` : 'none' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background:'rgba(99,102,241,0.12)', color: T.primaryHi, display:'grid', placeItems:'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={r.icon}/>{r.l === 'Horarios' && <circle cx="12" cy="12" r="10"/>}</svg>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.l}</div>
                </div>
                <div style={{ fontSize: 11, color: T.textSec }}>{r.v}</div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MobileTabBar active="config" />
    </PhoneFrame>
  );
}

window.MobileAgenda = MobileAgenda;
window.MobileClientes = MobileClientes;
window.MobileEquipo = MobileEquipo;
window.MobileConfig = MobileConfig;
window.PhoneFrame = PhoneFrame;
