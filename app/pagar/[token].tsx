import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TText } from '@/components/ui/TText';

// Pago del total (cobro en local / enlace): v1 es web (app/pagar/[token].web.tsx). Nativo = placeholder.
export default function PagoTotalNative() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', textAlign: 'center', marginBottom: 6 }}>
        Paga tu servicio
      </TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Abre el enlace desde el navegador para completar el pago ({String(token)}).
      </TText>
    </View>
  );
}
