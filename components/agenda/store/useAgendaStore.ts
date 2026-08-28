// Estado VISUAL de la agenda (Zustand).
//
// Que entra aqui y que no
// -----------------------
// ENTRA: lo que solo describe COMO se esta viendo la agenda. Hoy: la vista
// activa y el profesional filtrado.
//
// NO ENTRA, y esto es lo importante:
//   1. Los DATOS del servidor (citas, clientes, servicios, horarios). De eso se
//      encarga TanStack Query en lib/datos/. Meter citas en Zustand seria
//      repetir con otra libreria el problema que veniamos a arreglar: dos
//      copias de la verdad y ningun mecanismo de invalidacion.
//   2. La FISICA del arrastre. El fantasma se mueve por `transform` sobre una
//      ref con requestAnimationFrame y SIN pasar por React -- esta medido: 80
//      movimientos cruzando 8 franjas mutan 8 nodos y no remontan nada. Pasar
//      esas coordenadas por un store las convertiria en renders y estropearia
//      justo lo que hoy funciona bien.
//
// Por que solo dos campos
// -----------------------
// La primera version de este fichero declaraba tambien modales, cita
// seleccionada y un flag de arrastre "para cuando hagan falta". Se han quitado:
// eran interfaz inventada antes de tener el caso de uso, y esas suelen estar
// mal cuando el caso llega. El store crece cuando una extraccion concreta lo
// pida, no antes.
import { create } from 'zustand';

export type VistaAgenda = 'day' | 'week' | 'month';

export interface EstadoVisualAgenda {
  vista: VistaAgenda;
  /** id del profesional, o 'todos'. */
  profesionalFiltrado: string;

  setVista: (vista: VistaAgenda) => void;
  setProfesionalFiltrado: (id: string) => void;
}

export const useAgendaStore = create<EstadoVisualAgenda>((set) => ({
  vista: 'day',
  profesionalFiltrado: 'todos',
  setVista: (vista) => set({ vista }),
  setProfesionalFiltrado: (profesionalFiltrado) => set({ profesionalFiltrado }),
}));

// Selectores sueltos.
//
// Se usan asi en vez de `useAgendaStore()` a pelo: suscribirse al store ENTERO
// hace que el componente se repinte cuando cambia cualquier cosa del store, y
// aqui hay tarjetas de cita repitiendose N veces por columna. Con un selector,
// cada componente solo se entera de SU trozo.
export const useVistaAgenda = () => useAgendaStore((s) => s.vista);
export const useProfesionalFiltrado = () => useAgendaStore((s) => s.profesionalFiltrado);
