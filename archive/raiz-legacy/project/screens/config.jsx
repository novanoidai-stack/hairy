// Configuración screen — services + business settings
function ScreenConfig() {
  const [tab, setTab] = React.useState('servicios');
  const [edit, setEdit] = React.useState(null);

  const TABS = [
    { id:'general',   label:'General' },
    { id:'servicios', label:'Servicios' },
    { id:'horarios',  label:'Horarios' },
    { id:'pagos',     label:'Pagos' },
    { id:'apariencia',label:'Apariencia' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background: window.TOKENS.bg, color: window.TOKENS.text, fontFamily:'Inter, sans-serif' }}>
      <window.Topbar
        title="Configuración"
        sub="Ajusta tu negocio, servicios y preferencias"
        right={<window.Btn variant="ghost">Guardar cambios</window.Btn>}
      />

      <div style={{ flex:1, display:'grid', gridTemplateColumns:'220px 1fr', overflow:'hidden' }}>
        {/* Tabs rail */}
        <div style={{ borderRight:`1px solid ${window.TOKENS.border}`, padding:'24px 16px', display:'flex', flexDirection:'column', gap: 4 }}>
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding:'10px 12px', borderRadius: 10, textAlign:'left',
                background: active ? 'rgba(99,102,241,0.10)' : 'transparent',
                border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
                color: active ? window.TOKENS.text : window.TOKENS.textSec,
                fontSize: 13, fontWeight: active ? 600 : 500, cursor:'pointer',
              }}>{t.label}</button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding: 24, display:'grid', gridTemplateColumns:'1fr 360px', gap: 24, alignItems:'start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin:0, fontSize: 18, fontWeight: 700, letterSpacing:-0.2 }}>Servicios del catálogo</h2>
                <div style={{ fontSize: 12, color: window.TOKENS.textSec, marginTop: 4 }}>{window.SERVICIOS.length} servicios activos · agrupados por categoría</div>
              </div>
              <window.Btn variant="primary" icon={window.I.plus} onClick={() => setEdit({})}>Nuevo servicio</window.Btn>
            </div>

            {/* Group by categoria */}
            {[...new Set(window.SERVICIOS.map(s => s.categoria))].map(cat => (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight: 600, marginBottom: 8, display:'flex', alignItems:'center', gap: 8 }}>
                  <span>{cat}</span>
                  <div style={{ flex:1, height: 1, background: window.TOKENS.border }} />
                  <span style={{ color: window.TOKENS.textTer }}>{window.SERVICIOS.filter(s => s.categoria === cat).length}</span>
                </div>
                <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 14, overflow:'hidden' }}>
                  {window.SERVICIOS.filter(s => s.categoria === cat).map((s, i, arr) => (
                    <div key={s.id} style={{
                      display:'grid', gridTemplateColumns:'1fr 80px 80px 110px 80px',
                      padding:'14px 16px', alignItems:'center',
                      borderBottom: i < arr.length-1 ? `1px solid ${window.TOKENS.border}` : 'none',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.nombre}</div>
                        <div style={{ fontSize: 10, color: window.TOKENS.textTer, marginTop: 2 }}>SKU-{s.id.toUpperCase()}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap: 4, color: window.TOKENS.textSec, fontSize: 12 }}>
                        {window.I.clock}<span>{s.duracion} min</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: window.TOKENS.success }}>{s.precio} €</div>
                      {/* Toggle */}
                      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 18, borderRadius: 999, background: 'rgba(99,102,241,0.30)',
                          position:'relative', cursor:'pointer',
                        }}>
                          <div style={{ position:'absolute', top: 2, left: 16, width: 14, height: 14, borderRadius: 999, background: window.TOKENS.primary, boxShadow:`0 0 6px ${window.TOKENS.primary}` }} />
                        </div>
                        <span style={{ fontSize: 11, color: window.TOKENS.success, fontWeight: 600 }}>Activo</span>
                      </div>
                      <div style={{ display:'flex', gap: 4, justifyContent:'flex-end' }}>
                        <button onClick={() => setEdit(s)} style={iconBtn}>{window.I.edit}</button>
                        <button style={{ ...iconBtn, color: window.TOKENS.danger }}>{window.I.trash}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right: settings */}
          <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Apariencia</div>
              <div style={{ fontSize: 11, color: window.TOKENS.textSec, marginBottom: 14 }}>Modo visual de la app</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
                <ThemeOption name="Oscuro" active />
                <ThemeOption name="Claro" />
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Negocio</div>
              <Field label="Nombre" value="Salón Bonita" />
              <Field label="Email" value="hola@salonbonita.es" />
              <Field label="Teléfono" value="+34 911 234 567" />
              <Field label="Dirección" value="C/ Mayor 12, Madrid" last />
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Notificaciones</div>
              {[
                { l:'Recordatorios SMS a clientes', on: true },
                { l:'Email de confirmación', on: true },
                { l:'Alertas de no-show', on: false },
                { l:'Resumen diario por email', on: true },
              ].map((n,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderTop: i > 0 ? `1px solid ${window.TOKENS.border}` : 'none' }}>
                  <span style={{ fontSize: 12, color: window.TOKENS.text }}>{n.l}</span>
                  <Toggle on={n.on} />
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>

      {edit !== null && <EditServiceModal service={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8,
  background:'transparent', border:`1px solid ${window.TOKENS.border}`,
  color: window.TOKENS.textSec, display:'grid', placeItems:'center', cursor:'pointer',
};

function Card({ children }) {
  return <div style={{ background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`, borderRadius: 14, padding: 16 }}>{children}</div>;
}

function ThemeOption({ name, active }) {
  return (
    <div style={{
      borderRadius: 10, overflow:'hidden',
      border: `1.5px solid ${active ? window.TOKENS.primary : window.TOKENS.border}`,
      cursor:'pointer', position:'relative',
    }}>
      <div style={{
        height: 50, background: name === 'Oscuro'
          ? 'linear-gradient(135deg, #0f172a, #1a2540)'
          : 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
        display:'flex', alignItems:'flex-end', padding: 6, gap: 4,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: window.TOKENS.primary }} />
        <div style={{ width: 18, height: 4, borderRadius: 2, background: name === 'Oscuro' ? '#475569' : '#cbd5e1' }} />
      </div>
      <div style={{ padding:'8px 10px', fontSize: 11, fontWeight: 600, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ color: window.TOKENS.text }}>{name}</span>
        {active && <div style={{ width: 14, height: 14, borderRadius: 999, background: window.TOKENS.primary, color:'#fff', display:'grid', placeItems:'center' }}>{window.I.check}</div>}
      </div>
    </div>
  );
}

function Field({ label, value, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 10 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ background: '#0b1220', border:`1px solid ${window.TOKENS.border}`, borderRadius: 8, padding:'8px 10px', fontSize: 12, color: window.TOKENS.text }}>{value}</div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <div style={{
      width: 32, height: 18, borderRadius: 999,
      background: on ? 'rgba(99,102,241,0.30)' : 'rgba(148,163,184,0.18)',
      position:'relative', cursor:'pointer',
    }}>
      <div style={{
        position:'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: 999,
        background: on ? window.TOKENS.primary : window.TOKENS.textTer,
        boxShadow: on ? `0 0 6px ${window.TOKENS.primary}` : 'none',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

function EditServiceModal({ service, onClose }) {
  const isNew = !service.id;
  const [nombre, setNombre] = React.useState(service.nombre || '');
  const [precio, setPrecio] = React.useState(service.precio || '');
  const [dur, setDur] = React.useState(service.duracion || 30);
  return (
    <ModalShell title={isNew ? 'Nuevo servicio' : 'Editar servicio'} onClose={onClose}>
      <div style={{ display:'grid', gap: 14 }}>
        <FormField label="Nombre del servicio">
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Corte + Barba" style={inputStyle} />
        </FormField>
        <FormField label="Categoría">
          <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
            {['Corte','Color','Tratamiento','Peinado','Otro'].map((c,i) => (
              <button key={c} style={{
                padding:'6px 12px', borderRadius: 999,
                background: i === 0 ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)',
                border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.4)' : window.TOKENS.border}`,
                color: i === 0 ? window.TOKENS.primaryHi : window.TOKENS.textSec,
                fontSize: 11, fontWeight: 600, cursor:'pointer',
              }}>{c}</button>
            ))}
          </div>
        </FormField>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14 }}>
          <FormField label="Precio (€)">
            <input value={precio} onChange={e => setPrecio(e.target.value)} placeholder="28" style={inputStyle} />
          </FormField>
          <FormField label="Duración (min)">
            <div style={{ display:'flex', gap: 6 }}>
              {[15,30,45,60,90].map(m => (
                <button key={m} onClick={() => setDur(m)} style={{
                  flex: 1, padding:'8px 0', borderRadius: 8,
                  background: dur === m ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)',
                  border: `1px solid ${dur === m ? 'rgba(99,102,241,0.4)' : window.TOKENS.border}`,
                  color: dur === m ? window.TOKENS.primaryHi : window.TOKENS.textSec,
                  fontSize: 11, fontWeight: 600, cursor:'pointer',
                }}>{m}</button>
              ))}
            </div>
          </FormField>
        </div>
        <FormField label="Tiempo de espera (opcional)">
          <input placeholder="0 min" style={inputStyle} />
          <div style={{ fontSize: 10, color: window.TOKENS.textTer, marginTop: 4 }}>Útil para coloraciones donde el tinte reposa.</div>
        </FormField>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', marginTop: 22, paddingTop: 16, borderTop: `1px solid ${window.TOKENS.border}` }}>
        {!isNew ? <window.Btn variant="danger" icon={window.I.trash}>Eliminar</window.Btn> : <span />}
        <div style={{ display:'flex', gap: 8 }}>
          <window.Btn variant="ghost" onClick={onClose}>Cancelar</window.Btn>
          <window.Btn variant="primary" icon={window.I.check}>Guardar servicio</window.Btn>
        </div>
      </div>
    </ModalShell>
  );
}

