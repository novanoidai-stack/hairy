import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { Sidebar } from '@/components/layout/Sidebar';
import { getUserProfile, can, type UserProfile, type Capability } from '@/lib/auth';

export default function TabsLayout({ children }: { children?: React.ReactNode }) {
  const { c } = useTheme();
  const { isDesktop } = useResponsive();

  // Gating por rol del bottom-tab movil (igual criterio que el Sidebar de escritorio).
  // Defensivo: mientras carga (undefined) se muestra todo; con cuenta real se aplica el rol.
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  useEffect(() => {
    if (isDesktop) return; // en escritorio la nav es el Sidebar
    getUserProfile().then(setProfile).catch(() => setProfile(null));
  }, [isDesktop]);
  const allows = (cap?: Capability) =>
    !cap || profile === undefined || profile === null || can(profile, cap);
  // La Caja (dinero del salon) es de gestores; el resto ficha y se sigue desde Mi jornada.
  const isManager = profile === undefined || profile === null
    || profile.role === 'owner' || profile.role === 'admin';

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } as any, unmountOnBlur: false, contentStyle: { backgroundColor: '#f6f1ea' } } as any}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="mi-jornada" />
            <Tabs.Screen name="caja" />
            <Tabs.Screen name="lista-espera" />
            <Tabs.Screen name="clientes" />
            <Tabs.Screen name="equipo" />
            <Tabs.Screen name="informes" />
            <Tabs.Screen name="configuracion" />
            <Tabs.Screen name="resenas" />
          </Tabs>
        </View>
      </View>
    );
  }

  // Icono de pestana: activo relleno, inactivo outline (mas limpio y "de app"
  // que rellenar siempre). Tamano fijo y contenido para no verse tosco en movil.
  const tabIcon = (name: string) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <Ionicons name={(focused ? name : `${name}-outline`) as any} size={23} color={color} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.tabBarBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58,
          paddingTop: 7,
          paddingBottom: 9,
        },
        tabBarActiveTintColor: '#f4501e',
        tabBarInactiveTintColor: c.textTertiary,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1, marginTop: 1 },
        tabBarItemStyle: { paddingTop: 1 },
        contentStyle: { backgroundColor: '#f6f1ea' },
      } as any}
    >
      <Tabs.Screen name="index" options={{ title: 'Agenda', tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen name="mi-jornada" options={{ title: 'Mi jornada', tabBarIcon: tabIcon('person-circle') }} />
      <Tabs.Screen name="caja" options={{ title: 'Caja', tabBarIcon: tabIcon('wallet'), href: isManager ? undefined : null }} />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: tabIcon('people'), href: allows('clientes.ver') ? undefined : null }} />
      <Tabs.Screen name="resenas" options={{ title: 'Reseñas', tabBarIcon: tabIcon('star') }} />
      <Tabs.Screen name="equipo" options={{ title: 'Equipo', tabBarIcon: tabIcon('person'), href: allows('equipo.ver') ? undefined : null }} />
      <Tabs.Screen name="informes" options={{ title: 'Informes', tabBarIcon: tabIcon('bar-chart'), href: allows('informes.ver') ? undefined : null }} />
      <Tabs.Screen name="configuracion" options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings'), href: allows('config.ver') ? undefined : null }} />
      <Tabs.Screen name="lista-espera" options={{ href: null }} />
    </Tabs>
  );
}
