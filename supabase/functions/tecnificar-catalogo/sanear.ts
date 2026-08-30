// Saneador de lo que devuelve el modelo al tecnificar el catalogo.
//
// Vive aparte de index.ts A PROPOSITO. index.ts llama a Deno.serve() y lee
// Deno.env en el nivel superior: importarlo desde un test levanta un servidor
// HTTP y exige permisos que un test unitario no deberia necesitar. Eso tuvo la
// CI en rojo desde el 30 ago a las 12:03, y con ella mudos los vigilantes y el
// canario, que van detras en el mismo job.
//
// Regla que sale de ahi: si una edge function tiene logica que merece test, esa
// logica va en su propio modulo. El index.ts es la puerta HTTP, no la libreria.

export const RECURSOS = ['lavacabezas', 'cabina', 'sillon', 'aparatologia'] as const;
export const FASES = ['completa', 'final'] as const;

export type Servicio = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  duracion_activa_min: number | null;
  duracion_espera_min: number | null;
  recurso_tipo: string | null;
  recurso_fase: string | null;
};

export type Propuesta = {
  id: string;
  duracion_activa_min: number;
  duracion_espera_min: number;
  recurso_tipo: string | null;
  recurso_fase: string | null;
  confianza: string;
  motivo: string;
};

const entero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * Todo lo que devuelve el modelo pasa por aqui. Devuelve la propuesta saneada o
 * el motivo por el que se descarta -- que se enseña, porque un descarte mudo es
 * lo que hace que nadie sepa por que faltan servicios.
 */
export function sanear(cruda: unknown, conocidos: Map<string, Servicio>): Propuesta | { descartada: string; id?: string } {
  const p = (cruda ?? {}) as Record<string, unknown>;
  const id = typeof p.id === 'string' ? p.id : '';
  const servicio = conocidos.get(id);
  if (!servicio) return { descartada: 'id que no estaba en la tanda', id };

  const activa = entero(p.duracion_activa_min);
  const espera = entero(p.duracion_espera_min);
  if (activa === null || activa < 5 || activa > 300) {
    return { descartada: `duracion activa fuera de rango (${p.duracion_activa_min})`, id };
  }
  if (espera === null || espera < 0 || espera > 120) {
    return { descartada: `reposo fuera de rango (${p.duracion_espera_min})`, id };
  }

  let tipo = typeof p.recurso_tipo === 'string' ? p.recurso_tipo.toLowerCase() : null;
  if (tipo && !RECURSOS.includes(tipo as (typeof RECURSOS)[number])) {
    // Un recurso inventado no invalida el resto de la propuesta: los minutos son
    // lo que vale, y el puesto se puede poner despues a mano.
    tipo = null;
  }
  let fase = typeof p.recurso_fase === 'string' ? p.recurso_fase.toLowerCase() : null;
  if (fase && !FASES.includes(fase as (typeof FASES)[number])) fase = null;
  if (!tipo) fase = null;
  if (tipo && !fase) fase = espera > 0 ? 'final' : 'completa';

  const confianza = ['alta', 'media', 'baja'].includes(String(p.confianza))
    ? String(p.confianza)
    : 'baja';

  return {
    id,
    duracion_activa_min: activa,
    duracion_espera_min: espera,
    recurso_tipo: tipo,
    recurso_fase: fase,
    confianza,
    motivo: String(p.motivo ?? '').slice(0, 200),
  };
}
