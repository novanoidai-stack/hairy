import type { ManualContent } from './types';

export const manualInventario: ManualContent = {
  pageKey: 'inventario',
  tituloPagina: 'Inventario',
  avisoTexto: 'Aquí controlas el stock de tus productos: qué tienes, qué se agota y el historial de entradas y salidas.',
  secciones: [
    {
      titulo: 'Añadir un producto',
      texto: 'Da de alta cada producto con su nombre, categoría y stock inicial. A partir de ahí, el sistema lleva la cuenta sola.',
      captura: '/manuals/inventario/kpis.png',
      highlight: { top: '63%', left: '71%', width: '14%', height: '6%' },
    },
    {
      titulo: 'Registrar un movimiento',
      texto: 'Cada vez que entra stock nuevo (compra) o sale (uso, venta o merma), registra un movimiento: el stock del producto se actualiza al momento.',
    },
    {
      titulo: 'Alertas de stock bajo',
      texto: 'La tarjeta de alertas cuenta los productos por debajo de su mínimo. El filtro "Solo stock bajo" los aísla para que sepas qué reponer.',
    },
    {
      titulo: 'Buscar, filtrar y ver el historial',
      texto: 'Busca por nombre, filtra por categoría y cambia entre vista de cuadrícula o tabla. El historial de cada producto muestra todos sus movimientos pasados.',
    },
  ],
};
