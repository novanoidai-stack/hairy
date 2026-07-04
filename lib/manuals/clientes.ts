import type { ManualContent } from './types';

export const manualClientes: ManualContent = {
  pageKey: 'clientes',
  tituloPagina: 'Clientes',
  avisoTexto: 'Aquí está la ficha de cada clienta: contacto, alergias, ficha de color/química e historial de citas.',
  secciones: [
    {
      titulo: 'Crear o importar clientes',
      texto: '"Nuevo cliente" da de alta uno a mano. "Importar Excel" sube un archivo (.xlsx, .xls o .csv) de otro sistema como Booksy para no volver a escribirlos todos.',
    },
    {
      titulo: 'Buscar y filtrar',
      texto: 'El buscador filtra por nombre, teléfono o email. Los chips (VIP, Habitual, Nuevo, Inactivas, Riesgo, Fuga) acotan la lista según el comportamiento real de cada clienta, calculado solo.',
      captura: '/manuals/clientes/lista.png',
      highlight: { top: '24%', left: '20%', width: '78%', height: '13%' },
    },
    {
      titulo: 'La ficha del cliente',
      texto: 'Al abrir una clienta, cuatro pestañas: "Resumen" (datos y estadísticas), "Alergias" (notas y alergias registradas), "Color/Química" (fichas técnicas de tinte) e "Historial" (todas sus citas pasadas).',
      captura: '/manuals/clientes/ficha.png',
      highlight: { top: '21%', left: '67%', width: '31%', height: '60%' },
    },
    {
      titulo: 'Ficha de color y química',
      texto: 'Registra la fórmula, fase (activa o en reposo) y fecha de cada proceso de color, para repetir exactamente el mismo resultado la próxima vez sin depender de la memoria.',
      captura: '/manuals/clientes/color.png',
      highlight: { top: '21%', left: '67%', width: '31%', height: '77%' },
    },
    {
      titulo: 'Fotos y consentimientos',
      texto: 'Puedes adjuntar fotos del resultado y guardar los consentimientos firmados de tratamientos, todo dentro de la misma ficha.',
    },
  ],
};
