import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { Sidebar } from '@/components/layout/Sidebar';

export default function TabsLayout({ children }: { children?: React.ReactNode }) {
  const { c } = useTheme();
  const { isDesktop } = useResponsive();

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } as any, unmountOnBlur: false, contentStyle: { backgroundColor: '#f6f1ea' } } as any}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="caja" />
            <Tabs.Screen name="lista-espera" />
            <Tabs.Screen name="clientes" />
            <Tabs.Screen name="equipo" />
            <Tabs.Screen name="informes" />
            <Tabs.Screen name="configuracion" />
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
      <Tabs.Screen name="caja" options={{ title: 'Caja', tabBarIcon: tabIcon('wallet') }} />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: tabIcon('people') }} />
      <Tabs.Screen name="equipo" options={{ title: 'Equipo', tabBarIcon: tabIcon('person') }} />
      <Tabs.Screen name="informes" options={{ title: 'Informes', tabBarIcon: tabIcon('bar-chart') }} />
      <Tabs.Screen name="configuracion" options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings') }} />
      <Tabs.Screen name="lista-espera" options={{ href: null }} />
    </Tabs>
  );
}
