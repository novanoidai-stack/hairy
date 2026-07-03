import { useState } from 'react';
import { Modal, View, Platform } from 'react-native';
import { TText } from '@/components/ui/TText';
import { Btn, Card } from '@/components/ui/DesignComponents';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { PRIVACY_POLICY_URL } from '@/lib/legal';
import { usePrivacyConsent } from '@/lib/privacyConsentContext';

// Aviso de politica de privacidad para quien usa el software (staff/propietario).
// Aparece una vez al entrar (o si la politica cambio de version) y tambien cuando
// se intenta abrir una seccion con datos de clientes sin haber aceptado todavia
// (ver PrivacyGateOverlay). Rechazar no bloquea toda la app: solo deja fuera las
// secciones que tratan datos de clientes, que es donde de verdad aplica.
export function PrivacyConsentModal() {
  const { modalOpen, gateReason, closeGate, accept } = usePrivacyConsent();
  const [saving, setSaving] = useState(false);

  if (!modalOpen) return null;

  const onAccept = async () => {
    setSaving(true);
    try {
      await accept();
    } catch {
      setSaving(false);
    }
  };

  const openPolicy = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(PRIVACY_POLICY_URL, '_blank', 'noopener');
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeGate}>
      <View style={{ flex: 1, backgroundColor: 'rgba(28,24,20,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Card style={{ maxWidth: 420, width: '100%', padding: 24, gap: 4 }}>
          <TText style={{ fontSize: T.fontSize.xl, fontWeight: 700 as const, color: T.text, marginBottom: 8 }}>
            Antes de continuar
          </TText>
          {gateReason ? (
            <TText style={{ fontSize: T.fontSize.md, color: T.textSecondary, marginBottom: 14, lineHeight: 21 }}>
              {gateReason}
            </TText>
          ) : (
            <TText style={{ fontSize: T.fontSize.md, color: T.textSecondary, marginBottom: 14, lineHeight: 21 }}>
              Mecha gestiona datos de tu negocio y de tus clientes (citas, contacto, cobros). Antes de seguir, tienes que aceptar cómo los tratamos.
            </TText>
          )}
          <View style={{ marginBottom: 18 }}>
            <TText
              onPress={openPolicy}
              style={{ fontSize: T.fontSize.sm, color: T.primary, fontWeight: 600 as const, textDecorationLine: 'underline' }}
            >
              Leer la política de privacidad completa
            </TText>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onPress={closeGate} disabled={saving}>
              Ahora no
            </Btn>
            <Btn variant="primary" onPress={onAccept} disabled={saving}>
              {saving ? 'Guardando…' : 'Aceptar y continuar'}
            </Btn>
          </View>
        </Card>
      </View>
    </Modal>
  );
}
