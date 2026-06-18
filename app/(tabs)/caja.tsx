import { View, Text } from 'react-native';

export default function CajaScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 20 }}>
      <Text style={{ fontSize: 16, color: '#1c1814', textAlign: 'center', fontWeight: 'bold', marginBottom: 8 }}>
        Gestión de caja
      </Text>
      <Text style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        La pantalla de caja no está disponible en la app nativa todavía. Por favor, usa la versión web.
      </Text>
    </View>
  );
}
