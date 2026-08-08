import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Topbar, Card } from '@/components/ui/DesignComponents';
import { TText } from '@/components/ui/TText';
import { TODOS_LOS_MANUALES, FAQS_INICIALES } from '@/lib/manuals';

const tokens = DESIGN_TOKENS;

export default function AyudaScreenNative() {
  const { c } = useTheme();

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Topbar title="Ayuda & Manuales" subtitle="Centro de formación y dudas de Mecha" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Banner principal */}
        <View style={s.section}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Ionicons name="sparkles" size={24} color={tokens.primary} />
              <TText style={{ fontSize: 16, fontWeight: '700', color: c.text }}>
                Centro de Ayuda y Manuales
              </TText>
            </View>
            <TText style={{ fontSize: 13, color: c.textSecondary, lineHeight: 18 }}>
              Accede a las guías completas de uso desde la versión Web del salón o consulta cualquier duda a Chispa por voz o texto en el chat.
            </TText>
          </Card>
        </View>

        {/* Resumen de manuales disponibles */}
        <View style={s.section}>
          <TText style={[s.sectionTitle, { color: c.text }]}>Manuales de uso</TText>
          {Object.values(TODOS_LOS_MANUALES).map((m) => (
            <View key={m.pageKey} style={[s.itemCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <TText style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{m.tituloPagina}</TText>
                <TText style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{m.avisoTexto}</TText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
            </View>
          ))}
        </View>

        {/* FAQs */}
        <View style={s.section}>
          <TText style={[s.sectionTitle, { color: c.text }]}>Dudas más frecuentes</TText>
          {FAQS_INICIALES.map((faq) => (
            <Card key={faq.id}>
              <TText style={{ fontSize: 13.5, fontWeight: '700', color: c.text, marginBottom: 4 }}>
                {faq.pregunta}
              </TText>
              <TText style={{ fontSize: 12.5, color: c.textSecondary, lineHeight: 17 }}>
                {faq.respuesta}
              </TText>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: tokens.spacing.xxl,
  },
  section: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  sectionTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
    marginBottom: tokens.spacing.xs,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing.sm,
  },
});
