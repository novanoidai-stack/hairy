import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

// Este componente ahora redirige al portal principal con el flag ?action=review
// El nuevo diseño del portal incluye el formulario de reseñas embebido en la vista del salón.
export default function ResenaRedirect() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  useEffect(() => {
    if (slug && typeof window !== 'undefined') {
      window.location.replace('/r/' + slug + '?action=review');
    }
  }, [slug]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f6f1ea', color: '#5c5249' }}>
      <p>Redirigiendo al portal del salón...</p>
    </div>
  );
}