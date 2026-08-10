import { View, TouchableOpacity, StyleSheet, Animated, Platform, ScrollView } from 'react-native';
import { TText } from '@/components/ui/TText';
import { MechaMark } from '@/components/ui/MechaMark';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { getUserProfile, can, roleOf, roleLabel, type UserProfile, type Capability } from '@/lib/auth';
import { IS_DEMO_MODE } from '@/lib/supabase';
import { useAppLang } from '@/lib/hooks/useAppLang';
import { incluyePlan, type FuncionPlan } from '@/lib/planes';
import {
  identidadActiva,
  soltarIdentidad,
  suscribirIdentidad,
  type IdentidadActiva,
} from '@/lib/identidadActiva';

const tokens = DESIGN_TOKENS;

const WORDMARK_FONT = Platform.select({
  web: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif",
  default: undefined,
}) as string | undefined;

// Color distintivo por sector: tinta iconos, etiquetas de seccion y estado activo
// para que cada bloque de navegacion se reconozca de un vistazo (tambien plegado).
const GROUP_META: Record<string, { color: string }> = {
  'Operativa': { color: '#f4501e' },
  'CRM & Marketing': { color: '#e11d6b' },
  'Gestión': { color: '#0891b2' },
  'Análisis': { color: '#8b5cf6' },
  'General': { color: '#f4501e' },
};

// `plan`: funcion del plan que hace falta para ver la seccion. El `cap` es el
// permiso del ROL; son dos filtros distintos y hay que pasar los dos.
const NAV_ITEMS: { label: string; labelKey: string; icon: string; activeIcon: string; href: string; cap?: Capability; plan?: FuncionPlan; group?: string }[] = [
  { label: 'Agenda', labelKey: 'nav_agenda', icon: 'calendar-outline', activeIcon: 'calendar', href: '/(tabs)', group: 'Operativa' },
  { label: 'Mi jornada', labelKey: 'nav_mi_jornada', icon: 'person-circle-outline', activeIcon: 'person-circle', href: '/(tabs)/mi-jornada', group: 'Operativa' },
  { label: 'Lista de espera', labelKey: 'nav_lista_espera', icon: 'time-outline', activeIcon: 'time', href: '/(tabs)/lista-espera', cap: 'agenda.ver_todas', plan: 'lista_espera', group: 'Operativa' },
  { label: 'Citas', labelKey: 'nav_citas', icon: 'calendar-number-outline', activeIcon: 'calendar-number', href: '/(tabs)/citas', cap: 'agenda.ver_todas', group: 'Operativa' },
  
  { label: 'Clientes', labelKey: 'nav_clientes', icon: 'people-outline', activeIcon: 'people', href: '/(tabs)/clientes', cap: 'clientes.ver', group: 'CRM & Marketing' },
  { label: 'Bandeja', labelKey: 'nav_bandeja', icon: 'mail-outline', activeIcon: 'mail', href: '/(tabs)/bandeja', group: 'CRM & Marketing' },
  { label: 'Campañas', labelKey: 'nav_campanas', icon: 'megaphone-outline', activeIcon: 'megaphone', href: '/(tabs)/campanas', cap: 'informes.ver', plan: 'campanas', group: 'CRM & Marketing' },
  
  { label: 'Caja', labelKey: 'nav_caja', icon: 'wallet-outline', activeIcon: 'wallet', href: '/(tabs)/caja', cap: 'config.ver', group: 'Gestión' },
  { label: 'Presupuestos', labelKey: 'nav_presupuestos', icon: 'document-text-outline', activeIcon: 'document-text', href: '/(tabs)/presupuestos', group: 'Gestión' },
  { label: 'Equipo', labelKey: 'nav_equipo', icon: 'person-outline', activeIcon: 'person', href: '/(tabs)/equipo', cap: 'equipo.ver', group: 'Gestión' },
  { label: 'Inventario', labelKey: 'nav_inventario', icon: 'cube-outline', activeIcon: 'cube', href: '/(tabs)/inventario', group: 'Gestión' },
  { label: 'Reseñas', labelKey: 'nav_resenas', icon: 'star-outline', activeIcon: 'star', href: '/(tabs)/resenas', group: 'Análisis' },
  { label: 'Informes', labelKey: 'nav_informes', icon: 'bar-chart-outline', activeIcon: 'bar-chart', href: '/(tabs)/informes', cap: 'informes.ver', group: 'Análisis' },
  { label: 'Ayuda & Manuales', labelKey: 'nav_ayuda', icon: 'help-buoy-outline', activeIcon: 'help-buoy', href: '/(tabs)/ayuda', group: 'Análisis' },
];

