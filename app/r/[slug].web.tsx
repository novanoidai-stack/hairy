import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import {
  getPortalInfo, getDisponibilidad, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  type PortalInfo, type PortalServicio, type PortalProfesional, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';

// ---------------------------------------------------------------------------
// Tokens (consistentes con el resto de .web.tsx — marca fuego / crema calido)
// ---------------------------------------------------------------------------
const T = {
  bg: '#f6f1ea',
  panel: '#fffdfb',
  card: '#ffffff',
  cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)',
  borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.10)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.12)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.12)',
};

const ANIM = `
  @keyframes rpFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rpUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
  .rp-step { animation: rpUp 0.4s cubic-bezier(0.16,1,0.3,1) both }
  .rp-opt { transition: all 0.16s ease; cursor: pointer }
  .rp-opt:hover { border-color: ${T.primary} !important; background: ${T.cardHi} !important; transform: translateY(-1px) }
  .rp-slot { transition: all 0.14s ease; cursor: pointer }
  .rp-slot:hover { border-color: ${T.primary} !important; background: ${T.primarySoft} !important }
  .rp-btn { transition: all 0.16s ease; cursor: pointer }
  .rp-btn:hover { filter: brightness(1.06) }
  .rp-btn:active { transform: translateY(1px) }
  .rp-day { transition: all 0.14s ease; cursor: pointer }
  .rp-day:hover { border-color: ${T.primary} !important }
  .rp-link { cursor: pointer }
  .rp-link:hover { color: ${T.primaryHi} !important }
`;

// ---------------------------------------------------------------------------
// Iconos SVG inline (sin emojis)
// ---------------------------------------------------------------------------
function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  };
  return (
    <span
      style={{ display: 'inline-flex', color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
      }}
    />
  );
}

type Step = 'servicio' | 'profesional' | 'fecha' | 'datos' | 'resumen' | 'confirmado';
const STEPS: { key: Step; label: string }[] = [
  { key: 'servicio', label: 'Servicio' },
  { key: 'profesional', label: 'Profesional' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'datos', label: 'Tus datos' },
  { key: 'resumen', label: 'Confirmar' },
];

