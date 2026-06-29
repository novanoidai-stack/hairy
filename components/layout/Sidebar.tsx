import { View, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { TText } from '@/components/ui/TText';
import { MechaMark } from '@/components/ui/MechaMark';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { getUserProfile, can, roleLabel, type UserProfile, type Capability } from '@/lib/auth';
import { IS_DEMO_MODE } from '@/lib/supabase';

const tokens = DESIGN_TOKENS;

const COLLAPSE_KEY = '@mecha:sidebar';

const WORDMARK_FONT = Platform.select({
  web: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif",
  default: undefined,
}) as string | undefined;

const NAV_ITEMS: { label: string; icon: string; activeIcon: string; href: string; cap?: Capability }[] = [
  { label: 'Agenda', icon: 'calendar-outline', activeIcon: 'calendar', href: '/(tabs)' },
  { label: 'Mi jornada', icon: 'person-circle-outline', activeIcon: 'person-circle', href: '/(tabs)/mi-jornada' },
  { label: 'Caja', icon: 'wallet-outline', activeIcon: 'wallet', href: '/(tabs)/caja', cap: 'config.ver' },
  { label: 'Presupuestos', icon: 'document-text-outline', activeIcon: 'document-text', href: '/(tabs)/presupuestos' },
  { label: 'Lista de espera', icon: 'time-outline', activeIcon: 'time', href: '/(tabs)/lista-espera', cap: 'agenda.ver_todas' },
  { label: 'Clientes', icon: 'people-outline', activeIcon: 'people', href: '/(tabs)/clientes', cap: 'clientes.ver' },
  { label: 'Reseñas', icon: 'star-outline', activeIcon: 'star', href: '/(tabs)/resenas' },
  { label: 'Equipo', icon: 'person-outline', activeIcon: 'person', href: '/(tabs)/equipo', cap: 'equipo.ver' },
  { label: 'Informes', icon: 'bar-chart-outline', activeIcon: 'bar-chart', href: '/(tabs)/informes', cap: 'informes.ver' },
];

const HOVER_DURATION = 200;

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const configActive = pathname.includes('configuracion');

  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);

  // Gating por rol (Modular 3, sec 7). Defensivo: mientras carga (undefined) o
  // sin sesion (null) se muestra todo; con una cuenta real se aplican las
  // capacidades del rol. Las pantallas bloquean ademas con setAccessDenied.
  useEffect(() => {
    getUserProfile().then(setProfile).catch(() => setProfile(null));
  }, []);
  const allows = (cap?: Capability) =>
    !cap || profile === undefined || profile === null || can(profile, cap);

  useEffect(() => {
    AsyncStorage.getItem(COLLAPSE_KEY)
      .then(v => { if (v === '1') setCollapsed(true); })
      .catch(() => {});
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      AsyncStorage.setItem(COLLAPSE_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  };

  // Salir del software de vuelta a la web publica, sin cerrar sesion.
  const exitToWeb = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      (window.top || window).location.href = '/';
    } catch (e) {
      window.location.href = '/';
    }
  };
  const [exitHovered, setExitHovered] = useState(false);

  const navAnimations = useRef(NAV_ITEMS.map(() => new Animated.Value(0))).current;
  const navHoverAnims = useRef(NAV_ITEMS.map(() => new Animated.Value(0))).current;
  const configHoverAnim = useRef(new Animated.Value(0)).current;
  const accountScaleAnim = useRef(new Animated.Value(1)).current;
  const [accountHovered, setAccountHovered] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [configHovered, setConfigHovered] = useState(false);

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

  const hoverIn = (anim: Animated.Value) => {
    Animated.timing(anim, { toValue: 1, duration: HOVER_DURATION, useNativeDriver: true }).start();
  };
  const hoverOut = (anim: Animated.Value) => {
    Animated.timing(anim, { toValue: 0, duration: HOVER_DURATION, useNativeDriver: true }).start();
  };

  const webTitle = (label: string) => (collapsed ? ({ title: label } as any) : {});

  // Cuenta real (la que tiene sesion), no un placeholder.
  const fullName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim();
  const accountName = fullName || 'Mi cuenta';
  const salonName = (profile?.nombre_negocio || '').trim();
  const roleText = profile ? roleLabel(profile) : '';
  const accountSubtitle = [salonName, roleText].filter(Boolean).join(' · ');
  const accountInitials = fullName
    ? fullName.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '';
  const accountTitle = accountSubtitle ? `${accountName} · ${accountSubtitle}` : accountName;

  return (
    <View style={[s.sidebar, collapsed && s.sidebarCollapsed]}>
      {/* Logo + toggle */}
      <View style={[s.logoContainer, collapsed && s.logoContainerCollapsed]}>
        <TouchableOpacity
          style={s.brand}
          onPress={() => router.push('/(tabs)' as any)}
          activeOpacity={0.8}
          {...webTitle('Mecha — Inicio')}
        >
          <MechaMark size={collapsed ? 30 : 32} />
          {!collapsed && (
            <View style={s.brandRow}>
              <TText style={s.logoText}>Mecha</TText>
              <View style={s.brandTag}><TText style={s.brandTagText}>OS</TText></View>
            </View>
          )}
        </TouchableOpacity>
        {!collapsed && (
          <TouchableOpacity style={s.collapseBtn} onPress={toggleCollapsed} {...({ title: 'Contraer menú' } as any)}>
            <Ionicons name="chevron-back" size={16} color={tokens.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {collapsed && (
        <TouchableOpacity style={s.collapseBtnFull} onPress={toggleCollapsed} {...({ title: 'Expandir menú' } as any)}>
          <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
        </TouchableOpacity>
      )}


      {/* Navigation */}
      <View style={s.navSection}>
        {!collapsed && <TText style={s.navSectionLabel}>PRINCIPAL</TText>}
        {NAV_ITEMS.map((item, idx) => {
          if (!allows(item.cap)) return null;
          const hrefSlug = item.href.split('/').pop() || '';
          const isActive =
            pathname === item.href ||
            pathname.endsWith(item.label.toLowerCase()) ||
            (item.href !== '/(tabs)' && !!hrefSlug && pathname.endsWith(hrefSlug)) ||
            (item.href === '/(tabs)' && (pathname === '/' || pathname === '/(tabs)'));

          const entryAnim = navAnimations[idx];
          const hoverAnim = navHoverAnims[idx];
          const combinedX = Animated.add(
            entryAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }),
            hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0, collapsed ? 0 : 4] })
          );

          return (
            <Animated.View
              key={item.href}
              style={{ opacity: entryAnim, transform: [{ translateX: combinedX }] }}
            >
              <TouchableOpacity
                style={[s.navItem, collapsed && s.navItemCollapsed, isActive && s.navItemActive, !isActive && hoveredIdx === idx && s.navItemHovered]}
                onPress={() => router.push(item.href as any)}
                {...{ onMouseEnter: () => { hoverIn(hoverAnim); setHoveredIdx(idx); }, onMouseLeave: () => { hoverOut(hoverAnim); setHoveredIdx(null); }, ...webTitle(item.label) } as any}
              >
                {isActive && !collapsed && <View style={s.navItemBar} />}
                <Ionicons
                  name={(isActive ? item.activeIcon : item.icon) as any}
                  size={collapsed ? 20 : 18}
                  color={isActive ? tokens.primary : tokens.textSecondary}
                />
                {!collapsed && (
                  <TText style={[s.navLabel, isActive && s.navLabelActive]}>
                    {item.label}
                  </TText>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* Bottom section */}
      <View>
        {allows('config.ver') && (
        <Animated.View
          style={{
            transform: [
              { translateX: configHoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0, collapsed ? 0 : 4] }) },
            ],
          }}
        >
          <TouchableOpacity
            style={[s.navItem, collapsed && s.navItemCollapsed, configActive && s.navItemActive, !configActive && configHovered && s.navItemHovered]}
            onPress={() => router.push('/(tabs)/configuracion' as any)}
            {...{ onMouseEnter: () => { hoverIn(configHoverAnim); setConfigHovered(true); }, onMouseLeave: () => { hoverOut(configHoverAnim); setConfigHovered(false); }, ...webTitle('Configuración') } as any}
          >
            {configActive && !collapsed && <View style={s.navItemBar} />}
            <Ionicons
              name={configActive ? 'settings' : 'settings-outline'}
              size={collapsed ? 20 : 18}
              color={configActive ? tokens.primary : tokens.textSecondary}
            />
            {!collapsed && (
              <TText style={[s.navLabel, configActive && s.navLabelActive]}>
                Configuración
              </TText>
            )}
          </TouchableOpacity>
        </Animated.View>
        )}

        {/* Volver al sitio web (salir del software sin cerrar sesion) */}
        {!IS_DEMO_MODE && (
          <TouchableOpacity
            style={[s.navItem, collapsed && s.navItemCollapsed, exitHovered && s.navItemHovered]}
            onPress={exitToWeb}
            {...{ onMouseEnter: () => setExitHovered(true), onMouseLeave: () => setExitHovered(false), ...webTitle('Volver al sitio web') } as any}
          >
            <Ionicons name="arrow-back-outline" size={collapsed ? 20 : 18} color={tokens.textSecondary} />
            {!collapsed && <TText style={s.navLabel}>Volver al sitio web</TText>}
          </TouchableOpacity>
        )}

        {/* Account card */}
        <Animated.View style={{ transform: [{ scale: accountScaleAnim }] }}>
          <TouchableOpacity
            style={[s.accountCard, collapsed && s.accountCardCollapsed, accountHovered && s.accountCardHovered]}
            {...{
              onMouseEnter: () => {
                setAccountHovered(true);
                Animated.timing(accountScaleAnim, { toValue: 1.02, duration: HOVER_DURATION, useNativeDriver: true }).start();
              },
              onMouseLeave: () => {
                setAccountHovered(false);
                Animated.timing(accountScaleAnim, { toValue: 1, duration: HOVER_DURATION, useNativeDriver: true }).start();
              },
              ...webTitle(accountTitle)
            } as any}
          >
            <View style={s.accountAvatar}>
              <TText style={s.accountInitial}>{accountInitials}</TText>
            </View>
            {!collapsed && (
              <>
                <View style={{ flex: 1 }}>
                  <TText style={s.accountName} numberOfLines={1}>{accountName}</TText>
                  {accountSubtitle ? <TText style={s.accountRole} numberOfLines={1}>{accountSubtitle}</TText> : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={tokens.textTertiary} />
              </>
            )}
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
    transition: 'width 0.2s ease' as any,
    ...Platform.select({
      web: {
        overflowY: 'auto',
        overflowX: 'hidden',
      },
      default: {},
    }),
  },
  sidebarCollapsed: {
    width: 76,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.xxl,
  },
  logoContainerCollapsed: {
    justifyContent: 'center',
    marginBottom: tokens.spacing.lg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTag: {
    borderWidth: 1,
    borderColor: tokens.borderHi,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  brandTagText: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: tokens.textTertiary,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  logoText: {
    fontFamily: WORDMARK_FONT,
    fontSize: 23,
    fontWeight: '800',
    color: tokens.text,
    letterSpacing: -0.9,
  },
  collapseBtn: {
    width: 26,
    height: 26,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgCardHi,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  collapseBtnFull: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgCardHi,
    borderWidth: 1,
    borderColor: tokens.border,
    marginBottom: tokens.spacing.md,
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
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    width: 44,
    height: 44,
    gap: 0,
  },
  navItemActive: {
    backgroundColor: tokens.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(244,80,30,0.28)',
  },
  navItemHovered: {
    backgroundColor: 'rgba(40,30,24,0.05)',
  },
  navItemBar: {
    position: 'absolute',
    left: -tokens.spacing.lg,
    top: '50%',
    height: 18,
    width: 3,
    backgroundColor: tokens.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
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
  accountCardCollapsed: {
    justifyContent: 'center',
    padding: tokens.spacing.sm,
  },
  accountCardHovered: {
    borderColor: 'rgba(244,80,30,0.32)',
    backgroundColor: 'rgba(244,80,30,0.06)',
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
} as any);
