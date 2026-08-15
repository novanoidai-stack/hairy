import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase, IS_DEMO_MODE, signInDemoViewer } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebScrollbarStyles } from '@/components/WebScrollbarStyles';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { MotionStyles } from '@/lib/motion';
import { ThemeProvider } from '@/lib/themeContext';
import { CalendarProvider } from '@/lib/calendarContext';
import { PrivacyConsentProvider } from '@/lib/privacyConsentContext';
import { PrivacyConsentModal } from '@/components/PrivacyConsentModal';
import { GuardaIdentidad } from '@/components/acceso/GuardaIdentidad';
import { instalarCazadorDeErrores } from '@/lib/reportarError';
import { ChispaLauncher } from '@/components/chispa/ChispaLauncher';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import { ProximaAccionLauncher } from '@/components/chispa/ProximaAccionLauncher';
import { CoachLauncher } from '@/components/chispa/CoachLauncher';
import { TourLauncher } from '@/components/chispa/TourLauncher';
import { useTheme } from '@/lib/theme';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './globals.css';

// Load Google Fonts for web + inject default text color
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bricolage+Grotesque:wght@600;700;800&family=Instrument+Serif:ital@0;1&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  // PWA: manifest + theme-color. No se puede usar app/+html.tsx (este proyecto
  // exporta en modo SPA, no static; +html.tsx no se aplica), asi que se inyecta
  // en runtime igual que las fuentes de arriba.
  const manifestLink = document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = '/app/manifest.json';
  document.head.appendChild(manifestLink);

  const themeColorMeta = document.createElement('meta');
  themeColorMeta.name = 'theme-color';
  themeColorMeta.content = '#f4501e';
  document.head.appendChild(themeColorMeta);

  // Inject global CSS with warm charcoal as default text on light bg.
  // (Aqui habia un @font-face de Ionicons apuntando a un CDN. Sobraba: la fuente
  // viaja en el propio bundle y se sirve desde /app/assets, asi que en produccion
  // la CSP bloqueaba esa peticion y solo dejaba un error en consola.)
  const style = document.createElement('style');
  style.textContent = `
    * { color: #1c1814; }
    input::placeholder, textarea::placeholder { color: #8a7d70 !important; }
    input, select, textarea { background-color: #f6f1ea; color: #1c1814 !important; border-color: rgba(40,30,24,0.14); }
    option { background-color: #f6f1ea; color: #1c1814 !important; }
  `;
  document.head.appendChild(style);
}

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

function ThemedRoot({ children, isPublicRoute }: { children: React.ReactNode; isPublicRoute?: boolean }) {
  const { c, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <WebScrollbarStyles />
      <MotionStyles />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      {!isPublicRoute && <PrivacyConsentModal />}
      {/* Salon con un solo correo: antes de nada, quien eres (solo en panel interno, nunca en reservas publicas del marketplace). */}
      {!isPublicRoute && <GuardaIdentidad />}
      {!isPublicRoute && <ChispaLauncher />}
      {!isPublicRoute && <CoachLauncher />}
      {!isPublicRoute && <TourLauncher />}
      {children}
    </GestureHandlerRootView>
  );
}

const webModal = Platform.OS === 'web'
  ? { presentation: 'transparentModal' as const, headerShown: false }
  : {};

// --- Quien puede estar dentro de /app -------------------------------------
// 'completo'    -> equipo Mecha o cuenta de pago: adelante.
// 'free'        -> cuenta gratis: su sitio es /acceso.html.
// 'desconocido' -> no hemos podido leer perfil ni saber si es staff.

type Veredicto = 'completo' | 'free' | 'desconocido';

// La respuesta de is_staff hay que distinguirla de un fallo: `false` por error
// de red no es lo mismo que "no es del equipo" (a un staff lo echariamos).
async function esStaffCierto(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('is_staff');
  if (error) return null;
  return data === true;
}

