import { View } from 'react-native';
import { TText } from '@/components/ui/TText';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';

// Lista de espera: v1 es web. En nativo, placeholder (web-first).
function ListaEsperaNative() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', marginBottom: 6 }}>Lista de espera</TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Disponible en la version web del software.
      </TText>
    </View>
  );
}

export default withClientDataGate(ListaEsperaNative, 'Lista de espera');
