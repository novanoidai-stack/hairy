import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import {
  getPortalInfo, getDisponibilidad, getDiasDisponibles, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  type PortalInfo, type PortalServicio, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';

// ---------------------------------------------------------------------------
// Tokens — marca Mecha (crema calido + fuego). El gradiente FIRE es el del
// simbolo de la llama (#mecha-mark): se usa en CTAs, progreso y exito.
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
  star: '#f59e0b',
};
const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const SERIF = '"Instrument Serif", Georgia, serif';

const ANIM = `
  @keyframes rpFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rpUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes rpPop { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: scale(1) } }
  @keyframes rpFlicker { 0%,100% { transform: rotate(-1deg) scale(1); opacity: 1 } 45% { transform: rotate(1.5deg) scale(1.05); opacity: 0.92 } 70% { transform: rotate(-0.5deg) scale(0.99); opacity: 0.97 } }
  @keyframes rpRing { 0% { transform: scale(0.6); opacity: 0.55 } 100% { transform: scale(1.9); opacity: 0 } }
  @keyframes rpShimmer { 0% { background-position: -360px 0 } 100% { background-position: 360px 0 } }
  @keyframes rpBarUp { from { transform: translateY(120%) } to { transform: translateY(0) } }
  .rp-step { animation: rpUp 0.45s cubic-bezier(0.16,1,0.3,1) both }
  .rp-stagger > * { animation: rpUp 0.5s cubic-bezier(0.16,1,0.3,1) both }
  .rp-flame { animation: rpFlicker 3.4s ease-in-out infinite; transform-origin: 50% 80% }
  .rp-opt { transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease; cursor: pointer }
  .rp-opt:hover { border-color: ${T.primary} !important; background: ${T.cardHi} !important; transform: translateY(-2px); box-shadow: 0 10px 26px rgba(192,38,10,0.10) }
  .rp-slot { transition: transform 0.13s ease, border-color 0.13s ease, background 0.13s ease; cursor: pointer }
  .rp-slot:hover { border-color: ${T.primary} !important; background: ${T.primarySoft} !important; transform: translateY(-1px) }
  .rp-slot.rp-on, .rp-slot.rp-on:hover { background: ${T.primary} !important; border-color: ${T.primary} !important; color: #fff !important; transform: none }
  .rp-day { transition: transform 0.14s ease, border-color 0.14s ease; cursor: pointer }
  .rp-day:hover { transform: translateY(-2px) }
  .rp-day-off { opacity: 0.34; cursor: default !important; filter: grayscale(0.4) }
  .rp-cta { transition: transform 0.16s ease, filter 0.16s ease; cursor: pointer }
  .rp-cta:hover { filter: brightness(1.05) }
  .rp-cta:active { transform: translateY(1px) }
  .rp-link { cursor: pointer; transition: color 0.15s ease }
  .rp-link:hover { color: ${T.primaryHi} !important }
  .rp-bar { animation: rpBarUp 0.4s cubic-bezier(0.16,1,0.3,1) both }
  .rp-rail::-webkit-scrollbar { height: 0 }
  .rp-skel { background: linear-gradient(90deg, rgba(40,30,24,0.05) 25%, rgba(40,30,24,0.10) 37%, rgba(40,30,24,0.05) 63%); background-size: 720px 100%; animation: rpShimmer 1.4s linear infinite; border-radius: 10px }
  .rp-field:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} }
  @media (prefers-reduced-motion: reduce) {
    .rp-step, .rp-stagger > *, .rp-flame, .rp-bar, .rp-skel { animation: none !important }
    .rp-opt, .rp-slot, .rp-day, .rp-cta { transition: none !important }
  }
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
    users: '<path d="M17 21v-2a4 4 0 0 0-3-3.87"/><path d="M9 21v-2a4 4 0 0 0-4-4H4"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    sunset: '<path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41M22 22H2M16 18a4 4 0 0 0-8 0M8 6l4 4 4-4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    sparkle: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z"/>',
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
function capFirst(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function claveADate(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function franjaDe(iso: string): 'manana' | 'tarde' | 'noche' {
  const h = new Date(iso).getHours();
  if (h < 14) return 'manana';
  if (h < 20) return 'tarde';
  return 'noche';
}
const FRANJAS: { key: 'manana' | 'tarde' | 'noche'; label: string; icon: string }[] = [
  { key: 'manana', label: 'Mañana', icon: 'sun' },
  { key: 'tarde', label: 'Tarde', icon: 'sunset' },
  { key: 'noche', label: 'Noche', icon: 'moon' },
];

function gcalLink(servicioNombre: string, negocioNombre: string, inicioISO: string, durMin: number, direccion?: string | null) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ini = new Date(inicioISO);
  const fin = new Date(ini.getTime() + durMin * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${servicioNombre} · ${negocioNombre}`,
    dates: `${fmt(ini)}/${fmt(fin)}`,
    details: `Reserva en ${negocioNombre}`,
  });
  if (direccion) p.set('location', direccion);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
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
  const [profId, setProfId] = useState<string>(ANY_PRO);
  const [fecha, setFecha] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotSel, setSlotSel] = useState<SlotDisponible | null>(null);

  const [diasDisp, setDiasDisp] = useState<Set<string>>(new Set());
  const [diasLoading, setDiasLoading] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<CrearCitaResult | null>(null);

  const skipPro = (info?.profesionales.length ?? 0) <= 1;

  // Carga del portal -------------------------------------------------------
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

  // Dias con disponibilidad (de un viaje) + auto-seleccion del primero ------
  useEffect(() => {
    if (step !== 'fecha' || !servicio) return;
    let cancel = false;
    (async () => {
      setDiasLoading(true);
      try {
        const arr = await getDiasDisponibles(slug, servicio.id, profId === ANY_PRO ? null : profId, 21);
        if (cancel) return;
        const set = new Set(arr);
        setDiasDisp(set);
        const curKey = fechaISOaClave(fecha);
        if (!set.has(curKey) && arr.length > 0) setFecha(claveADate(arr[0]));
      } catch {
        if (!cancel) setDiasDisp(new Set());
      } finally {
        if (!cancel) setDiasLoading(false);
      }
    })();
    return () => { cancel = true; };
    // fecha no va en deps a proposito: la ajustamos aqui dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, servicio, profId, slug]);

  // Huecos del dia seleccionado --------------------------------------------
  useEffect(() => {
    if (step !== 'fecha' || !servicio) return;
    let cancel = false;
    (async () => {
      setSlotsLoading(true);
      setSlotSel(null);
      try {
        const data = await getDisponibilidad(slug, servicio.id, fechaISOaClave(fecha), profId === ANY_PRO ? null : profId);
        if (!cancel) setSlots(data);
      } catch {
        if (!cancel) setSlots([]);
      } finally {
        if (!cancel) setSlotsLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [step, servicio, profId, fecha, slug]);

  // Horas unicas, agrupadas por franja del dia -----------------------------
  const horas = useMemo(() => {
    const map = new Map<string, SlotDisponible>();
    for (const s of slots) if (!map.has(s.slot)) map.set(s.slot, s);
    return [...map.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  }, [slots]);

  const proximosDias = useMemo(() => {
    const arr: Date[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) { const d = new Date(base); d.setDate(base.getDate() + i); arr.push(d); }
    return arr;
  }, []);

  const mostrarPrecioEnLista = info?.negocio.mostrar_precios === 'catalogo';
  const mostrarPrecioResumen = info?.negocio.mostrar_precios !== 'nunca';

  const profSel = useMemo(
    () => (profId === ANY_PRO ? null : info?.profesionales.find(p => p.id === profId) ?? null),
    [profId, info],
  );

  // Confirmar reserva ------------------------------------------------------
  const confirmar = useCallback(async () => {
    if (!servicio || !slotSel) return;
    setError('');
    if (!nombre.trim()) { setError('Indica tu nombre.'); return; }
    if (telefono.trim().length < 6) { setError('Indica un telefono valido.'); return; }
    setEnviando(true);
    try {
      const r = await crearCitaPublica({
        slug, servicioId: servicio.id, profesionalId: slotSel.profesional_id, inicioISO: slotSel.slot,
        clienteNombre: nombre.trim(), clienteTelefono: telefono.trim(),
        clienteEmail: email.trim() || undefined, notas: notas.trim() || undefined,
      });
      setResultado(r);
      setStep('confirmado');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo completar la reserva.';
      if (/ocupado|disponib|antelacion|horario/i.test(msg)) {
        setError('Ese hueco ya no esta libre. Elige otro, por favor.');
        setStep('fecha');
      } else { setError(msg); }
    } finally {
      setEnviando(false);
    }
  }, [servicio, slotSel, nombre, telefono, email, notas, slug]);

  function elegirServicio(sv: PortalServicio) {
    setServicio(sv); setError('');
    if (skipPro) { setProfId(info?.profesionales[0]?.id ?? ANY_PRO); setStep('fecha'); }
    else setStep('profesional');
  }

  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null); setDiasDisp(new Set());
    setNombre(''); setTelefono(''); setEmail(''); setNotas('');
    setResultado(null); setError(''); setStep('servicio');
  }

  // Render -----------------------------------------------------------------
  if (loading) return <Shell><LoadingState /></Shell>;

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
  const progreso = step === 'confirmado' ? 1 : stepIndex / (STEPS.length - 1);

  return (
    <Shell negocio={info.negocio} resenas={resenas}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />

      {step !== 'confirmado' && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{STEPS[stepIndex]?.label}</span>
            <span style={{ fontSize: 11.5, color: T.textTer }}>Paso {stepIndex + 1} de {STEPS.length}</span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'rgba(40,30,24,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(progreso * 100, 6)}%`, background: FIRE, borderRadius: 999, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginBottom: 14, background: T.dangerSoft, border: `1px solid ${T.danger}40`, borderRadius: 10, color: T.danger, fontSize: 13 }}>
          <Icon name="alert" size={16} color={T.danger} /> {error}
        </div>
      )}

      {/* PASO 1 — Servicio */}
      {step === 'servicio' && (
        <div className="rp-step">
          <H titulo="¿Qué te apetece?" sub="Elige el servicio para empezar" />
          <div className="rp-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {info.servicios.length === 0 && <Empty titulo="Sin servicios" texto="Este salon aun no tiene servicios para reservar online." />}
            {info.servicios.map((sv, i) => (
              <button key={sv.id} className="rp-opt" onClick={() => elegirServicio(sv)} style={{ ...optStyle, animationDelay: `${i * 0.05}s` }}>
                {sv.foto_url ? (
                  <img src={sv.foto_url} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: T.cardHi }} />
                ) : (
                  <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 12, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="scissors" size={19} color={T.primary} />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: T.text }}>{sv.nombre}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: T.textTer, marginTop: 2 }}>
                    <Icon name="clock" size={12} color={T.textTer} /> {sv.duracion} min
                    {mostrarPrecioEnLista && <span style={{ color: T.textSec, fontWeight: 600 }}>· {sv.precio}€</span>}
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
          <H titulo="¿Con quién?" sub={servicio?.nombre} />
          <div className="rp-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="rp-opt" onClick={() => { setProfId(ANY_PRO); setStep('fecha'); }} style={{ ...optStyle, animationDelay: '0s' }}>
              <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 12, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="users" size={19} color={T.primary} />
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: T.text }}>Cualquiera disponible</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.primaryHi, background: T.primarySoft, padding: '2px 7px', borderRadius: 999 }}>Más rápido</span>
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: T.textTer, marginTop: 2 }}>Más opciones de horario</span>
              </span>
              <Icon name="chevronRight" size={18} color={T.textTer} />
            </button>
            {info.profesionales.map((pr, i) => (
              <button key={pr.id} className="rp-opt" onClick={() => { setProfId(pr.id); setStep('fecha'); }} style={{ ...optStyle, animationDelay: `${(i + 1) * 0.05}s` }}>
                <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: '50%', background: (pr.color || T.primary) + '22', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: pr.color || T.primary, fontSize: 16 }}>
                  {pr.nombre.charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15.5, fontWeight: 700, color: T.text }}>{pr.nombre}</span>
                <Icon name="chevronRight" size={18} color={T.textTer} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PASO 3 — Fecha + hora */}
      {step === 'fecha' && servicio && (
        <div className="rp-step">
          <BackLink onClick={() => setStep(skipPro ? 'servicio' : 'profesional')} />
          <H titulo="Elige día y hora" sub={`${servicio.nombre}${profSel ? ` · ${profSel.nombre}` : ' · cualquiera'}`} />

          {!diasLoading && diasDisp.size === 0 ? (
            <Empty
              titulo="Sin huecos próximos"
              texto={`Ahora mismo no hay disponibilidad online en los próximos días.${info.negocio.telefono ? ' Llámanos y te buscamos hueco.' : ''}`}
              telefono={info.negocio.telefono}
            />
          ) : (
            <>
              {/* Rail de dias */}
              <div className="rp-rail" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 6, scrollSnapType: 'x proximity' }}>
                {proximosDias.map((d, i) => {
                  const key = fechaISOaClave(d);
                  const on = diasDisp.has(key);
                  const sel = key === fechaISOaClave(fecha);
                  const rel = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short' });
                  return (
                    <button
                      key={key}
                      className={`rp-day${on ? '' : ' rp-day-off'}`}
                      disabled={!on}
                      onClick={() => on && setFecha(d)}
                      style={{
                        flexShrink: 0, width: 60, padding: '9px 0', borderRadius: 14, textAlign: 'center', scrollSnapAlign: 'start',
                        border: sel ? 'none' : `1.5px solid ${T.border}`,
                        background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                        boxShadow: sel ? '0 8px 20px rgba(192,38,10,0.22)' : 'none',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize', opacity: sel ? 0.92 : 0.7 }}>{rel}</span>
                      <span style={{ display: 'block', fontSize: 19, fontWeight: 800, lineHeight: 1.15 }}>{d.getDate()}</span>
                      <span style={{ display: 'block', fontSize: 9.5, textTransform: 'capitalize', opacity: sel ? 0.85 : 0.6 }}>{d.toLocaleDateString('es-ES', { month: 'short' })}</span>
                    </button>
                  );
                })}
              </div>

              {/* Huecos */}
              {(slotsLoading || diasLoading) ? (
                <SlotsSkeleton />
              ) : horas.length === 0 ? (
                <Empty titulo="Día completo" texto="No quedan huecos este día. Prueba con otra fecha del calendario." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {FRANJAS.map(fr => {
                    const items = horas.filter(s => franjaDe(s.slot) === fr.key);
                    if (items.length === 0) return null;
                    return (
                      <div key={fr.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                          <Icon name={fr.icon} size={14} color={T.textSec} />
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textSec }}>{fr.label}</span>
                          <span style={{ fontSize: 11.5, color: T.textTer }}>· {items.length}</span>
                        </div>
                        <div className="rp-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
                          {items.map((s, i) => {
                            const sel = slotSel?.slot === s.slot;
                            return (
                              <button
                                key={s.slot}
                                className={sel ? 'rp-slot rp-on' : 'rp-slot'}
                                onClick={() => setSlotSel(s)}
                                title={profId === ANY_PRO ? `con ${s.profesional_nombre}` : undefined}
                                style={{
                                  padding: '11px 6px', borderRadius: 12, fontSize: 14.5, fontWeight: 700, animationDelay: `${i * 0.02}s`,
                                  border: sel ? 'none' : `1.5px solid ${T.border}`,
                                  background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                                  boxShadow: sel ? '0 8px 18px rgba(192,38,10,0.22)' : 'none',
                                }}
                              >
                                {fmtHora(s.slot)}
                                {profId === ANY_PRO && (
                                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>
                                    {s.profesional_nombre.split(' ')[0]}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Barra fija de continuar */}
          {slotSel && (
            <>
              <div style={{ height: 78 }} />
              <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 40 }}>
                <button
                  className="rp-cta rp-bar"
                  onClick={() => setStep('datos')}
                  style={{ pointerEvents: 'auto', width: '100%', maxWidth: 568, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderRadius: 16, border: 'none', background: FIRE, color: '#fff', boxShadow: '0 14px 36px rgba(192,38,10,0.34)' }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>{fmtFechaLarga(new Date(slotSel.slot))}</span>
                    <span style={{ fontSize: 15.5, fontWeight: 800 }}>{fmtHora(slotSel.slot)} · {slotSel.profesional_nombre.split(' ')[0]}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800 }}>
                    Continuar <Icon name="chevronRight" size={18} color="#fff" />
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* PASO 4 — Datos */}
      {step === 'datos' && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('fecha')} />
          <H titulo="Tus datos" sub="Solo lo justo para reservar" />
          <div className="rp-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field icon="user" label="Nombre y apellidos" value={nombre} onChange={setNombre} placeholder="Tu nombre" />
            <Field icon="phone" label="Teléfono" value={telefono} onChange={setTelefono} placeholder="600 000 000" type="tel" />
            <Field icon="mail" label="Email (opcional)" value={email} onChange={setEmail} placeholder="tu@email.com" type="email" />
            <Field icon="edit" label="Notas (opcional)" value={notas} onChange={setNotas} placeholder="Algo que debamos saber" multiline />
          </div>
          <button className="rp-cta" onClick={() => { if (!nombre.trim()) { setError('Indica tu nombre.'); return; } if (telefono.trim().length < 6) { setError('Indica un telefono valido.'); return; } setError(''); setStep('resumen'); }} style={primaryBtn}>
            Revisar reserva
          </button>
        </div>
      )}

      {/* PASO 5 — Resumen */}
      {step === 'resumen' && servicio && slotSel && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('datos')} />
          <H titulo="Confirma tu reserva" sub="Repasa que todo esté bien" />
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 26px rgba(40,30,24,0.05)' }}>
            <ResumenRow icon="scissors" label="Servicio" value={`${servicio.nombre}${mostrarPrecioResumen ? ` · ${servicio.precio}€` : ''}`} />
            <ResumenRow icon="user" label="Profesional" value={slotSel.profesional_nombre} />
            <ResumenRow icon="calendar" label="Fecha" value={fmtFechaLarga(new Date(slotSel.slot))} />
            <ResumenRow icon="clock" label="Hora" value={`${fmtHora(slotSel.slot)} · ${servicio.duracion} min`} last />
          </div>

          {servicio.prepago && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: T.primarySoft, border: `1px solid ${T.primary}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>
              <Icon name="alert" size={16} color={T.primary} />
              Este servicio requiere una senal. Te indicaremos como abonarla para confirmar la reserva.
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12.5, color: T.textTer }}>
            {nombre} · {telefono}{email ? ` · ${email}` : ''}
          </div>

          <button className="rp-cta" onClick={confirmar} disabled={enviando} style={{ ...primaryBtn, opacity: enviando ? 0.65 : 1 }}>
            {enviando ? 'Reservando…' : 'Confirmar reserva'}
          </button>
        </div>
      )}

      {/* PASO 6 — Confirmado */}
      {step === 'confirmado' && resultado && servicio && slotSel && (
        <div className="rp-step" style={{ textAlign: 'center', padding: '10px 0 4px' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <span style={{ position: 'absolute', width: 78, height: 78, borderRadius: '50%', background: T.primarySoft, animation: 'rpRing 1.8s ease-out infinite' }} />
            <span style={{ position: 'relative', display: 'inline-flex', width: 78, height: 78, borderRadius: '50%', background: '#fff', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
              <span className="rp-flame"><MechaMark size={40} /></span>
            </span>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 30, color: T.text, marginBottom: 6, lineHeight: 1.05 }}>
            {resultado.estado === 'pendiente' ? 'Reserva recibida' : '¡Reserva confirmada!'}
          </div>
          <div style={{ fontSize: 14.5, color: T.textSec, marginBottom: 4 }}>
            {capFirst(fmtFechaLarga(new Date(slotSel.slot)))}
          </div>
          <div style={{ fontSize: 14.5, color: T.text, fontWeight: 700, marginBottom: 18 }}>
            {fmtHora(slotSel.slot)} · {slotSel.profesional_nombre}
          </div>

          {resultado.estado === 'pendiente' && resultado.deposito_requerido && (
            <div style={{ margin: '0 auto 18px', maxWidth: 380, padding: '11px 13px', background: T.primarySoft, border: `1px solid ${T.primary}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>
              Queda pendiente la senal de {resultado.deposito_importe}€. Te contactaremos para completar el pago.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
            <a className="rp-cta" href={gcalLink(servicio.nombre, info.negocio.nombre || 'tu salon', slotSel.slot, servicio.duracion, info.negocio.direccion)} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: T.card, border: `1.5px solid ${T.border}`, color: T.text, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              <Icon name="calendar" size={16} color={T.primary} /> Añadir al calendario
            </a>
            <button className="rp-link" onClick={reiniciar} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700, padding: 8 }}>
              Hacer otra reserva
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes / estilos
// ---------------------------------------------------------------------------
const optStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: 13,
  background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 16,
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 22, padding: '15px 16px', borderRadius: 14, border: 'none',
  background: FIRE, color: '#fff', fontSize: 15.5, fontWeight: 800, boxShadow: '0 12px 30px rgba(192,38,10,0.28)',
};

function Shell({ children, negocio, resenas }: { children: React.ReactNode; negocio?: PortalInfo['negocio']; resenas?: ResenaResumen | null }) {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '0 16px 48px', fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {/* Resplandor calido de fondo */}
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 520, height: 320, background: 'radial-gradient(closest-side, rgba(244,80,30,0.10), transparent)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '24px 4px 18px' }}>
          <span className="rp-flame" style={{ display: 'inline-flex' }}><MechaMark size={36} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 25, color: T.text, letterSpacing: -0.2, lineHeight: 1.05 }}>
              {negocio?.nombre || 'Reserva tu cita'}
            </div>
            {(negocio?.direccion || (resenas && resenas.total > 0)) && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                {resenas && resenas.total > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-flex', color: T.star }} dangerouslySetInnerHTML={{ __html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{resenas.media}</span>
                    <span style={{ fontSize: 12, color: T.textTer }}>· {resenas.total} {resenas.total === 1 ? 'valoración' : 'valoraciones'}</span>
                  </span>
                )}
                {negocio?.direccion && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: T.textTer }}>
                    <Icon name="mapPin" size={12} color={T.textTer} /> {negocio.direccion}
                  </span>
                )}
              </div>
            )}
          </div>
        </header>
        <main style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 22, padding: 22, boxShadow: '0 16px 50px rgba(40,30,24,0.08)' }}>
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
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: SERIF, fontSize: 26, color: T.text, letterSpacing: -0.2, lineHeight: 1.08 }}>{titulo}</div>
      {sub && <div style={{ fontSize: 13.5, color: T.textTer, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="rp-link" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: T.textSec, fontSize: 13, fontWeight: 600, marginBottom: 14, cursor: 'pointer', padding: 0 }}>
      <Icon name="chevronLeft" size={15} color={T.textSec} /> Atras
    </button>
  );
}

