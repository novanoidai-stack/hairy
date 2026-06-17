import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TText } from '@/components/ui/TText';

// Pago de senal: v1 es web (app/pago/[ref].web.tsx). En nativo, placeholder.
export default function PagoSenalNative() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', textAlign: 'center', marginBottom: 6 }}>
        Pago de tu señal
      </TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Abre el enlace desde el navegador para completar el pago ({String(ref)}).
      </TText>
    </View>
  );
}
