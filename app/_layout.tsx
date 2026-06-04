import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebScrollbarStyles } from '@/components/WebScrollbarStyles';
import { MotionStyles } from '@/lib/motion';
import { ThemeProvider } from '@/lib/themeContext';
import { CalendarProvider } from '@/lib/calendarContext';
import { useTheme } from '@/lib/theme';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import './globals.css';

// Load Google Fonts for web + inject default text color
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bricolage+Grotesque:wght@600;700;800&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  // Inject global CSS with warm charcoal as default text on light bg
  const style = document.createElement('style');
  style.textContent = `
    * { color: #1c1814; }
    input::placeholder, textarea::placeholder { color: #8a7d70 !important; }
    input, select, textarea { background-color: #ffffff; color: #1c1814 !important; border-color: rgba(40,30,24,0.14); }
    option { background-color: #ffffff; color: #1c1814 !important; }
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
    const inAuthGroup = segments[0] === 'login';
    if (!session && !inAuthGroup) {
      // El login canonico es el de la landing (acceso.html), mismo origen que /app en el deploy.
      // En el deploy real (app servida bajo /app) mandamos ahi: el usuario entra una sola vez.
      // En dev suelto (expo start, ruta en raiz) usamos el login interno como fallback.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
        window.location.href = '/acceso.html';
      } else {
        router.replace('/login');
      }
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, segments]);

  // Puente de navegacion para la vista previa (demo.html embebe /app en un iframe).
  // Cada paso de la guia manda { type:'mecha-nav', route } y aqui movemos la app.
  // Solo aceptamos mensajes del mismo origen para evitar navegacion externa.
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; route?: string } | null;
      if (data && data.type === 'mecha-nav' && typeof data.route === 'string') {
        router.push(data.route as never);
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
    <CalendarProvider>
    <ThemeProvider>
    <SafeAreaProvider>
    <ThemedRoot>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="screens/agenda-detalle" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Cita', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
        <Stack.Screen name="screens/nueva-cita" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Nueva cita', headerBackTitle: 'Agenda', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
        <Stack.Screen name="screens/configuracion" options={{ headerShown: true, title: 'Configuración', headerStyle: { backgroundColor: '#fffdfb' }, headerTintColor: '#1c1814' }} />
      </Stack>
    </ThemedRoot>
    </SafeAreaProvider>
    </ThemeProvider>
    </CalendarProvider>
  );
}
