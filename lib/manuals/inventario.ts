import type { ManualContent } from './types';

export const manualInventario: ManualContent = {
  pageKey: 'inventario',
  tituloPagina: 'Inventario',
  avisoTexto: 'Aquí controlas el stock de tus productos: qué tienes, qué se agota y el historial de entradas y salidas.',
  secciones: [
    {
      titulo: 'Añadir un producto',
      texto: 'Pulsa "Nuevo Producto" (arriba a la derecha) y rellena nombre, categoría, precio PVP, inventario inicial y, sobre todo, el stock mínimo de alerta: ese mínimo es el que dispara los avisos de reposición. Confirma con "Crear Referencia" y a partir de ahí el sistema lleva la cuenta sola.',
      captura: '/manuals/inventario/kpis.png',
      highlight: { top: '63%', left: '71%', width: '14%', height: '6%' },
    },
    {
      titulo: 'Registrar un movimiento',
      texto: 'Pulsa "Ajustar Stock" en el producto y elige "Entrada" (llega mercancía), "Salida" (uso, venta o merma) o "Ajuste" (recuento: escribes el inventario total que has contado). Antes de confirmar ves el stock resultante y si quedará bajo mínimo.',
    },
    {
      titulo: 'Alertas de stock bajo',
      texto: 'La tarjeta "Bajo Mínimo" cuenta los productos por debajo de su mínimo. Cuando hay alguno aparece el aviso de stock insuficiente con el botón "Ver Sólo Críticos", que deja en pantalla solo esos productos (vuelves con "Mostrar Todos"). Al cambiar de categoría el filtro se desactiva.',
    },
    {
      titulo: 'Qué reponer, propuesto por Chispa',
      texto: 'La predicción de pedido mira tus productos críticos y su consumo para proponerte qué comprar y en qué cantidad. Es una propuesta: la revisas antes de darla por buena.',
    },
    {
      titulo: 'Buscar, filtrar y ver el historial',
      texto: 'Busca por nombre, código de barras o descripción; las pestañas de arriba filtran por categoría y con "Mosaico" o "Tabla" cambias de vista (en móvil siempre se ve en mosaico). El icono de reloj de cada producto abre su historial con todos los movimientos pasados.',
    },
  ],
};
