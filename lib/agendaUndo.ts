// Deshacer/rehacer movimientos de citas de la agenda (pila en memoria de la sesion).
//
// Alcance deliberado: SOLO movimientos (hora, fases y profesional). NO cubre cobros,
// estados ni cancelaciones: el historico es inmutable (PA-06) y esas operaciones tienen
// efectos que un "deshacer" no puede revertir (dinero, avisos ya enviados).
//
// Seguro respecto a notificaciones: los unicos triggers de `citas` reaccionan a
// `deposito_requerido`, `estado` y `updated_at`. Mover una cita (inicio/fin/fin_activa/
// fin_espera/profesional_id) no dispara ningun aviso, asi que deshacerla tampoco.
//
// PURO: no toca BD ni React. El llamador aplica los snapshots.

// Las 5 marcas que definen donde esta una cita. Se mueven juntas o no se mueven.
export interface SnapshotCita {
  inicio: string;
  fin: string;
  fin_activa: string | null;
  fin_espera: string | null;
  profesional_id: string;
}

export interface CambioCita {
  citaId: string;
  antes: SnapshotCita;
  despues: SnapshotCita;
}

// Un paso deshacible = un lote. El drag mueve 1 cita; el organizador puede mover varias
// en cascada, y deshacer eso a medias dejaria la agenda peor que antes.
export type PasoAgenda = CambioCita[];

export interface PilaAgenda {
  deshacer: PasoAgenda[];
  rehacer: PasoAgenda[];
}

export const PILA_VACIA: PilaAgenda = { deshacer: [], rehacer: [] };

// Cuantos pasos se recuerdan. Suficiente para el caso real ("me he equivocado

// arrastrando") sin acumular memoria de una sesion larga.
export const MAX_PASOS = 20;

export function snapshotDe(c: {
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
  profesional_id: string;
}): SnapshotCita {
  return {
    inicio: c.inicio,
    fin: c.fin,
    fin_activa: c.fin_activa ?? null,
    fin_espera: c.fin_espera ?? null,
    profesional_id: c.profesional_id,
  };
}

export function mismoSitio(a: SnapshotCita, b: SnapshotCita): boolean {
  return (
    a.inicio === b.inicio &&
    a.fin === b.fin &&
    a.fin_activa === b.fin_activa &&
    a.fin_espera === b.fin_espera &&
    a.profesional_id === b.profesional_id
  );
}

// Registra un paso nuevo. Descarta los cambios que no mueven nada (un drag que
// suelta la cita donde estaba no debe gastar un paso de deshacer) y vacia la pila
// de rehacer: una vez haces algo nuevo, el futuro que habias deshecho ya no existe.
export function registrar(pila: PilaAgenda, paso: PasoAgenda): PilaAgenda {
  const utiles = paso.filter((c) => !mismoSitio(c.antes, c.despues));
  if (utiles.length === 0) return pila;
  return {
    deshacer: [...pila.deshacer, utiles].slice(-MAX_PASOS),
    rehacer: [],
  };
}

// Saca el ultimo paso y lo pasa a rehacer. Devuelve los cambios a aplicar (usando `antes`).
export function deshacer(pila: PilaAgenda): { pila: PilaAgenda; aplicar: PasoAgenda } | null {
  const paso = pila.deshacer[pila.deshacer.length - 1];
  if (!paso) return null;
  return {
    pila: { deshacer: pila.deshacer.slice(0, -1), rehacer: [...pila.rehacer, paso].slice(-MAX_PASOS) },
    aplicar: paso,
  };
}

// Saca el ultimo deshecho y lo devuelve a la pila de deshacer (usando `despues`).
export function rehacer(pila: PilaAgenda): { pila: PilaAgenda; aplicar: PasoAgenda } | null {
  const paso = pila.rehacer[pila.rehacer.length - 1];
  if (!paso) return null;
  return {
    pila: { deshacer: [...pila.deshacer, paso].slice(-MAX_PASOS), rehacer: pila.rehacer.slice(0, -1) },
    aplicar: paso,
  };
}
