import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileTabBar } from '@/components/layout/MobileTabBar';

export default function TabsLayout({ children }: { children?: React.ReactNode }) {
  const { c } = useTheme();
  const { isDesktop } = useResponsive();

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } as any, unmountOnBlur: false, sceneStyle: { backgroundColor: '#f6f1ea' } } as any}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="mi-jornada" />
            <Tabs.Screen name="caja" />
            <Tabs.Screen name="presupuestos" />
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

  // Movil/tablet: barra inferior custom con destinos primarios + hoja "Mas".
  // Antes la barra nativa montaba las 9 pestanas a la vez y se amontonaban; el
  // gating por rol y el overflow viven ahora en MobileTabBar. Mantenemos todas
  // las Tabs.Screen registradas para que las rutas existan (la barra decide que
  // mostrar y como navegar).
  return (
    <Tabs
      tabBar={(props) => <MobileTabBar state={props.state} navigation={props.navigation} />}
      screenOptions={{
        headerShown: false,
        // sceneStyle: fondo solido en el contenedor de escena de bottom-tabs. Sin
        // esto, una pantalla mas corta que el viewport dejaba ver la de detras.
        sceneStyle: { backgroundColor: '#f6f1ea' },
      } as any}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="mi-jornada" />
      <Tabs.Screen name="caja" />
      <Tabs.Screen name="presupuestos" />
      <Tabs.Screen name="clientes" />
      <Tabs.Screen name="resenas" />
      <Tabs.Screen name="equipo" />
      <Tabs.Screen name="informes" />
      <Tabs.Screen name="configuracion" />
      <Tabs.Screen name="lista-espera" />
    </Tabs>
  );
}
