import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TText } from '@/components/ui/TText';

// Portal de reserva publica: v1 es web (app/r/[slug].web.tsx). En nativo dejamos
// un placeholder para no romper el bundle; la version nativa se hara mas adelante.
export default function PortalReservaNative() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f1ea', padding: 24 }}>
      <TText style={{ fontSize: 16, fontWeight: '700', color: '#1c1814', textAlign: 'center', marginBottom: 6 }}>
        Reserva online
      </TText>
      <TText style={{ fontSize: 14, color: '#5c5249', textAlign: 'center' }}>
        Abre el enlace de reserva ({String(slug)}) desde el navegador para reservar tu cita.
      </TText>
    </View>
  );
}
