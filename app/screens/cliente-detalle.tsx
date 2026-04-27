import { View, Text, StyleSheet } from 'react-native';

export default function ClienteDetalleScreen() {
  return (
    <View style={s.container}>
      <TText style={s.title}>Ficha cliente</TText>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9' },
});
