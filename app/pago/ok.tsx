import { View } from 'react-native';
import { TText } from '@/components/ui/TText';

// Exito de pago: v1 es web (app/pago/ok.web.tsx). En nativo, placeholder.
export default function PagoOkNative() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', textAlign: 'center', marginBottom: 6 }}>
        ¡Pago recibido!
      </TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Tu señal está confirmada y tu cita queda reservada.
      </TText>
    </View>
  );
}
