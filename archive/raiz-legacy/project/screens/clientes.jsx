// Clientes screen
function ScreenClientes() {
  const [selected, setSelected] = React.useState('c3'); // María Jiménez
  const c = window.CLIENTES.find(x => x.id === selected);
  const TAGS = { VIP:{ color:'#f59e0b' }, Habitual:{ color:'#6366f1' }, Nuevo:{ color:'#10b981' } };

  return (
    <div style={{ display:'flex', flexDirection:'column', height: '100%', background: window.TOKENS.bg, color: window.TOKENS.text, fontFamily:'Inter, sans-serif' }}>
      <window.Topbar
        title="Clientes"
        sub={`${window.CLIENTES.length} clientes activos · 23 nuevos este mes`}
        right={<>
          <window.Btn variant="ghost" icon={window.I.filter}>Filtros</window.Btn>
          <window.Btn variant="primary" icon={window.I.plus}>Nuevo cliente</window.Btn>
        </>}
      />

      <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 380px', overflow:'hidden' }}>
        {/* List */}
        <div style={{ overflowY:'auto', padding: 24 }}>
          {/* Search */}
          <div style={{
            display:'flex', alignItems:'center', gap: 10,
            background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 12,
            padding: '11px 14px', marginBottom: 16,
          }}>
            {window.I.search}
            <input placeholder="Buscar por nombre, teléfono o email…" style={{
              flex:1, background:'transparent', border:'none', outline:'none', color: window.TOKENS.text, fontSize: 13,
            }} defaultValue="" />
            <span style={{ fontSize: 11, color: window.TOKENS.textTer }}>{window.CLIENTES.length} resultados</span>
          </div>

          {/* Tag chips */}
          <div style={{ display:'flex', gap: 8, marginBottom: 16, flexWrap:'wrap' }}>
            {[
              {l:'Todos', n: window.CLIENTES.length, active:true, color: window.TOKENS.primary},
              {l:'VIP', n: 3, color: '#f59e0b'},
              {l:'Habituales', n: 14, color: window.TOKENS.primary},
              {l:'Nuevos', n: 23, color: window.TOKENS.success},
              {l:'Inactivos', n: 7, color: window.TOKENS.textTer},
            ].map((t,i) => (
              <button key={i} style={{
                display:'inline-flex', alignItems:'center', gap: 7,
                padding: '7px 12px', borderRadius: 999,
                background: t.active ? `${t.color}22` : window.TOKENS.bgCard,
                border: `1px solid ${t.active ? `${t.color}55` : window.TOKENS.border}`,
                color: t.active ? t.color : window.TOKENS.textSec,
                fontSize: 12, fontWeight: 600, cursor:'pointer',
              }}>
                <span>{t.l}</span>
                <span style={{ fontSize: 10, padding:'1px 6px', borderRadius: 99, background: t.active ? `${t.color}44` : 'rgba(148,163,184,0.10)', color: t.active ? t.color : window.TOKENS.textSec }}>{t.n}</span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 0.8fr 32px', padding:'10px 16px', fontSize: 10, letterSpacing: 1, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight:600, borderBottom:`1px solid ${window.TOKENS.border}`, background: 'rgba(99,102,241,0.04)' }}>
              <div>Cliente</div>
              <div>Última visita</div>
              <div>Total gastado</div>
              <div style={{ textAlign:'right' }}>Visitas</div>
              <div />
            </div>
            {window.CLIENTES.map((cl, i) => {
              const tagMeta = TAGS[cl.tag];
              const isSel = cl.id === selected;
              return (
                <div key={cl.id} onClick={() => setSelected(cl.id)} style={{
                  display:'grid', gridTemplateColumns:'2fr 1fr 1fr 0.8fr 32px', padding:'12px 16px',
                  borderBottom: i < window.CLIENTES.length - 1 ? `1px solid ${window.TOKENS.border}` : 'none',
                  alignItems:'center', cursor:'pointer',
                  background: isSel ? 'rgba(99,102,241,0.08)' : 'transparent',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                    <Avatar name={cl.nombre} />
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: window.TOKENS.text }}>{cl.nombre}</div>
                        <window.Pill color={tagMeta.color}>{cl.tag}</window.Pill>
                      </div>
                      <div style={{ fontSize: 11, color: window.TOKENS.textTer, marginTop: 2 }}>{cl.tel}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: window.TOKENS.textSec }}>{cl.ultimaVisita}</div>
                  <div style={{ fontSize: 13, color: window.TOKENS.success, fontWeight: 600 }}>{cl.gastado} €</div>
                  <div style={{ textAlign:'right', fontSize: 13, color: window.TOKENS.text, fontWeight: 600 }}>{cl.visitas}</div>
                  <div style={{ color: window.TOKENS.textTer, display:'grid', placeItems:'center' }}>{window.I.more}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ borderLeft:`1px solid ${window.TOKENS.border}`, padding: 24, overflowY:'auto', background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)' }}>
          {/* Profile head */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', marginBottom: 18 }}>
            <Avatar name={c.nombre} size={72} />
            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: window.TOKENS.text }}>{c.nombre}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: window.TOKENS.textSec }}>{c.tel}</div>
            <div style={{ marginTop: 8 }}>
              <window.Pill color={TAGS[c.tag].color}>{window.I.star}{c.tag} · Cliente desde 2023</window.Pill>
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
            {[{l:'Reservar',i:window.I.cal,p:true},{l:'Llamar',i:window.I.phone},{l:'Editar',i:window.I.edit}].map((a,i) => (
              <button key={i} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap: 6, padding:'12px 8px',
                background: a.p ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : window.TOKENS.bgCard,
                border: a.p ? '1px solid rgba(255,255,255,0.12)' : `1px solid ${window.TOKENS.border}`,
                borderRadius: 12, color: a.p ? '#fff' : window.TOKENS.text, fontSize: 11, fontWeight: 600, cursor:'pointer',
                boxShadow: a.p ? '0 4px 14px rgba(99,102,241,0.4)' : 'none',
              }}>{a.i}<span>{a.l}</span></button>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
            <MiniStat label="Visitas" value={c.visitas} tone={window.TOKENS.primary} />
            <MiniStat label="Total" value={`${c.gastado}€`} tone={window.TOKENS.success} />
            <MiniStat label="Ticket medio" value={`${Math.round(c.gastado/c.visitas)}€`} tone={window.TOKENS.warning} />
          </div>

          {/* Servicios favoritos */}
          <Section title="Servicio preferido">
            <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 12, padding: 14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.fav}</div>
                <div style={{ fontSize: 11, color: window.TOKENS.textTer, marginTop: 2 }}>Solicitado 8 veces</div>
              </div>
              <div style={{ width:36, height: 36, borderRadius:10, background:'rgba(245,158,11,0.14)', color:'#f59e0b', display:'grid', placeItems:'center' }}>{window.I.star}</div>
            </div>
          </Section>

          {/* Próxima cita */}
          <Section title="Próxima cita">
            <div style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))', border:`1px solid rgba(99,102,241,0.30)`, borderRadius: 12, padding: 14 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: window.TOKENS.primaryHi, letterSpacing: 0.4 }}>MAR 22 OCT · 16:30</span>
                <window.Pill color={window.TOKENS.primary}>Confirmada</window.Pill>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Mechas Babylights</div>
              <div style={{ fontSize: 11, color: window.TOKENS.textSec, marginTop: 2 }}>Carla Mendoza · 150 min · 95 €</div>
            </div>
          </Section>

          {/* Historial */}
          <Section title="Historial reciente">
            <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
              {[
                { fecha:'15 Sep 2026', s:'Coloración Completa', p:'Sofía León', precio: 75 },
                { fecha:'02 Sep 2026', s:'Corte Dama', p:'Carla Mendoza', precio: 32 },
                { fecha:'18 Ago 2026', s:'Mechas Babylights', p:'Carla Mendoza', precio: 95 },
              ].map((h,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap: 12, padding: 10, background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 10 }}>
                  <div style={{ width: 4, alignSelf:'stretch', borderRadius: 2, background: window.TOKENS.success }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{h.s}</div>
                    <div style={{ fontSize: 10, color: window.TOKENS.textTer, marginTop: 2 }}>{h.fecha} · {h.p}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: window.TOKENS.success }}>{h.precio} €</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 38 }) {
  const initials = name.split(' ').map(n => n[0]).slice(0,2).join('');
  // hash hue
  let hash = 0;
  for (let i=0;i<name.length;i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: `linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue+30)%360} 70% 50%))`,
      display:'grid', placeItems:'center',
      color:'#fff', fontWeight: 700, fontSize: size * 0.36,
      boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
      flexShrink: 0,
    }}>{initials}</div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 10, padding: 10, textAlign:'center' }}>
      <div style={{ fontSize: 9, letterSpacing: 1, color: window.TOKENS.textTer, fontWeight: 600, textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone, marginTop: 2 }}>{value}</div>
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

window.ScreenClientes = ScreenClientes;
window.Avatar = Avatar;
