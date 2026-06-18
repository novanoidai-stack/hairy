import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import {
  getCitaPublica, cancelarCitaPublica, modificarCitaPublica,
  getDiasDisponibles, getDisponibilidad,
  type CitaPublica, type SlotDisponible,
} from '@/lib/reservaPublica';

// ---------------------------------------------------------------------------
// Pagina "gestiona tu cita" (/app/cita/[id]?s=<slug>). Es el destino del enlace
// {{6}} de las plantillas de confirmacion / recordatorio de WhatsApp.
// Anonima: el cliente prueba propiedad con su telefono; todo va por las RPC
// gated (cita_publica / cancelar_cita_publica / modificar_cita_publica).
// Tokens y lenguaje visual identicos al portal de reserva (app/r/[slug].web.tsx).
// ---------------------------------------------------------------------------
const T = {
  bg: '#f7f0e8',
  card: '#ffffff',
  cardHi: '#fbf5ef',
  border: 'rgba(40,30,24,0.10)',
  text: '#241a14',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.10)',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";

const ANIM = `
  @keyframes gcUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes gcRing { 0% { transform: scale(0.6); opacity: 0.55 } 100% { transform: scale(1.9); opacity: 0 } }
  @keyframes gcFlicker { 0%,100% { transform: rotate(-1deg) scale(1); opacity: 1 } 45% { transform: rotate(1.5deg) scale(1.05); opacity: 0.92 } 70% { transform: rotate(-0.5deg) scale(0.99); opacity: 0.97 } }
  @keyframes gcFloat1 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(26px,-38px) scale(1.08) } }
  @keyframes gcFloat2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-30px,30px) scale(1.1) } }
  .gc-blob1 { animation: gcFloat1 20s ease-in-out infinite alternate; filter: blur(64px) }
  .gc-blob2 { animation: gcFloat2 26s ease-in-out infinite alternate; filter: blur(72px) }
  .gc-step { animation: gcUp 0.45s cubic-bezier(0.16,1,0.3,1) both }
  .gc-flame { animation: gcFlicker 3.4s ease-in-out infinite; transform-origin: 50% 80% }
  .gc-cta { transition: transform 0.16s ease, filter 0.16s ease; cursor: pointer }
  .gc-cta:hover { filter: brightness(1.05) }
  .gc-cta:active { transform: translateY(1px) }
  .gc-ghost { transition: background 0.15s ease, border-color 0.15s ease; cursor: pointer }
  .gc-ghost:hover { background: ${T.cardHi} !important }
  .gc-field:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} }
  .gc-day { transition: transform 0.14s ease, border-color 0.14s ease; cursor: pointer }
  .gc-day:hover { transform: translateY(-2px) }
  .gc-slot { transition: transform 0.13s ease, border-color 0.13s ease, background 0.13s ease; cursor: pointer }
  .gc-slot:hover { border-color: ${T.primary} !important; background: ${T.primarySoft} !important; transform: translateY(-1px) }
  .gc-slot.gc-on, .gc-slot.gc-on:hover { background: ${T.primary} !important; border-color: ${T.primary} !important; color: #fff !important; transform: none }
  .gc-rail::-webkit-scrollbar { height: 0 }
  .gc-link { cursor: pointer; transition: color 0.15s ease }
  .gc-link:hover { color: ${T.primaryHi} !important }
  @media (prefers-reduced-motion: reduce) {
    .gc-step, .gc-flame, .gc-blob1, .gc-blob2 { animation: none !important }
    .gc-cta, .gc-day, .gc-slot { transition: none !important }
  }
`;

function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  };
  return (
    <span
      style={{ display: 'inline-flex', color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
      }}
    />
  );
}

