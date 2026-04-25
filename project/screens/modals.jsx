// New cita modal & details modal
function NuevaCitaModal({ onClose }) {
  const [paso, setPaso] = React.useState(1);
  return (
    <window.ModalShell title="Nueva cita" onClose={onClose} w={580}>
      {/* Stepper */}
      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 22 }}>
        {[1,2,3].map(n => (
          <React.Fragment key={n}>
            <div style={{
              display:'flex', alignItems:'center', gap: 8,
              padding:'6px 12px', borderRadius: 999,
              background: n === paso ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)',
              border: `1px solid ${n === paso ? 'rgba(99,102,241,0.4)' : window.TOKENS.border}`,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 999,
                background: n <= paso ? window.TOKENS.primary : 'rgba(148,163,184,0.18)',
                color:'#fff', fontSize: 10, fontWeight: 700,
                display:'grid', placeItems:'center',
              }}>{n}</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: n === paso ? window.TOKENS.primaryHi : window.TOKENS.textSec }}>
                {['Cliente','Servicio','Hora'][n-1]}
              </span>
            </div>
            {n < 3 && <div style={{ flex: 1, height: 1, background: window.TOKENS.border }} />}
          </React.Fragment>
        ))}
      </div>

      <window.FormField label="Cliente">
        <div style={{ display:'flex', alignItems:'center', gap: 10, padding:'10px 12px', borderRadius: 10, background:'rgba(99,102,241,0.08)', border:`1px solid rgba(99,102,241,0.30)` }}>
          <window.Avatar name="María Jiménez" size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>María Jiménez</div>
            <div style={{ fontSize: 11, color: window.TOKENS.textTer }}>+34 654 777 234 · 22 visitas</div>
          </div>
          <window.Pill color="#f59e0b">VIP</window.Pill>
        </div>
      </window.FormField>

      <div style={{ height: 14 }} />
      <window.FormField label="Servicio">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
          {window.SERVICIOS.slice(0,4).map((s,i) => (
            <div key={s.id} style={{
              padding: 12, borderRadius: 10,
              background: i === 1 ? 'rgba(99,102,241,0.12)' : window.TOKENS.bgCard,
              border:`1px solid ${i === 1 ? 'rgba(99,102,241,0.4)' : window.TOKENS.border}`, cursor:'pointer',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{s.nombre}</div>
              <div style={{ display:'flex', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: window.TOKENS.textTer }}>{s.duracion} min</span>
                <span style={{ fontSize: 10, color: window.TOKENS.success, fontWeight: 700 }}>{s.precio} €</span>
              </div>
            </div>
          ))}
        </div>
      </window.FormField>

      <div style={{ height: 14 }} />
      <window.FormField label="Profesional">
        <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
          {window.PROFESIONALES.filter(p => p.activo).map((p,i) => (
            <button key={p.id} style={{
              display:'flex', alignItems:'center', gap: 8,
              padding:'7px 12px', borderRadius: 999,
              background: i === 0 ? `${p.color}22` : 'rgba(148,163,184,0.06)',
              border: `1px solid ${i === 0 ? `${p.color}66` : window.TOKENS.border}`,
              color: i === 0 ? p.color : window.TOKENS.textSec,
              fontSize: 12, fontWeight: 600, cursor:'pointer',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: p.color }} />
              {p.nombre.split(' ')[0]}
            </button>
          ))}
        </div>
      </window.FormField>

      <div style={{ height: 14 }} />
      <window.FormField label="Hora · Jue 22 oct">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap: 6 }}>
          {['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','15:00'].map((h,i) => {
            const occupied = [false,false,true,false,false,true,false,false,false,false][i];
            const sel = h === '10:30';
            return (
              <button key={h} disabled={occupied} style={{
                padding:'8px 0', borderRadius: 8,
                background: sel ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : occupied ? 'rgba(239,68,68,0.10)' : window.TOKENS.bgCard,
                border:`1px solid ${sel ? '#6366f1' : occupied ? 'rgba(239,68,68,0.30)' : window.TOKENS.border}`,
                color: sel ? '#fff' : occupied ? window.TOKENS.danger : window.TOKENS.textSec,
                fontSize: 11, fontWeight: 600, cursor: occupied ? 'not-allowed' : 'pointer',
                textDecoration: occupied ? 'line-through' : 'none',
                opacity: occupied ? 0.6 : 1,
              }}>{h}</button>
            );
          })}
        </div>
      </window.FormField>

      <div style={{ marginTop: 18, padding: 12, background:'rgba(16,185,129,0.08)', border:`1px solid rgba(16,185,129,0.25)`, borderRadius: 10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, color: window.TOKENS.textSec }}>Total estimado</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: window.TOKENS.success }}>32 €</div>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', gap: 8, marginTop: 18, paddingTop: 16, borderTop:`1px solid ${window.TOKENS.border}` }}>
        <window.Btn variant="ghost" onClick={onClose}>Cancelar</window.Btn>
        <window.Btn variant="primary" icon={window.I.check}>Reservar cita</window.Btn>
      </div>
    </window.ModalShell>
  );
}

window.NuevaCitaModal = NuevaCitaModal;
