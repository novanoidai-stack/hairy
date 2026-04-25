import { View } from 'react-native';
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
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="clientes" />
            <Tabs.Screen name="equipo" />
            <Tabs.Screen name="informes" />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopColor: c.tabBarBorder, height: 60, paddingBottom: 8 },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: c.textTertiary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Agenda', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
      <Tabs.Screen name="equipo" options={{ title: 'Equipo', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="informes" options={{ title: 'Informes', tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" size={size} color={color} /> }} />
    </Tabs>
  );
}
