import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { OIcon } from './OnboardingIcons';

const T = DESIGN_TOKENS;

interface Props {
  coreCompletados: number;
  coreTotal: number;
  onOpen: () => void;
  onHide: () => void;
}

// Tarjeta destacada para el checklist (version React Native).
// Se muestra en la agenda nativa cuando el onboarding esta pendiente.
export function OnboardingCard({ coreCompletados, coreTotal, onOpen, onHide }: Props) {
  const pct = coreTotal > 0 ? Math.round((coreCompletados / coreTotal) * 100) : 0;
  const faltan = Math.max(0, coreTotal - coreCompletados);

  return (
    <View style={s.card}>
      {/* Icono + titulo + descripcion */}
      <View style={s.header}>
        <View style={s.iconContainer}>
          <OIcon name="rocket" size={16} color="#fff" />
        </View>
        <View style={s.headerText}>
          <Text style={s.title}>Pon en marcha tu salon</Text>
          <Text style={s.subtitle}>
            {faltan === 0
              ? 'Ultimo repaso para dejarlo listo'
              : `Te faltan ${faltan} ${faltan === 1 ? 'paso' : 'pasos'} para estar operativo`}
          </Text>
        </View>
      </View>

      {/* Barra de progreso */}
      <View style={s.progressRow}>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.progressLabel}>{coreCompletados}/{coreTotal}</Text>
      </View>

      {/* Botones */}
      <View style={s.actions}>
        <TouchableOpacity style={s.btnPrimary} onPress={onOpen}>
          <Text style={s.btnPrimaryText}>Ver los pasos</Text>
          <OIcon name="arrowRight" size={15} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={onHide}>
          <Text style={s.btnSecondaryText}>Ahora no</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: `rgba(244,80,30,0.12)`,
    borderWidth: 1,
    borderColor: 'rgba(244,80,30,0.3)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: T.text,
    lineHeight: 16,
  },
  subtitle: {
    fontSize: 11.5,
    color: T.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(40,30,24,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: T.primary,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: T.primaryHi,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: T.primary,
    borderRadius: 9,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 9,
  },
  btnSecondaryText: {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
