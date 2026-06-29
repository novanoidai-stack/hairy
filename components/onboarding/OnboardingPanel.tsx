import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import {
  ONBOARDING_STEPS,
  type OnboardingStepDef,
  type OnboardingStepId,
  type OnboardingLevel,
  CORE_STEP_IDS,
} from '@/lib/onboarding';
import { OIcon } from './OnboardingIcons';

const T = DESIGN_TOKENS;

interface Props {
  visible: boolean;
  done: Record<OnboardingStepId, boolean>;
  skipped: OnboardingStepId[];
  coreCompletados: number;
  coreTotal: number;
  onClose: () => void;
  onNavigate: (step: OnboardingStepDef) => void;
  onSkip: (id: OnboardingStepId) => void;
  onUnskip: (id: OnboardingStepId) => void;
}

const LEVEL_META: Record<OnboardingLevel, { label: string; color: string; bg: string }> = {
  imprescindible: { label: 'Imprescindible', color: T.primary, bg: `rgba(244,80,30,0.12)` },
  necesario: { label: 'Necesario', color: T.warning, bg: `rgba(224,138,0,0.16)` },
  recomendado: { label: 'Recomendado', color: T.textTertiary, bg: 'rgba(115,102,88,0.12)' },
};

// Panel completo del onboarding (React Native).
// Modal de pantalla completa con ScrollView, con cabecera fija, progreso y lista de pasos.
export default function OnboardingPanel({
  visible,
  done,
  skipped,
  coreCompletados,
  coreTotal,
  onClose,
  onNavigate,
  onSkip,
  onUnskip,
}: Props) {
  const operativo = coreCompletados >= coreTotal;
  const firstRecIdx = ONBOARDING_STEPS.findIndex((s) => s.nivel === 'recomendado');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={s.modalContent}>
          {/* Cabecera */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <OIcon name="rocket" size={19} color="#fff" />
              </View>
              <View style={s.headerTitles}>
                <Text style={s.headerTitle}>Pon en marcha tu salon</Text>
                <Text style={s.headerSubtitle}>Completa lo esencial y queda operativo</Text>
              </View>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <OIcon name="x" size={17} />
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          <View style={s.progressSection}>
            {operativo ? (
              <View style={s.operativoBanner}>
                <OIcon name="sparkles" size={18} color={T.success} />
                <Text style={s.operativoText}>Tu salon ya esta operativo. Lo de abajo es para sacarle mas partido.</Text>
              </View>
            ) : (
              <>
                <View style={s.progressHeader}>
                  <Text style={s.progressLabel}>Esenciales para operar</Text>
                  <Text style={s.progressValue}>{coreCompletados}/{coreTotal}</Text>
                </View>
                <View style={s.progressBarTrack}>
                  <View style={[s.progressBarFill, { width: `${(coreCompletados / coreTotal) * 100}%` }]} />
                </View>
              </>
            )}
          </View>

          {/* Lista de pasos */}
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {ONBOARDING_STEPS.map((step, idx) => {
              const isDone = !!done[step.id];
              const isSkipped = skipped.includes(step.id);

              // Separador "Saca el maximo partido" antes del primer recomendado
              if (idx === firstRecIdx) {
                return (
                  <View key={step.id}>
                    <Text style={s.sectionLabel}>Saca el maximo partido</Text>
                    <StepRow
                      step={step}
                      done={isDone}
                      skipped={isSkipped}
                      onNavigate={onNavigate}
                      onSkip={onSkip}
                      onUnskip={onUnskip}
                    />
                  </View>
                );
              }

              return (
                <StepRow
                  key={step.id}
                  step={step}
                  done={isDone}
                  skipped={isSkipped}
                  onNavigate={onNavigate}
                  onSkip={onSkip}
                  onUnskip={onUnskip}
                />
              );
            })}

            <Text style={s.optionalNote}>
              Opcional, cuando quieras: la senal con tarjeta y las comisiones del equipo se configuran en Ajustes.
            </Text>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// Fila de paso (done, skipped, o pending)
function StepRow({
  step,
  done,
  skipped,
  onNavigate,
  onSkip,
  onUnskip,
}: {
  step: OnboardingStepDef;
  done: boolean;
  skipped: boolean;
  onNavigate: (s: OnboardingStepDef) => void;
  onSkip: (id: OnboardingStepId) => void;
  onUnskip: (id: OnboardingStepId) => void;
}) {
  const meta = LEVEL_META[step.nivel];

  if (done) {
    return (
      <View style={s.rowDone}>
        <View style={s.rowIconDone}>
          <OIcon name="check" size={16} color={T.success} />
        </View>
        <Text style={s.rowTitleDone}>{step.titulo}</Text>
        <View style={s.badgeDone}>
          <Text style={s.badgeDoneText}>Hecho</Text>
        </View>
      </View>
    );
  }

  if (skipped) {
    return (
      <View style={s.rowSkipped}>
        <View style={s.rowIconSkipped}>
          <OIcon name={step.icon} size={15} color={T.textMuted} />
        </View>
        <Text style={s.rowTitleSkipped}>{step.titulo}</Text>
        <TouchableOpacity onPress={() => onUnskip(step.id)}>
          <Text style={s.reactivateText}>Reactivar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.rowPending}>
      {/* Icono + titulo + etiqueta de nivel */}
      <View style={s.rowPendingHeader}>
        <View style={[s.rowIconPending, { backgroundColor: meta.bg }]}>
          <OIcon name={step.icon} size={17} color={meta.color} />
        </View>
        <View style={s.rowPendingTitleBox}>
          <Text style={s.rowPendingTitle}>{step.titulo}</Text>
          <View style={[s.levelBadge, { backgroundColor: meta.bg }]}>
            <Text style={[s.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
      </View>

      {/* Explicacion */}
      <Text style={s.rowPendingDesc}>{step.porque}</Text>

      {/* Acciones */}
      <View style={s.rowPendingActions}>
        <TouchableOpacity
          style={s.btnNavigate}
          onPress={() => onNavigate(step)}
        >
          <Text style={s.btnNavigateText}>{step.cta}</Text>
          <OIcon name="arrowRight" size={15} color="#fff" />
        </TouchableOpacity>
        {step.nivel === 'recomendado' && (
          <TouchableOpacity style={s.btnSkip} onPress={() => onSkip(step.id)}>
            <Text style={s.btnSkipText}>Omitir</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,12,6,0.45)',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
    backgroundColor: T.bg,
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: T.text,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: T.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: T.bgCard,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSection: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: T.text,
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '700',
    color: T.primaryHi,
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(40,30,24,0.1)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: T.primary,
  },
  operativoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: `rgba(15,157,107,0.14)`,
    borderWidth: 1,
    borderColor: 'rgba(15,157,107,0.2)',
    borderRadius: 12,
  },
  operativoText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.success,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: T.textTertiary,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 10,
  },
  optionalNote: {
    fontSize: 11.5,
    color: T.textTertiary,
    lineHeight: 18,
    marginTop: 6,
  },
  // Row done
  rowDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    backgroundColor: T.bgCardHi,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
  },
  rowIconDone: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: `rgba(15,157,107,0.14)`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitleDone: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: T.textSecondary,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(92,82,73,0.4)',
  },
  badgeDone: {
    backgroundColor: `rgba(15,157,107,0.14)`,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeDoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.success,
  },
  // Row skipped
  rowSkipped: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    backgroundColor: T.bgCard,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    opacity: 0.7,
  },
  rowIconSkipped: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(40,30,24,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitleSkipped: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: T.textMuted,
  },
  reactivateText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
  },
  // Row pending
  rowPending: {
    backgroundColor: T.bgCard,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    padding: 13,
    gap: 8,
  },
  rowPendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  rowIconPending: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPendingTitleBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowPendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  levelBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  rowPendingDesc: {
    fontSize: 12.5,
    color: T.textSecondary,
    lineHeight: 18,
  },
  rowPendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnNavigate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: T.primary,
    borderRadius: 9,
    flex: 1,
  },
  btnNavigateText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnSkip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 9,
  },
  btnSkipText: {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
