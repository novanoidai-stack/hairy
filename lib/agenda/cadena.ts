// Cadenas de citas (servicios encadenados multiprofesional).
//
// Una clienta puede pasar por varios profesionales en secuencia (corte con A,
// luego color con B). Eso es UNA cita-clienta repartida en varias filas de
// `citas` que comparten `grupo_id` y se ordenan por `orden_en_grupo`.
//
// Este modulo existe porque el predicado estaba escrito a mano por toda
// AgendaCalendar.web.tsx y no todas las copias decian lo mismo. Al extraerlas
// se mantiene el comportamiento exacto de cada una, pero ahora la diferencia
// esta escrita y tiene tests.
//
// EXTRACCION PARCIAL (27 ago 2026). Cubiertas las dos reglas de abajo, que son
// las que operan sobre la cadena y las que la pintan en la rejilla. Dentro de
// `DetalleCitaModal` quedan cuatro copias mas con DOS variantes distintas que
// no se han tocado porque cada una filtra por su cuenta y hay que mirar su
// contexto una a una:
//   - una descarta por `sinCarrilPropio` (o sea, cancelada Y no presentada);
//   - tres no filtran estado en absoluto.
// Mientras existan, sigue habiendo margen de divergencia. Al extraer ese modal
// en la Fase 5 del plan es el momento de unificarlas.

export type CitaEncadenable = {
  id: string;
  inicio: string;
  grupo_id?: string | null;
  cliente_id?: string | null;
  orden_en_grupo?: number | null;
  estado?: string | null;
  [campo: string]: unknown;
};

// Orden de los eslabones: por `orden_en_grupo` y, a igualdad, por hora.
// El desempate por hora importa porque `orden_en_grupo` puede venir a NULL en
// filas antiguas y entonces todas valdrian 0.
function porOrden(a: CitaEncadenable, b: CitaEncadenable): number {
  return (
    (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0) ||
    new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
  );
}

// ---------------------------------------------------------------------------
// Regla 1: la cadena sobre la que se OPERA (marcar no-show, cambiar estado...).
//
// Ata por `grupo_id` Y `cliente_id`: el cliente_id es el cinturon de seguridad,
// para no arrastrar a otra persona si dos grupos comparten id por accidente.
// NO descarta las canceladas, a proposito: es el comportamiento que habia.
//
// (Anotado para revisar aparte, porque cambiarlo SI cambia comportamiento: al
// marcar no-show la cadena entera, un eslabon ya CANCELADO pasa tambien a
// no_presentada. Suena a que no deberia, y eso mueve metricas de no-show.)
// ---------------------------------------------------------------------------
export function eslabonesParaOperar(
  cita: CitaEncadenable,
  todas: CitaEncadenable[] | null | undefined,
): CitaEncadenable[] {
  if (!cita.grupo_id || !cita.cliente_id || !todas) return [];
  return todas
    .filter((x) => x.grupo_id === cita.grupo_id && x.cliente_id === cita.cliente_id)
    .sort(porOrden);
}

// True si la cita es el PRIMER eslabon de su cadena. Las operaciones en cadena
// solo se lanzan desde el primero, para no repetirlas una vez por eslabon.
export function esPrimerEslabon(
  cita: CitaEncadenable,
  todas: CitaEncadenable[] | null | undefined,
): boolean {
  const cadena = eslabonesParaOperar(cita, todas);
  return cadena.length > 0 && cadena[0].id === cita.id;
}

// ---------------------------------------------------------------------------
// Regla 2: la cadena que se PINTA (contador "2/3", riel de ChainFlowOverlay).
//
// Dos diferencias deliberadas con la de operar:
//   - descarta las CANCELADAS: una cadena de tres con una anulada decia "2/4" y
//     saltaba del 2 al 4, y el riel (que si las quita) dibujaba otra cosa;
//   - NO mira `cliente_id`: aqui basta el grupo, porque solo se esta pintando.
// ---------------------------------------------------------------------------
export function eslabonesParaPintar(
  grupoId: string | null | undefined,
  todas: CitaEncadenable[] | null | undefined,
  esCancelada: (estado?: string | null) => boolean,
): CitaEncadenable[] {
  if (!grupoId || !todas) return [];
  return todas.filter((c) => c.grupo_id === grupoId && !esCancelada(c.estado)).sort(porOrden);
}

// True si la cita forma parte de una cadena con mas de un eslabon VISIBLE.
// Una cadena de la que solo queda un eslabon vivo ya no se pinta como cadena.
export function estaEnCadenaVisible(
  grupoId: string | null | undefined,
  todas: CitaEncadenable[] | null | undefined,
  esCancelada: (estado?: string | null) => boolean,
): boolean {
  return eslabonesParaPintar(grupoId, todas, esCancelada).length > 1;
}
