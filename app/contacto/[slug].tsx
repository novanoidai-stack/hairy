import { View, Text } from 'react-native';

// Stub nativo: "Contactar con el salon" es una pagina web publica (se comparte
// como enlace). El bundler web usa [slug].web.tsx.
export default function ContactoPublicoScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f0e8', padding: 24 }}>
      <Text style={{ fontSize: 15, color: '#241a14', textAlign: 'center' }}>
        Abre este enlace desde un navegador para contactar con el salón.
      </Text>
    </View>
  );
}
