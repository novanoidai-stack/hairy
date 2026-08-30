// ===========================================================================
// Gestión y cálculo de múltiples fases de cita (Spec 1 y Spec 4)
// Funciones puras para descomponer, desplazar y resumir fases de una cita.
// ===========================================================================

export type TipoFase = 'activa' | 'reposo' | 'transicion';

export interface FasePlantilla {
  tipo: TipoFase;
  min: number;
  etiqueta?: string | null;
  recurso_tipo?: string | null;
}

export interface CitaFase {
  id?: string;
  cita_id?: string;
  orden: number;
  tipo: TipoFase;
  inicio: string; // ISO
  fin: string; // ISO
  profesional_id?: string | null;
  recurso_tipo?: string | null;
  etiqueta?: string | null;
  iniciada_at?: string | null;
  cerrada_at?: string | null;
}

/**
 * Construye una secuencia de fases consecutivas a partir de la plantilla del catálogo (servicios.fases).
 */
export function construirFasesDesdePlantilla(
  inicioDate: Date,
  fasesPlantilla: FasePlantilla[],
  profesionalId?: string | null,
): CitaFase[] {
  if (!fasesPlantilla || fasesPlantilla.length === 0) {
    return [];
  }

  let cursorMs = inicioDate.getTime();
  const resultado: CitaFase[] = [];

  fasesPlantilla.forEach((fase, index) => {
    const durMs = Math.max(1, fase.min || 1) * 60 * 1000;
    const iniIso = new Date(cursorMs).toISOString();
    const finIso = new Date(cursorMs + durMs).toISOString();

    resultado.push({
      orden: index + 1,
      tipo: fase.tipo || 'activa',
      inicio: iniIso,
      fin: finIso,
      profesional_id: profesionalId ?? null,
      recurso_tipo: fase.recurso_tipo ?? null,
      etiqueta: fase.etiqueta ?? (fase.tipo === 'reposo' ? 'Reposo' : 'Servicio'),
    });

    cursorMs += durMs;
  });

  return resultado;
}

/**
 * Calcula las cuatro marcas clásicas de resumen para mantener 100% de compatibilidad con
 * el esquema tradicional (inicio, fin, fin_activa, fin_espera).
 */
export function calcularMarcasResumen(fases: CitaFase[]): {
  inicio: string;
  fin: string;
  fin_activa: string;
  fin_espera: string;
} {
  if (fases.length === 0) {
    const ahora = new Date().toISOString();
    return { inicio: ahora, fin: ahora, fin_activa: ahora, fin_espera: ahora };
  }

  const ordenadas = [...fases].sort((a, b) => a.orden - b.orden);
  const inicio = ordenadas[0].inicio;
  const fin = ordenadas[ordenadas.length - 1].fin;

  // Fin de la primera fase activa o de transición
  const primeraActiva = ordenadas.find((f) => f.tipo === 'activa' || f.tipo === 'transicion');
  const fin_activa = primeraActiva ? primeraActiva.fin : fin;

  // Fin del primer reposo técnico
  const primerReposo = ordenadas.find((f) => f.tipo === 'reposo');
  const fin_espera = primerReposo ? primerReposo.fin : fin_activa;

  return { inicio, fin, fin_activa, fin_espera };
}

/**
 * Desplaza todas las fases por un delta en milisegundos (por arrastre en agenda).
 */
export function desplazarFases(fases: CitaFase[], deltaMs: number): CitaFase[] {
  return fases.map((fase) => ({
    ...fase,
    inicio: new Date(new Date(fase.inicio).getTime() + deltaMs).toISOString(),
    fin: new Date(new Date(fase.fin).getTime() + deltaMs).toISOString(),
    iniciada_at: fase.iniciada_at
      ? new Date(new Date(fase.iniciada_at).getTime() + deltaMs).toISOString()
      : fase.iniciada_at,
    cerrada_at: fase.cerrada_at
      ? new Date(new Date(fase.cerrada_at).getTime() + deltaMs).toISOString()
      : fase.cerrada_at,
  }));
}

/**
 * Modifica la duración de una fase específica y desplaza en cascada las fases posteriores
 * de la misma cita sin alterar el inicio de la cita.
 */
export function recalcularFasesDesdeOrden(
  fases: CitaFase[],
  ordenModificado: number,
  nuevosMinutos: number,
): CitaFase[] {
  const ordenadas = [...fases].sort((a, b) => a.orden - b.orden);
  const durMs = Math.max(1, nuevosMinutos) * 60 * 1000;
  let cursorMs: number | null = null;

  return ordenadas.map((fase) => {
    if (fase.orden < ordenModificado) {
      return { ...fase };
    }

    if (fase.orden === ordenModificado) {
      const iniMs = new Date(fase.inicio).getTime();
      const finMs = iniMs + durMs;
      cursorMs = finMs;
      return {
        ...fase,
        inicio: new Date(iniMs).toISOString(),
        fin: new Date(finMs).toISOString(),
      };
    }

    // Fases posteriores: se desplazan a partir del cursor
    const durOriginal = new Date(fase.fin).getTime() - new Date(fase.inicio).getTime();
    const iniMs = cursorMs!;
    const finMs = iniMs + durOriginal;
    cursorMs = finMs;
    return {
      ...fase,
      inicio: new Date(iniMs).toISOString(),
      fin: new Date(finMs).toISOString(),
    };
  });
}

/**
 * Extrae los tramos de reposo y tramos activos en formato numérico [iniMs, finMs].
 */
export function extraerVentanasFases(fases: CitaFase[]): {
  activas: Array<[number, number]>;
  reposos: Array<{ ini: number; fin: number; orden: number; etiqueta: string | null }>;
} {
  const activas: Array<[number, number]> = [];
  const reposos: Array<{ ini: number; fin: number; orden: number; etiqueta: string | null }> = [];

  for (const f of fases) {
    const ini = new Date(f.inicio).getTime();
    const fin = new Date(f.fin).getTime();
    if (f.tipo === 'reposo') {
      reposos.push({ ini, fin, orden: f.orden, etiqueta: f.etiqueta ?? null });
    } else {
      activas.push([ini, fin]);
    }
  }

  return { activas, reposos };
}