function Empty({ titulo, texto, telefono }: { titulo: string; texto: string; telefono?: string | null }) {
  return (
    <div style={{ padding: '30px 24px', textAlign: 'center', border: `1px dashed ${T.borderHi}`, borderRadius: 16, background: T.cardHi }}>
      <div style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: '50%', background: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon name="calendar" size={20} color={T.primary} />
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: T.textSec, maxWidth: 320, margin: '0 auto' }}>{texto}</div>
      {telefono && (
        <a className="rp-cta" href={`tel:${telefono}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '11px 18px', borderRadius: 12, background: FIRE, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          <Icon name="phone" size={15} color="#fff" /> Llamar al salon
        </a>
      )}
    </div>
  );
}

function ResumenRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: last ? 'none' : `1px solid ${T.border}`, background: T.card }}>
      <Icon name={icon} size={16} color={T.primary} />
      <span style={{ fontSize: 12.5, color: T.textTer, width: 88 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Field({ icon, label, value, onChange, placeholder, type = 'text', multiline }: {
  icon: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; multiline?: boolean;
}) {
  const base: React.CSSProperties = {
    width: '100%', padding: multiline ? '12px 12px 12px 38px' : '12px 12px 12px 38px', borderRadius: 12, border: `1.5px solid ${T.border}`,
    fontSize: 14.5, color: T.text, background: T.card, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <span style={{ position: 'absolute', left: 12, top: multiline ? 13 : '50%', transform: multiline ? 'none' : 'translateY(-50%)', pointerEvents: 'none' }}>
          <Icon name={icon} size={16} color={T.textTer} />
        </span>
        {multiline ? (
          <textarea className="rp-field" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...base, resize: 'vertical' }} />
        ) : (
          <input className="rp-field" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={base} />
        )}
      </span>
    </label>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map(i => <div key={i} className="rp-skel" style={{ height: 66 }} />)}
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[0, 1].map(g => (
        <div key={g}>
          <div className="rp-skel" style={{ height: 14, width: 90, marginBottom: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
            {Array.from({ length: g === 0 ? 6 : 4 }).map((_, i) => <div key={i} className="rp-skel" style={{ height: 44 }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
