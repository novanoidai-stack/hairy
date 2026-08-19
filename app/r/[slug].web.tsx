import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { MechaMark } from '@/components/ui/MechaMark';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { ConsentBanner } from '@/components/portal/ConsentBanner';
import { makeT, localeOf, type TFn } from '@/lib/portalI18n';
import {
  getPortalInfo, getDisponibilidad, getDiasDisponibles, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  unirseListaEsperaPublica, crearResenaPublica, normalizarTelefonoE164,
  type PortalInfo, type PortalServicio, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';
import { reportarError } from '@/lib/reportarError';
import { PORTAL_TOKENS, FIRE_GRADIENT, SANS_SERIF } from '@/lib/portalTokens';
import { initGA4, trackPageView, trackEvent, giveConsent, withdrawConsent, loadSavedConsent, AnalyticsEvents } from '@/lib/analytics';
import { PortalGrupoModal } from '@/components/portal/PortalGrupoModal.web';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { barrasDistribucion, subNotas } from '@/lib/portalResenas';

// Cloudflare Turnstile (captcha). Site key publica y global (un dominio); el
// secreto vive en Supabase (TURNSTILE_SECRET_KEY) y lo usa validate-captcha.
const TURNSTILE_SITE_KEY = '0x4AAAAAAEN33iLdZO1Ao1bD';

const T = PORTAL_TOKENS;
const FIRE = FIRE_GRADIENT;
const SERIF = SANS_SERIF;

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
    star: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
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

function IconStarFilled({ size = 15, color = "#e08a00" }: { size?: number, color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill={color}></path>
    </svg>
  );
}

function IconStarOutline({ size = 15, color = "rgba(40,30,24,0.28)" }: { size?: number, color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"></path>
    </svg>
  );
}

type Step = 'servicio' | 'profesional' | 'fecha' | 'datos' | 'resumen' | 'confirmado';
const ANY_PRO = '__any__';

function fmtHora(iso: string, loc: string) { return new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }); }
function fmtFechaLarga(d: Date, loc: string) { return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }); }
function fmtFechaRelativa(iso: string, loc: string) {
  const dias = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} dias`;
  if (dias < 30) { const s = Math.floor(dias / 7); return `hace ${s} ${s === 1 ? 'semana' : 'semanas'}`; }
  if (dias < 365) { const m = Math.floor(dias / 30); return `hace ${m} ${m === 1 ? 'mes' : 'meses'}`; }
  return new Date(iso).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
}

// Obliga a declarar que hace la rejilla bajo el breakpoint. Sin esto se colaron
// los recortes de la cabecera y de las resenas: rejillas de escritorio pintadas
// tal cual en un viewport de 375px.
function ResponsiveGrid({ children, mobile, desktop, gap, style }: { children: React.ReactNode; mobile: string; desktop: string; gap: number; style?: React.CSSProperties }) {
  const { isMobile } = useResponsive();
  return <div style={{ display: 'grid', gridTemplateColumns: isMobile ? mobile : desktop, gap, ...style }}>{children}</div>;
}
function capFirst(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
// Busqueda tolerante a mayusculas y tildes ("mechas" encuentra "Mechas Californianas").
function normalizaTexto(s: string) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
function claveADate(k: string): Date { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }

// Fila de servicio del paso 1. Se comparte entre el acordeon por categoria y la
// lista plana de resultados de busqueda (ahi si se muestra a que categoria pertenece).
function ServicioFila({ sv, selected, mostrarPrecio, conCategoria, demoAbrir, onClick }: {
  sv: PortalServicio; selected: boolean; mostrarPrecio: boolean; conCategoria?: boolean; demoAbrir?: string; onClick: () => void;
}) {
  return (
    // demoAbrir: el recorrido guiado pulsa este servicio para poder enseñar los
    // pasos que solo existen DESPUES de elegirlo (profesional y hora).
    <button onClick={onClick} data-demo-abrir={demoAbrir} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: 12, background: selected ? T.primarySoft : '#fff', border: `1.5px solid ${selected ? T.primary : T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: 14, background: '#f0f0f0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {sv.foto_url ? <img src={sv.foto_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} /> : <Icon name="scissors" size={24} color="#ccc" />}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        {conCategoria && sv.categoria_nombre && (
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 2 }}>{sv.categoria_nombre}</span>
        )}
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{sv.nombre}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#736658', marginTop: 2 }}>{sv.duracion} min{mostrarPrecio ? ` · ${sv.precio}€` : ''}</span>
      </span>
      {selected && (
        <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: T.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="check" size={14} color="#fff" />
        </span>
      )}
    </button>
  );
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

function normalizeUrl(w: string): string { return /^https?:\/\//i.test(w) ? w : `https://${w}`; }
function hostOf(w: string): string { try { return new URL(normalizeUrl(w)).host.replace(/^www\./, ''); } catch { return w; } }
function gcalLink(servicioNombre: string, negocioNombre: string, inicioISO: string, durMin: number, direccion?: string | null) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ini = new Date(inicioISO);
  const fin = new Date(ini.getTime() + durMin * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: `${servicioNombre} · ${negocioNombre}`,
    dates: `${fmt(ini)}/${fmt(fin)}`, details: `Reserva en ${negocioNombre}`,
  });
  if (direccion) p.set('location', direccion);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function appleCalendarDownload(servicioNombre: string, negocioNombre: string, inicioISO: string, durMin: number, direccion?: string | null) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ini = new Date(inicioISO);
  const fin = new Date(ini.getTime() + durMin * 60000);
  const now = fmt(new Date());
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mecha//Portal Reserva//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2, 9)}@mechaa.es`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmt(ini)}`,
    `DTEND:${fmt(fin)}`,
    `SUMMARY:${servicioNombre} · ${negocioNombre}`,
    `DESCRIPTION:Reserva de ${servicioNombre} en ${negocioNombre}`,
    direccion ? `LOCATION:${direccion}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reserva-${negocioNombre.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ANIM = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  @keyframes rpUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes rpRing { 0% { transform: scale(0.6); opacity: 0.5; } 100% { transform: scale(1.9); opacity: 0; } }
  @keyframes rpShake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-5px); } 40%,80% { transform: translateX(5px); } }
  .rp-shake { animation: rpShake 0.4s ease-in-out; }
  @media (prefers-reduced-motion: reduce) { .rp-shake { animation: none; } }
  a { color: #c0260a; }
  a:hover { color: #f4501e; }
  ::-webkit-scrollbar { height: 0; }
  .rp-step { animation: rpUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
  /* El checkbox real del consentimiento esta escondido: cuando recibe el foco
     por teclado, el que se marca es el cuadrito pintado que va justo detras. */
  .rp-consent input:focus-visible + span { outline: 2px solid #f4501e; outline-offset: 2px; }
`;

