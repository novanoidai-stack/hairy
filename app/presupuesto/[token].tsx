import { View, Text } from 'react-native';

// Stub nativo: la página pública de presupuesto es web (se abre desde el enlace
// del correo/WhatsApp en el navegador). El bundler web usa [token].web.tsx.
export default function PresupuestoPublicoScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f0e8', padding: 24 }}>
      <Text style={{ fontSize: 15, color: '#241a14', textAlign: 'center' }}>
        Abre este presupuesto desde el enlace que te ha enviado tu salón.
      </Text>
    </View>
  );
}
