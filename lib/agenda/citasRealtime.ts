// Reglas de mezcla de los cambios que llegan por Realtime sobre la lista de
// citas que la agenda ya tiene cargada.
//
// Va aparte del hook a proposito: aqui no hay React ni socket, solo la decision
// de que hacer con cada evento. Es la parte que se puede equivocar de verdad
// (duplicar una cita, colar una de otra semana, dejar visible una cancelada) y
// la unica que merece test.

// Lo minimo que la mezcla necesita saber de una cita. Se deja aparte del tipo
// con indice libre para que valga tambien el tipo Cita de la agenda, que es
// cerrado y no admite firma de indice.
export type CitaBase = {
  id: string;
  inicio?: string | null;
  oculta_en_calendario?: boolean | null;
};

// Lo que llega por el socket: las columnas de la fila, sin tipar.
export type CitaRealtime = CitaBase & { [campo: string]: unknown };

export type EventoRealtime = {
  tipo: 'INSERT' | 'UPDATE' | 'DELETE';
  fila: CitaRealtime | null;
  filaAnterior?: CitaRealtime | null;
};

export type ContextoMezcla = {
  // Si la cita cae dentro del tramo de fechas que la agenda tiene descargado.
  // Fuera de el no se mete nada: se pintaria una cita suelta en una semana que
  // el usuario todavia no ha cargado.
  dentroDeVentana: (inicioISO: string | null | undefined) => boolean;
  // Con el interruptor de canceladas apagado, la agenda pidio al servidor solo
  // las que tienen oculta_en_calendario = false. Hay que respetarlo tambien aqui.
  verCanceladas: boolean;
};

function esVisible(fila: CitaRealtime, ctx: ContextoMezcla): boolean {
  if (!ctx.dentroDeVentana(fila.inicio)) return false;
  if (!ctx.verCanceladas && fila.oculta_en_calendario === true) return false;
  return true;
}

/**
 * Devuelve la nueva lista de citas tras aplicar un evento de Realtime.
 * Si no hay nada que cambiar devuelve EXACTAMENTE el mismo array recibido, para
 * que React pueda saltarse el re-render por identidad.
 */
export function aplicarCambioCita<T extends CitaBase>(
  citas: T[],
  evento: EventoRealtime,
  ctx: ContextoMezcla,
): T[] {
  if (evento.tipo === 'DELETE') {
    const id = evento.filaAnterior?.id ?? evento.fila?.id;
    if (!id) return citas;
    // Un borrado que no estaba cargado no es asunto nuestro. Ademas de ahorrar
    // trabajo, evita hacer caso de ids ajenos: los DELETE llegan sin filtrar.
    if (!citas.some((c) => c.id === id)) return citas;
    return citas.filter((c) => c.id !== id);
  }

  const fila = evento.fila;
  if (!fila?.id) return citas;

  const indice = citas.findIndex((c) => c.id === fila.id);
  const visible = esVisible(fila, ctx);

  // Deja de tocar: se ha cancelado, se ha ocultado o se ha movido a una fecha
  // que no tenemos cargada.
  if (!visible) {
    if (indice === -1) return citas;
    return citas.filter((c) => c.id !== fila.id);
  }

  // Un INSERT puede llegar cuando la cita YA esta en la lista: la pestaña que la
  // creo se la añadio al estado en cuanto respondio el insert, y el evento llega
  // despues. Se trata como actualizacion en vez de duplicarla.
  if (indice === -1) return [...citas, fila as unknown as T];

  const copia = citas.slice();
  copia[indice] = { ...citas[indice], ...fila } as T;
  return copia;
}
