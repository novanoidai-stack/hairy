import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebScrollbarStyles } from '@/components/WebScrollbarStyles';

const webModal = Platform.OS === 'web'
  ? { presentation: 'transparentModal' as const, headerShown: false }
  : {};

export default function RootLayout() {
  const [session, setSession] = useState<any>(undefined);
  const router = useRouter();
  const segments = useSegments();

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

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WebScrollbarStyles />
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="screens/agenda-detalle" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Cita', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="screens/cliente-detalle" options={{ headerShown: true, title: 'Cliente', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="screens/nueva-cita" options={{ ...webModal, headerShown: Platform.OS !== 'web', title: 'Nueva cita', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="screens/configuracion" options={{ headerShown: true, title: 'Configuración', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
      </Stack>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