const ANY_PRO = '__any__';

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtFechaLarga(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function PortalReservaWeb() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [resenas, setResenas] = useState<ResenaResumen | null>(null);

  const [step, setStep] = useState<Step>('servicio');
  const [servicio, setServicio] = useState<PortalServicio | null>(null);
  const [profId, setProfId] = useState<string>(ANY_PRO); // ANY_PRO = cualquiera
  const [fecha, setFecha] = useState<Date>(new Date());
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotSel, setSlotSel] = useState<SlotDisponible | null>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<CrearCitaResult | null>(null);

  // -------------------------------------------------------------------------
  // Carga del portal
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [data, res] = await Promise.all([getPortalInfo(slug), getResenasPublicas(slug)]);
        if (cancel) return;
        if (!data) { setNotFound(true); } else { setInfo(data); setResenas(res); }
      } catch {
        if (!cancel) setNotFound(true);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [slug]);

  // -------------------------------------------------------------------------
  // Disponibilidad cuando cambia servicio / profesional / fecha
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (step !== 'fecha' || !servicio) return;
    let cancel = false;
    (async () => {
      setSlotsLoading(true);
      setSlotSel(null);
      try {
        const data = await getDisponibilidad(
          slug, servicio.id, fechaISOaClave(fecha), profId === ANY_PRO ? null : profId,
        );
        if (!cancel) setSlots(data);
      } catch {
        if (!cancel) setSlots([]);
      } finally {
        if (!cancel) setSlotsLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [step, servicio, profId, fecha, slug]);

  // Horas unicas (cuando es "cualquiera", varios profesionales comparten hora)
  const horas = useMemo(() => {
    const map = new Map<string, SlotDisponible>();
    for (const s of slots) if (!map.has(s.slot)) map.set(s.slot, s);
    return [...map.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  }, [slots]);

  const proximosDias = useMemo(() => {
    const arr: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const mostrarPrecioEnLista = info?.negocio.mostrar_precios === 'catalogo';
  const mostrarPrecioResumen = info?.negocio.mostrar_precios !== 'nunca';

  const profSel = useMemo(
    () => (profId === ANY_PRO ? null : info?.profesionales.find(p => p.id === profId) ?? null),
    [profId, info],
  );

  // -------------------------------------------------------------------------
  // Confirmar reserva
  // -------------------------------------------------------------------------
  const confirmar = useCallback(async () => {
    if (!servicio || !slotSel) return;
    setError('');
    if (!nombre.trim()) { setError('Indica tu nombre.'); return; }
    if (telefono.trim().length < 6) { setError('Indica un telefono valido.'); return; }
    setEnviando(true);
    try {
      const r = await crearCitaPublica({
        slug,
        servicioId: servicio.id,
        profesionalId: slotSel.profesional_id,
        inicioISO: slotSel.slot,
        clienteNombre: nombre.trim(),
        clienteTelefono: telefono.trim(),
        clienteEmail: email.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      setResultado(r);
      setStep('confirmado');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo completar la reserva.';
      // Si el hueco se ocupo entre medias, devolvemos al paso de fecha.
      if (/ocupado|disponib|antelacion|horario/i.test(msg)) {
        setError('Ese hueco ya no esta libre. Elige otro, por favor.');
        setStep('fecha');
      } else {
        setError(msg);
      }
    } finally {
      setEnviando(false);
    }
  }, [servicio, slotSel, nombre, telefono, email, notas, slug]);

  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null);
    setNombre(''); setTelefono(''); setEmail(''); setNotas('');
    setResultado(null); setError(''); setStep('servicio');
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <Shell>
        <div style={{ padding: 60, textAlign: 'center', color: T.textTer }}>Cargando…</div>
      </Shell>
    );
  }

  if (notFound || !info) {
    return (
      <Shell>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 6 }}>Reservas no disponibles</div>
          <div style={{ fontSize: 14, color: T.textSec }}>Este salon todavia no tiene la reserva online activa.</div>
        </div>
      </Shell>
    );
  }

  const stepIndex = STEPS.findIndex(s => s.key === step);

  return (
    <Shell negocio={info.negocio} resenas={resenas}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />

      {/* Stepper */}
      {step !== 'confirmado' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 18px', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                  background: done ? T.success : active ? T.primary : 'transparent',
                  color: done || active ? '#fff' : T.textTer,
                  border: done || active ? 'none' : `1.5px solid ${T.borderHi}`,
                }}>
                  {done ? <Icon name="check" size={12} color="#fff" /> : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? T.text : T.textTer }}>{s.label}</span>
                {i < STEPS.length - 1 && <span style={{ width: 14, height: 1, background: T.borderHi, margin: '0 2px' }} />}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginBottom: 14,
          background: T.dangerSoft, border: `1px solid ${T.danger}40`, borderRadius: 10, color: T.danger, fontSize: 13,
        }}>
          <Icon name="alert" size={16} color={T.danger} />
          {error}
        </div>
      )}

      {/* PASO 1 — Servicio */}
      {step === 'servicio' && (
        <div className="rp-step">
          <H titulo="Elige el servicio" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {info.servicios.length === 0 && <Empty texto="No hay servicios disponibles para reservar." />}
            {info.servicios.map(sv => (
              <button
                key={sv.id}
                className="rp-opt"
                onClick={() => { setServicio(sv); setError(''); setStep('profesional'); }}
                style={optStyle}
              >
                <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 10, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="scissors" size={18} color={T.primary} />
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: T.text }}>{sv.nombre}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: T.textTer, marginTop: 2 }}>
                    <Icon name="clock" size={12} color={T.textTer} /> {sv.duracion} min
                    {mostrarPrecioEnLista && <> · {sv.precio}€</>}
                  </span>
                </span>
                <Icon name="chevronRight" size={18} color={T.textTer} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PASO 2 — Profesional */}
      {step === 'profesional' && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('servicio')} />
          <H titulo="Con quien quieres ir" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="rp-opt" onClick={() => { setProfId(ANY_PRO); setStep('fecha'); }} style={optStyle}>
              <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 10, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="user" size={18} color={T.primary} />
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: T.text }}>Cualquiera disponible</span>
                <span style={{ display: 'block', fontSize: 12.5, color: T.textTer, marginTop: 2 }}>Mas opciones de horario</span>
              </span>
              <Icon name="chevronRight" size={18} color={T.textTer} />
            </button>
            {info.profesionales.map(pr => (
              <button key={pr.id} className="rp-opt" onClick={() => { setProfId(pr.id); setStep('fecha'); }} style={optStyle}>
                <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: '50%', background: (pr.color || T.primary) + '22', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: pr.color || T.primary, fontSize: 15 }}>
                  {pr.nombre.charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 700, color: T.text }}>{pr.nombre}</span>
                <Icon name="chevronRight" size={18} color={T.textTer} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PASO 3 — Fecha + hueco */}
      {step === 'fecha' && servicio && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('profesional')} />
          <H titulo="Elige dia y hora" sub={`${servicio.nombre}${profSel ? ` · ${profSel.nombre}` : ' · cualquiera'}`} />

          {/* Dias */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
            {proximosDias.map(d => {
              const sel = fechaISOaClave(d) === fechaISOaClave(fecha);
              return (
                <button
                  key={d.toISOString()}
                  className="rp-day"
                  onClick={() => setFecha(d)}
                  style={{
                    flexShrink: 0, width: 58, padding: '8px 0', borderRadius: 12, textAlign: 'center',
                    border: `1.5px solid ${sel ? T.primary : T.border}`,
                    background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                  }}
                >
                  <span style={{ display: 'block', fontSize: 11, textTransform: 'capitalize', opacity: 0.85 }}>
                    {d.toLocaleDateString('es-ES', { weekday: 'short' })}
                  </span>
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{d.getDate()}</span>
                  <span style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>
                    {d.toLocaleDateString('es-ES', { month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Horas */}
          {slotsLoading ? (
            <div style={{ padding: 28, textAlign: 'center', color: T.textTer, fontSize: 14 }}>Buscando huecos…</div>
          ) : horas.length === 0 ? (
            <Empty texto="No hay huecos libres este dia. Prueba con otra fecha." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8 }}>
              {horas.map(s => {
                const sel = slotSel?.slot === s.slot;
                return (
                  <button
                    key={s.slot}
                    className="rp-slot"
                    onClick={() => setSlotSel(s)}
                    title={profId === ANY_PRO ? `con ${s.profesional_nombre}` : undefined}
                    style={{
                      padding: '10px 6px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                      border: `1.5px solid ${sel ? T.primary : T.border}`,
                      background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                    }}
                  >
                    {fmtHora(s.slot)}
                    {profId === ANY_PRO && (
                      <span style={{ display: 'block', fontSize: 9.5, fontWeight: 500, opacity: 0.75, marginTop: 1 }}>
                        {s.profesional_nombre.split(' ')[0]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {slotSel && (
            <button className="rp-btn" onClick={() => setStep('datos')} style={primaryBtn}>
              Continuar · {fmtHora(slotSel.slot)}
            </button>
          )}
        </div>
      )}

      {/* PASO 4 — Datos */}
      {step === 'datos' && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('fecha')} />
          <H titulo="Tus datos" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nombre y apellidos" value={nombre} onChange={setNombre} placeholder="Tu nombre" />
            <Field label="Telefono" value={telefono} onChange={setTelefono} placeholder="600 000 000" type="tel" />
            <Field label="Email (opcional)" value={email} onChange={setEmail} placeholder="tu@email.com" type="email" />
            <Field label="Notas (opcional)" value={notas} onChange={setNotas} placeholder="Algo que debamos saber" multiline />
          </div>
          <button className="rp-btn" onClick={() => { if (!nombre.trim()) { setError('Indica tu nombre.'); return; } if (telefono.trim().length < 6) { setError('Indica un telefono valido.'); return; } setError(''); setStep('resumen'); }} style={primaryBtn}>
            Revisar reserva
          </button>
        </div>
      )}

      {/* PASO 5 — Resumen */}
      {step === 'resumen' && servicio && slotSel && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('datos')} />
          <H titulo="Confirma tu reserva" />
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <ResumenRow icon="scissors" label="Servicio" value={`${servicio.nombre}${mostrarPrecioResumen ? ` · ${servicio.precio}€` : ''}`} />
            <ResumenRow icon="user" label="Profesional" value={slotSel.profesional_nombre} />
            <ResumenRow icon="calendar" label="Fecha" value={fmtFechaLarga(new Date(slotSel.slot))} />
            <ResumenRow icon="clock" label="Hora" value={`${fmtHora(slotSel.slot)} · ${servicio.duracion} min`} last />
          </div>

          {servicio.prepago && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: T.primarySoft, border: `1px solid ${T.primary}33`, borderRadius: 10, fontSize: 12.5, color: T.text }}>
              <Icon name="alert" size={16} color={T.primary} />
              Este servicio requiere una senal. Te indicaremos como abonarla para confirmar la reserva.
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 12, color: T.textTer }}>
            {nombre} · {telefono}{email ? ` · ${email}` : ''}
          </div>

          <button className="rp-btn" onClick={confirmar} disabled={enviando} style={{ ...primaryBtn, opacity: enviando ? 0.6 : 1 }}>
            {enviando ? 'Reservando…' : 'Confirmar reserva'}
          </button>
        </div>
      )}

      {/* PASO 6 — Confirmado */}
      {step === 'confirmado' && resultado && servicio && slotSel && (
        <div className="rp-step" style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%', background: T.successSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Icon name="checkCircle" size={32} color={T.success} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 6 }}>
            {resultado.estado === 'pendiente' ? 'Reserva recibida' : 'Reserva confirmada'}
          </div>
          <div style={{ fontSize: 14, color: T.textSec, marginBottom: 18 }}>
            {fmtFechaLarga(new Date(slotSel.slot))} a las {fmtHora(slotSel.slot)} · {slotSel.profesional_nombre}
          </div>

          {resultado.estado === 'pendiente' && resultado.deposito_requerido && (
            <div style={{ margin: '0 auto 18px', maxWidth: 360, padding: '10px 12px', background: T.primarySoft, border: `1px solid ${T.primary}33`, borderRadius: 10, fontSize: 12.5, color: T.text }}>
              Queda pendiente la senal de {resultado.deposito_importe}€. Te contactaremos para completar el pago.
            </div>
          )}

          <button className="rp-link" onClick={reiniciar} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700 }}>
            Hacer otra reserva
          </button>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes / estilos
// ---------------------------------------------------------------------------
const optStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 12,
  background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 14,
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 20, padding: '14px 16px', borderRadius: 12, border: 'none',
  background: T.primary, color: '#fff', fontSize: 15, fontWeight: 700,
};

function Shell({ children, negocio, resenas }: { children: React.ReactNode; negocio?: PortalInfo['negocio']; resenas?: ResenaResumen | null }) {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '0 16px 48px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 4px 18px' }}>
          <MechaMark size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: -0.3 }}>
              {negocio?.nombre || 'Reserva tu cita'}
            </div>
            {negocio?.direccion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: T.textTer, marginTop: 1 }}>
                <Icon name="mapPin" size={12} color={T.textTer} /> {negocio.direccion}
              </div>
            )}
            {resenas && resenas.total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <span style={{ display: 'inline-flex', color: '#f59e0b' }} dangerouslySetInnerHTML={{ __html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{resenas.media}</span>
                <span style={{ fontSize: 12, color: T.textTer }}>· {resenas.total} {resenas.total === 1 ? 'valoración' : 'valoraciones'}</span>
              </div>
            )}
          </div>
        </header>
        <main style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 18, padding: 20, boxShadow: '0 10px 40px rgba(40,30,24,0.06)' }}>
          {children}
        </main>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: T.textTer, marginTop: 16 }}>
          Reservas con <span style={{ fontWeight: 800, color: T.primary }}>mecha</span>
        </div>
      </div>
    </div>
  );
}

function H({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: -0.3 }}>{titulo}</div>
      {sub && <div style={{ fontSize: 13, color: T.textTer, marginTop: 2, textTransform: 'capitalize' }}>{sub}</div>}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="rp-link" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: T.textSec, fontSize: 13, fontWeight: 600, marginBottom: 12, cursor: 'pointer', padding: 0 }}>
      <Icon name="chevronLeft" size={15} color={T.textSec} /> Atras
    </button>
  );
}

function Empty({ texto }: { texto: string }) {
  return <div style={{ padding: 24, textAlign: 'center', color: T.textTer, fontSize: 13.5, border: `1px dashed ${T.borderHi}`, borderRadius: 12 }}>{texto}</div>;
}

function ResumenRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${T.border}`, background: T.card }}>
      <Icon name={icon} size={16} color={T.primary} />
      <span style={{ fontSize: 12.5, color: T.textTer, width: 88 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; multiline?: boolean;
}) {
  const base: React.CSSProperties = {
    width: '100%', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`,
    fontSize: 14, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 5 }}>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...base, resize: 'vertical' }} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={base} />
      )}
    </label>
  );
}
