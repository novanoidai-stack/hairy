import { View, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { TText } from '@/components/ui/TText';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { getUserProfile, can, roleOf, roleLabel, type UserProfile, type Capability } from '@/lib/auth';
import { IS_DEMO_MODE } from '@/lib/supabase';
import { useAppLang } from '@/lib/hooks/useAppLang';

const tokens = DESIGN_TOKENS;

type NavItem = {
  name: string;        // nombre de la ruta en el Tabs navigator (= nombre de archivo)
  label: string;       // label resuelto en runtime via i18n
  labelKey: string;    // clave i18n
  icon: string;        // Ionicons (se le anade "-outline" cuando esta inactivo)
  route: string;       // ruta expo-router para router.navigate
  cap?: Capability;    // capacidad requerida (gating por rol)
  managerOnly?: boolean;
};

// Destinos PRIMARIOS (siempre visibles en la barra). Maximo 4 + el boton "Mas".
const PRIMARY: NavItem[] = [
  { name: 'index', label: 'Agenda', labelKey: 'nav_agenda', icon: 'calendar', route: '/(tabs)' },
  { name: 'caja', label: 'Caja', labelKey: 'nav_caja', icon: 'wallet', route: '/(tabs)/caja', managerOnly: true },
  { name: 'lista-espera', label: 'Lista de espera', labelKey: 'nav_lista_espera', icon: 'time', route: '/(tabs)/lista-espera' },
  { name: 'clientes', label: 'Clientes', labelKey: 'nav_clientes', icon: 'people', route: '/(tabs)/clientes', cap: 'clientes.ver' },
];

// Destinos SECUNDARIOS (viven en la hoja "Mas").
const MORE: NavItem[] = [
  { name: 'mi-jornada', label: 'Mi jornada', labelKey: 'nav_mi_jornada', icon: 'person-circle', route: '/(tabs)/mi-jornada' },
  { name: 'presupuestos', label: 'Presupuestos', labelKey: 'nav_presupuestos', icon: 'document-text', route: '/(tabs)/presupuestos' },
  { name: 'bandeja', label: 'Bandeja', labelKey: 'nav_bandeja', icon: 'mail', route: '/(tabs)/bandeja' },
  { name: 'resenas', label: 'Reseñas', labelKey: 'nav_resenas', icon: 'star', route: '/(tabs)/resenas' },
  { name: 'equipo', label: 'Equipo', labelKey: 'nav_equipo', icon: 'person', route: '/(tabs)/equipo', cap: 'equipo.ver' },
  { name: 'inventario', label: 'Inventario', labelKey: 'nav_inventario', icon: 'cube', route: '/(tabs)/inventario' },
  { name: 'informes', label: 'Informes', labelKey: 'nav_informes', icon: 'bar-chart', route: '/(tabs)/informes', cap: 'informes.ver' },
  { name: 'configuracion', label: 'Ajustes', labelKey: 'nav_configuracion', icon: 'settings', route: '/(tabs)/configuracion', cap: 'config.ver' },
];

// Padding inferior respetando la zona segura del notch en web; valor fijo en nativo.
const SAFE_BOTTOM = Platform.OS === 'web'
  ? ('calc(8px + env(safe-area-inset-bottom, 0px))' as any)
  : 8;

type TabBarProps = {
  // Props del custom tabBar de react-navigation (las tipamos en laxo para no
  // depender del paquete @react-navigation directamente).
  state?: any;
  navigation?: any;
};

export function MobileTabBar({ state }: TabBarProps) {
  const router = useRouter();
  const { t } = useAppLang();
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);

  // Gating por rol (mismo criterio que el Sidebar de escritorio). Defensivo:
  // mientras carga (undefined) o sin sesion (null) se muestra todo.
  useEffect(() => {
    getUserProfile().then(setProfile).catch(() => setProfile(null));
  }, []);
  const allows = (item: NavItem) => {
    if (item.managerOnly) {
      return profile === undefined || profile === null
        || profile.role === 'owner' || profile.role === 'admin';
    }
    if (item.name === 'configuracion' && roleOf(profile) === 'profesional') return true;
    return !item.cap || profile === undefined || profile === null || can(profile, item.cap);
  };

  const primaryItems = PRIMARY.filter(allows);
  const moreItems = MORE.filter(allows);

  const currentName: string = state?.routes?.[state.index]?.name ?? 'index';
  const moreNames = new Set(MORE.map((m) => m.name));
  const moreActive = moreNames.has(currentName);

  // Navegamos por el router de expo-router (router.push), el mismo camino que ya
  // usan el Sidebar de escritorio y el puente del tour (mecha-nav). No usamos el
  // navigation.navigate del navegador react-navigation porque actualiza ruta y
  // pestana activa pero deja la escena anterior pintada encima. Evitamos
  // re-navegar si ya estamos en la ruta.
  const go = (item: NavItem) => {
    if (currentName === item.name) return;
    router.push(item.route as any);
  };

  const fullName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim();
  const accountName = fullName || 'Mi cuenta';
  const salonName = (profile?.nombre_negocio || '').trim();
  const roleText = profile ? roleLabel(profile) : '';
  const accountSubtitle = [salonName, roleText].filter(Boolean).join(' · ');
  const accountInitials = fullName
    ? fullName.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '';

  const exitToWeb = () => {
    setMoreOpen(false);
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try { (window.top || window).location.href = '/'; }
    catch (e) { window.location.href = '/'; }
  };

  const renderTab = (item: NavItem) => {
    const active = currentName === item.name;
    const color = active ? tokens.primary : tokens.textTertiary;
    return (
      <TouchableOpacity
        key={item.name}
        style={s.tab}
        onPress={() => go(item)}
        activeOpacity={0.7}
        {...({ accessibilityRole: 'button', accessibilityLabel: t(item.labelKey) || item.label } as any)}
      >
        <Ionicons name={(active ? item.icon : `${item.icon}-outline`) as any} size={23} color={color} />
        <TText style={[s.tabLabel, { color }]} numberOfLines={1}>{t(item.labelKey) || item.label}</TText>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={s.bar}>
        {primaryItems.map(renderTab)}
        {/* Boton "Mas": abre la hoja con el resto de secciones */}
        <TouchableOpacity
          style={s.tab}
          onPress={() => setMoreOpen(true)}
          activeOpacity={0.7}
          {...({ accessibilityRole: 'button', accessibilityLabel: 'Más opciones' } as any)}
        >
          <Ionicons
            name={(moreActive || moreOpen ? 'menu' : 'menu-outline') as any}
            size={23}
            color={moreActive || moreOpen ? tokens.primary : tokens.textTertiary}
          />
          <TText style={[s.tabLabel, { color: moreActive || moreOpen ? tokens.primary : tokens.textTertiary }]} numberOfLines={1}>
            {t('nav_mas')}
          </TText>
        </TouchableOpacity>
      </View>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setMoreOpen(false)} />
        <View style={s.sheet}>
          <View style={s.grabber} />

          {/* Cuenta */}
          <View style={s.accountRow}>
            <View style={s.accountAvatar}>
              <TText style={s.accountInitial}>{accountInitials || ''}</TText>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TText style={s.accountName} numberOfLines={1}>{accountName}</TText>
              {accountSubtitle ? <TText style={s.accountRole} numberOfLines={1}>{accountSubtitle}</TText> : null}
            </View>
          </View>

          <TText style={s.sheetLabel}>SECCIONES</TText>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {moreItems.map((item) => {
              const active = currentName === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[s.row, active && s.rowActive]}
                  onPress={() => { setMoreOpen(false); go(item); }}
                  activeOpacity={0.7}
                >
                  <View style={[s.rowIcon, active && s.rowIconActive]}>
                    <Ionicons
                      name={(active ? item.icon : `${item.icon}-outline`) as any}
                      size={20}
                      color={active ? tokens.primary : tokens.textSecondary}
                    />
                  </View>
                  <TText style={[s.rowLabel, active && s.rowLabelActive]} numberOfLines={1}>{t(item.labelKey) || item.label}</TText>
                  <Ionicons name="chevron-forward" size={18} color={tokens.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!IS_DEMO_MODE && (
            <TouchableOpacity style={s.exitRow} onPress={exitToWeb} activeOpacity={0.7}>
              <Ionicons name="arrow-back-outline" size={18} color={tokens.textSecondary} />
              <TText style={s.exitLabel}>Volver al sitio web</TText>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: tokens.bgPanel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderHi,
    paddingTop: 7,
    paddingBottom: SAFE_BOTTOM,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
    minHeight: 44,
  },
  tabLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginTop: 1,
    width: '100%',
    textAlign: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,6,4,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.bgPanel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 10,
    paddingBottom: (Platform.OS === 'web'
      ? ('calc(18px + env(safe-area-inset-bottom, 0px))' as any)
      : 18),
    borderTopWidth: 1,
    borderTopColor: tokens.borderHi,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 -16px 50px rgba(0,0,0,0.22)' as any }
      : { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 } }),
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: tokens.borderHiHi,
    marginBottom: 14,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: 2,
    marginBottom: tokens.spacing.sm,
  },
  accountAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: tokens.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInitial: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  accountName: {
    fontSize: tokens.fontSize.base,
    fontWeight: '700',
    color: tokens.text,
  },
  accountRole: {
    fontSize: tokens.fontSize.xs,
    color: tokens.textTertiary,
    marginTop: 2,
  },
  sheetLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: tokens.textTertiary,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.lg,
  },
  rowActive: {
    backgroundColor: tokens.primarySoft,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.lg,
    backgroundColor: 'rgba(40,30,24,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconActive: {
    backgroundColor: 'rgba(244,80,30,0.14)',
  },
  rowLabel: {
    flex: 1,
    fontSize: tokens.fontSize.base,
    fontWeight: '600',
    color: tokens.text,
  },
  rowLabelActive: {
    color: tokens.primaryHi,
    fontWeight: '700',
  },
  exitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: 2,
    marginTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.border,
  },
  exitLabel: {
    fontSize: tokens.fontSize.base,
    fontWeight: '500',
    color: tokens.textSecondary,
  },
} as any);
