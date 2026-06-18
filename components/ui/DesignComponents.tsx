import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { TText } from '@/components/ui/TText';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS, STATUS_META } from '@/lib/designTokens';

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

// ── Loader web (fuego prendiendo - estilo Mecha)
// Solo usar en archivos .web.tsx
export function PageLoader({ message = 'Cargando...' }: { message?: string }) {
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
          viewBox="0 0 100 116"
          width="100"
          height="116"
          style={{ overflow: 'visible', filter: 'drop-shadow(0 0 18px rgba(244,80,30,0.45))' }}
        >
          <defs>
            <radialGradient id="igEmber" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffd24a" />
              <stop offset="42%" stopColor="#ff7a2e" />
              <stop offset="100%" stopColor="rgba(224,52,14,0)" />
            </radialGradient>
            <linearGradient id="igFlame" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#c0260a" />
              <stop offset="0.45" stopColor="#ff5a1e" />
              <stop offset="1" stopColor="#ffcf4a" />
            </linearGradient>
            <linearGradient id="igCore" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#ff8a3d" />
              <stop offset="1" stopColor="#fff3c4" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes igDance {
              0%, 100% { transform: scaleY(1) scaleX(1) rotate(0deg); }
              20% { transform: scaleY(1.16) scaleX(0.9) rotate(-2.5deg); }
              45% { transform: scaleY(0.8) scaleX(1.09) rotate(1.5deg); }
              70% { transform: scaleY(1.08) scaleX(0.95) rotate(2.5deg); }
            }
            @keyframes igHalo {
              0%, 100% { opacity: 0.42; transform: scale(0.9); }
              50% { opacity: 0.85; transform: scale(1.08); }
            }
            @keyframes igCoals {
              0%, 100% { opacity: 0.78; }
              50% { opacity: 1; }
            }
            .ig-halo { transform-box: fill-box; transform-origin: center; animation: igHalo 2.4s ease-in-out infinite; }
            .ig-flame { transform-box: fill-box; transform-origin: bottom center; will-change: transform; }
            .ig-flame.f1 { animation: igDance 0.95s ease-in-out infinite; }
            .ig-flame.f2 { animation: igDance 0.7s ease-in-out infinite; animation-delay: -0.2s; }
            .ig-flame.f3 { animation: igDance 1.35s ease-in-out infinite; animation-delay: -0.5s; opacity: 0.82; }
            .ig-coals { transform-box: fill-box; transform-origin: center; animation: igCoals 1.8s ease-in-out infinite; }
          `}</style>
          <circle className="ig-halo" cx="50" cy="74" r="44" fill="url(#igEmber)" />
          <g>
            <path className="ig-flame f3" d="M50 96 C 33 80 39 58 50 38 C 61 58 67 80 50 96 Z" fill="url(#igFlame)" />
            <path className="ig-flame f1" d="M50 98 C 39 84 43 64 50 48 C 57 64 61 84 50 98 Z" fill="url(#igFlame)" />
            <path className="ig-flame f2" d="M50 99 C 43 88 45 74 50 62 C 55 74 57 88 50 99 Z" fill="url(#igCore)" />
          </g>
          <g className="ig-coals">
            <ellipse cx="50" cy="100" rx="22" ry="6.5" fill="url(#igEmber)" />
            <circle cx="41" cy="101" r="4" fill="#ff6619" />
            <circle cx="52" cy="103" r="5" fill="#ff7a2e" />
            <circle cx="61" cy="101" r="3.5" fill="#e0340e" />
          </g>
        </svg>
      </div>
      {message && (
        <p style={{ margin: 0, fontSize: 14, color: tokens.textSecondary, textAlign: 'center' }}>
          {message}
        </p>
      )}
    </div>
  );
}
