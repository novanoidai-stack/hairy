import { View, Text } from 'react-native';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';

function ResenasScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Gestión de reseñas no disponible en la app nativa todavía.</Text>
    </View>
  );
}

export default withClientDataGate(ResenasScreen, 'Reseñas');
