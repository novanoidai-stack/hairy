import { View, Text, StyleSheet } from 'react-native';

export default function EquipoScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Equipo</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#f1f5f9' },
});
