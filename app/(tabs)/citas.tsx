import { Platform } from 'react-native';
import CitasWeb from './citas.web';

export default function CitasScreen() {
  if (Platform.OS === 'web') return <CitasWeb />;
  return null; // En la app nativa, por ahora, esta pantalla no existe (o podria existir en el futuro)
}