const LOC = 'es-ES';
function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
}
function fmtFechaLarga(iso: string) {
  const s = new Date(iso).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function diaClaveLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Step = 'phone' | 'view' | 'confirmCancel' | 'reschedule' | 'cancelled' | 'rescheduled';

export default function GestionCitaWeb() {
  const params = useLocalSearchParams<{ id: string; s?: string }>();
  const citaId = String(params.id || '');
  const slug = String(params.s || '');

  const [step, setStep] = useState<Step>('phone');
  const [tel, setTel] = useState('');
  const [cita, setCita] = useState<CitaPublica | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Reagendar
  const [dias, setDias] = useState<string[]>([]);
  const [diaSel, setDiaSel] = useState('');
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [slotSel, setSlotSel] = useState<SlotDisponible | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const enlaceValido = !!citaId && !!slug;

  const cargarCita = useCallback(async () => {
    if (!tel.trim()) return;
    setErr(''); setBusy(true);
    try {
      const c = await getCitaPublica(slug, citaId, tel.trim());
      if (!c.ok) {
        setErr('No encontramos ninguna cita con ese teléfono. Usa el mismo número con el que reservaste.');
      } else {
        setCita(c);
        setStep('view');
      }
    } catch {
      setErr('No se pudo cargar la cita. Inténtalo de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  }, [slug, citaId, tel]);

  const confirmarCancelar = useCallback(async () => {
    if (!cita) return;
    setErr(''); setBusy(true);
    try {
      const r = await cancelarCitaPublica({ slug, citaId, telefono: tel.trim() });
      setCita({ ...cita, estado: 'cancelada', cancelable: false, fuera_de_plazo: r.fuera_de_plazo });
      setStep('cancelled');
    } catch {
      setErr('No se pudo cancelar. Quizá ya pasó la cita o no es cancelable.');
      setStep('view');
    } finally {
      setBusy(false);
    }
  }, [cita, slug, citaId, tel]);

  // Cargar dias disponibles al entrar a reagendar
  useEffect(() => {
    if (step !== 'reschedule' || !cita?.servicio_id) return;
    let vivo = true;
    (async () => {
      setLoadingSlots(true); setErr('');
      try {
        const ds = await getDiasDisponibles(slug, cita.servicio_id!);
        if (!vivo) return;
        setDias(ds);
        setDiaSel(ds[0] ?? '');
      } catch {
        if (vivo) setErr('No se pudo cargar la disponibilidad.');
      } finally {
        if (vivo) setLoadingSlots(false);
      }
    })();
    return () => { vivo = false; };
  }, [step, cita?.servicio_id, slug]);

  // Cargar slots del dia seleccionado
  useEffect(() => {
    if (step !== 'reschedule' || !cita?.servicio_id || !diaSel) return;
    let vivo = true;
    (async () => {
      setLoadingSlots(true); setSlotSel(null);
      try {
        const ss = await getDisponibilidad(slug, cita.servicio_id!, diaSel);
        if (vivo) setSlots(ss);
      } catch {
        if (vivo) setSlots([]);
      } finally {
        if (vivo) setLoadingSlots(false);
      }
    })();
    return () => { vivo = false; };
  }, [step, diaSel, cita?.servicio_id, slug]);

  const confirmarReagendar = useCallback(async () => {
    if (!cita || !slotSel) return;
    setErr(''); setBusy(true);
    try {
      const r = await modificarCitaPublica({
        slug, citaId, telefono: tel.trim(),
        nuevoInicioISO: slotSel.slot,
        nuevoProfesionalId: slotSel.profesional_id,
      });
      setCita({ ...cita, inicio: r.inicio, fin: r.fin, profesional_id: r.profesional_id, profesional: slotSel.profesional_nombre });
      setStep('rescheduled');
    } catch {
      setErr('Ese hueco ya no está disponible. Elige otro, por favor.');
    } finally {
      setBusy(false);
    }
  }, [cita, slotSel, slug, citaId, tel]);

  const diasView = useMemo(() => dias.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return {
      clave: d,
      dow: dt.toLocaleDateString(LOC, { weekday: 'short' }).replace('.', ''),
      dnum: dt.getDate(),
      mon: dt.toLocaleDateString(LOC, { month: 'short' }).replace('.', ''),
    };
  }), [dias]);

  return (
    <Shell salon={cita?.salon}>
      {!enlaceValido && (
        <Panel>
          <H titulo="Enlace no válido" sub="Falta información en el enlace. Abre el botón desde tu mensaje de WhatsApp." />
        </Panel>
      )}

      {/* PASO — Telefono */}
      {enlaceValido && step === 'phone' && (
        <Panel>
          <div className="gc-step">
            <H titulo="Gestiona tu cita" sub="Introduce tu teléfono para ver, cambiar o cancelar tu cita." />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: T.textSec, marginBottom: 7 }}>Tu teléfono</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}><Icon name="phone" size={16} color={T.textTer} /></span>
              <input
                className="gc-field"
                value={tel}
                onChange={e => setTel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') cargarCita(); }}
                inputMode="tel"
                placeholder="600 000 000"
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 14px 14px 40px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 15, color: T.text, outline: 'none' }}
              />
            </div>
            {err && <ErrBox msg={err} />}
            <button className="gc-cta" onClick={cargarCita} disabled={busy || !tel.trim()} style={{ ...primaryBtn, opacity: busy || !tel.trim() ? 0.6 : 1 }}>
              {busy ? 'Buscando…' : 'Ver mi cita'}
            </button>
          </div>
        </Panel>
      )}

      {/* PASO — Ver cita */}
      {step === 'view' && cita && (
        <Panel>
          <div className="gc-step">
            <H titulo="Tu cita" sub={estadoSub(cita)} />
            <CitaCard cita={cita} />
            {err && <ErrBox msg={err} />}
            {cita.cancelable ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                <button className="gc-cta" onClick={() => setStep('reschedule')} style={primaryBtn}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><Icon name="edit" size={16} color="#fff" /> Cambiar día u hora</span>
                </button>
                <button className="gc-ghost" onClick={() => setStep('confirmCancel')} style={ghostBtn(T.danger)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><Icon name="x" size={16} color={T.danger} /> Cancelar cita</span>
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 16, fontSize: 13.5, color: T.textTer, textAlign: 'center' }}>
                Esta cita ya no se puede modificar online. Si necesitas algo, contacta con el salón.
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* PASO — Confirmar cancelacion */}
      {step === 'confirmCancel' && cita && (
        <Panel>
          <div className="gc-step">
            <H titulo="¿Cancelar la cita?" sub="Esta acción no se puede deshacer." />
            <CitaCard cita={cita} />
            {cita.fuera_de_plazo && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: T.dangerSoft, border: `1px solid ${T.danger}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>
                <Icon name="alert" size={16} color={T.danger} />
                <span>Estás cancelando con menos de {cita.cancelacion_horas} h de antelación. El salón podría aplicar su política de cancelación.</span>
              </div>
            )}
            {err && <ErrBox msg={err} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <button className="gc-cta" onClick={confirmarCancelar} disabled={busy} style={{ ...primaryBtn, background: T.danger, boxShadow: '0 12px 30px rgba(226,59,52,0.28)', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Cancelando…' : 'Sí, cancelar mi cita'}
              </button>
              <button className="gc-link" onClick={() => setStep('view')} style={linkBtn}>Volver</button>
            </div>
          </div>
        </Panel>
      )}

      {/* PASO — Reagendar */}
      {step === 'reschedule' && cita && (
        <Panel>
          <div className="gc-step">
            <BackLink onClick={() => setStep('view')} />
            <H titulo="Elige nuevo día y hora" sub={`${cita.servicio} · cambiar tu cita`} />

            {loadingSlots && dias.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.textTer, padding: '22px 0', fontSize: 14 }}>Cargando disponibilidad…</div>
            ) : dias.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.textTer, padding: '22px 0', fontSize: 14 }}>No hay huecos disponibles próximamente. Contacta con el salón.</div>
            ) : (
              <>
                <div className="gc-rail" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
                  {diasView.map(d => {
                    const on = d.clave === diaSel;
                    return (
                      <button key={d.clave} className="gc-day" onClick={() => setDiaSel(d.clave)}
                        style={{ flex: '0 0 auto', width: 60, padding: '10px 0', borderRadius: 13, border: `1.5px solid ${on ? T.primary : T.border}`, background: on ? T.primarySoft : T.card, textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4 }}>{d.dow}</div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: on ? T.primaryHi : T.text, lineHeight: 1.1 }}>{d.dnum}</div>
                        <div style={{ fontSize: 10.5, color: T.textTer }}>{d.mon}</div>
                      </button>
                    );
                  })}
                </div>

                {loadingSlots ? (
                  <div style={{ textAlign: 'center', color: T.textTer, padding: '16px 0', fontSize: 14 }}>Buscando huecos…</div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign: 'center', color: T.textTer, padding: '16px 0', fontSize: 14 }}>Sin huecos ese día. Prueba otro.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
                    {slots.map(s => {
                      const on = slotSel?.slot === s.slot && slotSel?.profesional_id === s.profesional_id;
                      return (
                        <button key={`${s.slot}-${s.profesional_id}`} className={`gc-slot${on ? ' gc-on' : ''}`} onClick={() => setSlotSel(s)}
                          style={{ padding: '11px 6px', borderRadius: 12, border: `1.5px solid ${on ? T.primary : T.border}`, background: on ? T.primary : T.card, color: on ? '#fff' : T.text, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                          {fmtHora(s.slot)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {slotSel && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: T.textTer, textAlign: 'center' }}>
                    Nueva cita con {slotSel.profesional_nombre}
                  </div>
                )}
                {err && <ErrBox msg={err} />}
                <button className="gc-cta" onClick={confirmarReagendar} disabled={busy || !slotSel} style={{ ...primaryBtn, opacity: busy || !slotSel ? 0.6 : 1 }}>
                  {busy ? 'Guardando…' : 'Confirmar cambio'}
                </button>
              </>
            )}
          </div>
        </Panel>
      )}

      {/* PASO — Cancelada OK */}
      {step === 'cancelled' && cita && (
        <Panel>
          <Exito titulo="Cita cancelada" sub="Hemos cancelado tu cita. Cuando quieras, puedes reservar de nuevo." />
        </Panel>
      )}

      {/* PASO — Reagendada OK */}
      {step === 'rescheduled' && cita && (
        <Panel>
          <Exito titulo="Cita actualizada" sub={`Tu cita es ahora el ${fmtFechaLarga(cita.inicio)} a las ${fmtHora(cita.inicio)}.`}>
            <CitaCard cita={cita} />
          </Exito>
        </Panel>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 18, padding: '15px 16px', borderRadius: 14, border: 'none',
  background: FIRE, color: '#fff', fontSize: 15.5, fontWeight: 800, boxShadow: '0 12px 30px rgba(192,38,10,0.28)',
};
function ghostBtn(color: string): React.CSSProperties {
  return { width: '100%', padding: '13px 16px', borderRadius: 14, border: `1.5px solid ${color}40`, background: T.card, color, fontSize: 14.5, fontWeight: 700 };
}
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700, padding: 8 };

function estadoSub(c: CitaPublica): string {
  if (c.estado === 'cancelada') return 'Esta cita está cancelada.';
  if (c.estado === 'completada') return 'Esta cita ya se ha realizado.';
  if (!c.cancelable) return 'Esta cita ya ha pasado.';
  return 'Revisa los datos y, si lo necesitas, cámbiala o cancélala.';
}

function CitaCard({ cita }: { cita: CitaPublica }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 26px rgba(40,30,24,0.05)', marginTop: 4 }}>
      <Row icon="scissors" label="Servicio" value={cita.servicio || '—'} />
      <Row icon="user" label="Profesional" value={cita.profesional || '—'} />
      <Row icon="calendar" label="Día" value={fmtFechaLarga(cita.inicio)} />
      <Row icon="clock" label="Hora" value={fmtHora(cita.inicio)} last />
    </div>
  );
}

function Row({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', background: T.card, borderBottom: last ? 'none' : `1px solid ${T.border}` }}>
      <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 9, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={16} color={T.primary} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{value}</div>
      </div>
    </div>
  );
}

function H({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: SERIF, fontSize: 30, color: T.text, lineHeight: 1.05 }}>{titulo}</div>
      {sub && <div style={{ fontSize: 14, color: T.textSec, marginTop: 6, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: T.dangerSoft, border: `1px solid ${T.danger}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>
      <Icon name="alert" size={16} color={T.danger} /><span>{msg}</span>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="gc-link" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: T.textSec, fontSize: 13.5, fontWeight: 700, padding: '0 0 12px', cursor: 'pointer' }}>
      <Icon name="chevronLeft" size={15} color={T.textSec} /> Volver
    </button>
  );
}

function Exito({ titulo, sub, children }: { titulo: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="gc-step" style={{ textAlign: 'center', padding: '6px 0 2px' }}>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <span style={{ position: 'absolute', width: 78, height: 78, borderRadius: '50%', background: T.primarySoft, animation: 'gcRing 1.8s ease-out infinite' }} />
        <span style={{ position: 'relative', display: 'inline-flex', width: 78, height: 78, borderRadius: '50%', background: '#fff', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
          <span className="gc-flame"><MechaMark size={40} /></span>
        </span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 32, color: T.text, marginBottom: 8, lineHeight: 1.02 }}>{titulo}</div>
      <div style={{ maxWidth: 380, margin: '0 auto 18px', fontSize: 15, color: T.textSec, lineHeight: 1.5 }}>{sub}</div>
      {children && <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'left' }}>{children}</div>}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,253,251,0.86)', backdropFilter: 'blur(10px)', border: `1px solid ${T.border}`, borderRadius: 22, padding: 22, boxShadow: '0 18px 50px rgba(40,30,24,0.08)' }}>
      {children}
    </div>
  );
}

function Shell({ children, salon }: { children: React.ReactNode; salon?: string }) {
  return (
    <div style={{ height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'linear-gradient(180deg, #fdf6ee 0%, #f7ede1 60%, #f3e7d8 100%)', padding: '0 16px 32px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 560, height: 340, background: 'radial-gradient(closest-side, rgba(244,80,30,0.14), transparent)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="gc-blob1" aria-hidden style={{ position: 'absolute', top: '6%', left: '6%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,196,150,0.5)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="gc-blob2" aria-hidden style={{ position: 'absolute', bottom: '8%', right: '4%', width: 340, height: 340, borderRadius: '50%', background: 'rgba(255,222,170,0.45)', pointerEvents: 'none', zIndex: 0 }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -70, right: -50, opacity: 0.05, pointerEvents: 'none', zIndex: 0 }}><MechaMark size={360} /></div>

      <div style={{ maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <header style={{ padding: '26px 4px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="gc-flame" style={{ display: 'inline-flex' }}><MechaMark size={22} /></span>
            <span style={{ fontFamily: SERIF, fontSize: 22, color: T.text }}>{salon || 'Mecha'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(244,80,30,0.16)', padding: '5px 11px', borderRadius: 999 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '0.8px' }}>mecha</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
