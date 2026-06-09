import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TText } from '@/components/ui/TText';

// Pagina publica de resena: v1 es web. Placeholder en nativo (web-first).
export default function ResenaNative() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', marginBottom: 6 }}>Valoraciones</TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Abre el enlace de valoracion ({String(slug)}) desde el navegador.
      </TText>
    </View>
  );
}
