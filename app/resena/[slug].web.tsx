import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

// Este componente ahora redirige al portal principal con el flag ?action=review
// El nuevo diseño del portal incluye el formulario de reseñas embebido en la vista del salón.
export default function ResenaRedirect() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  useEffect(() => {
    if (slug && typeof window !== 'undefined') {
      // OJO con la ruta: el portal vive en /app/r/[slug]. Un '/r/' a secas no lo
      // sirve nadie (ni vercel.json ni el espejo local) y acababa en 404 — lo
      // encontro el smoke de pantallas el 28 ago 2026.
      window.location.replace('/app/r/' + slug + '?action=review');
    }
  }, [slug]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f6f1ea', color: '#5c5249' }}>
      <p>Redirigiendo al portal del salón...</p>
    </div>
  );
}