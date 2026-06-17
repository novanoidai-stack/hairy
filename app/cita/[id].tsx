import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TText } from '@/components/ui/TText';

// Gestion de cita por el cliente: v1 es web (app/cita/[id].web.tsx). En nativo dejamos
// un placeholder para no romper el bundle; la version nativa se hara mas adelante.
export default function GestionCitaNative() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', textAlign: 'center', marginBottom: 6 }}>
        Gestiona tu cita
      </TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Abre el enlace desde el navegador para ver, cambiar o cancelar tu cita ({String(id)}).
      </TText>
    </View>
  );
}
