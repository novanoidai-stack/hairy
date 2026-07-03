import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { TText } from '@/components/ui/TText';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS, STATUS_META } from '@/lib/designTokens';
import { pickLoadingTip, LOADER_STUCK_MESSAGE, LOADER_STUCK_TIMEOUT_MS } from '@/lib/loadingTips';

const tokens = DESIGN_TOKENS;

// ── Topbar with title and actions
export function Topbar({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.topbar}>
      <View>
        <TText style={s.topbarTitle}>{title}</TText>
        {subtitle && <TText style={s.topbarSubtitle}>{subtitle}</TText>}
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
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
      <TText style={[s.btnText, { color: v.text }]}>{children}</TText>
    </TouchableOpacity>
  );
}

// ── Pill badge
export function Pill({ children, color = tokens.primary }: { children: string; color?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: `${color}22`, borderColor: `${color}33` }]}>
      <TText style={[s.pillText, { color }]}>{children}</TText>
    </View>
  );
}

// ── Status badge
export function StatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <View style={[s.statusBadge, { backgroundColor: meta.soft, borderColor: meta.color }]}>
      <TText style={[s.statusBadgeText, { color: meta.color }]}>{meta.label}</TText>
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
      <TText style={s.emptyStateTitle}>{title}</TText>
      {subtitle && <TText style={s.emptyStateSubtitle}>{subtitle}</TText>}
    </View>
  );
}

// ── Stats card (for dashboard)
export function StatCard({ label, value, icon, color = tokens.primary }: { label: string; value: string | number; icon?: string; color?: string }) {
  return (
    <Card style={[s.statCard, { borderColor: color }]}>
      {icon && <Ionicons name={icon as any} size={20} color={color} />}
      <TText style={s.statValue}>{value}</TText>
      <TText style={s.statLabel}>{label}</TText>
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
        <TText style={s.rowLabel}>{label}</TText>
        {value && <TText style={s.rowValue}>{value}</TText>}
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

// ── Loader web (Spinner premium minimalista - estilo Mecha)
// Solo usar en archivos .web.tsx
export function PageLoader({ message = 'Cargando...', showTip = true }: { message?: string; showTip?: boolean }) {
  const tip = useMemo(() => pickLoadingTip(), []);
  const [footer, setFooter] = useState(tip);

  useEffect(() => {
    if (!showTip) return;
    const timer = setTimeout(() => setFooter(LOADER_STUCK_MESSAGE), LOADER_STUCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [showTip, tip]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: tokens.bg,
      color: tokens.text,
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
        <svg
          viewBox="0 0 80 80"
          width="80"
          height="80"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="spinnerGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={tokens.primary} />
              <stop offset="100%" stopColor="rgba(244,80,30,0.15)" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes mechaSpinner {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes mechaPulse {
              0%, 100% { transform: scale(0.88); opacity: 0.5; }
              50% { transform: scale(1.05); opacity: 0.95; }
            }
            .mecha-spinner-ring {
              transform-box: fill-box;
              transform-origin: center;
              animation: mechaSpinner 1s linear infinite;
            }
            .mecha-spinner-core {
              transform-box: fill-box;
              transform-origin: center;
              animation: mechaPulse 2.2s ease-in-out infinite;
            }
          `}</style>
          {/* Anillo exterior */}
          <circle className="mecha-spinner-ring" cx="40" cy="40" r="32" stroke="url(#spinnerGrad)" strokeWidth="4" strokeLinecap="round" strokeDasharray="140 60" fill="none" />
          {/* Núcleo central pulsante */}
          <circle className="mecha-spinner-core" cx="40" cy="40" r="16" fill={tokens.primary} style={{ filter: 'drop-shadow(0 0 10px rgba(244,80,30,0.4))' }} />
        </svg>
      </div>
      {message && (
        <p style={{ margin: 0, fontSize: 14, color: tokens.textSecondary, textAlign: 'center' }}>
          {message}
        </p>
      )}
      {showTip && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: tokens.textTertiary, textAlign: 'center', maxWidth: 320, lineHeight: 1.4 }}>
          {footer}
        </p>
      )}
    </div>
  );
}
