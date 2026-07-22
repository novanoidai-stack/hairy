import type { ManualContent } from './types';

export const manualClientes: ManualContent = {
  pageKey: 'clientes',
  tituloPagina: 'Clientes',
  avisoTexto: 'Aquí está la ficha de cada clienta: contacto, alergias, ficha de color/química e historial de citas.',
  secciones: [
    {
      titulo: 'Crear o importar clientes',
      texto: 'Arriba a la derecha: "Nuevo cliente" da de alta uno a mano y "Importar Excel" sube un archivo (.xlsx, .xls o .csv) de otro sistema como Booksy para no volver a escribirlos todos.',
    },
    {
      titulo: 'Buscar y filtrar',
      texto: 'El buscador filtra por nombre, teléfono o email. Los chips (Todos, VIP, Habitual, Nuevo, Inactivas, Riesgo, Fuga, Recompra) acotan la lista según el comportamiento real de cada clienta, calculado solo.',
      captura: '/manuals/clientes/lista.png',
      highlight: { top: '24%', left: '20%', width: '78%', height: '13%' },
    },
    {
      titulo: 'La ficha del cliente',
      texto: 'Al abrir una clienta, cuatro pestañas: "Resumen" (datos y estadísticas), "Alergias" (notas y alergias registradas), "Color/Quimica" (fichas técnicas de tinte) e "Historial" (todas sus citas pasadas). Con el botón de expandir ves todos los bloques a la vez, incluidos Consentimientos, Fidelización y Bonos.',
      captura: '/manuals/clientes/ficha.png',
      highlight: { top: '21%', left: '67%', width: '31%', height: '60%' },
    },
    {
      titulo: 'Ficha de color y química',
      texto: 'Registra la fórmula completa de cada proceso: marca y producto, tonos y gramos de la mezcla, oxidante, tiempo de exposición y técnica. Cada ficha queda fechada y puedes asociarla a la cita en la que se hizo, para repetir el mismo resultado sin depender de la memoria.',
      captura: '/manuals/clientes/color.png',
      highlight: { top: '21%', left: '67%', width: '31%', height: '77%' },
    },
    {
      titulo: 'Acciones rápidas de la ficha',
      texto: 'Desde la ficha puedes reservarle cita, llamarla, sacar su ficha en PDF, exportar sus datos (RGPD) o fusionar duplicados. Arriba verás además avisos automáticos: alergias, cumpleaños, inactividad o riesgo de no-show.',
    },
    {
      titulo: 'Fotos y consentimientos',
      texto: 'Puedes adjuntar fotos del resultado. Los consentimientos (tratamiento de datos, uso de imagen, comunicaciones comerciales y asistente de IA) se activan o revocan en el bloque "Consentimientos", que aparece al expandir la ficha.',
    },
  ],
};
