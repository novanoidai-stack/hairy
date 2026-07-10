import { View, Text } from 'react-native';

// Stub nativo: la pantalla rica de Campañas es web (campanas.web.tsx). El nativo
// va por detrás; aquí solo evitamos el error de expo-router por ruta sin hermano.
export default function CampanasNative() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 15, color: '#5c5249', textAlign: 'center' }}>
        Las campañas están disponibles en la versión web de Mecha.
      </Text>
    </View>
  );
}
