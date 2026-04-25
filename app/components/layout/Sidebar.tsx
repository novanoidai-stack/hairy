import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const tokens = DESIGN_TOKENS;

const NAV_ITEMS = [
  { label: 'Agenda', icon: 'calendar-outline', activeIcon: 'calendar', href: '/(tabs)' },
  { label: 'Clientes', icon: 'people-outline', activeIcon: 'people', href: '/(tabs)/clientes' },
  { label: 'Equipo', icon: 'person-outline', activeIcon: 'person', href: '/(tabs)/equipo' },
  { label: 'Informes', icon: 'bar-chart-outline', activeIcon: 'bar-chart', href: '/(tabs)/informes' },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const configActive = pathname.includes('/screens/configuracion');

  return (
    <View style={s.sidebar}>
      {/* Logo */}
      <View style={s.logoContainer}>
        <View style={s.logoBadge}>
          <Ionicons name="cut" size={16} color="#fff" />
        </View>
        <View>
          <Text style={s.logoText}>hairy</Text>
          <Text style={s.logoSubtext}>studio · pro</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={14} color={tokens.textTertiary} />
        <Text style={s.searchPlaceholder}>Buscar…</Text>
        <Text style={s.searchShortcut}>⌘K</Text>
      </View>

      {/* Navigation */}
      <View style={s.navSection}>
        <Text style={s.navSectionLabel}>PRINCIPAL</Text>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href === '/(tabs)' && pathname === '/');
          return (
            <TouchableOpacity
              key={item.href}
              style={[s.navItem, isActive && s.navItemActive]}
              onPress={() => router.push(item.href as any)}
            >
              {isActive && <View style={s.navItemBar} />}
              <Ionicons
                name={(isActive ? item.activeIcon : item.icon) as any}
                size={18}
                color={isActive ? tokens.primaryHi : tokens.textSecondary}
              />
              <Text style={[s.navLabel, isActive && s.navLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom section */}
      <View>
        <TouchableOpacity
          style={[s.navItem, configActive && s.navItemActive]}
          onPress={() => router.push('/screens/configuracion' as any)}
        >
          {configActive && <View style={s.navItemBar} />}
          <Ionicons
            name={configActive ? 'settings' : 'settings-outline'}
            size={18}
            color={configActive ? tokens.primaryHi : tokens.textSecondary}
          />
          <Text style={[s.navLabel, configActive && s.navLabelActive]}>
            Configuración
          </Text>
        </TouchableOpacity>

        {/* Account card */}
        <View style={s.accountCard}>
          <View style={s.accountAvatar}>
            <Text style={s.accountInitial}>RM</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.accountName}>Rosa Mendoza</Text>
            <Text style={s.accountRole}>Salón Bonita · Admin</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={tokens.textTertiary} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sidebar: {
    width: 240,
    height: '100%',
    backgroundColor: tokens.bgPanel,
    borderRightWidth: 1,
    borderRightColor: tokens.border,
    padding: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.lg,
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.xxl,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '700',
    color: tokens.text,
    letterSpacing: -0.5,
  },
  logoSubtext: {
    fontSize: 9,
    letterSpacing: 2,
    color: tokens.textTertiary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    backgroundColor: tokens.bgCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border,
    marginBottom: tokens.spacing.xl,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    color: tokens.textTertiary,
  },
  searchShortcut: {
    fontSize: 10,
    padding: 2,
    paddingHorizontal: tokens.spacing.xs,
    borderRadius: 4,
    backgroundColor: tokens.bg,
    borderWidth: 1,
    borderColor: tokens.border,
    color: tokens.textSecondary,
  },
  navSection: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  navSectionLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: tokens.textTertiary,
    textTransform: 'uppercase',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: tokens.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
  },
  navItemBar: {
    position: 'absolute',
    left: -tokens.spacing.lg,
    top: '50%',
    height: 18,
    width: 3,
    backgroundColor: tokens.primary,
    borderRadius: '0 3px 3px 0' as any,
    transform: [{ translateY: -9 }],
  },
  navLabel: {
    fontSize: tokens.fontSize.base,
    fontWeight: '500',
    color: tokens.textSecondary,
  },
  navLabelActive: {
    fontWeight: '600',
    color: tokens.text,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    backgroundColor: tokens.bgCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border,
    marginTop: tokens.spacing.lg,
  },
  accountAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: tokens.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInitial: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  accountName: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    color: tokens.text,
  },
  accountRole: {
    fontSize: tokens.fontSize.xs,
    color: tokens.textTertiary,
    marginTop: 2,
  },
});