export default function PortalReservaWeb() {
  const params = useLocalSearchParams<{ slug: string, action?: string }>();
  const slug = String(params.slug || '');
  const actionParam = params.action;
  const { isMobile } = useResponsive();

  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [splash, setSplash] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [resenas, setResenas] = useState<ResenaResumen | null>(null);

  const [step, setStep] = useState<Step>('servicio');
  const [servicio, setServicio] = useState<PortalServicio | null>(null);
  const [catAbierta, setCatAbierta] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [showGrupoModal, setShowGrupoModal] = useState(false);
  const [grupoOk, setGrupoOk] = useState<{ total: number; inicio: string } | null>(null);
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
  const [consentFallo, setConsentFallo] = useState(false);
  const consentRef = useRef<HTMLLabelElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const resolverCaptcha = useRef<((token: string) => void) | null>(null);
  const exitoRef = useRef<HTMLDivElement>(null);
  const pasoProfRef = useRef<HTMLDivElement>(null);
  const [consentIa, setConsentIa] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<CrearCitaResult | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  // Waitlist modal state
  const [showWlModal, setShowWlModal] = useState(false);
  const [wlRango, setWlRango] = useState<'dia' | 'semanal'>('semanal');
  const [wlFranja, setWlFranja] = useState<'manana' | 'tarde' | 'cualquiera'>('cualquiera');
  const [wlNombre, setWlNombre] = useState('');
  const [wlTelefono, setWlTelefono] = useState('');
  const [wlConsent, setWlConsent] = useState(false);
  const [wlEnviando, setWlEnviando] = useState(false);
  const [wlExito, setWlExito] = useState(false);
  const [wlError, setWlError] = useState('');

  // Reviews states
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [rPuntuacion, setRPuntuacion] = useState(0);
  const [rTrato, setRTrato] = useState(0);
  const [rProductos, setRProductos] = useState(0);
  const [rComentario, setRComentario] = useState('');
  const [rProfesionalId, setRProfesionalId] = useState('');
  const [rProfesionalPuntuacion, setRProfesionalPuntuacion] = useState(0);
  const [rMechaPuntuacion, setRMechaPuntuacion] = useState(0);
  const [rMechaFacilidad, setRMechaFacilidad] = useState(0);
  const [rMechaDisponibilidad, setRMechaDisponibilidad] = useState(0);
  const [rMechaPagos, setRMechaPagos] = useState(0);
  const [rMechaMejora, setRMechaMejora] = useState('');
  const [rNombre, setRNombre] = useState('');
  const [rError, setRError] = useState('');

  const reviewsRef = useRef<HTMLDivElement>(null);

  const skipPro = (info?.profesionales.length ?? 0) <= 1;
  const t: TFn = useMemo(() => makeT(info?.negocio?.idioma), [info?.negocio?.idioma]);
  const loc = useMemo(() => localeOf(info?.negocio?.idioma), [info?.negocio?.idioma]);


  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [data, res] = await Promise.all([getPortalInfo(slug), getResenasPublicas(slug)]);
        if (cancel) return;
        if (!data) { setNotFound(true); } else { setInfo(data); setResenas(res); }
      } catch (err) {
        if (!cancel) {
          setNotFound(true);
          reportarError(err, { origen: 'portal', tipo: 'operativo' });
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [slug]);

  useEffect(() => {
    if (!info?.negocio) return;
    const analyticsConfig = info.negocio.analytics_config;
    if (analyticsConfig?.enabled && analyticsConfig.measurementId) {
      const savedConsent = loadSavedConsent();
      initGA4({ measurementId: analyticsConfig.measurementId, enabled: true, consentGiven: savedConsent });
      setAnalyticsConsent(savedConsent);
      if (savedConsent) {
        trackPageView(`/r/${slug}`, info.negocio.nombre || 'Portal');
        AnalyticsEvents.portalView(slug, info.negocio.nombre || 'Portal');
      }
    }
  }, [info, slug]);

  useEffect(() => {
    const timer = setTimeout(() => setSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (actionParam === 'review' && info) {
      setShowReviewForm(true);
      setTimeout(() => {
        reviewsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [actionParam, info]);

  // Carga Turnstile y renderiza un widget en modo 'execute' (invisible salvo que
  // Cloudflare pida interaccion): al enviar se resuelve on-demand y se cambia por
  // un token de servidor via validate-captcha.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelado = false;
    const contenedor = document.createElement('div');
    contenedor.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999';
    document.body.appendChild(contenedor);
    const renderWidget = () => {
      if (cancelado) return;
      const ts = (window as any).turnstile;
      if (!ts) { setCaptchaReady(false); return; }
      try {
        turnstileWidgetId.current = ts.render(contenedor, {
          sitekey: TURNSTILE_SITE_KEY,
          execution: 'execute',
          appearance: 'interaction-only',
          callback: (token: string) => { const cb = resolverCaptcha.current; resolverCaptcha.current = null; cb?.(token); },
          'error-callback': () => { const cb = resolverCaptcha.current; resolverCaptcha.current = null; cb?.(''); },
        });
        setCaptchaReady(true);
      } catch (e) { console.error('turnstile render', e); setCaptchaReady(false); }
    };
    if ((window as any).turnstile) {
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.onload = renderWidget;
      script.onerror = () => setCaptchaReady(false);
      document.head.appendChild(script);
    }
    return () => {
      cancelado = true;
      try { if (turnstileWidgetId.current) (window as any).turnstile?.remove(turnstileWidgetId.current); } catch { /* ignore */ }
      contenedor.remove();
    };
  }, []);

  useEffect(() => {
    if (!servicio) return;
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
  }, [servicio, profId, slug]);

  useEffect(() => {
    if (!servicio) return;
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
  }, [servicio, profId, fecha, slug]);

  const horas = useMemo(() => {
    // Una fila por hora. Si a la misma hora hay un profesional libre y otro en
    // reposo, gana el libre: el hueco de reposo solo se ofrece cuando es la
    // unica opcion. Antes se quedaba con el primero que llegase del orden de la
    // RPC (slot, nombre), asi que acertar dependia del alfabeto.
    const map = new Map<string, SlotDisponible>();
    for (const s of slots) {
      const previo = map.get(s.slot);
      if (!previo || (previo.en_reposo && !s.en_reposo)) map.set(s.slot, s);
    }
    return [...map.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  }, [slots]);

  const proximosDias = useMemo(() => {
    const arr: Date[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) { const d = new Date(base); d.setDate(base.getDate() + i); arr.push(d); }
    return arr;
  }, []);

  const mostrarPrecioEnLista = (info?.negocio.mostrar_precios as string) === 'catalogo' || (info?.negocio.mostrar_precios as string) === 'siempre';
  const mostrarPrecioResumen = info?.negocio.mostrar_precios !== 'nunca';

  const profSel = useMemo(() => (profId === ANY_PRO ? null : info?.profesionales.find(p => p.id === profId) ?? null), [profId, info]);

  useEffect(() => {
    if (!analyticsConsent || !info?.negocio.analytics_config?.enabled) return;
    AnalyticsEvents.stepView(step, slug);
  }, [step, slug, analyticsConsent, info]);

  // Resuelve Turnstile (execute) y lo cambia por un token de servidor de un solo
  // uso (validate-captcha). Devuelve undefined si no hay captcha o falla: el RPC
  // decide si lo exige, asi un salon sin captcha configurado no se bloquea.
  const obtenerCaptchaToken = useCallback(async (): Promise<string | undefined> => {
    if (typeof window === 'undefined') return undefined;
    const ts = (window as any).turnstile;
    if (!captchaReady || !ts || !turnstileWidgetId.current) return undefined;
    let turnstileToken = '';
    try {
      turnstileToken = await new Promise<string>((resolve) => {
        resolverCaptcha.current = resolve;
        try { ts.execute(turnstileWidgetId.current); } catch { resolve(''); }
        setTimeout(() => { if (resolverCaptcha.current) { resolverCaptcha.current = null; resolve(''); } }, 8000);
      });
    } catch { return undefined; }
    try { ts.reset(turnstileWidgetId.current); } catch { /* ignore */ }
    if (!turnstileToken) return undefined;
    try {
      const { data } = await supabase.functions.invoke('validate-captcha', { body: { token: turnstileToken, contexto: 'cita' } });
      const d = data as { ok?: boolean; captcha_token?: string } | null;
      if (d?.ok && d.captcha_token) return d.captcha_token;
    } catch (e) { console.error('validate-captcha', e); }
    return undefined;
  }, [captchaReady]);

  const confirmar = useCallback(async () => {
    if (!servicio || !slotSel) return;
    setError('');
    if (!nombre.trim()) { setError(t('err_nombre')); return; }
    
    // Normalización y validación estricta de teléfono E.164
    const normTel = normalizarTelefonoE164(telefono);
    if (!normTel.esValido) {
      setError('Por favor, indica un número de teléfono móvil válido (+34 o internacional).');
      return;
    }

    if (!consent) {
      setError(t('err_consent'));
      setConsentFallo(true);
      consentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setConsentFallo(false);
    setEnviando(true);
    try {
      const captchaToken = await obtenerCaptchaToken();

      const r = await crearCitaPublica({
        slug,
        servicioId: servicio.id,
        profesionalId: slotSel.profesional_id,
        inicioISO: slotSel.slot,
        clienteNombre: nombre.trim(),
        clienteTelefono: normTel.e164,
        clienteEmail: email.trim() || undefined,
        notas: notas.trim() || undefined,
        consentimientoDatos: consent,
        consienteIa: consentIa,
        captchaToken,
      });
      setResultado(r);
      setStep('confirmado');
      // El formulario deja paso a una tarjeta mas corta: sin esto la pagina se
      // queda a la altura de las opiniones y la clienta no llega a ver el "confirmada".
      requestAnimationFrame(() => exitoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      if (analyticsConsent) {
        AnalyticsEvents.bookingCompleted(r.cita_id, servicio.nombre, slotSel.profesional_nombre, servicio.precio || 0, slug);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('err_generic');
      if (/ocupado|disponib|antelacion|horario/i.test(msg)) { setError(t('err_ocupado')); setStep('fecha'); } else { setError(msg); }
    } finally { setEnviando(false); }
  }, [servicio, slotSel, nombre, telefono, email, notas, consent, slug, t, consentIa, analyticsConsent, obtenerCaptchaToken]);

  // El publico del portal es el cliente final, no el salon: "atras" debe devolverle
  // al marketplace (de donde suele venir), nunca a la landing comercial de Mecha.
  // Si venia de otra pagina del sitio se usa el historial para no perder su scroll ni sus filtros.
  const volverAtras = useCallback(() => {
    const ref = typeof document !== 'undefined' ? document.referrer : '';
    let mismoSitio = false;
    try { mismoSitio = !!ref && new URL(ref).origin === window.location.origin && !new URL(ref).pathname.startsWith('/app/r/'); } catch { mismoSitio = false; }
    if (mismoSitio && window.history.length > 1) window.history.back();
    else window.location.href = '/salones.html';
  }, []);

  const submitReview = async () => {
    if (!rPuntuacion) { setRError('Elige una valoración para el salón.'); return; }
    setRError('');
    try {
      const captchaToken = await obtenerCaptchaToken();
      await crearResenaPublica({
        slug,
        puntuacion: rPuntuacion,
        comentario: rComentario.trim() || undefined,
        autorNombre: rNombre.trim() || undefined,
        profesionalId: rProfesionalId || null,
        servicioId: servicio?.id || null,
        captchaToken,
        salonTrato: rTrato || null,
        salonProductos: rProductos || null,
        profesionalPuntuacion: rProfesionalPuntuacion || null,
        mechaPuntuacion: rMechaPuntuacion || null,
        mechaFacilidad: rMechaFacilidad || null,
        mechaDisponibilidad: rMechaDisponibilidad || null,
        mechaPagos: rMechaPagos || null,
        mechaMejora: rMechaMejora.trim() || null,
      });
      setReviewSubmitted(true);
    } catch (e: any) {
      setRError(e?.message || 'No se pudo registrar la reseña. Inténtalo más tarde.');
    }
  };

  function elegirServicio(sv: PortalServicio) {
    setServicio(sv); setError('');
    setStep('profesional');
    // El paso 2 (profesional y dias) aparece debajo de la lista de servicios:
    // al elegir, bajamos hasta el para no obligar a scrollear a ciegas.
    setTimeout(() => pasoProfRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null); setDiasDisp(new Set());
    setNombre(''); setTelefono(''); setEmail(''); setNotas(''); setConsent(false); setConsentIa(false);
    setResultado(null); setError(''); setStep('servicio');
  }

  if (splash) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'rpPop 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
          <svg viewBox="0 0 80 80" width="80" height="80" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="spinnerGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={T.primary} />
                <stop offset="100%" stopColor="rgba(244,80,30,0.15)" />
              </linearGradient>
            </defs>
            <style>{`
              @keyframes mechaSpinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              @keyframes mechaPulse { 0%, 100% { transform: scale(0.88); opacity: 0.5; } 50% { transform: scale(1.05); opacity: 0.95; } }
              .mecha-spinner-ring { transform-box: fill-box; transform-origin: center; animation: mechaSpinner 1s linear infinite; }
              .mecha-spinner-core { transform-box: fill-box; transform-origin: center; animation: mechaPulse 2.2s ease-in-out infinite; }
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f6f1ea', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ padding: 40, textAlign: 'center' }}>Cargando...</div>
    </div>
  );

  if (notFound || !info) return (
    <div style={{ minHeight: '100vh', background: '#f6f1ea', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ padding: '44px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 26, color: T.text, marginBottom: 6 }}>{t('notfound_title')}</div>
        <div style={{ fontSize: 14, color: T.textSec }}>{t('notfound_sub')}</div>
      </div>
    </div>
  );

  const showForm = step !== 'confirmado';
  const showSuccess = step === 'confirmado';
  const servicioElegido = !!servicio;
  const slotElegido = !!slotSel;
  const ctaDisabled = !(servicioElegido && slotElegido);

  // Catalogos grandes (50+ servicios): en vez de una lista plana que obliga a
  // scrollear, se agrupa por categoria en acordeon y se ofrece buscador.
  const grupos: { id: string; nombre: string; servicios: typeof info.servicios }[] = [];
  for (const sv of info.servicios) {
    const id = sv.categoria_id || '__sin_categoria';
    let g = grupos.find(x => x.id === id);
    if (!g) { g = { id, nombre: sv.categoria_nombre || 'Otros servicios', servicios: [] }; grupos.push(g); }
    g.servicios.push(sv);
  }
  const qBusqueda = normalizaTexto(busqueda);
  const resultadosBusqueda = qBusqueda
    ? info.servicios.filter(sv =>
        normalizaTexto(sv.nombre).includes(qBusqueda) ||
        normalizaTexto(sv.categoria_nombre || '').includes(qBusqueda) ||
        normalizaTexto(sv.descripcion || '').includes(qBusqueda))
    : [];
  // Con una sola categoria el acordeon no aporta: se abre sola.
  const catAbiertaEfectiva = grupos.length === 1 ? grupos[0].id : catAbierta;

  const franjaMananaItems = horas.filter(s => franjaDe(s.slot) === 'manana');
  const franjaTardeItems = horas.filter(s => franjaDe(s.slot) === 'tarde');
  const franjaNocheItems = horas.filter(s => franjaDe(s.slot) === 'noche');
  const sinHuecos = !diasLoading && diasDisp.size > 0 && horas.length === 0;
  const sinHuecoHorizonte = servicioElegido && !diasLoading && diasDisp.size === 0;

  const inputStyle = { width: '100%', padding: '13px 14px', borderRadius: 11, border: '1.5px solid rgba(40,30,24,0.08)', fontSize: 14.5, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1c1814' };
  const textareaStyle = { ...inputStyle, minHeight: 58, resize: 'vertical' as const };
  const errorStyleBox = { padding: '10px 12px', background: T.dangerSoft, border: '1px solid rgba(226,59,52,0.35)', borderRadius: 10, color: T.danger, fontSize: 12.5, marginTop: 14 };

  const ratingBars = barrasDistribucion(resenas?.distribucion, resenas?.total ?? 0);
  return (
    <div data-screen-label="Portal de reservas" style={{ height: '100vh', overflowY: 'auto', overflowX: 'hidden', background: '#f6f1ea', fontFamily: 'Inter,system-ui,sans-serif', color: '#1c1814' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: '#fffdfb', borderBottom: '1px solid rgba(40,30,24,0.08)' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: isMobile ? '12px 20px' : '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <button onClick={volverAtras} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 11, background: 'rgba(40,30,24,0.06)', border: 'none', cursor: 'pointer' }} title="Volver a los salones">
              <Icon name="chevronLeft" size={18} />
            </button>
            <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 11, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}><MechaMark size={20} /></span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{info.negocio.nombre}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5c5249', whiteSpace: 'nowrap' }}>
              {resenas && resenas.total > 0 ? (
                <><IconStarFilled size={14} /> <b style={{ color: '#1c1814' }}>{resenas.media}</b>&nbsp;· {resenas.total} {resenas.total === 1 ? 'reseña' : 'reseñas'}</>
              ) : null}
            </span>
            {info.negocio.direccion && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5c5249', whiteSpace: 'nowrap' }}>
                <Icon name="mapPin" size={14} color="#736658" /> {info.negocio.direccion}
              </span>
            )}
            {info.negocio.telefono && (
              <a href={`tel:${info.negocio.telefono}`} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10, border: '1.5px solid rgba(40,30,24,0.14)', color: '#1c1814', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <Icon name="phone" size={14} color="#1c1814" /> {info.negocio.telefono}
              </a>
            )}
          </div>
        </div>
      </header>

      <div data-demo="portal-cabecera" style={{ position: 'relative', height: 236, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'linear-gradient(135deg,#3a2a20 0%,#1c1814 100%)' }}>
          {/* Foto de fondo elegida por el salon en Ajustes > Portal. Sin ella, degradado de marca. */}
          {info.negocio.fondo_portal_url && <img src={info.negocio.fondo_portal_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(28,24,20,0.02) 0%,rgba(18,14,10,0.74) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 1360, margin: '0 auto', padding: isMobile ? '0 20px 24px' : '0 40px 24px', pointerEvents: 'none' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: '#ffcf4a', marginBottom: 6 }}>
            {info.negocio.ciudad ? `Salón de belleza · ${info.negocio.ciudad}` : 'Salón de belleza'}
          </div>
          <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: isMobile ? 36 : 44, color: '#fff', lineHeight: 1 }}>{info.negocio.nombre}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1360, margin: '-30px auto 0', padding: isMobile ? '0 16px 40px' : '0 40px 56px', position: 'relative', zIndex: 2 }}>
        <div style={{ background: '#fffdfb', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 24, boxShadow: '0 24px 60px rgba(40,30,24,0.12)', padding: isMobile ? 20 : 32 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#736658', fontWeight: 600 }}>
              <Icon name="check" size={14} color="#0f9d6b" /> Confirmación inmediata · Sin registro
            </div>
          </div>

          <>
              {showForm && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 32, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                    {/* 1. Servicio */}
                    {/* Las marcas data-demo son las que enfoca el capitulo del
                        portal en el recorrido guiado de demo.html. */}
                    <div data-demo="portal-servicios" style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 5 }}>1 · Servicio</div>
                      <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: -0.3, marginBottom: 12 }}>¿Qué te apetece hoy?</div>
                      {/* Buscador: con catalogos de 50 servicios es la via rapida. */}
                      <div style={{ position: 'relative', marginBottom: 14 }}>
                        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', pointerEvents: 'none' }}>
                          <Icon name="search" size={16} color={T.textTer} />
                        </span>
                        <input
                          value={busqueda}
                          onChange={e => setBusqueda(e.target.value)}
                          placeholder="Buscar servicio..."
                          aria-label="Buscar servicio"
                          style={{ ...inputStyle, paddingLeft: 38, paddingRight: busqueda ? 38 : 14 }}
                        />
                        {busqueda !== '' && (
                          <button onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                            <Icon name="x" size={15} color={T.textTer} />
                          </button>
                        )}
                      </div>

                      {qBusqueda ? (
                        // Buscando: lista plana de coincidencias, sin acordeon.
                        resultadosBusqueda.length === 0 ? (
                          <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13.5, color: '#736658', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 16 }}>
                            No encontramos ningún servicio con «{busqueda}».
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {resultadosBusqueda.map(sv => (
                              <ServicioFila key={sv.id} sv={sv} selected={servicio?.id === sv.id} mostrarPrecio={mostrarPrecioEnLista} conCategoria onClick={() => elegirServicio(sv)} />
                            ))}
                          </div>
                        )
                      ) : (
                        // Sin busqueda: acordeon por categoria, todo plegado de inicio.
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {grupos.map(g => {
                            const abierta = catAbiertaEfectiva === g.id;
                            const tieneSeleccion = g.servicios.some(s => s.id === servicio?.id);
                            return (
                              <div key={g.id} style={{ background: '#fff', border: `1.5px solid ${abierta || tieneSeleccion ? T.primary : T.border}`, borderRadius: 16, overflow: 'hidden' }}>
                                <button
                                  onClick={() => setCatAbierta(abierta ? null : g.id)}
                                  aria-expanded={abierta}
                                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '15px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                >
                                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{g.nombre}</span>
                                  {tieneSeleccion && !abierta && (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: T.primaryHi, whiteSpace: 'nowrap' }}>1 elegido</span>
                                  )}
                                  <span style={{ fontSize: 12.5, color: '#736658', flexShrink: 0 }}>{g.servicios.length}</span>
                                  <span style={{ display: 'inline-flex', flexShrink: 0, transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s ease' }}>
                                    <Icon name="chevronRight" size={16} color={T.textSec} />
                                  </span>
                                </button>
                                {abierta && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '0 10px 10px' }}>
                                    {g.servicios.map(sv => (
                                      <ServicioFila key={sv.id} sv={sv} selected={servicio?.id === sv.id} mostrarPrecio={mostrarPrecioEnLista} demoAbrir={g.servicios[0]?.id === sv.id ? 'portal-profesional portal-hora' : undefined} onClick={() => elegirServicio(sv)} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 2. Profesional */}
                    {servicioElegido && (
                      <div ref={pasoProfRef} data-demo="portal-profesional" style={{ marginBottom: 22, scrollMarginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi }}>2 · Profesional</div>
                          <button onClick={() => setServicio(null)} style={{ background: 'none', border: 'none', color: '#5c5249', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Cambiar servicio</button>
                        </div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 24, marginBottom: 12 }}>¿Con quién prefieres ir?</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => setProfId(ANY_PRO)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', ...(profId === ANY_PRO ? { border: `1.5px solid ${T.primary}`, background: T.primarySoft, color: T.primaryHi } : { border: '1.5px solid ' + T.border, background: '#fff', color: T.text }) }}>
                            <Icon name="users" size={16} /> Cualquiera disponible
                          </button>
                          {info.profesionales.map(pr => {
                            const selected = profId === pr.id;
                            const color = pr.color || T.primary;
                            return (
                              <button key={pr.id} onClick={() => setProfId(pr.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 8px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', ...(selected ? { border: `1.5px solid ${T.primary}`, background: T.primarySoft, color: T.primaryHi } : { border: '1.5px solid ' + T.border, background: '#fff', color: T.text }) }}>
                                <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: color + '26', color: color, alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>{pr.nombre.charAt(0).toUpperCase()}</span>{pr.nombre}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3. Fecha y hora */}
                    {servicioElegido && (
                      <div data-demo="portal-hora" style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 5 }}>3 · Fecha y hora</div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 24, marginBottom: 12 }}>¿Cuándo te viene bien?</div>
                        
                        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 10, marginBottom: 8 }}>
                          {proximosDias.map((d, i) => {
                            const key = fechaISOaClave(d);
                            const on = diasDisp.has(key);
                            const sel = key === fechaISOaClave(fecha);
                            const rel = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString(loc, { weekday: 'short' });
                            return (
                              <button key={key} onClick={() => on && setFecha(d)} style={{ flexShrink: 0, width: 58, padding: '9px 0', borderRadius: 14, textAlign: 'center', cursor: on ? 'pointer' : 'default', border: sel ? 'none' : '1.5px solid ' + T.border, background: sel ? FIRE : '#fff', color: sel ? '#fff' : T.text, opacity: on ? 1 : 0.35, boxShadow: sel ? '0 7px 16px rgba(0,0,0,0.18)' : 'none' }}>
                                <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'capitalize', opacity: sel ? 0.92 : 0.7 }}>{rel}</span>
                                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{d.getDate()}</span>
                                <span style={{ display: 'block', fontSize: 9, textTransform: 'capitalize', opacity: sel ? 0.85 : 0.55 }}>{d.toLocaleDateString(loc, { month: 'short' })}</span>
                              </button>
                            );
                          })}
                        </div>

                        {(sinHuecos || sinHuecoHorizonte) && (
                          <div style={{ padding: '26px 20px', textAlign: 'center', border: '1px dashed rgba(40,30,24,0.14)', borderRadius: 16, background: '#fbf6f0' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: T.text }}>
                              {sinHuecoHorizonte ? 'No hay hueco libre en las próximas 3 semanas' : 'Sin huecos disponibles este día'}
                            </div>
                            <div style={{ fontSize: 13, color: '#5c5249', marginBottom: 14 }}>
                              {sinHuecoHorizonte ? 'Apúntate a la lista de espera y te avisamos por WhatsApp en cuanto se libere un hueco.' : 'Prueba otro día o apúntate a la lista de espera para avisarte si alguien cancela.'}
                            </div>
                            <button onClick={() => { setWlNombre(nombre); setWlTelefono(telefono); setShowWlModal(true); }} style={{ padding: '10px 20px', borderRadius: 12, background: T.primary, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                              Unirme a la Lista de Espera
                            </button>
                          </div>
                        )}

                        {!sinHuecos && [
                          { label: 'Mañana', icon: 'sun', items: franjaMananaItems },
                          { label: 'Tarde', icon: 'sunset', items: franjaTardeItems },
                          { label: 'Noche', icon: 'moon', items: franjaNocheItems },
                        ].map((fr, idx) => fr.items.length > 0 && (
                          <div key={idx} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                              <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 7, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Icon name={fr.icon} size={12} color={T.primary} />
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5c5249' }}>{fr.label}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 7 }}>
                              {fr.items.map(s => {
                                const sel = slotSel?.slot === s.slot;
                                const reposo = !!s.en_reposo;
                                const titleText = reposo
                                  ? `⚡ Hueco Express: Hueco optimizado durante el tiempo de reposo técnico del salón — Aprovecha un hueco entre servicios${s.reposo_disponible_min ? ` (${s.reposo_disponible_min} min libres)` : ''}`
                                  : undefined;
                                return (
                                  <button
                                    key={s.slot}
                                    onClick={() => setSlotSel(s)}
                                    title={titleText}
                                    style={{
                                      padding: '10px 6px',
                                      borderRadius: 12,
                                      fontSize: 14,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      border: sel ? 'none' : `1.5px ${reposo ? 'dashed' : 'solid'} ` + (reposo ? T.primary : T.border),
                                      background: sel ? T.primary : reposo ? T.primarySoft : '#fff',
                                      color: sel ? '#fff' : T.text,
                                      boxShadow: sel ? '0 7px 16px rgba(0,0,0,0.18)' : 'none',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {reposo && (
                                      <span
                                        title="Hueco optimizado durante el tiempo de reposo técnico del salón"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          fontSize: 9,
                                          fontWeight: 800,
                                          color: sel ? '#fff' : T.primaryHi,
                                          marginBottom: 2,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        ⚡ Hueco Express
                                      </span>
                                    )}
                                    <div>{fmtHora(s.slot, loc)}</div>
                                    <span style={{ display: profId === ANY_PRO ? 'block' : 'none', fontSize: 9.5, fontWeight: 500, opacity: 0.75, marginTop: 1 }}>{s.profesional_nombre.split(' ')[0]}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {slotSel?.en_reposo && (
                          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: T.primarySoft, border: `1px dashed ${T.primary}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.primaryHi }}>
                            <Icon name="scissors" size={15} color={T.primary} />
                            <span>
                              <strong>⚡ Hueco Express:</strong> Hueco optimizado durante el tiempo de reposo técnico del salón{slotSel.reposo_disponible_min ? ` (${slotSel.reposo_disponible_min} min libres)` : ''}.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. Tus datos */}
                    {slotElegido && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 5 }}>4 · Tus datos</div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 24, marginBottom: 12 }}>Para confirmar la cita</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Nombre</span>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" style={inputStyle} />
                          </label>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Teléfono</span>
                            <PhoneInput value={telefono} onChange={setTelefono} placeholder="600 000 000" />
                          </label>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Email (opcional)</span>
                            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" style={inputStyle} />
                          </label>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Notas (opcional)</span>
                            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Alergias, preferencias…" style={inputStyle} />
                          </label>
                        </div>
                        {/* Si falta el consentimiento el boton no dice nada util: se resalta
                            la casilla (borde rojo + fondo + sacudida) y se lleva a la vista.
                            La casilla es un checkbox DE VERDAD, escondido debajo del cuadrito
                            pintado: sin el, quien navega con teclado o lector de pantalla no
                            podia marcar el consentimiento y se quedaba sin poder reservar. */}
                        <label
                          ref={consentRef}
                          className={`rp-consent${consentFallo ? ' rp-shake' : ''}`}
                          style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer', padding: consentFallo ? '10px 12px' : 0, borderRadius: 12, border: consentFallo ? `1.5px solid ${T.danger}` : '1.5px solid transparent', background: consentFallo ? T.dangerSoft : 'transparent', transition: 'background 0.2s ease, border-color 0.2s ease' }}
                        >
                          <input
                            type="checkbox"
                            checked={consent}
                            onChange={e => { setConsent(e.target.checked); setConsentFallo(false); }}
                            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, margin: 0 }}
                          />
                          <span aria-hidden style={{ flexShrink: 0, marginTop: 1, width: 21, height: 21, borderRadius: 6, border: '2px solid ' + (consent ? T.primary : consentFallo ? T.danger : T.borderHi), background: consent ? T.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {consent && <Icon name="check" size={14} color="#fff" />}
                          </span>
                          <span style={{ fontSize: 12.5, color: consentFallo ? T.danger : '#5c5249', lineHeight: 1.45, fontWeight: consentFallo ? 600 : 400 }}>He leído y acepto la política de privacidad. Solo usamos tus datos para gestionar esta cita.</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Aside Resumen */}
                  <div style={{ position: 'sticky', top: 88, width: isMobile ? '100%' : 340, flexShrink: 0 }}>
                    <div style={{ background: '#fbf6f0', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 18, padding: 20 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Resumen de tu reserva</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Servicio</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{servicio ? servicio.nombre : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Profesional</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{servicioElegido ? (profSel ? profSel.nombre : 'Cualquiera disponible') : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Fecha</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{slotElegido ? capFirst(fmtFechaLarga(new Date(slotSel!.slot), loc)) : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Hora</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{slotElegido ? `${fmtHora(slotSel!.slot, loc)} · ${slotSel!.profesional_nombre.split(' ')[0]}` : '—'}</span>
                        </div>
                      </div>
                      {(mostrarPrecioResumen && servicio) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(40,30,24,0.08)' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Total</span><span style={{ fontSize: 19, fontWeight: 800 }}>{servicio.precio}€</span>
                        </div>
                      )}
                      {error && <div style={errorStyleBox}>{error}</div>}
                      <button onClick={confirmar} disabled={ctaDisabled || enviando} style={{ width: '100%', marginTop: 18, padding: '14px 16px', borderRadius: 13, border: 'none', background: ctaDisabled ? T.borderHi : FIRE, color: ctaDisabled ? T.textTer : '#fff', fontSize: 15, fontWeight: 800, cursor: ctaDisabled ? 'default' : 'pointer', boxShadow: ctaDisabled ? 'none' : '0 12px 26px rgba(0,0,0,0.18)' }}>{enviando ? 'Confirmando...' : 'Confirmar reserva'}</button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> Confirmación inmediata por WhatsApp</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> Cancelación gratuita hasta 24h antes</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> {servicio?.prepago ? 'Se requerirá señal de reserva' : 'Pago en el salón el día de la cita'}</div>
                      </div>
                    </div>
                    <button onClick={() => { setWlNombre(nombre); setWlTelefono(telefono); setShowWlModal(true); }} style={{ width: '100%', marginTop: 12, padding: '13px 14px', borderRadius: 14, border: `1px dashed ${T.primary}`, background: T.primarySoft, color: '#1c1814', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ minWidth: 0 }}>¿No te encaja ninguna hora? Únete a la lista de espera</span>
                      <Icon name="chevronRight" size={16} color={T.primaryHi} />
                    </button>
                  </div>
                </div>
              )}

              {showSuccess && (
                <div ref={exitoRef} style={{ textAlign: 'center', padding: '20px 0 4px' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <span style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: T.primarySoft, animation: 'rpRing 1.8s ease-out infinite' }} />
                    <span style={{ position: 'relative', display: 'inline-flex', width: 84, height: 84, borderRadius: '50%', background: '#fff', border: '1px solid rgba(40,30,24,0.08)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(244,80,30,0.22)' }}>
                      <Icon name="check" size={36} color={T.primary} />
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 34, marginBottom: 8 }}>¡Reserva confirmada!</div>
                  <div style={{ maxWidth: 420, margin: '0 auto 20px', fontSize: 15, color: '#5c5249', lineHeight: 1.5 }}>Te esperamos {capFirst(fmtFechaLarga(new Date(slotSel!.slot), loc))} a las {fmtHora(slotSel!.slot, loc)}. Hemos enviado la confirmación por WhatsApp.</div>
                  <div style={{ maxWidth: 420, margin: '0 auto 20px', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 16, overflow: 'hidden', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '13px 16px', borderBottom: '1px solid rgba(40,30,24,0.08)' }}><span style={{ fontSize: 12.5, color: '#736658' }}>Servicio</span><span style={{ fontSize: 13.5, fontWeight: 700 }}>{servicio!.nombre}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '13px 16px', borderBottom: '1px solid rgba(40,30,24,0.08)' }}><span style={{ fontSize: 12.5, color: '#736658' }}>Profesional</span><span style={{ fontSize: 13.5, fontWeight: 700 }}>{slotSel!.profesional_nombre}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '13px 16px' }}><span style={{ fontSize: 12.5, color: '#736658' }}>Cuándo</span><span style={{ fontSize: 13.5, fontWeight: 700 }}>{capFirst(fmtFechaLarga(new Date(slotSel!.slot), loc))} a las {fmtHora(slotSel!.slot, loc)}</span></div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(15,157,107,0.1)', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#0f9d6b', margin: '0 auto 16px' }}>
                    <Icon name="check" size={14} color="#0f9d6b" /> Confirmación enviada por WhatsApp
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
                    <a href={gcalLink(servicio!.nombre, info.negocio.nombre || 'tu salon', slotSel!.slot, servicio!.duracion, info.negocio.direccion)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: '#fff', border: '1.5px solid rgba(40,30,24,0.1)', color: '#1c1814', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                      <Icon name="calendar" size={16} color={T.primary} /> Añadir a Google Calendar
                    </a>
                    <button onClick={() => appleCalendarDownload(servicio!.nombre, info.negocio.nombre || 'tu salon', slotSel!.slot, servicio!.duracion, info.negocio.direccion)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: '#fff', border: '1.5px solid rgba(40,30,24,0.1)', color: '#1c1814', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      <Icon name="calendar" size={16} color={T.primary} /> Añadir a Apple Calendar
                    </button>
                    {resultado?.cita_id && (
                      <a href={`/app/cita/${resultado.cita_id}?s=${slug}&tel=${encodeURIComponent(telefono)}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: T.primarySoft, border: `1.5px solid ${T.primary}`, color: T.primaryHi, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                        <Icon name="edit" size={16} color={T.primaryHi} /> Gestionar o cancelar mi cita
                      </a>
                    )}
                    {/* La resena se pide DESPUES de que la clienta haya visto la confirmacion,
                        y solo si ella decide bajar: nunca arrastrandola sin avisar. */}
                    <button
                      onClick={() => { setShowReviewForm(true); requestAnimationFrame(() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth' })); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: '#fff', border: '1.5px solid rgba(40,30,24,0.1)', color: '#1c1814', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Icon name="edit" size={16} color={T.primary} /> ¿Ya nos conoces? Déjanos tu opinión
                    </button>
                    <button onClick={reiniciar} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700, padding: 8, cursor: 'pointer' }}>Hacer otra reserva</button>
                  </div>
                </div>
              )}
          </>

        </div>

        {/* OPINIONES */}
        <div style={{ marginTop: 44 }} ref={reviewsRef}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 6 }}>Opiniones</div>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: -0.4 }}>Lo que dicen nuestros clientes</div>
            </div>
            <button onClick={() => setShowReviewForm(!showReviewForm)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 11, border: '1.5px solid ' + (showReviewForm ? T.primary : T.border), background: showReviewForm ? T.primarySoft : '#fff', color: showReviewForm ? T.primaryHi : T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Icon name="edit" size={15} /> Escribir una reseña
            </button>
          </div>

          {showReviewForm && !reviewSubmitted && (
            <div style={{ background: '#fffdfb', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 20, padding: 22, marginBottom: 22 }}>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 19, marginBottom: 14 }}>Cuéntanos tu experiencia</div>
              <div style={{ border: `1.5px solid ${T.primary}`, background: T.primarySoft, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#5c5249' }}>¿Cómo calificarías tu experiencia?</span>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: T.primaryHi, whiteSpace: 'nowrap', flexShrink: 0 }}>Obligatorio</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRPuntuacion(n)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex' }}>
                        {n <= rPuntuacion ? <IconStarFilled size={30} /> : <IconStarOutline size={30} />}
                      </button>
                    ))}
                  </div>
                  {rPuntuacion > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: T.primaryHi }}>{['', 'Lo siento', 'Mejorable', 'Bien', 'Muy bien', '¡Excelente!'][rPuntuacion]}</span>}
                </div>
              </div>
              <div style={{ border: '1.5px dashed rgba(40,30,24,0.16)', background: 'rgba(40,30,24,0.02)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#736658', marginBottom: 12 }}>Opcional</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 10 }}>
                  <div>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 5 }}>Trato recibido</span>
                    <div style={{ display: 'flex', gap: 4 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRTrato(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rTrato ? <IconStarFilled size={20} /> : <IconStarOutline size={20} />}</button>)}</div>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 5 }}>Limpieza y productos</span>
                    <div style={{ display: 'flex', gap: 4 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRProductos(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rProductos ? <IconStarFilled size={20} /> : <IconStarOutline size={20} />}</button>)}</div>
                  </div>
                </div>
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 5 }}>¿Algo que destacar del salón?</span>
                  <textarea value={rComentario} onChange={e => setRComentario(e.target.value)} placeholder="¿Qué destacarías de tu experiencia?" style={textareaStyle}></textarea>
                </label>
                <div style={{ borderTop: '1px solid rgba(40,30,24,0.06)', paddingTop: 12, marginBottom: 14 }}>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 6 }}>¿Quién te atendió?</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[{ id: '', nombre: 'Prefiero no decirlo' }, ...info.profesionales].map(pr => {
                      const sel = rProfesionalId === pr.id;
                      return <button key={pr.id} onClick={() => setRProfesionalId(pr.id)} style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (sel ? T.primary : T.border), background: sel ? T.primarySoft : 'transparent', color: sel ? T.primaryHi : T.textSec }}>{pr.nombre}</button>;
                    })}
                  </div>
                  {rProfesionalId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11.5, color: '#736658' }}>Su atención:</span>
                      <div style={{ display: 'flex', gap: 4 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRProfesionalPuntuacion(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rProfesionalPuntuacion ? <IconStarFilled size={22} /> : <IconStarOutline size={22} />}</button>)}</div>
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid rgba(40,30,24,0.06)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 11.5, color: '#736658', whiteSpace: 'nowrap', flexShrink: 0 }}>Reserva online:</span>
                    <div style={{ display: 'flex', gap: 4 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRMechaPuntuacion(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rMechaPuntuacion ? <IconStarFilled size={24} /> : <IconStarOutline size={24} />}</button>)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(40,30,24,0.02)', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11.5, color: '#736658' }}>Facilidad</span><div style={{ display: 'flex', gap: 3 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRMechaFacilidad(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rMechaFacilidad ? <IconStarFilled size={16} /> : <IconStarOutline size={16} />}</button>)}</div></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11.5, color: '#736658' }}>Disponibilidad</span><div style={{ display: 'flex', gap: 3 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRMechaDisponibilidad(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rMechaDisponibilidad ? <IconStarFilled size={16} /> : <IconStarOutline size={16} />}</button>)}</div></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11.5, color: '#736658' }}>Rapidez y pago</span><div style={{ display: 'flex', gap: 3 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setRMechaPagos(n)} style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer' }}>{n <= rMechaPagos ? <IconStarFilled size={16} /> : <IconStarOutline size={16} />}</button>)}</div></div>
                  </div>
                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 5 }}>¿Qué mejorarías del sistema de reserva?</span>
                    <textarea value={rMechaMejora} onChange={e => setRMechaMejora(e.target.value)} placeholder="Sugerencias…" style={textareaStyle}></textarea>
                  </label>
                  <input value={rNombre} onChange={e => setRNombre(e.target.value)} placeholder="Tu nombre (opcional, se mostrará públicamente)" style={inputStyle} />
                </div>
              </div>
              {rError && <div style={errorStyleBox}>{rError}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={submitReview} style={{ padding: '14px 16px', borderRadius: 13, border: 'none', background: FIRE, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', flex: 1 }}>Enviar reseña</button>
                <button onClick={() => setShowReviewForm(false)} style={{ padding: '14px 18px', borderRadius: 13, border: '1.5px solid rgba(40,30,24,0.14)', background: '#fff', color: '#5c5249', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          )}

          {showReviewForm && reviewSubmitted && (
            <div style={{ background: '#fffdfb', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 20, padding: '30px 26px', marginBottom: 22, textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: '50%', background: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <IconStarFilled size={24} color={T.primary} />
              </span>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 19, marginBottom: 5 }}>¡Gracias por tu opinión!</div>
              <div style={{ fontSize: 13, color: '#5c5249' }}>Nos ayuda muchísimo a mejorar el servicio.</div>
            </div>
          )}

          {resenas && resenas.total > 0 && (
          <ResponsiveGrid mobile="minmax(0,1fr)" desktop="260px minmax(0,1fr)" gap={24} style={{ alignItems: 'start' }}>
            <div style={{ background: '#fbf6f0', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 18, padding: 20 }}>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{resenas.media}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, margin: '8px 0 4px' }}>
                {[1, 2, 3, 4, 5].map(n => <IconStarFilled key={n} size={15} />)}
              </div>
              <div style={{ fontSize: 12, color: '#736658', marginBottom: 14 }}>{resenas.total} {resenas.total === 1 ? 'reseña' : 'reseñas'}</div>
              {ratingBars.map(rb => (
                <div key={rb.star} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#736658', width: 10 }}>{rb.star}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(40,30,24,0.08)', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, background: '#e08a00', width: rb.pct + '%' }}></div></div>
                </div>
              ))}
            </div>
            <ResponsiveGrid mobile="minmax(0,1fr)" desktop="repeat(auto-fill,minmax(240px,1fr))" gap={12}>
              {resenas.ultimas.map((r, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 16, padding: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: '50%', background: T.primarySoft, color: T.primaryHi, alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{(r.autor || 'A')[0].toUpperCase()}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.autor || 'Anónimo'}</div>
                      <div style={{ fontSize: 11, color: '#736658' }}>{[r.servicio, fmtFechaRelativa(r.fecha, loc)].filter(Boolean).join(' · ')}</div>
                    </div>
                    {r.verificada && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: '#0f9d6b', background: 'rgba(15,157,107,0.08)', borderRadius: 6, padding: '2px 6px' }}>Verificada</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 7 }}>{[1,2,3,4,5].map(n => <IconStarFilled key={n} size={12} color={n <= Math.round(r.puntuacion) ? undefined : 'rgba(40,30,24,0.15)'} />)}</div>
                  {r.profesional && <div style={{ fontSize: 11, color: '#736658', marginBottom: 6 }}>Atendido por <b style={{ color: '#3a332c' }}>{r.profesional}</b>{r.profesional_puntuacion ? ` · ${r.profesional_puntuacion}/5` : ''}</div>}
                  {subNotas(r).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
                      {subNotas(r).map(sn => (
                        <span key={sn.etiqueta} style={{ fontSize: 10.5, color: '#736658', background: 'rgba(40,30,24,0.04)', borderRadius: 6, padding: '2px 6px' }}>{sn.etiqueta}: {sn.valor}/5</span>
                      ))}
                    </div>
                  )}
                  {r.comentario && <div style={{ fontSize: 12.5, color: '#3a332c', lineHeight: 1.5 }}>{r.comentario}</div>}
                </div>
              ))}
            </ResponsiveGrid>
          </ResponsiveGrid>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11.5, color: '#736658', marginTop: 18 }}>Reservas gestionadas por <b style={{ color: '#c0260a' }}>{info.negocio.nombre}</b></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8, paddingBottom: 40 }}>
        <IconStarFilled size={12} color="#f4501e" />
        <span style={{ fontSize: 11, color: '#736658' }}>Con <b style={{ color: '#f4501e' }}>mecha</b></span>
      </div>

      <ConsentBanner onAccept={() => { giveConsent(); setAnalyticsConsent(true); }} onReject={() => { withdrawConsent(); setAnalyticsConsent(false); }} />
      {showGrupoModal && info && <PortalGrupoModal slug={slug} info={info} onClose={() => setShowGrupoModal(false)} onSuccess={(r) => { setGrupoOk(r); setShowGrupoModal(false); }} />}
      {grupoOk && (
        <div onClick={() => setGrupoOk(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,7,10,0.75)', zIndex: 310, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', border: '1px solid ' + T.border, borderRadius: 18, padding: 24, maxWidth: 420, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: T.primarySoft, marginBottom: 14 }}><MechaMark size={30} /></div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>{t('grupo_ok_title')}</div>
            <div style={{ fontSize: 13.5, color: T.textSec, marginBottom: 16 }}>{t('grupo_ok_personas', { n: grupoOk.total })} · {new Date(grupoOk.inicio).toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. {t('grupo_ok_aviso')}</div>
            <button onClick={() => setGrupoOk(null)} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('grupo_ok_cerrar')}</button>
          </div>
        </div>
      )}
      {showWlModal && (
        <div onClick={() => setShowWlModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,7,10,0.75)', zIndex: 310, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', border: '1px solid ' + T.border, borderRadius: 18, padding: 24, maxWidth: 440, width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>Únete a la Lista de Espera</div>
            <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Te notificaremos por WhatsApp en cuanto se libere un hueco compatible.</div>

            {wlExito ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.primary, marginBottom: 6 }}>¡Apuntado correctamente!</div>
                <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Te avisaremos por WhatsApp si se abre un hueco.</div>
                <button onClick={() => { setShowWlModal(false); setWlExito(false); }} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!wlNombre.trim() || !wlTelefono.trim()) { setWlError('Introduce nombre y teléfono'); return; }
                if (!wlConsent) { setWlError('Acepta la política de privacidad para continuar.'); return; }
                setWlEnviando(true); setWlError('');
                try {
                  const res = await unirseListaEsperaPublica({
                    slug,
                    nombre: wlNombre,
                    telefono: wlTelefono,
                    servicioId: servicio?.id ?? null,
                    profesionalId: profId === ANY_PRO ? null : profId,
                    franja: wlFranja,
                    desde: wlRango === 'dia' && fecha ? fechaISOaClave(fecha) : null,
                    hasta: wlRango === 'dia' && fecha ? fechaISOaClave(fecha) : null,
                    consentimientoDatos: wlConsent,
                  });
                  if (res.ok) { setWlExito(true); } else { setWlError(res.error || 'Error al guardar'); }
                } catch (err: any) {
                  setWlError(err.message || 'Error de conexión');
                } finally { setWlEnviando(false); }
              }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Alcance del aviso</label>
                  <select value={wlRango} onChange={(e) => setWlRango(e.target.value as any)} style={inputStyle}>
                    <option value="semanal">Cualquier día de las próximas 2 semanas (Global)</option>
                    <option value="dia">Solo este día específico ({fecha ? fecha.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }) : ''})</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Preferencia horaria</label>
                  <select value={wlFranja} onChange={(e) => setWlFranja(e.target.value as any)} style={inputStyle}>
                    <option value="cualquiera">Cualquier hora</option>
                    <option value="manana">Mañana</option>
                    <option value="tarde">Tarde</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Tu nombre</label>
                  <input value={wlNombre} onChange={e => setWlNombre(e.target.value)} placeholder="Nombre" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Tu teléfono WhatsApp</label>
                  <PhoneInput value={wlTelefono} onChange={setWlTelefono} placeholder="600 000 000" />
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
                  <input type="checkbox" checked={wlConsent} onChange={e => setWlConsent(e.target.checked)} style={{ marginTop: 2 }} />
                  <span style={{ fontSize: 12, color: '#5c5249', lineHeight: 1.4 }}>Acepto la política de privacidad para que me contacten sobre esta solicitud.</span>
                </label>
                {wlError && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{wlError}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowWlModal(false)} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid ' + T.border, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" disabled={wlEnviando} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: wlEnviando ? 0.6 : 1 }}>{wlEnviando ? 'Guardando…' : 'Confirmar e inscribir'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
