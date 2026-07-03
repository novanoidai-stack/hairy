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
      titulo: 'Dos puntuaciones distintas',
      texto: 'Cada reseña valora dos cosas por separado: la experiencia en el salón y la experiencia de reservar con Mecha (rapidez, recordatorios...). El filtro "Con Mecha" aísla solo las que puntuaron esto último.',
    },
    {
      titulo: 'Filtrar por periodo y valoración',
      texto: 'Puedes acotar a los últimos 7, 30 o 90 días, por número de llamas (puntuación) o solo las que tienen comentario escrito.',
      captura: '/manuals/resenas/filtros.png',
    },
    {
      titulo: 'Ocultar una reseña',
      texto: 'Una reseña marcada "Oculta al público" no aparece en tu portal de reservas, pero sigue visible aquí para ti.',
    },
  ],
};
