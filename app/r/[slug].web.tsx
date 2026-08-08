import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MechaMark } from '@/components/ui/MechaMark';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { ConsentBanner } from '@/components/portal/ConsentBanner';
import { makeT, localeOf, type TFn } from '@/lib/portalI18n';
import {
  getPortalInfo, getDisponibilidad, getDiasDisponibles, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  getDisponibilidadExpress, crearCitaPublicaExpress, crearListaEsperaExpressPublica,
  type PortalInfo, type PortalServicio, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';
import { PORTAL_TOKENS, FIRE_GRADIENT, SANS_SERIF } from '@/lib/portalTokens';
import { categoryColorHex } from '@/lib/categoryColors';
import { initGA4, trackPageView, trackEvent, giveConsent, withdrawConsent, loadSavedConsent, AnalyticsEvents } from '@/lib/analytics';
import { PortalGrupoModal } from '@/components/portal/PortalGrupoModal.web';
import { useResponsive } from '@/lib/hooks/useResponsive';

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
    star: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'
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
function capFirst(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function claveADate(k: string): Date { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
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
    action: 'TEMPLATE', text: `${servicioNombre} Â· ${negocioNombre}`,
    dates: `${fmt(ini)}/${fmt(fin)}`, details: `Reserva en ${negocioNombre}`,
  });
  if (direccion) p.set('location', direccion);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const ANIM = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  @keyframes rpUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes rpRing { 0% { transform: scale(0.6); opacity: 0.5; } 100% { transform: scale(1.9); opacity: 0; } }
  a { color: #c0260a; }
  a:hover { color: #f4501e; }
  ::-webkit-scrollbar { height: 0; }
  .rp-step { animation: rpUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
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
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [showGrupoModal, setShowGrupoModal] = useState(false);
  const [grupoOk, setGrupoOk] = useState<{ total: number; inicio: string } | null>(null);
  const [profId, setProfId] = useState<string>(ANY_PRO);
  const [fecha, setFecha] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotSel, setSlotSel] = useState<SlotDisponible | null>(null);
  const [isExpress, setIsExpress] = useState(false);
  const [diasDisp, setDiasDisp] = useState<Set<string>>(new Set());
  const [diasLoading, setDiasLoading] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentIa, setConsentIa] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<CrearCitaResult | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  // Expres extra states
  const [eFranja, setEFranja] = useState('cualquiera');

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
      } catch {
        if (!cancel) setNotFound(true);
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

  useEffect(() => {
    const SITE_KEY = (info?.negocio as any)?.captcha_site_key;
    if (typeof window === 'undefined' || !SITE_KEY) { setCaptchaReady(false); return; }
    if ((window as any).grecaptcha) { setCaptchaReady(true); return; }
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.onload = () => setCaptchaReady(true);
    script.onerror = () => setCaptchaReady(false);
    document.head.appendChild(script);
  }, [info]);

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
  }, [step, servicio, profId, slug]);

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

  const mostrarPrecioEnLista = info?.negocio.mostrar_precios === 'catalogo' || info?.negocio.mostrar_precios === 'siempre';
  const mostrarPrecioResumen = info?.negocio.mostrar_precios !== 'nunca';

  const profSel = useMemo(() => (profId === ANY_PRO ? null : info?.profesionales.find(p => p.id === profId) ?? null), [profId, info]);

  useEffect(() => {
    if (!analyticsConsent || !info?.negocio.analytics_config?.enabled) return;
    AnalyticsEvents.stepView(step, slug);
  }, [step, slug, analyticsConsent, info]);

  const confirmar = useCallback(async () => {
    if (!servicio || (!slotSel && !isExpress)) return;
    setError('');
    if (!nombre.trim()) { setError(t('err_nombre')); return; }
    if (telefono.trim().length < 6) { setError(t('err_tel')); return; }
    if (!consent) { setError(t('err_consent')); return; }
    setEnviando(true);
    try {
      let captchaToken: string | undefined;
      const SITE_KEY = (info?.negocio as any)?.captcha_site_key;
      if (captchaReady && SITE_KEY && (window as any).grecaptcha) {
        try { captchaToken = await (window as any).grecaptcha.execute(SITE_KEY, { action: 'submit' }); } catch (e) { console.error(e); }
      }

      if (isExpress) {
        const disp = await getDisponibilidadExpress(slug, servicio.id, telefono.trim(), profId === ANY_PRO ? null : profId);
        if (disp.length > 0 && disp[0].error_msg) {
          setError(disp[0].error_msg); setEnviando(false); return;
        }
        if (disp.length > 0) {
          const best = disp[0];
          const r = await crearCitaPublicaExpress({
            slug, servicioId: servicio.id, profesionalId: best.profesional_id, inicioISO: best.slot,
            clienteNombre: nombre.trim(), clienteTelefono: telefono.trim(),
            clienteEmail: email.trim() || undefined, notas: notas.trim() || undefined,
            consentimientoDatos: consent, consienteIa: consentIa, captchaToken,
          });
          setResultado(r); setStep('confirmado');
        } else {
          const wl = await crearListaEsperaExpressPublica({
            slug, servicioId: servicio.id, telefono: telefono.trim(), profesionalId: profId === ANY_PRO ? null : profId,
          });
          if (!wl.ok) { setError(wl.error || 'Error al solicitar cita exprÃ©s'); }
          else {
            setResultado({ cita_id: 'waitlist', cliente_id: '', estado: 'pendiente', deposito_requerido: false, deposito_importe: 0, inicio: '', fin: '' });
            setStep('confirmado');
          }
        }
      } else {
        const r = await crearCitaPublica({
          slug, servicioId: servicio.id, profesionalId: slotSel!.profesional_id, inicioISO: slotSel!.slot,
          clienteNombre: nombre.trim(), clienteTelefono: telefono.trim(),
          clienteEmail: email.trim() || undefined, notas: notas.trim() || undefined,
          consentimientoDatos: consent, consienteIa: consentIa, captchaToken,
        });
        setResultado(r); setStep('confirmado');
        if (analyticsConsent) {
          AnalyticsEvents.bookingCompleted(r.cita_id, servicio.nombre, slotSel!.profesional_nombre, servicio.precio || 0, slug);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('err_generic');
      if (/ocupado|disponib|antelacion|horario/i.test(msg)) { setError(t('err_ocupado')); setStep('fecha'); } else { setError(msg); }
    } finally { setEnviando(false); }
  }, [servicio, slotSel, isExpress, nombre, telefono, email, notas, consent, slug, t, captchaReady, profId, consentIa, analyticsConsent, info]);

  const submitExpress = useCallback(async () => {
    // Basic validation
    if (!nombre.trim()) { setError('Escribe tu nombre.'); return; }
    if (telefono.trim().length < 6) { setError('Escribe un telÃ©fono vÃ¡lido.'); return; }
    if (!consent) { setError('Acepta la polÃ­tica de privacidad para continuar.'); return; }
    setEnviando(true);
    try {
      // Simulate backend request for express
      const wl = await crearListaEsperaExpressPublica({
        slug, servicioId: '', telefono: telefono.trim(), profesionalId: null,
      });
      if (!wl.ok) { setError(wl.error || 'Error al solicitar cita exprÃ©s'); }
      else {
        setResultado({ cita_id: 'waitlist-expres', cliente_id: '', estado: 'pendiente', deposito_requerido: false, deposito_importe: 0, inicio: '', fin: '' });
        setStep('confirmado');
      }
    } catch(e: any) {
      setError(e.message || 'Error');
    } finally {
      setEnviando(false);
    }
  }, [nombre, telefono, consent, slug]);

  const submitReview = () => {
    if (!rPuntuacion) { setRError('Elige una valoraciÃ³n para el salÃ³n.'); return; }
    setRError('');
    // Mock save review
    setReviewSubmitted(true);
  };

  function elegirServicio(sv: PortalServicio) {
    setServicio(sv); setError('');
    setStep('profesional');
  }

  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null); setDiasDisp(new Set());
    setIsExpress(false);
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

  const isGuiada = !isExpress;
  const isExpresMode = isExpress && !servicio; // purely express
  const showForm = step !== 'confirmado' && isGuiada;
  const showSuccess = step === 'confirmado' && isGuiada;
  const showExpresForm = isExpresMode && step !== 'confirmado';
  const showExpresSuccess = isExpresMode && step === 'confirmado';
  const servicioElegido = !!servicio;
  const slotElegido = !!slotSel;
  const ctaDisabled = !(servicioElegido && slotElegido);

  const categorias = Array.from(new Set(info.servicios.map(s => s.categoria_id).filter(Boolean)));
  const servFiltrados = info.servicios.filter(sv => !categoriaFiltro || sv.categoria_id === categoriaFiltro);

  const franjaMananaItems = horas.filter(s => franjaDe(s.slot) === 'manana');
  const franjaTardeItems = horas.filter(s => franjaDe(s.slot) === 'tarde');
  const franjaNocheItems = horas.filter(s => franjaDe(s.slot) === 'noche');
  const sinHuecos = !diasLoading && diasDisp.size > 0 && horas.length === 0;

  const inputStyle = { width: '100%', padding: '13px 14px', borderRadius: 11, border: '1.5px solid rgba(40,30,24,0.08)', fontSize: 14.5, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1c1814' };
  const textareaStyle = { ...inputStyle, minHeight: 58, resize: 'vertical' as const };
  const errorStyleBox = { padding: '10px 12px', background: T.dangerSoft, border: '1px solid rgba(226,59,52,0.35)', borderRadius: 10, color: T.danger, fontSize: 12.5, marginTop: 14 };

  const ratingBars = [5, 4, 3, 2, 1].map(star => {
    // Mock rating data for UI if resenas doesn't have details
    const count = star === 5 ? 164 : star === 4 ? 15 : star === 3 ? 2 : star === 2 ? 1 : 0;
    const total = 182;
    const pct = Math.round((count / total) * 100);
    return { star, pct };
  });
  return (
    <div data-screen-label="Portal de reservas" style={{ minHeight: '100vh', background: '#f6f1ea', fontFamily: 'Inter,system-ui,sans-serif', color: '#1c1814' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: '#fffdfb', borderBottom: '1px solid rgba(40,30,24,0.08)' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: isMobile ? '12px 20px' : '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 11, background: T.primarySoft, alignItems: 'center', justifyContent: 'center' }}><MechaMark size={20} /></span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{info.negocio.nombre}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5c5249', whiteSpace: 'nowrap' }}>
              <IconStarFilled size={14} /> <b style={{ color: '#1c1814' }}>{resenas?.media || '4.9'}</b>&nbsp;Â· {resenas?.total || 182} reseÃ±as
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

      <div style={{ position: 'relative', height: 236, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#ccc' }}>
          {/* placeholder hero image, could use a real one if available */}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(28,24,20,0.02) 0%,rgba(18,14,10,0.74) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 1360, margin: '0 auto', padding: isMobile ? '0 20px 24px' : '0 40px 24px', pointerEvents: 'none' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: '#ffcf4a', marginBottom: 6 }}>SalÃ³n de belleza Â· Madrid</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: isMobile ? 36 : 44, color: '#fff', lineHeight: 1 }}>{info.negocio.nombre}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1360, margin: '-30px auto 0', padding: isMobile ? '0 16px 40px' : '0 40px 56px', position: 'relative', zIndex: 2 }}>
        <div style={{ background: '#fffdfb', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 24, boxShadow: '0 24px 60px rgba(40,30,24,0.12)', padding: isMobile ? 20 : 32 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', padding: 4, background: '#f6f1ea', borderRadius: 14, gap: 4 }}>
              <button onClick={() => setIsExpress(false)} style={{ flex: '0 0 auto', padding: '10px 20px', borderRadius: 11, border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...(isGuiada ? { background: '#fff', color: '#1c1814', boxShadow: '0 2px 8px rgba(40,30,24,0.10)' } : { background: 'transparent', color: '#5c5249' }) }}>Reserva guiada</button>
              <button onClick={() => { setIsExpress(true); setServicio(null); setStep('datos'); }} style={{ flex: '0 0 auto', padding: '10px 20px', borderRadius: 11, border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...(isExpresMode ? { background: '#fff', color: '#1c1814', boxShadow: '0 2px 8px rgba(40,30,24,0.10)' } : { background: 'transparent', color: '#5c5249' }) }}>Reserva exprÃ©s</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#736658', fontWeight: 600 }}>
              <Icon name="check" size={14} color="#0f9d6b" /> ConfirmaciÃ³n inmediata Â· Sin registro
            </div>
          </div>

          {/* RESERVA GUIADA */}
          {isGuiada && (
            <>
              {showForm && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 32, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                    {/* 1. Servicio */}
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 5 }}>1 Â· Servicio</div>
                      <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: -0.3, marginBottom: 12 }}>Â¿QuÃ© te apetece hoy?</div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
                        <button onClick={() => setCategoriaFiltro(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', ...(categoriaFiltro === null ? { background: T.primarySoft, border: `1px solid ${T.primary}`, color: T.primaryHi } : { background: 'transparent', border: '1px solid ' + T.border, color: T.textSec }) }}>Todos</button>
                        {categorias.map(cat => {
                          const active = categoriaFiltro === cat;
                          const hex = categoryColorHex('primary'); // simplifying color handling for now
                          return (
                            <button key={cat} onClick={() => setCategoriaFiltro(active ? null : cat)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', ...(active ? { background: hex + '20', border: '1px solid ' + hex, color: T.text } : { background: 'transparent', border: '1px solid ' + T.border, color: T.textSec }) }}>
                              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: hex, marginRight: 0 }} />{info.servicios.find(s => s.categoria_id === cat)?.categoria_nombre || cat}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {servFiltrados.map(sv => {
                          const selected = servicio?.id === sv.id;
                          return (
                            <button key={sv.id} onClick={() => elegirServicio(sv)} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: 12, background: selected ? T.primarySoft : '#fff', border: `1.5px solid ${selected ? T.primary : T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                              <span style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: 14, background: '#f0f0f0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {sv.foto_url ? <img src={sv.foto_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} /> : <Icon name="scissors" size={24} color="#ccc" />}
                              </span>
                              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{sv.nombre}</span>
                                <span style={{ display: 'block', fontSize: 12.5, color: '#736658', marginTop: 2 }}>{sv.duracion} min{mostrarPrecioEnLista ? ` Â· ${sv.precio}â‚¬` : ''}</span>
                              </span>
                              {selected && (
                                <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: T.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Icon name="check" size={14} color="#fff" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Profesional */}
                    {servicioElegido && (
                      <div style={{ marginBottom: 22 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi }}>2 Â· Profesional</div>
                          <button onClick={() => setServicio(null)} style={{ background: 'none', border: 'none', color: '#5c5249', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Cambiar servicio</button>
                        </div>
                        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 12 }}>Â¿Con quiÃ©n prefieres ir?</div>
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
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 5 }}>3 Â· Fecha y hora</div>
                        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 12 }}>Â¿CuÃ¡ndo te viene bien?</div>
                        
                        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 10, marginBottom: 8 }}>
                          {proximosDias.map((d, i) => {
                            const key = fechaISOaClave(d);
                            const on = diasDisp.has(key);
                            const sel = key === fechaISOaClave(fecha);
                            const rel = i === 0 ? 'Hoy' : i === 1 ? 'MaÃ±ana' : d.toLocaleDateString(loc, { weekday: 'short' });
                            return (
                              <button key={key} onClick={() => on && setFecha(d)} style={{ flexShrink: 0, width: 58, padding: '9px 0', borderRadius: 14, textAlign: 'center', cursor: on ? 'pointer' : 'default', border: sel ? 'none' : '1.5px solid ' + T.border, background: sel ? FIRE : '#fff', color: sel ? '#fff' : T.text, opacity: on ? 1 : 0.35, boxShadow: sel ? '0 7px 16px rgba(0,0,0,0.18)' : 'none' }}>
                                <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'capitalize', opacity: sel ? 0.92 : 0.7 }}>{rel}</span>
                                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{d.getDate()}</span>
                                <span style={{ display: 'block', fontSize: 9, textTransform: 'capitalize', opacity: sel ? 0.85 : 0.55 }}>{d.toLocaleDateString(loc, { month: 'short' })}</span>
                              </button>
                            );
                          })}
                        </div>

                        {sinHuecos && (
                          <div style={{ padding: '26px 20px', textAlign: 'center', border: '1px dashed rgba(40,30,24,0.14)', borderRadius: 16, background: '#fbf6f0' }}>
                            <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Sin huecos este dÃ­a</div>
                            <div style={{ fontSize: 13, color: '#5c5249' }}>Prueba otro dÃ­a del calendario o llÃ¡manos y te buscamos hueco.</div>
                          </div>
                        )}

                        {!sinHuecos && [
                          { label: 'MaÃ±ana', icon: 'sun', items: franjaMananaItems },
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
                                return (
                                  <button key={s.slot} onClick={() => setSlotSel(s)} style={{ padding: '10px 6px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: sel ? 'none' : '1.5px solid ' + T.border, background: sel ? T.primary : '#fff', color: sel ? '#fff' : T.text, boxShadow: sel ? '0 7px 16px rgba(0,0,0,0.18)' : 'none' }}>
                                    {fmtHora(s.slot, loc)}
                                    <span style={{ display: profId === ANY_PRO ? 'block' : 'none', fontSize: 9.5, fontWeight: 500, opacity: 0.75, marginTop: 1 }}>{s.profesional_nombre.split(' ')[0]}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 4. Tus datos */}
                    {slotElegido && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 5 }}>4 Â· Tus datos</div>
                        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 12 }}>Para confirmar la cita</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Nombre</span>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" style={inputStyle} />
                          </label>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>TelÃ©fono</span>
                            <PhoneInput value={telefono} onChange={setTelefono} placeholder="600 000 000" />
                          </label>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Email (opcional)</span>
                            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" style={inputStyle} />
                          </label>
                          <label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Notas (opcional)</span>
                            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Alergias, preferenciasâ€¦" style={inputStyle} />
                          </label>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
                          <span onClick={() => setConsent(!consent)} style={{ flexShrink: 0, marginTop: 1, width: 21, height: 21, borderRadius: 6, border: '2px solid ' + (consent ? T.primary : T.borderHi), background: consent ? T.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {consent && <Icon name="check" size={14} color="#fff" />}
                          </span>
                          <span onClick={() => setConsent(!consent)} style={{ fontSize: 12.5, color: '#5c5249', lineHeight: 1.45 }}>He leÃ­do y acepto la polÃ­tica de privacidad. Solo usamos tus datos para gestionar esta cita.</span>
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
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Servicio</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{servicio ? servicio.nombre : 'â€”'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Profesional</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{servicioElegido ? (profSel ? profSel.nombre : 'Cualquiera disponible') : 'â€”'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Fecha</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{slotElegido ? capFirst(fmtFechaLarga(new Date(slotSel!.slot), loc)) : 'â€”'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#736658' }}>Hora</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{slotElegido ? `${fmtHora(slotSel!.slot, loc)} Â· ${slotSel!.profesional_nombre.split(' ')[0]}` : 'â€”'}</span>
                        </div>
                      </div>
                      {(mostrarPrecioResumen && servicio) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(40,30,24,0.08)' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Total</span><span style={{ fontSize: 19, fontWeight: 800 }}>{servicio.precio}â‚¬</span>
                        </div>
                      )}
                      {error && <div style={errorStyleBox}>{error}</div>}
                      <button onClick={confirmar} disabled={ctaDisabled || enviando} style={{ width: '100%', marginTop: 18, padding: '14px 16px', borderRadius: 13, border: 'none', background: ctaDisabled ? T.borderHi : FIRE, color: ctaDisabled ? T.textTer : '#fff', fontSize: 15, fontWeight: 800, cursor: ctaDisabled ? 'default' : 'pointer', boxShadow: ctaDisabled ? 'none' : '0 12px 26px rgba(0,0,0,0.18)' }}>{enviando ? 'Confirmando...' : 'Confirmar reserva'}</button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> ConfirmaciÃ³n inmediata por SMS</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> CancelaciÃ³n gratuita hasta 24h antes</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> Pago en el salÃ³n el dÃ­a de la cita</div>
                      </div>
                    </div>
                    <button onClick={() => { setIsExpress(true); setServicio(null); setStep('datos'); }} style={{ width: '100%', marginTop: 12, padding: '13px 14px', borderRadius: 14, border: `1px dashed ${T.primary}`, background: T.primarySoft, color: '#1c1814', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ whiteSpace: 'nowrap' }}>Â¿Tienes prisa? Reserva exprÃ©s en 10 segundos</span>
                      <Icon name="chevronRight" size={16} color={T.primaryHi} />
                    </button>
                  </div>
                </div>
              )}

              {showSuccess && (
                <div style={{ textAlign: 'center', padding: '20px 0 4px' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <span style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: T.primarySoft, animation: 'rpRing 1.8s ease-out infinite' }} />
                    <span style={{ position: 'relative', display: 'inline-flex', width: 84, height: 84, borderRadius: '50%', background: '#fff', border: '1px solid rgba(40,30,24,0.08)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(244,80,30,0.22)' }}>
                      <Icon name="check" size={36} color={T.primary} />
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 34, marginBottom: 8 }}>Â¡Reserva confirmada!</div>
                  <div style={{ maxWidth: 420, margin: '0 auto 20px', fontSize: 15, color: '#5c5249', lineHeight: 1.5 }}>Te esperamos {capFirst(fmtFechaLarga(new Date(slotSel!.slot), loc))} a las {fmtHora(slotSel!.slot, loc)}. Hemos enviado la confirmaciÃ³n por SMS.</div>
                  <div style={{ maxWidth: 420, margin: '0 auto 20px', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 16, overflow: 'hidden', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '13px 16px', borderBottom: '1px solid rgba(40,30,24,0.08)' }}><span style={{ fontSize: 12.5, color: '#736658' }}>Servicio</span><span style={{ fontSize: 13.5, fontWeight: 700 }}>{servicio!.nombre}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '13px 16px', borderBottom: '1px solid rgba(40,30,24,0.08)' }}><span style={{ fontSize: 12.5, color: '#736658' }}>Profesional</span><span style={{ fontSize: 13.5, fontWeight: 700 }}>{slotSel!.profesional_nombre}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '13px 16px' }}><span style={{ fontSize: 12.5, color: '#736658' }}>CuÃ¡ndo</span><span style={{ fontSize: 13.5, fontWeight: 700 }}>{capFirst(fmtFechaLarga(new Date(slotSel!.slot), loc))} a las {fmtHora(slotSel!.slot, loc)}</span></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
                    <a href={gcalLink(servicio!.nombre, info.negocio.nombre || 'tu salon', slotSel!.slot, servicio!.duracion, info.negocio.direccion)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, background: '#fff', border: '1.5px solid rgba(40,30,24,0.1)', color: '#1c1814', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                      <Icon name="calendar" size={16} color={T.primary} /> AÃ±adir a Google Calendar
                    </a>
                    <button onClick={reiniciar} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700, padding: 8, cursor: 'pointer' }}>Hacer otra reserva</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* RESERVA EXPRES */}
          {isExpresMode && (
            <>
              {showExpresForm && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 36, alignItems: isMobile ? 'flex-start' : 'center' }}>
                  <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 6 }}>Reserva exprÃ©s</div>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, marginBottom: 10, lineHeight: 1.1 }}>Te buscamos hueco nosotros</div>
                    <div style={{ fontSize: 14, color: '#5c5249', lineHeight: 1.55, marginBottom: 22, maxWidth: 400 }}>Ideal si tienes prisa: dÃ©janos tu nombre y telÃ©fono, y te llamamos en cuanto tengamos un hueco libre. Sin elegir servicio ni horario.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: T.primarySoft, color: T.primaryHi, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>1</span><span style={{ fontSize: 13.5, color: '#1c1814', paddingTop: 4 }}>Nos dejas tu nombre y telÃ©fono</span></div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: T.primarySoft, color: T.primaryHi, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>2</span><span style={{ fontSize: 13.5, color: '#1c1814', paddingTop: 4 }}>Revisamos la agenda y buscamos el primer hueco libre</span></div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: T.primarySoft, color: T.primaryHi, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>3</span><span style={{ fontSize: 13.5, color: '#1c1814', paddingTop: 4 }}>Te llamamos para confirmar dÃ­a y hora</span></div>
                    </div>
                    <button onClick={() => setIsExpress(false)} style={{ marginTop: 22, background: 'none', border: 'none', color: '#5c5249', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Prefiero elegir servicio y hora yo mismo</button>
                  </div>
                  <div style={{ width: isMobile ? '100%' : 380, flexShrink: 0, background: '#fbf6f0', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 18, padding: 26 }}>
                    <label style={{ display: 'block', marginBottom: 14 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Tu nombre</span>
                      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" style={inputStyle} />
                    </label>
                    <label style={{ display: 'block', marginBottom: 14 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Tu telÃ©fono</span>
                      <PhoneInput value={telefono} onChange={setTelefono} placeholder="600 000 000" />
                    </label>
                    <div style={{ marginBottom: 14 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 6 }}>Â¿Alguna preferencia horaria? (opcional)</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[
                          { key: 'cualquiera', label: 'Cuanto antes' },
                          { key: 'manana', label: 'MaÃ±ana' },
                          { key: 'tarde', label: 'Tarde' },
                          { key: 'noche', label: 'Noche' },
                        ].map(f => (
                          <button key={f.key} onClick={() => setEFranja(f.key)} style={{ padding: '7px 13px', borderRadius: 999, border: '1.5px solid ' + (eFranja === f.key ? T.primary : T.border), background: eFranja === f.key ? T.primarySoft : '#fff', color: eFranja === f.key ? T.primaryHi : T.textSec, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{f.label}</button>
                        ))}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                      <span onClick={() => setConsent(!consent)} style={{ flexShrink: 0, marginTop: 1, width: 21, height: 21, borderRadius: 6, border: '2px solid ' + (consent ? T.primary : T.borderHi), background: consent ? T.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {consent && <Icon name="check" size={14} color="#fff" />}
                      </span>
                      <span onClick={() => setConsent(!consent)} style={{ fontSize: 12, color: '#5c5249', lineHeight: 1.4 }}>Acepto la polÃ­tica de privacidad para que me contacten por esta cita.</span>
                    </label>
                    {error && <div style={errorStyleBox}>{error}</div>}
                    <button onClick={submitExpress} disabled={enviando} style={{ width: '100%', padding: '14px 16px', borderRadius: 13, border: 'none', background: FIRE, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 12px 26px rgba(0,0,0,0.18)' }}>{enviando ? 'Enviando...' : 'Solicitar hueco exprÃ©s'}</button>
                  </div>
                </div>
              )}
              {showExpresSuccess && (
                <div style={{ textAlign: 'center', padding: '30px 0 10px' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <span style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: T.primarySoft, animation: 'rpRing 1.8s ease-out infinite' }} />
                    <span style={{ position: 'relative', display: 'inline-flex', width: 84, height: 84, borderRadius: '50%', background: '#fff', border: '1px solid rgba(40,30,24,0.08)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(244,80,30,0.22)' }}>
                      <Icon name="phone" size={34} color={T.primary} />
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 32, marginBottom: 10 }}>Â¡Perfecto, {nombre}!</div>
                  <div style={{ maxWidth: 420, margin: '0 auto 22px', fontSize: 15, color: '#5c5249', lineHeight: 1.55 }}>Te llamamos al <b style={{ color: '#1c1814' }}>{telefono}</b> en cuanto tengamos un hueco libre â€” normalmente en menos de 30 minutos.</div>
                  <button onClick={reiniciar} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, fontWeight: 700, padding: 8, cursor: 'pointer' }}>Volver al inicio</button>
                </div>
              )}
            </>
          )}

        </div>

        {/* OPINIONES */}
        <div style={{ marginTop: 44 }} ref={reviewsRef}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 6 }}>Opiniones</div>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: -0.4 }}>Lo que dicen nuestros clientes</div>
            </div>
            <button onClick={() => setShowReviewForm(!showReviewForm)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 11, border: '1.5px solid ' + (showReviewForm ? T.primary : T.border), background: showReviewForm ? T.primarySoft : '#fff', color: showReviewForm ? T.primaryHi : T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Icon name="edit" size={15} /> Escribir una reseÃ±a
            </button>
          </div>

          {showReviewForm && !reviewSubmitted && (
            <div style={{ background: '#fffdfb', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 20, padding: 22, marginBottom: 22 }}>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 19, marginBottom: 14 }}>CuÃ©ntanos tu experiencia</div>
              <div style={{ border: `1.5px solid ${T.primary}`, background: T.primarySoft, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#5c5249' }}>Â¿CÃ³mo calificarÃ­as tu experiencia?</span>
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
                  {rPuntuacion > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: T.primaryHi }}>{['', 'Lo siento', 'Mejorable', 'Bien', 'Muy bien', 'Â¡Excelente!'][rPuntuacion]}</span>}
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
                  <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 5 }}>Â¿Algo que destacar del salÃ³n?</span>
                  <textarea value={rComentario} onChange={e => setRComentario(e.target.value)} placeholder="Â¿QuÃ© destacarÃ­as de tu experiencia?" style={textareaStyle}></textarea>
                </label>
                <div style={{ borderTop: '1px solid rgba(40,30,24,0.06)', paddingTop: 12, marginBottom: 14 }}>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 6 }}>Â¿QuiÃ©n te atendiÃ³?</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[{ id: '', nombre: 'Prefiero no decirlo' }, ...info.profesionales].map(pr => {
                      const sel = rProfesionalId === pr.id;
                      return <button key={pr.id} onClick={() => setRProfesionalId(pr.id)} style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (sel ? T.primary : T.border), background: sel ? T.primarySoft : 'transparent', color: sel ? T.primaryHi : T.textSec }}>{pr.nombre}</button>;
                    })}
                  </div>
                  {rProfesionalId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11.5, color: '#736658' }}>Su atenciÃ³n:</span>
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
                    <span style={{ display: 'block', fontSize: 11.5, color: '#736658', marginBottom: 5 }}>Â¿QuÃ© mejorarÃ­as del sistema de reserva?</span>
                    <textarea value={rMechaMejora} onChange={e => setRMechaMejora(e.target.value)} placeholder="Sugerenciasâ€¦" style={textareaStyle}></textarea>
                  </label>
                  <input value={rNombre} onChange={e => setRNombre(e.target.value)} placeholder="Tu nombre (opcional, se mostrarÃ¡ pÃºblicamente)" style={inputStyle} />
                </div>
              </div>
              {rError && <div style={errorStyleBox}>{rError}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={submitReview} style={{ padding: '14px 16px', borderRadius: 13, border: 'none', background: FIRE, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', flex: 1 }}>Enviar reseÃ±a</button>
                <button onClick={() => setShowReviewForm(false)} style={{ padding: '14px 18px', borderRadius: 13, border: '1.5px solid rgba(40,30,24,0.14)', background: '#fff', color: '#5c5249', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          )}

          {showReviewForm && reviewSubmitted && (
            <div style={{ background: '#fffdfb', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 20, padding: '30px 26px', marginBottom: 22, textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: '50%', background: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <IconStarFilled size={24} color={T.primary} />
              </span>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 19, marginBottom: 5 }}>Â¡Gracias por tu opiniÃ³n!</div>
              <div style={{ fontSize: 13, color: '#5c5249' }}>Nos ayuda muchÃ­simo a mejorar el servicio.</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
            <div style={{ background: '#fbf6f0', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 18, padding: 20 }}>
              <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{resenas?.media || '4.9'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, margin: '8px 0 4px' }}>
                {[1, 2, 3, 4, 5].map(n => <IconStarFilled key={n} size={15} />)}
              </div>
              <div style={{ fontSize: 12, color: '#736658', marginBottom: 14 }}>{resenas?.total || 182} reseÃ±as</div>
              {ratingBars.map(rb => (
                <div key={rb.star} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#736658', width: 10 }}>{rb.star}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(40,30,24,0.08)', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, background: '#e08a00', width: rb.pct + '%' }}></div></div>
                </div>
              ))}
            </div>
            {/* The rest of the reviews would be mapped here, using static for now as mock */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
              {[1,2].map(i => (
                <div key={i} style={{ background: '#fff', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 16, padding: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: '50%', background: T.primarySoft, color: T.primaryHi, alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>C</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Cliente feliz</div>
                      <div style={{ fontSize: 11, color: '#736658' }}>Servicio x Â· hace 4 dÃ­as</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 7 }}>{[1,2,3,4,5].map(n => <IconStarFilled key={n} size={12} />)}</div>
                  <div style={{ fontSize: 12.5, color: '#3a332c', lineHeight: 1.5 }}>Muy contenta con el resultado.</div>
                </div>
              ))}
            </div>
          </div>
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
            <div style={{ fontSize: 13.5, color: T.textSec, marginBottom: 16 }}>{t('grupo_ok_personas', { n: grupoOk.total })} Â· {new Date(grupoOk.inicio).toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. {t('grupo_ok_aviso')}</div>
            <button onClick={() => setGrupoOk(null)} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('grupo_ok_cerrar')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
