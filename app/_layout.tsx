import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase, IS_DEMO_MODE, signInDemoViewer } from '@/lib/supabase';
import { getUserProfile, isStaff } from '@/lib/auth';
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
import { ChispaLauncher } from '@/components/chispa/ChispaLauncher';
import { ProximaAccionLauncher } from '@/components/chispa/ProximaAccionLauncher';
import { CoachLauncher } from '@/components/chispa/CoachLauncher';
import { TourLauncher } from '@/components/chispa/TourLauncher';
import { useTheme } from '@/lib/theme';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
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

  // Inject global CSS with warm charcoal as default text on light bg
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

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { c, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <WebScrollbarStyles />
      <MotionStyles />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <PrivacyConsentModal />
      <ChispaLauncher />
      <ProximaAccionLauncher />
      <CoachLauncher />
      <TourLauncher />
      {children}
    </GestureHandlerRootView>
  );
}

const webModal = Platform.OS === 'web'
  ? { presentation: 'transparentModal' as const, headerShown: false }
  : {};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [session, setSession] = useState<any>(undefined);
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
          signInDemoViewer().catch(() => {});
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
      const [profile, staff] = await Promise.all([getUserProfile(), isStaff()]);
      if (cancel) return;
      // Solo expulsamos a /acceso.html si SABEMOS que la cuenta es free. Si el
      // perfil no se pudo leer (null por un fallo puntual de red/RLS), NO
      // expulsamos: evita el bug "te logueas y se te sale afuera" cuando la
      // lectura del perfil falla un instante (la cuenta sigue teniendo sesion).
      if (!profile) return;
      const plan = String(profile.plan || '').toLowerCase();
      if (!staff && plan === 'free') {
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

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f1ea' }}>
        <ActivityIndicator size="large" color="#f4501e" />
      </View>
    );
  }

  return (
    <PrivacyConsentProvider>
    <CalendarProvider>
    <ThemeProvider>
    <SafeAreaProvider>
    <ThemedRoot>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="r/[slug]" />
        <Stack.Screen name="resena/[slug]" />
        <Stack.Screen name="screens/agenda-detalle" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Cita', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
        <Stack.Screen name="screens/nueva-cita" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Nueva cita', headerBackTitle: 'Agenda', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
        <Stack.Screen name="screens/configuracion" options={{ headerShown: true, title: 'Configuración', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
      </Stack>
    </ThemedRoot>
    </SafeAreaProvider>
    </ThemeProvider>
    </CalendarProvider>
    </PrivacyConsentProvider>
  );
}
