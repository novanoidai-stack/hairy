import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { makeT, localeOf, type TFn } from '@/lib/portalI18n';
import {
  getPortalInfo, getDisponibilidad, getDiasDisponibles, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  type PortalInfo, type PortalServicio, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';
import { EmbersCanvas } from '../resena/[slug].web';
import { PORTAL_TOKENS, FIRE_GRADIENT, SANS_SERIF } from '@/lib/portalTokens';

// ---------------------------------------------------------------------------
// Tokens — marca Mecha (Basalto oscuro). El gradiente FIRE es el del
// simbolo de la llama (#mecha-mark): se usa en CTAs, progreso y exito.
// ---------------------------------------------------------------------------
const T = PORTAL_TOKENS;
const FIRE = FIRE_GRADIENT;
const SERIF = SANS_SERIF;

const ANIM = `
  @keyframes rpFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rpUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes rpPop { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: scale(1) } }
  @keyframes rpFlicker { 0%,100% { transform: rotate(-1deg) scale(1); opacity: 1 } 45% { transform: rotate(1.5deg) scale(1.05); opacity: 0.92 } 70% { transform: rotate(-0.5deg) scale(0.99); opacity: 0.97 } }
  @keyframes rpRing { 0% { transform: scale(0.6); opacity: 0.55 } 100% { transform: scale(1.9); opacity: 0 } }
  @keyframes rpShimmer { 0% { background-position: -360px 0 } 100% { background-position: 360px 0 } }
  @keyframes rpBarUp { from { transform: translateY(120%) } to { transform: translateY(0) } }
  @keyframes rpEmber { 0% { transform: translateY(0) scale(1); opacity: 0 } 12% { opacity: 0.7 } 100% { transform: translateY(-120px) scale(0.4); opacity: 0 } }
  .rp-step { animation: rpUp 0.45s cubic-bezier(0.16,1,0.3,1) both }
  .rp-stagger > * { animation: rpUp 0.5s cubic-bezier(0.16,1,0.3,1) both }
  .rp-flame { animation: rpFlicker 3.4s ease-in-out infinite; transform-origin: 50% 80% }
  .rp-opt { transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease; cursor: pointer }
  .rp-opt:hover { border-color: ${T.primary} !important; background: ${T.cardHi} !important; transform: translateY(-2px); box-shadow: 0 10px 26px rgba(244,80,30,0.15) }
  .rp-slot { transition: transform 0.13s ease, border-color 0.13s ease, background 0.13s ease; cursor: pointer }
  .rp-slot:hover { border-color: ${T.primary} !important; background: ${T.primarySoft} !important; transform: translateY(-1px) }
  .rp-slot.rp-on, .rp-slot.rp-on:hover { background: ${T.primary} !important; border-color: ${T.primary} !important; color: #fff !important; transform: none }
  .rp-day { transition: transform 0.14s ease, border-color 0.14s ease; cursor: pointer }
  .rp-day:hover { transform: translateY(-2px) }
  .rp-day-off { opacity: 0.32; cursor: default !important; filter: grayscale(0.4) }
  .rp-cta { transition: transform 0.16s ease, filter 0.16s ease; cursor: pointer }
  .rp-cta:hover { filter: brightness(1.05) }
  .rp-cta:active { transform: translateY(1px) }
  .rp-link { cursor: pointer; transition: color 0.15s ease }
  .rp-link:hover { color: ${T.primaryHi} !important }
  .rp-bar { animation: rpBarUp 0.4s cubic-bezier(0.16,1,0.3,1) both }
  .rp-rail::-webkit-scrollbar { height: 0 }
  .rp-skel { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.04) 63%); background-size: 720px 100%; animation: rpShimmer 1.4s linear infinite; border-radius: 10px }
  .rp-field { color: #f6f8ff !important; background-color: #101729 !important; }
  .rp-field:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} }
  .rp-check { transition: background 0.15s ease, border-color 0.15s ease }
  .rp-photo { transition: transform 0.3s cubic-bezier(0.16,1,0.3,1) }
  .rp-opt:hover .rp-photo { transform: scale(1.04) }
  @media (prefers-reduced-motion: reduce) {
    .rp-step, .rp-stagger > *, .rp-flame, .rp-bar, .rp-skel { animation: none !important }
    .rp-opt, .rp-slot, .rp-day, .rp-cta, .rp-photo { transition: none !important }
  }
`;

// ---------------------------------------------------------------------------
// Iconos SVG inline (sin emojis). Hex explicito en fill/stroke.
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
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    sunset: '<path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41M22 22H2M16 18a4 4 0 0 0-8 0M8 6l4 4 4-4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
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
const STEP_KEYS: { key: Step; tk: string }[] = [
  { key: 'servicio', tk: 'step_servicio' },
  { key: 'profesional', tk: 'step_profesional' },
  { key: 'fecha', tk: 'step_fecha' },
  { key: 'datos', tk: 'step_datos' },
  { key: 'resumen', tk: 'step_confirmar' },
];

const ANY_PRO = '__any__';

function fmtHora(iso: string, loc: string) {
  return new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
}
function fmtFechaLarga(d: Date, loc: string) {
  return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
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
const FRANJAS: { key: 'manana' | 'tarde' | 'noche'; tk: string; icon: string }[] = [
  { key: 'manana', tk: 'franja_manana', icon: 'sun' },
  { key: 'tarde', tk: 'franja_tarde', icon: 'sunset' },
  { key: 'noche', tk: 'franja_noche', icon: 'moon' },
];

function normalizeUrl(w: string): string {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}
function hostOf(w: string): string {
  try { return new URL(normalizeUrl(w)).host.replace(/^www\./, ''); } catch { return w; }
}

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

const PRIV_URL = '/privacidad.html';

export default function PortalReservaWeb() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [splash, setSplash] = useState(true);
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
  const [consent, setConsent] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<CrearCitaResult | null>(null);

  const skipPro = (info?.profesionales.length ?? 0) <= 1;
  const t: TFn = useMemo(() => makeT(info?.negocio?.idioma), [info?.negocio?.idioma]);
  const loc = useMemo(() => localeOf(info?.negocio?.idioma), [info?.negocio?.idioma]);

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

  useEffect(() => {
    const timer = setTimeout(() => setSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

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
    if (!nombre.trim()) { setError(t('err_nombre')); return; }
    if (telefono.trim().length < 6) { setError(t('err_tel')); return; }
    if (!consent) { setError(t('err_consent')); return; }
    setEnviando(true);
    try {
      const r = await crearCitaPublica({
        slug, servicioId: servicio.id, profesionalId: slotSel.profesional_id, inicioISO: slotSel.slot,
        clienteNombre: nombre.trim(), clienteTelefono: telefono.trim(),
        clienteEmail: email.trim() || undefined, notas: notas.trim() || undefined,
        consentimientoDatos: consent,
      });
      setResultado(r);
      setStep('confirmado');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('err_generic');
      if (/ocupado|disponib|antelacion|horario/i.test(msg)) {
        setError(t('err_ocupado'));
        setStep('fecha');
      } else { setError(msg); }
    } finally {
      setEnviando(false);
    }
  }, [servicio, slotSel, nombre, telefono, email, notas, consent, slug, t]);

  function elegirServicio(sv: PortalServicio) {
    setServicio(sv); setError('');
    if (skipPro) { setProfId(info?.profesionales[0]?.id ?? ANY_PRO); setStep('fecha'); }
    else setStep('profesional');
  }

  function irAResumen() {
    if (!nombre.trim()) { setError(t('err_nombre')); return; }
    if (telefono.trim().length < 6) { setError(t('err_tel')); return; }
    if (!consent) { setError(t('err_consent')); return; }
    setError(''); setStep('resumen');
  }

  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null); setDiasDisp(new Set());
    setNombre(''); setTelefono(''); setEmail(''); setNotas(''); setConsent(false);
    setResultado(null); setError(''); setStep('servicio');
  }

  // Render -----------------------------------------------------------------
  if (splash) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIM }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'rpPop 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
            <svg
              viewBox="0 0 80 80"
              width="80"
              height="80"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="spinnerGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={T.primary} />
                  <stop offset="100%" stopColor="rgba(244,80,30,0.15)" />
                </linearGradient>
              </defs>
              <style>{`
                @keyframes mechaSpinner {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                @keyframes mechaPulse {
                  0%, 100% { transform: scale(0.88); opacity: 0.5; }
                  50% { transform: scale(1.05); opacity: 0.95; }
                }
                .mecha-spinner-ring {
                  transform-box: fill-box;
                  transform-origin: center;
                  animation: mechaSpinner 1s linear infinite;
                }
                .mecha-spinner-core {
                  transform-box: fill-box;
                  transform-origin: center;
                  animation: mechaPulse 2.2s ease-in-out infinite;
                }
              `}</style>
              <circle className="mecha-spinner-ring" cx="40" cy="40" r="32" stroke="url(#spinnerGrad)" strokeWidth="4" strokeLinecap="round" strokeDasharray="140 60" fill="none" />
              <circle className="mecha-spinner-core" cx="40" cy="40" r="16" fill={T.primary} style={{ filter: 'drop-shadow(0 0 10px rgba(244,80,30,0.4))' }} />
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>{t('splash_powered')}</div>
          <div style={{ fontFamily: SERIF, fontSize: 40, color: T.text, lineHeight: 1 }}>Mecha</div>
          {info?.negocio?.nombre && (
            <div style={{ marginTop: 22, fontSize: 14.5, color: T.textSec, animation: 'rpFade 0.6s ease 0.4s both' }}>
              {t('splash_connecting', { n: '' })}<span style={{ fontWeight: 700, color: T.text }}>{info.negocio.nombre}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <Shell t={t}><LoadingState /></Shell>;

  if (notFound || !info) {
    return (
      <Shell t={t}>
        <div style={{ padding: '44px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: SERIF, fontSize: 26, color: T.text, marginBottom: 6 }}>{t('notfound_title')}</div>
          <div style={{ fontSize: 14, color: T.textSec }}>{t('notfound_sub')}</div>
        </div>
      </Shell>
    );
  }

  const stepIndex = STEP_KEYS.findIndex(s => s.key === step);

  return (
    <Shell t={t} negocio={info.negocio} resenas={resenas} loc={loc}>
      {step !== 'confirmado' && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', padding: '0 6px', marginBottom: 8 }}>
            <div style={{ position: 'absolute', left: 16, right: 16, top: '50%', transform: 'translateY(-50%)', height: 3, background: 'rgba(40,30,24,0.07)', borderRadius: 999, zIndex: 0 }} />
            <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', height: 3, width: `calc(${(stepIndex / (STEP_KEYS.length - 1)) * 100}% - ${stepIndex === 0 ? 0 : 0}px)`, maxWidth: 'calc(100% - 32px)', background: FIRE, borderRadius: 999, transition: 'width 0.4s ease', zIndex: 0 }} />
            {STEP_KEYS.map((s, idx) => {
              const isActive = idx === stepIndex;
              const isCompleted = idx < stepIndex;
              return (
                <div key={s.key} style={{ zIndex: 1 }}>
                  <div style={{
                    width: isActive ? 30 : 24, height: isActive ? 30 : 24, borderRadius: '50%',
                    background: (isActive || isCompleted) ? FIRE : T.card,
                    border: `2px solid ${(isActive || isCompleted) ? 'transparent' : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isActive ? 12.5 : 11, fontWeight: 800,
                    color: (isActive || isCompleted) ? '#fff' : T.textTer,
                    boxShadow: isActive ? '0 5px 14px rgba(244,80,30,0.32)' : 'none',
                    transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                  }}>
                    {isCompleted ? <Icon name="check" size={13} color="#fff" /> : idx + 1}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '1.4px' }}>
            {t('paso', { n: stepIndex + 1, t: STEP_KEYS.length })}
          </div>
        </div>
      )}

      {error && (
        <div className="rp-step" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginBottom: 14, background: T.dangerSoft, border: `1px solid ${T.danger}40`, borderRadius: 10, color: T.danger, fontSize: 13 }}>
          <Icon name="alert" size={16} color={T.danger} /> {error}
        </div>
      )}

      {/* PASO 1 — Servicio */}
      {step === 'servicio' && (
        <div className="rp-step">
          <H titulo={t('s1_title')} sub={t('s1_sub')} />
          <div className="rp-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {info.servicios.length === 0 && <Empty titulo={t('empty_servicios_t')} texto={t('empty_servicios_x')} />}
            {info.servicios.map((sv, i) => (
              <button key={sv.id} className="rp-opt" onClick={() => elegirServicio(sv)} style={{ ...optStyle, animationDelay: `${i * 0.05}s` }}>
                {sv.foto_url ? (
                  <span style={{ position: 'relative', width: 72, height: 72, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: T.cardHi, boxShadow: 'inset 0 0 0 1px rgba(40,30,24,0.05)' }}>
                    <img className="rp-photo" src={sv.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.96) brightness(1.02) contrast(0.97)', display: 'block' }} />
                    <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,247,240,0.10), rgba(40,30,24,0.06))' }} />
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', width: 72, height: 72, borderRadius: 14, background: T.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="scissors" size={24} color={T.primary} />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: T.text }}>{sv.nombre}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: T.textTer, marginTop: 2 }}>
                    <Icon name="clock" size={12} color={T.textTer} /> {sv.duracion} {t('min')}
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
          <BackLink onClick={() => setStep('servicio')} t={t} />
          <H titulo={t('s2_title')} sub={servicio?.nombre} />
          <div className="rp-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button className="rp-opt" onClick={() => { setProfId(ANY_PRO); setStep('fecha'); }} style={{ ...optStyle, animationDelay: '0s' }}>
              <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 12, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="users" size={19} color={T.primary} />
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: T.text }}>{t('any_pro')}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.primaryHi, background: T.primarySoft, padding: '2px 7px', borderRadius: 999 }}>{t('any_pro_badge')}</span>
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: T.textTer, marginTop: 2 }}>{t('any_pro_sub')}</span>
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
          <BackLink onClick={() => setStep(skipPro ? 'servicio' : 'profesional')} t={t} />
          <H titulo={t('s3_title')} sub={`${servicio.nombre}${profSel ? ` · ${profSel.nombre}` : ` · ${t('any')}`}`} />

          {!diasLoading && diasDisp.size === 0 ? (
            <Empty
              titulo={t('empty_huecos_t')}
              texto={`${t('empty_huecos_x')}${info.negocio.telefono ? t('call_us') : ''}`}
              telefono={info.negocio.telefono}
              t={t}
            />
          ) : (
            <>
              {/* Rail de dias */}
              <div className="rp-rail" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 10, marginBottom: 8, scrollSnapType: 'x proximity' }}>
                {proximosDias.map((d, i) => {
                  const key = fechaISOaClave(d);
                  const on = diasDisp.has(key);
                  const sel = key === fechaISOaClave(fecha);
                  const rel = i === 0 ? t('hoy') : i === 1 ? t('manana_rel') : d.toLocaleDateString(loc, { weekday: 'short' });
                  return (
                    <button
                      key={key}
                      className={`rp-day${on ? '' : ' rp-day-off'}`}
                      disabled={!on}
                      onClick={() => on && setFecha(d)}
                      style={{
                        flexShrink: 0, width: 58, padding: '8px 0', borderRadius: 14, textAlign: 'center', scrollSnapAlign: 'start',
                        border: sel ? 'none' : `1.5px solid ${T.border}`,
                        background: sel ? FIRE : T.card, color: sel ? '#fff' : T.text,
                        boxShadow: sel ? '0 7px 18px rgba(192,38,10,0.24)' : 'none',
                        position: 'relative',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'capitalize', opacity: sel ? 0.92 : 0.7 }}>{rel}</span>
                      <span style={{ display: 'block', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{d.getDate()}</span>
                      <span style={{ display: 'block', fontSize: 9, textTransform: 'capitalize', opacity: sel ? 0.85 : 0.55 }}>{d.toLocaleDateString(loc, { month: 'short' })}</span>
                      {on && !sel && <span aria-hidden style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: T.primary }} />}
                    </button>
                  );
                })}
              </div>

              {(slotsLoading || diasLoading) ? (
                <SlotsSkeleton />
              ) : horas.length === 0 ? (
                <Empty titulo={t('dia_completo_t')} texto={t('dia_completo_x')} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {FRANJAS.map(fr => {
                    const items = horas.filter(s => franjaDe(s.slot) === fr.key);
                    if (items.length === 0) return null;
                    return (
                      <div key={fr.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 7, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name={fr.icon} size={13} color={T.primary} />
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textSec }}>{t(fr.tk)}</span>
                          <span style={{ fontSize: 11.5, color: T.textTer }}>· {items.length} {t('huecos')}</span>
                        </div>
                        <div className="rp-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 7 }}>
                          {items.map((s, i) => {
                            const sel = slotSel?.slot === s.slot;
                            return (
                              <button
                                key={s.slot}
                                className={sel ? 'rp-slot rp-on' : 'rp-slot'}
                                onClick={() => setSlotSel(s)}
                                title={profId === ANY_PRO ? `con ${s.profesional_nombre}` : undefined}
                                style={{
                                  padding: '10px 6px', borderRadius: 12, fontSize: 14.5, fontWeight: 700, animationDelay: `${i * 0.02}s`,
                                  border: sel ? 'none' : `1.5px solid ${T.border}`,
                                  background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                                  boxShadow: sel ? '0 8px 18px rgba(192,38,10,0.22)' : 'none',
                                }}
                              >
                                {fmtHora(s.slot, loc)}
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

          {slotSel && (
            <>
              <div style={{ height: 78 }} />
              <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 40 }}>
                <button
                  className="rp-cta rp-bar"
                  onClick={() => setStep('datos')}
                  style={{ pointerEvents: 'auto', width: '100%', maxWidth: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderRadius: 16, border: 'none', background: FIRE, color: '#fff', boxShadow: '0 14px 36px rgba(192,38,10,0.34)' }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>{capFirst(fmtFechaLarga(new Date(slotSel.slot), loc))}</span>
                    <span style={{ fontSize: 15.5, fontWeight: 800 }}>{fmtHora(slotSel.slot, loc)} · {slotSel.profesional_nombre.split(' ')[0]}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800 }}>
                    {t('continuar')} <Icon name="chevronRight" size={18} color="#fff" />
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
          <BackLink onClick={() => setStep('fecha')} t={t} />
          <H titulo={t('step_datos')} sub={t('s4_sub')} />
          <div className="rp-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field icon="user" label={t('f_nombre')} value={nombre} onChange={setNombre} placeholder={t('f_nombre_ph')} />
            <div>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>{t('f_tel')}</span>
              <PhoneInput value={telefono} onChange={(e164) => setTelefono(e164)} placeholder="600 000 000" />
            </div>
            <Field icon="mail" label={t('f_email')} value={email} onChange={setEmail} placeholder="tu@email.com" type="email" />
            <Field icon="edit" label={t('f_notas')} value={notas} onChange={setNotas} placeholder={t('f_notas_ph')} multiline />
          </div>

          {/* Consentimiento de privacidad (se recoge el telefono) */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: 'pointer' }}>
            <span
              onClick={() => setConsent(c => !c)}
              className="rp-check"
              style={{
                flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: 7,
                border: `2px solid ${consent ? T.primary : T.borderHi}`,
                background: consent ? T.primary : T.card,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {consent && <Icon name="check" size={14} color="#fff" />}
            </span>
            <span style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.45 }}>
              <span onClick={() => setConsent(c => !c)}>
                {t('consent').split('{priv}')[0]}
                <a className="rp-link" href={PRIV_URL} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.primary, fontWeight: 700, textDecoration: 'underline' }}>{t('consent_link')}</a>
                {t('consent').split('{priv}')[1]}
              </span>
              <span style={{ display: 'block', color: T.textTer, marginTop: 3, fontSize: 11.5 }}>{t('consent_note')}</span>
            </span>
          </label>

          <button className="rp-cta" onClick={irAResumen} style={primaryBtn}>
            {t('revisar')}
          </button>
        </div>
      )}

      {/* PASO 5 — Resumen */}
      {step === 'resumen' && servicio && slotSel && (
        <div className="rp-step">
          <BackLink onClick={() => setStep('datos')} t={t} />
          <H titulo={t('s5_title')} sub={t('s5_sub')} />
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 26px rgba(40,30,24,0.05)' }}>
            <ResumenRow icon="scissors" label={t('step_servicio')} value={`${servicio.nombre}${mostrarPrecioResumen ? ` · ${servicio.precio}€` : ''}`} />
            <ResumenRow icon="user" label={t('step_profesional')} value={slotSel.profesional_nombre} />
            <ResumenRow icon="calendar" label={t('step_fecha')} value={capFirst(fmtFechaLarga(new Date(slotSel.slot), loc))} />
            <ResumenRow icon="clock" label="Hora" value={`${fmtHora(slotSel.slot, loc)} · ${servicio.duracion} ${t('min')}`} last />
          </div>

          {servicio.prepago && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: T.primarySoft, border: `1px solid ${T.primary}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>
              <Icon name="alert" size={16} color={T.primary} />
              {t('prepago')}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12.5, color: T.textTer }}>
            {nombre} · {telefono}{email ? ` · ${email}` : ''}
          </div>

          <button className="rp-cta" onClick={confirmar} disabled={enviando} style={{ ...primaryBtn, opacity: enviando ? 0.65 : 1 }}>
            {enviando ? t('reservando') : t('confirmar_reserva')}
          </button>
        </div>
      )}

      {/* PASO 6 — Confirmado */}
      {step === 'confirmado' && resultado && servicio && slotSel && (
        <div className="rp-step" style={{ textAlign: 'center', padding: '6px 0 2px' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ position: 'absolute', width: 78, height: 78, borderRadius: '50%', background: T.primarySoft, animation: 'rpRing 1.8s ease-out infinite' }} />
            <span style={{ position: 'relative', display: 'inline-flex', width: 78, height: 78, borderRadius: '50%', background: T.card, border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(244,80,30,0.25)' }}>
              <span className="rp-flame"><MechaMark size={40} /></span>
            </span>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 34, color: T.text, marginBottom: 8, lineHeight: 1.02 }}>
            {resultado.estado === 'pendiente' ? t('ok_recibida') : t('ok_confirmada')}
          </div>

          {/* Mensaje calido */}
          <div style={{ maxWidth: 380, margin: '0 auto 18px', fontSize: 15, color: T.textSec, lineHeight: 1.5 }}>
            {t('ok_esperamos', { fecha: fmtFechaLarga(new Date(slotSel.slot), loc), hora: fmtHora(slotSel.slot, loc) })}
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 14, background: T.cardHi, border: `1px solid ${T.border}`, marginBottom: 18 }}>
            <Icon name="user" size={15} color={T.primary} />
            <span style={{ fontSize: 13.5, color: T.text, fontWeight: 600 }}>{slotSel.profesional_nombre}</span>
          </div>

          {resultado.estado === 'pendiente' && resultado.deposito_requerido && (
            <div style={{ margin: '0 auto 18px', maxWidth: 380, padding: '11px 13px', background: T.primarySoft, border: `1px solid ${T.primary}33`, borderRadius: 12, fontSize: 12.5, color: T.text }}>
              {t('ok_deposito', { imp: resultado.deposito_importe })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
            <a className="rp-cta" href={gcalLink(servicio.nombre, info.negocio.nombre || 'tu salon', slotSel.slot, servicio.duracion, info.negocio.direccion)} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: T.card, border: `1.5px solid ${T.border}`, color: T.text, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              <Icon name="calendar" size={16} color={T.primary} /> {t('add_cal')}
            </a>
            <button className="rp-link" onClick={reiniciar} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700, padding: 8 }}>
              {t('otra')}
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
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 12,
  background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 16,
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 20, padding: '15px 16px', borderRadius: 14, border: 'none',
  background: FIRE, color: '#fff', fontSize: 15.5, fontWeight: 800, boxShadow: '0 12px 30px rgba(192,38,10,0.28)',
};


function Shell({ children, negocio, resenas, t, loc = 'es-ES' }: {
  children: React.ReactNode; negocio?: PortalInfo['negocio']; resenas?: ResenaResumen | null; t: TFn; loc?: string;
}) {
  const dir = negocio?.direccion?.trim();
  const tel = negocio?.telefono?.trim();
  const web = negocio?.web?.trim();
  const hasEst = !!(dir || tel || web);
  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      backgroundImage: `
        radial-gradient(80% 60% at 50% -10%, rgba(224,52,14,0.06), transparent 75%),
        radial-gradient(60% 50% at 85% 5%, rgba(255,130,40,0.12), transparent 70%),
        radial-gradient(65% 55% at 15% 15%, rgba(255,90,30,0.12), transparent 70%),
        radial-gradient(75% 60% at 50% 110%, rgba(224,52,14,0.08), transparent 70%)
      `,
      padding: '0 16px 48px',
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative',
      overflowY: 'auto'
    }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <EmbersCanvas />
      <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Cabecera: el nombre del salon es el protagonista */}
        <header style={{ padding: '26px 4px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', border: `1px solid ${T.border}`, padding: '5px 11px', borderRadius: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              <span className="rp-flame" style={{ display: 'inline-flex' }}><MechaMark size={13} /></span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '0.8px' }}>mecha</span>
            </div>
          </div>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(34px, 9vw, 48px)', fontWeight: 400, color: T.text, letterSpacing: -0.4, lineHeight: 1.0 }}>
            {negocio?.nombre || 'Reserva tu cita'}
          </h1>
          {(dir || (resenas && resenas.total > 0)) && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
              {resenas && resenas.total > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="rp-flame" style={{ display: 'inline-flex' }}><MechaMark size={15} /></span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{resenas.media}</span>
                  <span style={{ fontSize: 12, color: T.textTer }}>· {resenas.total} {resenas.total === 1 ? t('valoracion_1') : t('valoracion_n')}</span>
                  {!!resenas.verificadas && resenas.verificadas > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: T.success, background: T.successSoft, padding: '2px 7px', borderRadius: 999 }}>
                      <Icon name="check" size={11} color={T.success} /> {resenas.verificadas} {t('verificadas')}
                    </span>
                  )}
                </span>
              )}
              {dir && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: T.textTer }}>
                  <Icon name="mapPin" size={12} color={T.textTer} /> {dir}
                </span>
              )}
            </div>
          )}
        </header>

        {/* Panel principal */}
        <main style={{ background: T.panel, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: `1px solid ${T.border}`, borderRadius: 22, padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
          {children}
        </main>

        {/* Datos del establecimiento — visibilidad e interconexion */}
        {hasEst && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {dir && (
              <a className="rp-cta" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                <Icon name="mapPin" size={14} color={T.primary} /> {t('como_llegar')}
              </a>
            )}
            {tel && (
              <a className="rp-cta" href={`tel:${tel}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                <Icon name="phone" size={14} color={T.primary} /> {t('llamar')}
              </a>
            )}
            {web && (
              <a className="rp-cta" href={normalizeUrl(web)} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                <Icon name="globe" size={14} color={T.primary} /> {hostOf(web)}
              </a>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11.5, color: T.textTer, marginTop: 16 }}>
          {t('footer_reservas')} <span style={{ fontWeight: 800, color: T.primary }}>mecha</span>
        </div>
      </div>
    </div>
  );
}

function H({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: SERIF, fontSize: 28, color: T.text, letterSpacing: -0.3, lineHeight: 1.05 }}>{titulo}</div>
      {sub && <div style={{ fontSize: 13.5, color: T.textTer, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BackLink({ onClick, t }: { onClick: () => void; t: TFn }) {
  return (
    <button className="rp-link" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: T.textSec, fontSize: 13, fontWeight: 600, marginBottom: 12, cursor: 'pointer', padding: 0 }}>
      <Icon name="chevronLeft" size={15} color={T.textSec} /> {t('atras')}
    </button>
  );
}

function Empty({ titulo, texto, telefono, t }: { titulo: string; texto: string; telefono?: string | null; t?: TFn }) {
  return (
    <div style={{ padding: '28px 24px', textAlign: 'center', border: `1px dashed ${T.borderHi}`, borderRadius: 16, background: T.cardHi }}>
      <div style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: '50%', background: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon name="calendar" size={20} color={T.primary} />
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: T.textSec, maxWidth: 320, margin: '0 auto' }}>{texto}</div>
      {telefono && t && (
        <a className="rp-cta" href={`tel:${telefono}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '11px 18px', borderRadius: 12, background: FIRE, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          <Icon name="phone" size={15} color="#fff" /> {t('llamar')}
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
    width: '100%', padding: '12px 12px 12px 38px', borderRadius: 12, border: `1.5px solid ${T.border}`,
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 7 }}>
            {Array.from({ length: g === 0 ? 6 : 4 }).map((_, i) => <div key={i} className="rp-skel" style={{ height: 42 }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
