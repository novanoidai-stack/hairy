import { useState } from 'react';
import { View, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TText } from '@/components/ui/TText';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import type { AvisosData } from '@/lib/hooks/useAvisos';
import {
  CATEGORIA_META, CATEGORIA_ORDEN, urgenciaColor, tiempoRelativo,
  type AvisoCategoria, type AvisoItem,
} from '@/lib/avisosCategorias';

const tokens = DESIGN_TOKENS;

interface Props {
  visible: boolean;
  onClose: () => void;
  avisos: AvisosData;
}

// Hoja inferior de avisos para movil/tablet (RN puro: sirve en web y nativo).
// Misma estructura que la campana web: CATEGORIAS + urgencia por fila + vista
// "Todos" ordenada. Cada aviso navega a la pantalla donde se resuelve.
export function AvisosSheet({ visible, onClose, avisos }: Props) {
  const router = useRouter();
  const [cat, setCat] = useState<'todos' | AvisoCategoria>('todos');
  const items = avisos.items;

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const hayUrgente = items.some((i) => i.urgencia === 'urgente' || i.urgencia === 'alta');
  const categoriasPresentes = CATEGORIA_ORDEN.filter((c) => items.some((i) => i.categoria === c));
  const conteo = (c: AvisoCategoria) => items.filter((i) => i.categoria === c).length;
  const visibles = cat === 'todos' ? items : items.filter((i) => i.categoria === cat);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.headerRow}>
          <TText style={s.title}>Avisos</TText>
          {avisos.total > 0 && (
            <View style={[s.badge, { backgroundColor: hayUrgente ? tokens.dangerSoft : 'rgba(251,146,60,0.14)' }]}>
              <TText style={[s.badgeText, { color: hayUrgente ? tokens.danger : '#fb923c' }]}>{avisos.total}</TText>
            </View>
          )}
        </View>

        {items.length === 0 ? (
          <TText style={s.empty}>{avisos.loading ? 'Cargando...' : 'No hay avisos pendientes'}</TText>
        ) : (
          <>
            {/* Chips de categoria (scroll horizontal): "Todos" + solo las que tienen avisos. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
              <Chip label="Todos" count={items.length} active={cat === 'todos'} onPress={() => setCat('todos')} />
              {categoriasPresentes.map((c) => (
                <Chip key={c} label={CATEGORIA_META[c].label} count={conteo(c)} active={cat === c} onPress={() => setCat(c)} />
              ))}
            </ScrollView>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {visibles.map((it) => (
                <FilaAviso
                  key={it.id}
                  item={it}
                  onOpen={() => go(it.ruta)}
                  onResolver={it.hallazgoId ? () => { void avisos.resolverHallazgo(it.hallazgoId!, 'resuelto'); } : undefined}
                  onDescartar={it.hallazgoId ? () => { void avisos.resolverHallazgo(it.hallazgoId!, 'descartado'); } : undefined}
                />
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

function Chip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[s.chip, active && s.chipActive]}>
      <TText style={[s.chipText, active && s.chipTextActive]}>{label}</TText>
      <TText style={[s.chipCount, active && s.chipTextActive]}>{count}</TText>
    </TouchableOpacity>
  );
}

function FilaAviso({ item, onOpen, onResolver, onDescartar }: {
  item: AvisoItem;
  onOpen: () => void;
  onResolver?: () => void;
  onDescartar?: () => void;
}) {
  const u = urgenciaColor(item.urgencia);
  const meta = CATEGORIA_META[item.categoria];
  const cuando = tiempoRelativo(item.ts);
  const mostrarBadge = item.urgencia === 'urgente' || item.urgencia === 'alta';
  return (
    <View style={s.filaRow}>
      <TouchableOpacity style={[s.item, { flex: 1, borderLeftWidth: 3, borderLeftColor: u.fg }]} activeOpacity={0.7} onPress={onOpen}>
        <View style={[s.itemIcon, { backgroundColor: `${meta.tint}14` }]}>
          <Ionicons name={meta.ionicon as never} size={17} color={meta.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TText style={[s.itemTitle, { flexShrink: 1 }]} numberOfLines={1}>{item.titulo}</TText>
            {mostrarBadge && (
              <View style={[s.urgBadge, { backgroundColor: u.bg }]}>
                <TText style={[s.urgBadgeText, { color: u.fg }]}>{u.label.toUpperCase()}</TText>
              </View>
            )}
          </View>
          <TText style={s.itemSub} numberOfLines={1}>{(item.meta || item.subtitulo || meta.label)} · {cuando}</TText>
        </View>
      </TouchableOpacity>
      {onResolver && (
        <TouchableOpacity style={s.filaBtn} activeOpacity={0.7} onPress={onResolver}>
          <Ionicons name="checkmark" size={18} color={tokens.success} />
        </TouchableOpacity>
      )}
      {onDescartar && (
        <TouchableOpacity style={s.filaBtn} activeOpacity={0.7} onPress={onDescartar}>
          <Ionicons name="close" size={18} color={tokens.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
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
    marginBottom: tokens.spacing.sm,
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
  chipsRow: {
    flexGrow: 0,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  chipActive: {
    backgroundColor: tokens.primarySoft,
    borderColor: 'rgba(244,80,30,0.35)',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: tokens.textSecondary,
  },
  chipCount: {
    fontSize: 10.5,
    fontWeight: '800',
    color: tokens.textTertiary,
  },
  chipTextActive: {
    color: tokens.primaryHi,
  },
  filaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    marginBottom: 6,
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
  filaBtn: {
    width: 40,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
} as any);
