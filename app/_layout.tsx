import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebScrollbarStyles } from '@/components/WebScrollbarStyles';
import { ThemeProvider } from '@/lib/themeContext';
import { CalendarProvider } from '@/lib/calendarContext';
import { useTheme } from '@/lib/theme';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import './globals.css';

// Load Google Fonts for web + inject default text color
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  // Inject global CSS with white as default
  const style = document.createElement('style');
  style.textContent = `
    * { color: #f8fafc; }
    input::placeholder, textarea::placeholder { color: #64748b !important; }
    input, select, textarea { background-color: #141f33; color: #f8fafc !important; border-color: rgba(148,163,184,0.10); }
    option { background-color: #141f33; color: #f8fafc !important; }
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
    if (!session && !inAuthGroup) router.replace('/login');
    else if (session && inAuthGroup) router.replace('/(tabs)');
  }, [session, segments]);

  if (!isWeb && !fontsLoaded) {
    return null;
  }

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#6366f1" />
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
        <Stack.Screen name="screens/agenda-detalle" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Cita', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="screens/cliente-detalle" options={{ headerShown: true, title: 'Cliente', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="screens/nueva-cita" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Nueva cita', headerBackTitle: 'Agenda', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="screens/configuracion" options={{ headerShown: true, title: 'Configuración', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
      </Stack>
    </ThemedRoot>
    </SafeAreaProvider>
    </ThemeProvider>
    </CalendarProvider>
  );
}
