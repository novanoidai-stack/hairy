import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { fontSize, fontWeight, radius, useTheme } from '@/lib/theme';
import { TText } from '@/components/ui/TText';
import type { Cita } from './AgendaView';
import { STATUS_META } from '@/lib/designTokens';

const ESTADO_COLORS: Record<Cita['estado'], string> = {
  confirmada: STATUS_META.confirmada.color,
  completada: STATUS_META.completada.color,
  cancelada: STATUS_META.cancelada.color,
  no_presentada: STATUS_META.no_show.color,
};

interface Props {
  cita: Cita;
  top: number;
  height: number;
  onPress: () => void;
}

export function AppointmentCard({ cita, top, height, onPress }: Props) {
  const { c } = useTheme();
  const bg = cita.color + '22';
  const border = cita.color;
  const estadoColor = ESTADO_COLORS[cita.estado];
  const compact = height < 48;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.card,
        {
          top,
          height,
          backgroundColor: bg,
          borderLeftColor: border,
        },
      ]}
      activeOpacity={0.8}
    >
      <View style={[s.estadoDot, { backgroundColor: estadoColor }]} />
      <TText style={[s.cliente, { color: border }]} numberOfLines={1}>
        {cita.clienteNombre}
      </TText>
      {!compact && (
        <TText style={[s.servicio, { color: c.textSecondary }]} numberOfLines={1}>
          {cita.servicioNombre}
        </TText>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    padding: 5,
    overflow: 'hidden',
  },
  estadoDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cliente: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  servicio: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
});
