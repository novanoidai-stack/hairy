import { useEffect } from 'react';
import { View } from 'react-native';

// En WEB no existe login interno: el unico acceso es el login de la landing
// (acceso.html), mismo origen que /app. Si por cualquier ruta o enlace antiguo
// se aterriza en /login, reconducimos a la landing sin mostrar nada.
// (En nativo se usa app/login.tsx, que SI es la pantalla de login real.)
export default function LoginWebRedirect() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.location.replace('/acceso.html');
    }
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#f6f1ea' }} />;
}