const HOVER_DURATION = 200;

const getRoleTheme = (profile: UserProfile | null | undefined) => {
  const role = roleOf(profile);
  switch (role) {
    case 'propietario':
      return {
        accent: '#f4501e', // Naranja/Fuego de Propietario
        accentGlow: 'rgba(244,80,30,0.08)',
        badgeBg: 'rgba(244,80,30,0.12)',
        badgeText: '#f4501e',
        label: 'Propietario',
      };
    case 'direccion':
      return {
        accent: '#8b5cf6', // Violeta de Dirección
        accentGlow: 'rgba(139,92,246,0.08)',
        badgeBg: 'rgba(139,92,246,0.12)',
        badgeText: '#8b5cf6',
        label: 'Dirección',
      };
    case 'recepcion':
      return {
        accent: '#0284c7', // Azul/Cielo de Recepción
        accentGlow: 'rgba(2,132,199,0.08)',
        badgeBg: 'rgba(2,132,199,0.12)',
        badgeText: '#0284c7',
        label: 'Recepción',
      };
    case 'profesional':
    default:
      return {
        accent: '#0d9488', // Teal de Profesional
        accentGlow: 'rgba(13,148,136,0.08)',
        badgeBg: 'rgba(13,148,136,0.12)',
        badgeText: '#0d9488',
        label: 'Profesional',
      };
  }
};

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useAppLang();
  const configActive = pathname.includes('configuracion');

  // Sin desplegar por defecto (rail de iconos); la eleccion del usuario persiste.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('mecha-sidebar-collapsed');
        if (saved != null) return saved === '1';
      } catch {}
    }
    return true;
  });
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try { window.localStorage.setItem('mecha-sidebar-collapsed', next ? '1' : '0'); } catch {}
      }
      return next;
    });
  };
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const roleTheme = getRoleTheme(profile);

  // Gating por rol (Modular 3, sec 7). Defensivo: mientras carga (undefined) o
  // sin sesion (null) se muestra todo; con una cuenta real se aplican las
  // capacidades del rol. Las pantallas bloquean ademas con setAccessDenied.
  useEffect(() => {
    getUserProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  // Quien esta usando el dispositivo (solo en salones con un solo correo).
  // Al cambiar de persona hay que releer el perfil: su rol decide el menu.
  const [identidad, setIdentidad] = useState<IdentidadActiva | null>(identidadActiva());
  useEffect(() => suscribirIdentidad((i) => {
    setIdentidad(i);
    getUserProfile().then(setProfile).catch(() => {});
  }), []);
  const allows = (cap?: Capability) =>
    !cap || profile === undefined || profile === null || can(profile, cap);
  // Filtro por PLAN contratado. La demo compartida lo enseña todo (es el
  // escaparate) y mientras el perfil carga no se esconde nada, para que el menu
  // no baile al entrar.
  const entraEnPlan = (fn?: FuncionPlan) =>
    !fn || IS_DEMO_MODE || profile === undefined || profile === null || incluyePlan(profile, fn);

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
    const entrada = Animated.stagger(
      60,
      navAnimations.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          // JS driver: con el driver nativo, en web el valor puede quedarse a 0
          // y los iconos se quedan invisibles y 20px a la izquierda.
          useNativeDriver: false,
        })
      )
    );
    entrada.start();
    // Salvavidas: si la animacion no llega a correr (pestana en segundo plano,
    // requestAnimationFrame pausado) los iconos se quedarian con opacidad 0 y
    // desplazados. setTimeout si dispara en segundo plano, asi que fijamos el
    // estado final pasado un tiempo prudencial.
    const finFallback = setTimeout(() => {
      navAnimations.forEach((anim) => anim.setValue(1));
    }, 1500);
    return () => {
      clearTimeout(finFallback);
      entrada.stop();
    };
  }, []);

  const hoverIn = (anim: Animated.Value) => {
    Animated.timing(anim, { toValue: 1, duration: HOVER_DURATION, useNativeDriver: true }).start();
  };
  const hoverOut = (anim: Animated.Value) => {
    Animated.timing(anim, { toValue: 0, duration: HOVER_DURATION, useNativeDriver: true }).start();
  };

  const webTitle = (label: string) => (collapsed ? ({ title: label } as any) : {});

  // Cuenta real (la que tiene sesion), no un placeholder. En un salon con
  // acceso compartido manda quien se ha identificado en este dispositivo: la
  // cuenta es la del jefe, pero delante de la tablet esta Marta.
  const fullName = identidad?.nombre
    || [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim();
  const accountName = fullName || 'Mi cuenta';
  const salonName = (profile?.nombre_negocio || '').trim();
  const roleText = profile ? roleLabel(profile) : '';
  const accountSubtitle = [salonName, roleText].filter(Boolean).join(' · ');
  const accountInitials = fullName
    ? fullName.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '';
  const accountTitle = identidad
    ? `${accountName} · ${accountSubtitle} — pulsa para cambiar de persona`
    : accountSubtitle ? `${accountName} · ${accountSubtitle} — pulsa para ir a tu cuenta` : accountName;

  const renderNavItem = (item: typeof NAV_ITEMS[0], idx: number) => {
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

    const isPrincipal = idx < 4;
    // Acento del item = color de su sector (no del rol): asi Operativa, CRM,
    // Gestion y Analisis se distinguen aun con el rail plegado.
    const gColor = (GROUP_META[item.group || 'General'] || GROUP_META.General).color;
    const gSoft = `${gColor}14`;
    const gBorder = `${gColor}3d`;

    return (
      <Animated.View
        key={item.href}
        style={{ opacity: entryAnim, transform: [{ translateX: combinedX }] }}
      >
        <TouchableOpacity
          style={[
            s.navItem,
            collapsed && s.navItemCollapsed,
            isActive && s.navItemActive,
            isActive && { backgroundColor: gSoft, borderColor: gBorder },
            !isActive && hoveredIdx === idx && s.navItemHovered,
            isPrincipal && !collapsed && s.navItemPrincipal,
            isPrincipal && !collapsed && isActive && { backgroundColor: gSoft, borderColor: gBorder },
          ]}
          onPress={() => router.replace(item.href as any)}
          {...{
            onMouseEnter: (e: any) => {
              hoverIn(hoverAnim); setHoveredIdx(idx);
              setTip({ x: e?.clientX ?? 0, y: e?.clientY ?? 0, label: t(item.labelKey) || item.label });
            },
            onMouseMove: (e: any) => {
              const x = e?.clientX, y = e?.clientY;
              setTip((prev) => (prev ? { ...prev, x: x ?? prev.x, y: y ?? prev.y } : prev));
            },
            onMouseLeave: () => { hoverOut(hoverAnim); setHoveredIdx(null); setTip(null); },
            // Ancla para el coach intra-pagina (S16): data-coach="nav-<slug>".
            dataSet: { coach: `nav-${item.href === '/(tabs)' ? 'agenda' : hrefSlug}` },
            ...webTitle(t(item.labelKey) || item.label)
          } as any}
        >
          {isActive && !collapsed && <View style={[s.navItemBar, { backgroundColor: gColor }]} />}
          <Ionicons
            name={(isActive ? item.activeIcon : item.icon) as any}
            size={collapsed ? 24 : 20}
            color={isActive ? gColor : `${gColor}b3`}
          />
          {!collapsed && (
            <TText style={[
              s.navLabel,
              isActive && s.navLabelActive,
              isActive && { color: gColor },
              isPrincipal && s.navLabelPrincipal,
            ]}>
              {t(item.labelKey) || item.label}
            </TText>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    // El hueco reserva SOLO el ancho del rail; la barra va flotando encima,
    // asi al desplegarse con el raton no empuja el contenido de la pagina.
    <View style={[s.sidebar, collapsed && s.sidebarCollapsed]}>
      <View style={[s.logoContainer, collapsed && s.logoContainerCollapsed]}>
        <TouchableOpacity
          style={s.brand}
          onPress={() => router.replace('/(tabs)' as any)}
          activeOpacity={0.8}
          {...webTitle('Mecha — Inicio')}
        >
          <MechaMark size={collapsed ? 38 : 32} />
          {!collapsed && (
            <View style={{ flexDirection: 'column', gap: 2 }}>
              <View style={s.brandRow}>
                <TText style={s.logoText}>Mecha</TText>
                <View style={s.brandTag}><TText style={s.brandTagText}>OS</TText></View>
              </View>
              {profile !== undefined && profile !== null && (
                <View style={{
                  backgroundColor: roleTheme.badgeBg,
                  borderRadius: 4,
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  alignSelf: 'flex-start',
                  marginTop: 1,
                  borderWidth: 1,
                  borderColor: roleTheme.accentGlow,
                }}>
                  <TText style={{
                    fontSize: 9.5,
                    fontWeight: '700',
                    color: roleTheme.badgeText,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>{roleTheme.label}</TText>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.collapseBtnFull, collapsed && s.collapseBtnCollapsed]}
          onPress={toggleCollapsed}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          {...({
            title: collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral',
            dataSet: { coach: 'sidebar-toggle' },
          } as any)}
        >
          {/* Chevron de TEXTO a proposito, no un icono de fuente: con la fuente de
              iconos este boton salia VACIO en produccion (se pintaba antes de que
              cargara y no volvia a pintarse), y es justo el boton que despliega el
              menu. Con texto siempre se ve. */}
          <TText style={s.collapseChevron}>{collapsed ? '›' : '‹'}</TText>
        </TouchableOpacity>
      </View>
      {/* Navigation Scroll Container */}
      <ScrollView
        style={s.navScroll}
        contentContainerStyle={s.navScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Dynamic Groups Rendering */}
        {(() => {
          const groups = NAV_ITEMS.reduce((acc, item, index) => {
            const groupName = item.group || 'General';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push({ item, index });
            return acc;
          }, {} as Record<string, { item: typeof NAV_ITEMS[0]; index: number }[]>);

          return Object.entries(groups).map(([groupName, items], groupIndex) => {
            const gColor = (GROUP_META[groupName] || GROUP_META.General).color;
            return (
            <View key={groupName} style={collapsed ? { marginBottom: 12 } : {}}>
              {groupIndex > 0 && <View style={[s.navDivider, collapsed && { width: 24, alignSelf: 'center', marginVertical: 8, backgroundColor: `${gColor}2e` }]} />}
              {!collapsed && (
                <TText style={[s.navSectionLabel, groupIndex > 0 && { marginTop: tokens.spacing.xs }, { color: gColor, opacity: 0.85 }]}>
                  {groupName}
                </TText>
              )}
              <View style={s.navGroupContainer}>
                {items.map(({ item, index }) => {
                  if (!allows(item.cap) || !entraEnPlan(item.plan)) return null;
                  return renderNavItem(item, index);
                })}
              </View>
            </View>
            );
          });
        })()}
      </ScrollView>

      {/* Bottom section */}
      <View>
        {(allows('config.ver') || roleOf(profile) === 'profesional') && (
        <Animated.View
          style={{
            transform: [
              { translateX: configHoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0, collapsed ? 0 : 4] }) },
            ],
          }}
        >
          <TouchableOpacity
            style={[
              s.navItem,
              collapsed && s.navItemCollapsed,
              configActive && s.navItemActive,
              configActive && { backgroundColor: roleTheme.accentGlow, borderColor: roleTheme.accentGlow },
              !configActive && configHovered && s.navItemHovered
            ]}
            onPress={() => router.replace('/(tabs)/configuracion' as any)}
            {...{ onMouseEnter: () => { hoverIn(configHoverAnim); setConfigHovered(true); }, onMouseLeave: () => { hoverOut(configHoverAnim); setConfigHovered(false); }, ...webTitle(t('nav_configuracion')) } as any}
          >
            {configActive && !collapsed && <View style={[s.navItemBar, { backgroundColor: roleTheme.accent }]} />}
            <Ionicons
              name={configActive ? 'settings' : 'settings-outline'}
              size={collapsed ? 20 : 18}
              color={configActive ? roleTheme.accent : tokens.textSecondary}
            />
            {!collapsed && (
              <TText style={[s.navLabel, configActive && s.navLabelActive, configActive && { color: roleTheme.accent }]}>
                {t('nav_configuracion')}
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
            // Con acceso compartido, suelta la identidad y vuelve a sacar la
            // puerta de "¿Quien eres?" para que entre el siguiente. Sin acceso
            // compartido, lleva a la propia cuenta en Configuracion.
            onPress={identidad
              ? () => { soltarIdentidad(); }
              : () => { router.push({ pathname: '/(tabs)/configuracion', params: { tab: 'cuenta' } } as any); }}
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
            <View style={[s.accountAvatar, { backgroundColor: roleTheme.accent }]}>
              <TText style={s.accountInitial}>{accountInitials}</TText>
            </View>
            {!collapsed && (
              <>
                <View style={{ flex: 1 }}>
                  <TText style={s.accountName} numberOfLines={1}>{accountName}</TText>
                  {accountSubtitle ? <TText style={s.accountRole} numberOfLines={1}>{accountSubtitle}</TText> : null}
                </View>
                <Ionicons
                  name={identidad ? 'swap-horizontal' : 'chevron-forward'}
                  size={14}
                  color={tokens.textTertiary}
                />
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Etiqueta flotante con el nombre de la seccion. position fixed para que
          no la recorte ni el scroll de la navegacion ni el propio rail. */}
      {tip && (
        <View
          pointerEvents="none"
          style={[s.navTip, { left: tip.x + 16, top: tip.y + 12 }] as any}
        >
          <TText style={s.navTipText} numberOfLines={1}>{tip.label}</TText>
        </View>
      )}
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
    // overflow visible: el rail ya no anima su ancho, y si recorta se come la
    // etiqueta flotante que sale al pasar el raton por los iconos.
    overflow: 'visible',
    // zIndex: sin el, el contenido de la pagina (hermano posterior) se pinta
    // encima y tapa la etiqueta flotante en cuanto sale del rail.
    zIndex: 100,
  },
  sidebarCollapsed: {
    width: 76,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
  },
  // Etiqueta flotante del rail (nombre de la seccion al pasar el raton)
  navTip: {
    position: 'fixed' as any,
    zIndex: 9999,
    backgroundColor: '#2b2320',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    boxShadow: '0 6px 18px rgba(40,30,24,0.28)' as any,
  },
  navTipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    whiteSpace: 'nowrap' as any,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.lg,
  },
  // Plegado: logo arriba y boton de expandir debajo, bien visible (antes el
  // chevron quedaba pegado al logo y costaba encontrarlo/pincharlo).
  logoContainerCollapsed: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
    transform: [],
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
    width: 30,
    height: 30,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgCardHi,
    borderWidth: 1,
    borderColor: tokens.border,
    cursor: 'pointer' as any,
    flexShrink: 0,
  },
  collapseBtnCollapsed: {
    width: 36,
    height: 30,
    borderColor: tokens.borderHi,
  },
  collapseChevron: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
    color: tokens.textSecondary,
    marginTop: -2,
  },
  navScroll: {
    flex: 1,
    marginVertical: tokens.spacing.xs,
  },
  navScrollContent: {
    paddingBottom: tokens.spacing.lg,
  },
  navGroupContainer: {
    gap: tokens.spacing.xs,
  },
  navSectionLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: tokens.textTertiary,
    textTransform: 'uppercase',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
  },
  navDivider: {
    height: 1,
    backgroundColor: tokens.border,
    marginVertical: tokens.spacing.md,
    marginHorizontal: tokens.spacing.md,
  },
  navItemPrincipal: {
    backgroundColor: 'rgba(251, 246, 240, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(40, 30, 24, 0.03)',
  },
  navItemPrincipalActive: {
    backgroundColor: tokens.primarySoft,
    borderColor: 'rgba(244,80,30,0.3)',
  },
  navLabelPrincipal: {
    fontWeight: '600',
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
