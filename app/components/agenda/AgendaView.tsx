import { useRef, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { TText } from '@/components/ui/TText';
import { AppointmentCard } from './AppointmentCard';
import { format, addDays, subDays, isToday } from 'date-fns';
import { es } from 'date-fns/locale';

const HOUR_HEIGHT = 64;
const TIME_COL_WIDTH = 52;
const COL_WIDTH = 160;
const START_HOUR = 8;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

export interface Cita {
  id: string;
  clienteNombre: string;
  servicioNombre: string;
  inicio: Date;
  fin: Date;
  color: string;
  estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';
}

export interface Profesional {
  id: string;
  nombre: string;
  color: string;
  citas: Cita[];
}

interface Props {
  profesionales: Profesional[];
  onCitaPress: (cita: Cita) => void;
  onNuevaCita: (profesionalId: string, hora: Date) => void;
  fecha: Date;
  onFechaChange: (fecha: Date) => void;
}

export function AgendaView({ profesionales, onCitaPress, onNuevaCita, fecha, onFechaChange }: Props) {
  const { c, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const horaAPixel = (hora: Date) => {
    const h = hora.getHours() + hora.getMinutes() / 60;
    return (h - START_HOUR) * HOUR_HEIGHT;
  };

  const duracionAPixel = (inicio: Date, fin: Date) => {
    const mins = (fin.getTime() - inicio.getTime()) / 60000;
    return (mins / 60) * HOUR_HEIGHT;
  };

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header con navegación de fecha */}
      <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity style={s.navBtn} onPress={() => onFechaChange(subDays(fecha, 1))}>
          <Ionicons name="chevron-back" size={20} color={c.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onFechaChange(new Date())}>
          <View style={s.fechaCenter}>
            <TText style={[s.fechaDia, { color: c.text }]}>
              {format(fecha, "EEEE d 'de' MMMM", { locale: es })}
            </TText>
            {isToday(fecha) && (
              <View style={s.hoyBadge}>
                <TText style={s.hoyText}>Hoy</TText>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.navBtn} onPress={() => onFechaChange(addDays(fecha, 1))}>
          <Ionicons name="chevron-forward" size={20} color={c.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Cabecera de profesionales */}
      <View style={[s.profHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={{ width: TIME_COL_WIDTH }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {profesionales.map((prof) => (
            <View key={prof.id} style={[s.profCol, { width: COL_WIDTH }]}>
              <View style={[s.profDot, { backgroundColor: prof.color }]} />
              <TText style={[s.profNombre, { color: c.text }]} numberOfLines={1}>{prof.nombre}</TText>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Grid de tiempo */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View style={s.grid}>
          {/* Columna de horas */}
          <View style={[s.timeCol, { width: TIME_COL_WIDTH }]}>
            {HOURS.map((hour) => (
              <View key={hour} style={[s.timeRow, { height: HOUR_HEIGHT }]}>
                <TText style={[s.timeLabel, { color: c.textTertiary }]}>
                  {String(hour).padStart(2, '0')}:00
                </TText>
              </View>
            ))}
          </View>

          {/* Columnas de profesionales */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row' }}>
              {profesionales.map((prof, idx) => (
                <View
                  key={prof.id}
                  style={[
                    s.profGridCol,
                    { width: COL_WIDTH, borderLeftColor: c.border },
                  ]}
                >
                  {/* Líneas de hora */}
                  {HOURS.map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[s.hourCell, { height: HOUR_HEIGHT, borderTopColor: c.border }]}
                      onPress={() => {
                        const d = new Date(fecha);
                        d.setHours(hour, 0, 0, 0);
                        onNuevaCita(prof.id, d);
                      }}
                      activeOpacity={0.4}
                    />
                  ))}

                  {/* Citas del profesional */}
                  {prof.citas.map((cita) => (
                    <AppointmentCard
                      key={cita.id}
                      cita={cita}
                      top={horaAPixel(cita.inicio)}
                      height={Math.max(duracionAPixel(cita.inicio, cita.fin), 32)}
                      onPress={() => onCitaPress(cita)}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  navBtn: { padding: spacing.sm },
  fechaCenter: { alignItems: 'center', gap: 4 },
  fechaDia: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, textTransform: 'capitalize' },
  hoyBadge: { backgroundColor: '#6366f1', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  hoyText: { color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  profHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
  },
  profCol: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: spacing.sm },
  profDot: { width: 8, height: 8, borderRadius: 4 },
  profNombre: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  grid: { flexDirection: 'row' },
  timeCol: {},
  timeRow: { justifyContent: 'flex-start', paddingTop: 4, paddingHorizontal: 6 },
  timeLabel: { fontSize: 10 },
  profGridCol: { borderLeftWidth: 1, position: 'relative' },
  hourCell: { borderTopWidth: StyleSheet.hairlineWidth },
});
