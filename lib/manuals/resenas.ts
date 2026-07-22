import type { ManualContent } from './types';

export const manualResenas: ManualContent = {
  pageKey: 'resenas',
  tituloPagina: 'Reseñas de clientes',
  avisoTexto: 'Aquí ves qué opinan tus clientes del salón y de reservar con Mecha, con la puntuación media arriba.',
  secciones: [
    {
      titulo: 'De dónde salen',
      texto: 'Las reseñas las deja el cliente desde el portal público tras su cita (o desde el enlace que le llega por WhatsApp). Aparecen aquí automáticamente, sin nada que hacer.',
      captura: '/manuals/resenas/lista.png',
    },
    {
      titulo: 'Qué valora cada reseña',
      texto: 'Cada reseña puntúa el salón (valoración general, trato recibido, limpieza y productos) y la experiencia de reservar con Mecha (general, facilidad de reserva, disponibilidad de huecos y pagos). Arriba tienes la media de cada apartado; el filtro "Con Mecha" aísla las que puntuaron esto último.',
    },
    {
      titulo: 'Filtrar y buscar',
      texto: 'Acota por "Fueguitos" (de 5 a 1), por "Periodo" (Todo, 7, 30 o 90 días) y por "Tipo" ("Con Mecha" o "Con comentario"). Arriba del todo hay un buscador por comentario, sugerencia o nombre.',
      captura: '/manuals/resenas/filtros.png',
      highlight: { top: '28%', left: '23%', width: '68%', height: '8%' },
    },
    {
      titulo: 'Qué mejorar',
      texto: 'Bajo las medias verás "Lo que mejor hacéis" y "A mejorar", calculados con los filtros que tengas puestos, y el botón "Resumir temas (IA)" para que Chispa saque los temas que más se repiten en los comentarios.',
    },
    {
      titulo: 'Ocultar o eliminar una reseña',
      texto: 'El icono del ojo, arriba a la derecha de cada reseña, la quita de tu portal de reservas: queda marcada "Oculta al público" pero sigue visible aquí para ti, y el mismo icono la vuelve a publicar. El icono de papelera la borra definitivamente.',
    },
  ],
};
