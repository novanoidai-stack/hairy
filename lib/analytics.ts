// Libreria de Analytics para el portal publico (GA4)
// Maneja inicializacion, tracking de eventos y consentimiento GDPR

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export interface AnalyticsConfig {
  measurementId: string; // Formato: G-XXXXXXXXXX
  enabled: boolean;
  consentGiven: boolean;
}

let config: AnalyticsConfig | null = null;
let isLoaded = false;

// Inicializar GA4 con elMeasurement ID
export function initGA4(cfg: AnalyticsConfig): void {
  config = cfg;

  if (!cfg.enabled || !cfg.measurementId) {
    console.log('[Analytics] GA4 disabled or no measurement ID');
    return;
  }

  if (typeof window === 'undefined') return;

  // Cargar script de gtag.js si no esta cargado
  if (!window.gtag) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.measurementId}`;
    document.head.appendChild(script);

    // Inicializar dataLayer
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() {
      window.dataLayer!.push(arguments);
    };

    // Configurar GA4
    window.gtag('js', new Date());
    window.gtag('config', cfg.measurementId, {
      anonymize_ip: true, // GDPR: anonimizar IPs
      cookie_flags: 'samesite=none;secure', // GDPR: cookies seguras
      send_page_view: false, // Enviamos page views manualmente
    });

    isLoaded = true;
    console.log('[Analytics] GA4 initialized with ID:', cfg.measurementId);
  }
}

// Trackear evento personalizado
export function trackEvent(name: string, params: Record<string, any> = {}): void {
  if (!config || !config.enabled || !config.consentGiven || !isLoaded) {
    console.log('[Analytics] Event skipped (disabled, no consent, or not loaded):', name);
    return;
  }

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, params);
    console.log('[Analytics] Event tracked:', name, params);
  }
}

// Trackear vista de pagina
export function trackPageView(path: string, title: string): void {
  if (!config || !config.enabled || !config.consentGiven || !isLoaded) {
    console.log('[Analytics] PageView skipped (disabled, no consent, or not loaded):', path);
    return;
  }

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title,
    });
    console.log('[Analytics] PageView tracked:', path, title);
  }
}

// Dar consentimiento del usuario
export function giveConsent(): void {
  if (!config) return;
  config.consentGiven = true;

  // Actualizar consentimiento en GA4
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied', // No usamos ads
    });
    console.log('[Analytics] Consent given');
  }

  // Guardar en localStorage
  try {
    localStorage.setItem('mecha-analytics-consent', 'true');
  } catch {
    // localStorage no disponible
  }
}

// Retirar consentimiento del usuario
export function withdrawConsent(): void {
  if (!config) return;
  config.consentGiven = false;

  // Actualizar consentimiento en GA4
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
    });
    console.log('[Analytics] Consent withdrawn');
  }

  // Guardar en localStorage
  try {
    localStorage.setItem('mecha-analytics-consent', 'false');
  } catch {
    // localStorage no disponible
  }
}

// Cargar consentimiento guardado
export function loadSavedConsent(): boolean {
  try {
    const saved = localStorage.getItem('mecha-analytics-consent');
    return saved === 'true';
  } catch {
    return false;
  }
}

// Eventos especificos del portal Mecha
export const AnalyticsEvents = {
  // Portal cargado
  portalView: (slug: string, negocioNombre: string) =>
    trackEvent('portal_view', { slug, negocio_nombre: negocioNombre }),

  // Paso del flujo de reserva
  stepView: (step: string, slug: string) =>
    trackEvent('step_view', { step, slug }),

  // Reserva completada
  bookingCompleted: (citaId: string, servicio: string, profesional: string, importe: number, slug: string) =>
    trackEvent('booking_completed', {
      cita_id: citaId,
      servicio,
      profesional,
      importe,
      slug,
    }),

  // Reserva abandonada
  bookingAbandoned: (lastStep: string, slug: string) =>
    trackEvent('booking_abandoned', { last_step: lastStep, slug }),

  // Reseña enviada
  reviewSubmitted: (puntuacion: number, slug: string) =>
    trackEvent('review_submitted', { puntuacion, slug }),
};
