import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { TText } from '@/components/ui/TText';
import { useEffect, useRef, useState } from 'react';
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

const HOVER_DURATION = 200;

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const configActive = pathname.includes('configuracion');

  const navAnimations = useRef(NAV_ITEMS.map(() => new Animated.Value(0))).current;
  const navHoverAnims = useRef(NAV_ITEMS.map(() => new Animated.Value(0))).current;
  const configHoverAnim = useRef(new Animated.Value(0)).current;
  const accountScaleAnim = useRef(new Animated.Value(1)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;
  const [accountHovered, setAccountHovered] = useState(false);

  useEffect(() => {
    Animated.stagger(
      60,
      navAnimations.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        })
      )
    ).start();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const hoverIn = (anim: Animated.Value) => {
    Animated.timing(anim, { toValue: 1, duration: HOVER_DURATION, useNativeDriver: true }).start();
  };

  const hoverOut = (anim: Animated.Value) => {
    Animated.timing(anim, { toValue: 0, duration: HOVER_DURATION, useNativeDriver: true }).start();
  };

  return (
    <View style={s.sidebar}>
      {/* Logo */}
      <View style={s.logoContainer}>
        <Animated.View style={[s.logoBadge, { transform: [{ scale: badgePulse }] }]}>
          <Ionicons name="cut" size={16} color="#fff" />
        </Animated.View>
        <View>
          <TText style={s.logoText}>hairy</TText>
          <TText style={s.logoSubtext}>studio · pro</TText>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={14} color={tokens.textTertiary} />
        <TText style={s.searchPlaceholder}>Buscar…</TText>
        <TText style={s.searchShortcut}>⌘K</TText>
      </View>

      {/* Navigation */}
      <View style={s.navSection}>
        <TText style={s.navSectionLabel}>PRINCIPAL</TText>
        {NAV_ITEMS.map((item, idx) => {
          const isActive =
            pathname === item.href ||
            pathname.endsWith(item.label.toLowerCase()) ||
            (item.href === '/(tabs)' && (pathname === '/' || pathname === '/(tabs)'));

          const entryAnim = navAnimations[idx];
          const hoverAnim = navHoverAnims[idx];
          const combinedX = Animated.add(
            entryAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }),
            hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] })
          );

          return (
            <Animated.View
              key={item.href}
              style={{ opacity: entryAnim, transform: [{ translateX: combinedX }] }}
            >
              <TouchableOpacity
                style={[s.navItem, isActive && s.navItemActive]}
                onPress={() => router.push(item.href as any)}
                onMouseEnter={() => hoverIn(hoverAnim)}
                onMouseLeave={() => hoverOut(hoverAnim)}
              >
                {isActive && <View style={s.navItemBar} />}
                <Ionicons
                  name={(isActive ? item.activeIcon : item.icon) as any}
                  size={18}
                  color={isActive ? tokens.primaryHi : tokens.textSecondary}
                />
                <TText style={[s.navLabel, isActive && s.navLabelActive]}>
                  {item.label}
                </TText>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* Bottom section */}
      <View>
        <Animated.View
          style={{
            transform: [
              { translateX: configHoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) },
            ],
          }}
        >
          <TouchableOpacity
            style={[s.navItem, configActive && s.navItemActive]}
            onPress={() => router.push('/(tabs)/configuracion' as any)}
            onMouseEnter={() => hoverIn(configHoverAnim)}
            onMouseLeave={() => hoverOut(configHoverAnim)}
          >
            {configActive && <View style={s.navItemBar} />}
            <Ionicons
              name={configActive ? 'settings' : 'settings-outline'}
              size={18}
              color={configActive ? tokens.primaryHi : tokens.textSecondary}
            />
            <TText style={[s.navLabel, configActive && s.navLabelActive]}>
              Configuración
            </TText>
          </TouchableOpacity>
        </Animated.View>

        {/* Account card */}
        <Animated.View style={{ transform: [{ scale: accountScaleAnim }] }}>
          <TouchableOpacity
            style={[s.accountCard, accountHovered && s.accountCardHovered]}
            onMouseEnter={() => {
              setAccountHovered(true);
              Animated.timing(accountScaleAnim, { toValue: 1.02, duration: HOVER_DURATION, useNativeDriver: true }).start();
            }}
            onMouseLeave={() => {
              setAccountHovered(false);
              Animated.timing(accountScaleAnim, { toValue: 1, duration: HOVER_DURATION, useNativeDriver: true }).start();
            }}
          >
            <View style={s.accountAvatar}>
              <TText style={s.accountInitial}>RM</TText>
            </View>
            <View style={{ flex: 1 }}>
              <TText style={s.accountName}>Rosa Mendoza</TText>
              <TText style={s.accountRole}>Salón Bonita · Admin</TText>
            </View>
            <Ionicons name="chevron-forward" size={14} color={tokens.textTertiary} />
          </TouchableOpacity>
        </Animated.View>
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
    transition: 'background-color 0.2s ease, border-color 0.2s ease' as any,
  },
  accountCardHovered: {
    borderColor: 'rgba(99,102,241,0.3)',
    backgroundColor: 'rgba(99,102,241,0.05)',
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
