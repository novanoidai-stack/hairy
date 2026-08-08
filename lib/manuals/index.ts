import { manualAgenda } from './agenda';
import { manualBandeja } from './bandeja';
import { manualCaja } from './caja';
import { manualCampanas } from './campanas';
import { manualChispa } from './chispa';
import { manualCitas } from './citas';
import { manualClientes } from './clientes';
import { manualConfiguracion } from './configuracion';
import { manualEquipo } from './equipo';
import { manualInformes } from './informes';
import { manualInventario } from './inventario';
import { manualListaEspera } from './lista-espera';
import { manualMiJornada } from './mi-jornada';
import { manualPresupuestos } from './presupuestos';
import { manualResenas } from './resenas';
import type { ManualContent } from './types';

export * from './types';
export * from './faqs';

export interface ManualCategoria {
  id: string;
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  manuales: ManualContent[];
}

export const TODOS_LOS_MANUALES: Record<string, ManualContent> = {
  agenda: manualAgenda,
  bandeja: manualBandeja,
  caja: manualCaja,
  campanas: manualCampanas,
  chispa: manualChispa,
  citas: manualCitas,
  clientes: manualClientes,
  configuracion: manualConfiguracion,
  equipo: manualEquipo,
  informes: manualInformes,
  inventario: manualInventario,
  'lista-espera': manualListaEspera,
  'mi-jornada': manualMiJornada,
  presupuestos: manualPresupuestos,
  resenas: manualResenas,
};

export const CATEGORIAS_MANUALES: ManualCategoria[] = [
  {
    id: 'operativa',
    titulo: 'Operativa & Agenda',
    descripcion: 'Gestión diaria de tu salón, turnos, citas y lista de espera.',
    icono: 'calendar-outline',
    color: '#f4501e',
    manuales: [manualAgenda, manualMiJornada, manualCitas, manualListaEspera],
  },
  {
    id: 'gestion',
    titulo: 'Gestión & Caja',
    descripcion: 'Cobros, presupuestos, stock, equipo y ajustes del negocio.',
    icono: 'wallet-outline',
    color: '#0891b2',
    manuales: [manualCaja, manualPresupuestos, manualEquipo, manualInventario, manualConfiguracion],
  },
  {
    id: 'crm',
    titulo: 'Clientes & Comunicación',
    descripcion: 'Fichas de clientes, mensajería WhatsApp, campañas y reseñas.',
    icono: 'people-outline',
    color: '#e11d6b',
    manuales: [manualClientes, manualBandeja, manualCampanas, manualResenas],
  },
  {
    id: 'analisis_ia',
    titulo: 'Inteligencia Artificial (Chispa)',
    descripcion: 'Asistente proactivo 24/7, dictado por voz y analítica narrada.',
    icono: 'sparkles-outline',
    color: '#8b5cf6',
    manuales: [manualChispa, manualInformes],
  },
];
