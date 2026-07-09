import { View, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TText } from '@/components/ui/TText';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import type { AvisosData } from '@/lib/hooks/useAvisos';

const tokens = DESIGN_TOKENS;
const LOCALE = 'es-ES';

interface Props {
  visible: boolean;
  onClose: () => void;
  avisos: AvisosData;
}

// Hoja inferior de avisos para movil/tablet (RN puro: sirve en web y nativo).
// Cada aviso navega a la pantalla donde se resuelve.
export function AvisosSheet({ visible, onClose, avisos }: Props) {
  const router = useRouter();

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const sevColor = (sev: string): { fg: string; bg: string } => {
    if (sev === 'urgente') return { fg: tokens.danger, bg: tokens.dangerSoft };
    if (sev === 'alta') return { fg: '#fb923c', bg: 'rgba(251,146,60,0.14)' };
    if (sev === 'media') return { fg: tokens.cyan, bg: tokens.cyanSoft };
    return { fg: tokens.textTertiary, bg: tokens.bgCardHi };
  };

  const rutaHallazgo = (tipo: string, payload?: Record<string, unknown>): string => {
    const destino = (payload?.destino as string) || '';
    const mapa: Record<string, string> = {
      agenda: '/(tabs)/', bandeja: '/(tabs)/bandeja', presupuestos: '/(tabs)/presupuestos',
      inventario: '/(tabs)/inventario', clientes: '/(tabs)/clientes',
    };
    if (destino && mapa[destino]) return mapa[destino];
    if (tipo === 'presupuesto_sin_respuesta') return '/(tabs)/presupuestos';
    if (tipo === 'stock_bajo') return '/(tabs)/inventario';
    return '/(tabs)/';
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.headerRow}>
          <TText style={s.title}>Avisos</TText>
          {avisos.total > 0 && (
            <View style={[s.badge, { backgroundColor: avisos.sinConfirmar.length > 0 ? tokens.dangerSoft : 'rgba(251,146,60,0.14)' }]}>
              <TText style={[s.badgeText, { color: avisos.sinConfirmar.length > 0 ? tokens.danger : '#fb923c' }]}>{avisos.total}</TText>
            </View>
          )}
        </View>

        {avisos.total === 0 ? (
          <TText style={s.empty}>{avisos.loading ? 'Cargando...' : 'No hay avisos pendientes'}</TText>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {avisos.sinConfirmar.length > 0 && (
              <>
                <TText style={s.sectionLabel}>SIN CONFIRMAR (PROXIMAS 48H)</TText>
                {avisos.sinConfirmar.slice(0, 8).map((c) => {
                  const ini = new Date(c.inicio);
                  return (
                    <TouchableOpacity key={c.id} style={s.item} activeOpacity={0.7} onPress={() => go(`/(tabs)/?cita=${c.id}`)}>
                      <View style={[s.itemIcon, { backgroundColor: tokens.dangerSoft }]}>
                        <Ionicons name="alert-circle-outline" size={18} color={tokens.danger} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TText style={s.itemTitle} numberOfLines={1}>{c.clienteNombre}</TText>
                        <TText style={s.itemSub}>{ini.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })} · {ini.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</TText>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {avisos.mensajesSinLeer > 0 && (
              <>
                <TText style={s.sectionLabel}>MENSAJES</TText>
                <TouchableOpacity style={s.item} activeOpacity={0.7} onPress={() => go('/(tabs)/bandeja')}>
                  <View style={[s.itemIcon, { backgroundColor: tokens.primarySoft }]}>
                    <Ionicons name="mail-outline" size={18} color={tokens.primary} />
                  </View>
                  <TText style={[s.itemTitle, { flex: 1 }]}>{avisos.mensajesSinLeer} {avisos.mensajesSinLeer === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}</TText>
                  <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
                </TouchableOpacity>
              </>
            )}

            {avisos.clientesFuga > 0 && (
              <>
                <TText style={s.sectionLabel}>CLIENTAS</TText>
                <TouchableOpacity style={s.item} activeOpacity={0.7} onPress={() => go('/(tabs)/clientes?filtro=fuga')}>
                  <View style={[s.itemIcon, { backgroundColor: tokens.cyanSoft }]}>
                    <Ionicons name="warning-outline" size={18} color={tokens.cyan} />
                  </View>
                  <TText style={[s.itemTitle, { flex: 1 }]}>{avisos.clientesFuga} {avisos.clientesFuga === 1 ? 'clienta en riesgo de fuga' : 'clientas en riesgo de fuga'}</TText>
                  <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
                </TouchableOpacity>
              </>
            )}

            {avisos.hallazgos.length > 0 && (
              <>
                <TText style={s.sectionLabel}>CHISPA ESTA VIGILANDO</TText>
                {avisos.hallazgos.map((h) => {
                  const c = sevColor(h.severidad);
                  const cnt = h.datos?.count ?? 0;
                  return (
                    <View key={h.id} style={s.hallazgoRow}>
                      <TouchableOpacity
                        style={[s.item, { flex: 1, marginBottom: 0, borderLeftWidth: 3, borderLeftColor: c.fg }]}
                        activeOpacity={0.7}
                        onPress={() => go(rutaHallazgo(h.tipo, h.accion_sugerida?.payload as Record<string, unknown>))}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TText style={[s.itemTitle, { flexShrink: 1 }]} numberOfLines={1}>{h.resumen}</TText>
                            {h.severidad === 'urgente' && (
                              <View style={[s.urgBadge, { backgroundColor: c.bg }]}>
                                <TText style={[s.urgBadgeText, { color: c.fg }]}>URGENTE</TText>
                              </View>
                            )}
                          </View>
                          <TText style={s.itemSub}>{cnt > 0 ? `${cnt} ${cnt === 1 ? 'caso' : 'casos'}` : h.detalle}</TText>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.hallazgoBtn} activeOpacity={0.7} onPress={() => { void avisos.resolverHallazgo(h.id, 'resuelto'); }}>
                        <Ionicons name="checkmark" size={18} color={tokens.success} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.hallazgoBtn} activeOpacity={0.7} onPress={() => { void avisos.resolverHallazgo(h.id, 'descartado'); }}>
                        <Ionicons name="close" size={18} color={tokens.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}

            {avisos.cumples.length > 0 && (
              <>
                <TText style={s.sectionLabel}>CUMPLEANOS (PROXIMOS 7 DIAS)</TText>
                {avisos.cumples.map((b) => {
                  const cuando = b.diff === 0 ? 'Hoy' : b.diff === 1 ? 'Manana' : `En ${b.diff} dias`;
                  return (
                    <TouchableOpacity key={b.clienteId} style={s.item} activeOpacity={0.7} onPress={() => go(`/(tabs)/clientes?clienteId=${b.clienteId}`)}>
                      <View style={[s.itemIcon, { backgroundColor: 'rgba(251,146,60,0.14)' }]}>
                        <Ionicons name="gift-outline" size={18} color="#fb923c" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TText style={s.itemTitle} numberOfLines={1}>{b.nombre}</TText>
                        <TText style={[s.itemSub, { color: '#fb923c' }]}>{cuando} · {b.fecha.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}</TText>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(8,6,4,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: tokens.bgPanel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: tokens.borderHi,
  },
  grabber: {
    alignSelf: 'center',
    width: 38, height: 4,
    borderRadius: 999,
    backgroundColor: tokens.borderHiHi,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: tokens.text,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  empty: {
    fontSize: tokens.fontSize.sm,
    color: tokens.textTertiary,
    textAlign: 'center',
    paddingVertical: 24,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: tokens.textTertiary,
    fontWeight: '700',
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.border,
    marginBottom: 6,
  },
  itemIcon: {
    width: 34, height: 34,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    color: tokens.text,
  },
  itemSub: {
    fontSize: tokens.fontSize.xs,
    color: tokens.textSecondary,
    marginTop: 1,
  },
  hallazgoRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    marginBottom: 6,
  },
  hallazgoBtn: {
    width: 40,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  urgBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
} as any);