const inputStyle = {
  width: '100%', padding:'10px 12px', borderRadius: 8,
  background:'#0b1220', border:`1px solid ${window.TOKENS.border}`,
  color: window.TOKENS.text, fontSize: 13, outline:'none',
  fontFamily:'inherit',
};

function FormField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: window.TOKENS.textTer, textTransform:'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function ModalShell({ title, onClose, children, w = 520 }) {
  return (
    <div style={{
      position:'absolute', inset: 0, background:'rgba(11,18,32,0.65)',
      backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
      display:'grid', placeItems:'center', zIndex: 100, padding: 24,
    }}>
      <div style={{
        width: w, maxWidth:'100%', background: window.TOKENS.bgPanel,
        border: `1px solid ${window.TOKENS.borderHi}`,
        borderRadius: 18, padding: 22,
        boxShadow:'0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 18 }}>
          <h3 style={{ margin:0, fontSize: 17, fontWeight: 700, color: window.TOKENS.text }}>{title}</h3>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8,
            background: window.TOKENS.bgCard, border:`1px solid ${window.TOKENS.border}`,
            color: window.TOKENS.textSec, display:'grid', placeItems:'center', cursor:'pointer',
          }}>{window.I.close}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

window.ScreenConfig = ScreenConfig;
window.ModalShell = ModalShell;
window.FormField = FormField;
window.inputStyle = inputStyle;
