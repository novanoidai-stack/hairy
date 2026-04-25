import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS, STATUS_META } from '@/lib/designTokens';

const tokens = DESIGN_TOKENS;

// ── Topbar with title and actions
export function Topbar({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.topbar}>
      <View>
        <Text style={s.topbarTitle}>{title}</Text>
        {subtitle && <Text style={s.topbarSubtitle}>{subtitle}</Text>}
      </View>
      <View style={{ display: 'flex', flexDirection: 'row', gap: tokens.spacing.md }}>
        {right}
      </View>
    </View>
  );
}

// ── Button variants
export function Btn({
  children,
  variant = 'primary',
  onPress,
  icon,
  style,
  disabled,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: any;
  disabled?: boolean;
}) {
  const variants: any = {
    primary: {
      bg: tokens.primary,
      text: '#fff',
      border: `1px solid rgba(255,255,255,0.12)`,
    },
    ghost: {
      bg: tokens.bgCard,
      text: tokens.text,
      border: `1px solid ${tokens.border}`,
    },
    danger: {
      bg: 'transparent',
      text: tokens.danger,
      border: `1px solid ${tokens.danger}55`,
    },
  };
  const v = variants[variant];
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: v.bg, borderColor: v.border }, disabled && { opacity: 0.5 }, style]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon}
      <Text style={[s.btnText, { color: v.text }]}>{children}</Text>
    </TouchableOpacity>
  );
}

// ── Pill badge
export function Pill({ children, color = tokens.primary }: { children: string; color?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: `${color}22`, borderColor: `${color}33` }]}>
      <Text style={[s.pillText, { color }]}>{children}</Text>
    </View>
  );
}

// ── Status badge
export function StatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <View style={[s.statusBadge, { backgroundColor: meta.soft, borderColor: meta.color }]}>
      <Text style={[s.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

// ── Card container
export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[s.card, style]}>{children}</View>;
}

// ── Input field
export function Input({
  placeholder,
  value,
  onChangeText,
  icon,
  style,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  icon?: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[s.inputWrapper, style]}>
      {icon}
      <TextInput
        style={s.input}
        placeholder={placeholder}
        placeholderTextColor={tokens.textTertiary}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

// ── Loading indicator
export function Loading() {
  return (
    <View style={s.center}>
      <ActivityIndicator color={tokens.primary} size="large" />
    </View>
  );
}

// ── Empty state
export function EmptyState({ icon, title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <View style={s.emptyState}>
      {icon && <Ionicons name={icon as any} size={48} color={tokens.textTertiary} style={{ marginBottom: tokens.spacing.md }} />}
      <Text style={s.emptyStateTitle}>{title}</Text>
      {subtitle && <Text style={s.emptyStateSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Stats card (for dashboard)
export function StatCard({ label, value, icon, color = tokens.primary }: { label: string; value: string | number; icon?: string; color?: string }) {
  return (
    <Card style={[s.statCard, { borderColor: color }]}>
      {icon && <Ionicons name={icon as any} size={20} color={color} />}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

// ── Row item (for lists)
export function RowItem({
  label,
  value,
  icon,
  onPress,
  rightContent,
}: {
  label: string;
  value?: string;
  icon?: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
}) {
  const content = (
    <View style={s.rowItem}>
      {icon && <Ionicons name={icon as any} size={18} color={tokens.textSecondary} />}
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {value && <Text style={s.rowValue}>{value}</Text>}
      </View>
      {rightContent}
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  }
  return content;
}

const s = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: tokens.spacing.xxl,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border,
    backgroundColor: tokens.bg,
  },
  topbarTitle: {
    fontSize: tokens.fontSize.xxxl,
    fontWeight: '700',
    color: tokens.text,
    marginBottom: tokens.spacing.xs,
  },
  topbarSubtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.textSecondary,
    marginTop: tokens.spacing.xs,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
  },
  btnText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
  },
  pillText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
  },
  card: {
    backgroundColor: tokens.bgCard,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    backgroundColor: tokens.bgCard,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  input: {
    flex: 1,
    color: tokens.text,
    fontSize: tokens.fontSize.base,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.xxl,
    gap: tokens.spacing.md,
  },
  emptyStateTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
    color: tokens.text,
  },
  emptyStateSubtitle: {
    fontSize: tokens.fontSize.base,
    color: tokens.textSecondary,
    textAlign: 'center',
  },
  statCard: {
    flex: 1,
    gap: tokens.spacing.sm,
    borderLeftWidth: 3,
    justifyContent: 'center',
  },
  statValue: {
    fontSize: tokens.fontSize.xxl,
    fontWeight: '700',
    color: tokens.text,
  },
  statLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.textTertiary,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    backgroundColor: tokens.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border,
  },
  rowLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.textSecondary,
  },
  rowValue: {
    fontSize: tokens.fontSize.base,
    fontWeight: '600',
    color: tokens.text,
    marginTop: tokens.spacing.xs,
  },
});
