// lib/chispaFormato.ts
// S19: SELECCION DE FORMATO determinista para la capa de datos de Chispa.
//
// Regla de oro del plan V3: "casi nunca texto plano". Quien consulta los datos
// (el edge o el propio cliente) describe el RESULTADO con un descriptor neutral
// (DatoRespuesta) y esta funcion elige el MEJOR bloque visual, sin LLM y sin
// ambiguedad: cifra -> kpi · reparto por categoria -> barras · evolucion en el
// tiempo -> grafica · dos periodos -> comparativa · listado/historico -> tabla ·
// cronologia -> timeline. Las cifras SIEMPRE son reales (las trae el consumidor);
// aqui no se inventa ningun numero.
//
// Es TypeScript puro (sin React) para poder testarlo y para que el edge (Deno)
// pueda replicar la MISMA tabla de decision desde su propio prompt/tools.

import type { Bloque, ChispaUnidad } from '@/lib/chispaBloques';

export interface TarjetaKpi {
  label: string;
  valor: number;
  unidad: ChispaUnidad;
  deltaPct?: number;
  nota?: string;
}

export interface ColumnaTabla {
  key: string;
  label: string;
  alinear?: 'izq' | 'der';
  unidad?: ChispaUnidad;
}

export interface EventoCronologia {
  id: string;
  fecha: string;
  titulo: string;
  descripcion: string;
  icono?: string;
  color?: string;
}

// Descriptor neutral de un resultado de datos. El consumidor (edge/cliente) lo
// rellena con cifras reales; el formato final lo decide elegirFormatoDato().
export type DatoRespuesta =
  | { clase: 'cifra'; titulo?: string; label: string; valor: number; unidad: ChispaUnidad; deltaPct?: number; nota?: string }
  | { clase: 'cifras'; titulo?: string; tarjetas: TarjetaKpi[] }
  | { clase: 'reparto'; titulo: string; unidad: ChispaUnidad; datos: { etiqueta: string; valor: number }[] }
  | { clase: 'evolucion'; titulo: string; unidad: ChispaUnidad; serie: { fecha: string; valor: number }[] }
  | { clase: 'comparativa'; titulo: string; unidad: ChispaUnidad; actual: { label: string; valor: number }; anterior: { label: string; valor: number } }
  | { clase: 'listado'; titulo?: string; columnas: ColumnaTabla[]; filas: Record<string, string | number>[]; total?: Record<string, string | number> }
  | { clase: 'cronologia'; titulo: string; eventos: EventoCronologia[] };

// Convierte un descriptor de datos en el mejor bloque visual. Determinista.
export function elegirFormatoDato(d: DatoRespuesta): Bloque {
  switch (d.clase) {
    case 'cifra':
      return { tipo: 'kpi', titulo: d.titulo, tarjetas: [{ label: d.label, valor: d.valor, unidad: d.unidad, deltaPct: d.deltaPct, nota: d.nota }] };

    case 'cifras':
      return { tipo: 'kpi', titulo: d.titulo, tarjetas: d.tarjetas };

    case 'reparto': {
      // Un reparto de una sola categoria no es un grafico: es una cifra.
      if (d.datos.length <= 1) {
        const uno = d.datos[0];
        return uno
          ? { tipo: 'kpi', titulo: d.titulo, tarjetas: [{ label: uno.etiqueta, valor: uno.valor, unidad: d.unidad }] }
          : { tipo: 'texto', texto: `${d.titulo}: sin datos en el periodo.` };
      }
      return { tipo: 'barras', titulo: d.titulo, unidad: d.unidad, datos: d.datos };
    }

    case 'evolucion': {
      // Una serie de un solo punto no dibuja evolucion: mejor una cifra.
      if (d.serie.length <= 1) {
        const p = d.serie[0];
        return p
          ? { tipo: 'kpi', titulo: d.titulo, tarjetas: [{ label: d.titulo, valor: p.valor, unidad: d.unidad }] }
          : { tipo: 'texto', texto: `${d.titulo}: sin datos en el periodo.` };
      }
      return { tipo: 'grafica', titulo: d.titulo, unidad: d.unidad, serie: d.serie };
    }

    case 'comparativa':
      return { tipo: 'comparativa', titulo: d.titulo, unidad: d.unidad, actual: d.actual, anterior: d.anterior };

    case 'listado':
      return { tipo: 'tabla', titulo: d.titulo, columnas: d.columnas, filas: d.filas, total: d.total };

    case 'cronologia':
      return { tipo: 'timeline', titulo: d.titulo, eventos: d.eventos };
  }
}

// Convierte una tanda de descriptores en bloques (para respuestas compuestas).
export function elegirFormatoDatos(ds: DatoRespuesta[]): Bloque[] {
  return ds.map(elegirFormatoDato);
}

// "Nunca 'no puedo'": ante una peticion que no cae en ningun dato, se responde
// con una salida ACCIONABLE (enlaces a las pantallas mas probables) en vez de un
// parrafo seco. Devuelve un texto breve + los enlaces sugeridos.
export function bloqueFallbackAccionable(
  mensaje: string,
  enlaces: { ruta: string; label: string; descripcion?: string }[],
): Bloque[] {
  const bloques: Bloque[] = [{ tipo: 'texto', texto: mensaje }];
  for (const e of enlaces.slice(0, 4)) {
    bloques.push({ tipo: 'enlace', ruta: e.ruta, label: e.label, descripcion: e.descripcion });
  }
  return bloques;
}