// Una lectura fallida no decide nada, asi que se reintenta con esperas cortas
// antes de rendirse (un parpadeo de red no debe cambiar quien entra).
async function veredictoDeAcceso(cancelado: () => boolean): Promise<Veredicto> {
  const esperas = [0, 700, 1800];
  for (const espera of esperas) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    if (cancelado()) return 'desconocido';
    const [profile, staff] = await Promise.all([getUserProfile(), esStaffCierto()]);
    if (cancelado()) return 'desconocido';
    if (staff === true) return 'completo';
    if (!profile || staff === null) continue; // lectura incompleta: otra vuelta
    return String(profile.plan || '').toLowerCase() === 'free' ? 'free' : 'completo';
  }
  return 'desconocido';
}

const CLAVE_ACCESO = 'mecha_acceso:';

function recordarAcceso(uid: string, valor: 'free' | 'completo') {
  if (!uid) return;
  try { window.localStorage.setItem(CLAVE_ACCESO + uid, valor); } catch { /* modo privado */ }
}

function recuerdoDeAcceso(uid: string): string | null {
  if (!uid) return null;
  try { return window.localStorage.getItem(CLAVE_ACCESO + uid); } catch { return null; }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [session, setSession] = useState<any>(undefined);
  // Demo compartida: hasta que no aterriza su sesion no se puede consultar nada.
  // Si dejamos montar las pantallas antes, lanzan sus consultas sin token, se
  // quedan vacias y NO se reintentan: el visitante veia "0 citas" para siempre.
  // Esto marca cuando ya no tiene sentido seguir esperando (fallo o timeout).
  const [demoSinSesion, setDemoSinSesion] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const isWeb = Platform.OS === 'web';
  // Portal de reserva publica (app/r/[slug]), valoraciones (app/resena/[slug]) y gestion
  // de cita (app/cita/[id]): son anonimos, sin sesion. Quedan exentos de los guards de auth
  // (web y nativo) para que el cliente final pueda reservar / gestionar su cita.
  const isPublicRoute = ['r', 'resena', 'cita', 'pago', 'pagar', 'presupuesto', 'contacto'].includes(String(segments[0]));

  useEffect(() => {
    if (fontError) {
      console.error('Font loading error:', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (!isWeb && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, isWeb]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // Errores que no pasan por ningun try/catch ni por el boundary de React
  // (promesas sin capturar, scripts sueltos). Sin esto se perdian del todo.
  useEffect(() => instalarCazadorDeErrores(), []);

  // Salvavidas de la espera de demo: si la peticion se queda colgada del todo,
  // dejamos pasar igualmente en vez de dejar al visitante mirando un spinner
  // eterno. Es el ultimo recurso: el caso normal de fallo lo resuelve antes
  // signInDemoViewer(), que reintenta y avisa en cuanto se rinde.
  useEffect(() => {
    if (!IS_DEMO_MODE || session) return;
    const t = setTimeout(() => setDemoSinSesion(true), 10000);
    return () => clearTimeout(t);
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;
    // WEB: el UNICO acceso es el login de la landing (acceso.html), mismo origen
    // que /app — tanto en Vercel como en el espejo local. No hay login interno en
    // web: si no hay sesion, siempre se vuelve a la landing para entrar por
    // "Entrar al software". (El login interno solo existe en nativo, ver abajo.)
    if (Platform.OS === 'web') {
      if (!session && !isPublicRoute && typeof window !== 'undefined') {
        // Modo demo (iframe de demo.html): sesion aislada con la cuenta demo
        // compartida. Asi TODOS los visitantes ven la misma demo, sin tocar la
        // sesion personal del sitio. Si el login de demo falla, no redirigimos
        // (el marco de demo.html ya muestra su propio aviso).
        if (IS_DEMO_MODE) {
          // signInDemoViewer ya reintenta por dentro; si vuelve con error (o
          // peta), es que no hay nada que hacer y se monta la demo sin sesion.
          signInDemoViewer()
            .then((r) => { if (r?.error) setDemoSinSesion(true); })
            .catch(() => setDemoSinSesion(true));
          return;
        }
        window.location.href = '/acceso.html';
      }
      return;
    }
    // NATIVO (iOS/Android): no hay landing web, asi que el login interno
    // (app/login.tsx) es el acceso de la app.
    const inAuthGroup = segments[0] === 'login';
    if (!session && !inAuthGroup && !isPublicRoute) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, segments]);

  // El software es solo para el equipo (staff) y las cuentas full.
  // Una cuenta free que abre /app directamente (ventana principal, no el iframe
  // de la demo) se manda a /acceso.html, su pantalla. Dentro de la demo (iframe)
  // si puede mirar: alli el limite son sus visitas, no el plan.
  // Las rutas publicas (portal de reserva /r/ y valoraciones /resena/) quedan
  // exentas: son para el cliente final, da igual que sesion tenga el navegador.
  useEffect(() => {
    if (!isWeb || !session || typeof window === 'undefined' || isPublicRoute) return;
    const embedded = window.top !== window.self;
    const inApp = window.location.pathname.startsWith('/app');
    if (embedded || !inApp) return;
    let cancel = false;
    (async () => {
      const uid = String(session?.user?.id || '');
      const veredicto = await veredictoDeAcceso(() => cancel);
      if (cancel) return;
      // Sabemos que es free -> a su pantalla, y lo apuntamos.
      if (veredicto === 'free') {
        recordarAcceso(uid, 'free');
        window.location.href = '/acceso.html';
        return;
      }
      if (veredicto === 'completo') {
        recordarAcceso(uid, 'completo');
        return;
      }
      // No hemos podido saberlo ni reintentando. Aqui antes se dejaba pasar
      // siempre (fail-open): un fallo de red bastaba para colar a una cuenta
      // free en el software. Ahora tiramos de lo ultimo que SI supimos de esta
      // misma cuenta: si era free, fuera; si nunca lo supimos o tenia acceso,
      // la dejamos seguir — que es lo que evita el viejo bug de "te logueas y
      // se te sale afuera" cuando la lectura del perfil falla un instante.
      if (recuerdoDeAcceso(uid) === 'free') {
        window.location.href = '/acceso.html';
      }
    })();
    return () => { cancel = true; };
  }, [session, isWeb, isPublicRoute]);

  // Puente de navegacion para la vista previa (demo.html embebe /app en un iframe).
  // Cada paso de la guia manda { type:'mecha-nav', route } y aqui movemos la app.
  // Ademas { type:'mecha-demo', action } abre paneles reales (nueva cita, ficha,
  // notificaciones): lo reemitimos como CustomEvent para que cada pantalla escuche
  // sin acoplarse al puente. Solo aceptamos mensajes del mismo origen.
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; route?: string; action?: string } | null;
      if (!data) return;
      if (data.type === 'mecha-nav' && typeof data.route === 'string') {
        router.push(data.route as never);
      } else if (data.type === 'mecha-demo' && typeof data.action === 'string') {
        window.dispatchEvent(new CustomEvent('mecha-demo', { detail: { action: data.action } }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isWeb]);

  if (!isWeb && !fontsLoaded) {
    return null;
  }

  // Espera de la sesion de demo (con salvavidas de 8s por si el login falla o
  // se queda colgado: mejor entrar y que la pantalla avise que quedarse fijo).
  const esperandoDemo = isWeb && IS_DEMO_MODE && session === null && !isPublicRoute && !demoSinSesion;

  if (session === undefined || esperandoDemo) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f1ea' }}>
        <ActivityIndicator size="large" color="#f4501e" />
      </View>
    );
  }

  return (
    <GlobalErrorBoundary>
    <PrivacyConsentProvider>
    <CalendarProvider>
    <ThemeProvider>
    <SafeAreaProvider>
    <ThemedRoot isPublicRoute={isPublicRoute}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="r/[slug]" />
        <Stack.Screen name="resena/[slug]" />
        <Stack.Screen name="screens/agenda-detalle" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Cita', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
        <Stack.Screen name="screens/nueva-cita" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Nueva cita', headerBackTitle: 'Agenda', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
        <Stack.Screen name="screens/configuracion" options={{ headerShown: true, title: 'Configuración', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
      </Stack>
      {isWeb && <Analytics />}
      {isWeb && <SpeedInsights />}
    </ThemedRoot>
    </SafeAreaProvider>
    </ThemeProvider>
    </CalendarProvider>
    </PrivacyConsentProvider>
    </GlobalErrorBoundary>
  );
}
