import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { fontSize, fontWeight, radius, useTheme } from '@/lib/theme';
import { TText } from '@/components/ui/TText';
import type { Cita } from './AgendaView';
import { bloqueDeCita } from '@/lib/agendaBloqueUi';

// Misma ley que la agenda web (lib/agendaBloqueUi.ts): el color del bloque lo
// decide SOLO el estado. Aqui no hay animacion (el sistema de motion es de
// web); el nativo se queda con el mapa de color, que es lo que tiene que
// coincidir para que las dos plataformas cuenten lo mismo.
//
// Antes esta tarjeta pintaba el fondo y el borde izquierdo con el color del
// servicio, el borde superior con ese mismo color otra vez, y encima metia un
// punto de estado y dos insignias en la misma esquina: cuatro senales, tres
// colores y ni una jerarquia.

interface Props {
  cita: Cita;
  top: number;
  height: number;
  onPress: () => void;
}

export function AppointmentCard({ cita, top, height, onPress }: Props) {
  const { c } = useTheme();
  const bloque = bloqueDeCita(cita, Date.now());
  const compact = height < 48;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.card,
        {
          top,
          height,
          backgroundColor: bloque.fondo,
          borderColor: bloque.borde,
          borderLeftColor: bloque.acento ?? bloque.borde,
          borderLeftWidth: bloque.acento ? 3 : 1,
          opacity: bloque.atenuado ? 0.5 : 1,
        },
      ]}
      activeOpacity={0.8}
    >
      <TText
        style={[
          s.cliente,
          {
            color: c.text,
            textDecorationLine: bloque.tachado ? 'line-through' : 'none',
          },
        ]}
        numberOfLines={1}
      >
        {cita.clienteNombre}
      </TText>
      {!compact && (
        <TText style={[s.servicio, { color: c.textSecondary }]} numberOfLines={1}>
          {cita.servicioNombre}
        </TText>
      )}
      {/* Una sola marca de estado, abajo, y solo si dice algo: una cita que va
          segun lo previsto no lleva chip. */}
      {!compact && !!bloque.label && !!bloque.chipBg && (
        <View style={[s.chip, { backgroundColor: bloque.chipBg }]}>
          <TText style={[s.chipTexto, { color: bloque.acentoTexto ?? c.textSecondary }]}>
            {bloque.label}
          </TText>
        </View>
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
    borderWidth: 1,
    padding: 6,
    overflow: 'hidden',
  },
  cliente: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  servicio: {
    fontSize: 10,
    marginTop: 2,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipTexto: {
    fontSize: 9.5,
    fontWeight: '700',
  },
});
