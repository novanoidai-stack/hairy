import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TText } from '@/components/ui/TText';
import { Btn } from '@/components/ui/DesignComponents';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { usePrivacyConsent } from '@/lib/privacyConsentContext';

// Envuelve la pantalla de una ruta que trata datos de clientes: si el usuario
// (real, no demo) todavia no acepto la politica de privacidad, muestra el aviso
// en vez de montar la pantalla real (asi no dispara sus fetches de datos).
export function withClientDataGate<P extends object>(Screen: React.ComponentType<P>, seccion: string) {
  return function GatedScreen(props: P) {
    const { accepted, loading, isDemo } = usePrivacyConsent();
    if (!isDemo && !loading && !accepted) return <PrivacyGateOverlay seccion={seccion} />;
    return <Screen {...props} />;
  };
}

// Cubre una seccion que trabaja con datos de clientes cuando el usuario todavia
// no acepto la politica de privacidad (rechazar el aviso no bloquea todo el
// software, solo estas secciones - ver PrivacyConsentModal). Al pulsar "Aceptar"
// abre el mismo modal con el motivo puesto, en vez de repetir el formulario aqui.
export function PrivacyGateOverlay({ seccion }: { seccion: string }) {
  const { openGate } = usePrivacyConsent();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: T.bg }}>
      <View style={{ maxWidth: 380, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Ionicons name="lock-closed-outline" size={22} color={T.primary} />
        </View>
        <TText style={{ fontSize: T.fontSize.lg, fontWeight: 700 as const, color: T.text, textAlign: 'center' }}>
          {seccion} necesita tu aceptación
        </TText>
        <TText style={{ fontSize: T.fontSize.sm, color: T.textSecondary, textAlign: 'center', lineHeight: 20 }}>
          Esta sección muestra datos de tus clientes (nombres, contacto, citas o cobros). Acepta la política de privacidad para verla.
        </TText>
        <Btn
          variant="primary"
          style={{ marginTop: 8 }}
          onPress={() => openGate(`Para abrir "${seccion}" necesitas aceptar la política de privacidad: aquí se tratan datos de tus clientes.`)}
        >
          Aceptar y continuar
        </Btn>
      </View>
    </View>
  );
}
