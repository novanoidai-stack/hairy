import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';

const NAV_ITEMS = [
  { label: 'Agenda', icon: 'calendar-outline', activeIcon: 'calendar', href: '/(tabs)' },
  { label: 'Clientes', icon: 'people-outline', activeIcon: 'people', href: '/(tabs)/clientes' },
  { label: 'Equipo', icon: 'person-outline', activeIcon: 'person', href: '/(tabs)/equipo' },
  { label: 'Informes', icon: 'bar-chart-outline', activeIcon: 'bar-chart', href: '/(tabs)/informes' },
];

export function Sidebar() {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const configActive = pathname.includes('/screens/configuracion');

  return (
    <View style={[s.sidebar, { backgroundColor: c.surface, borderRightColor: c.border }]}>
      <View style={s.logo}>
        <Text style={[s.logoText, { color: c.text }]}>hairy</Text>
      </View>

      <View style={s.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href === '/(tabs)' && pathname === '/');
          return (
            <TouchableOpacity
              key={item.href}
              style={[s.navItem, isActive && { backgroundColor: isDark ? '#1e1b4b' : '#eef2ff' }]}
              onPress={() => router.push(item.href as any)}
            >
              <Ionicons
                name={(isActive ? item.activeIcon : item.icon) as any}
                size={20}
                color={isActive ? '#6366f1' : c.textSecondary}
              />
              <Text style={[s.navLabel, { color: isActive ? '#6366f1' : c.textSecondary }, isActive && { fontWeight: fontWeight.semibold }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[s.bottomNav, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[s.navItem, configActive && { backgroundColor: isDark ? '#1e1b4b' : '#eef2ff' }]}
          onPress={() => router.push('/screens/configuracion' as any)}
        >
          <Ionicons
            name={configActive ? 'settings' : 'settings-outline'}
            size={20}
            color={configActive ? '#6366f1' : c.textSecondary}
          />
          <Text style={[s.navLabel, { color: configActive ? '#6366f1' : c.textSecondary }, configActive && { fontWeight: fontWeight.semibold }]}>
            Configuración
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sidebar: {
    width: 220,
    height: '100%',
    borderRightWidth: 1,
    paddingVertical: spacing.lg,
    justifyContent: 'space-between',
  },
  logo: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  logoText: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, letterSpacing: -0.5 },
  nav: { flex: 1, paddingHorizontal: spacing.sm, gap: spacing.xs },
  bottomNav: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  navLabel: { fontSize: fontSize.md },
});
