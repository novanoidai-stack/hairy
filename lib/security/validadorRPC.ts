/**
 * Pasada 3 / Micro-Tarea E1: Validador de Seguridad de Parámetros en Llamadas a Funciones RPC de Supabase
 * Detecta intentos de inyección SQL, traversal de directorio y parámetros fuera de rango en las llamadas
 * RPC antes de que lleguen a la base de datos, generando alertas de seguridad auditables.
 */

export interface ParametroRPC {
  nombre: string;
  valor: unknown;
}

export interface ResultadoValidacionRPC {
  esSeguro: boolean;
  alertas: string[];
  parametrosBloqueados: string[];
}

const PATRON_INYECCION_SQL = /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b|--|;|\bUNION\b|\bOR\b\s+['"]?1['"]?\s*=)/i;
const PATRON_PATH_TRAVERSAL = /\.\.[/\\]/;
const PATRON_SCRIPT_XSS = /<script[\s>]/i;

export function validarParametrosRPC(nombreFuncion: string, parametros: ParametroRPC[]): ResultadoValidacionRPC {
  const alertas: string[] = [];
  const parametrosBloqueados: string[] = [];

  for (const p of parametros || []) {
    const valorStr = typeof p.valor === 'string' ? p.valor : String(p.valor ?? '');

    if (PATRON_INYECCION_SQL.test(valorStr)) {
      alertas.push(`[SQL_INJECTION] Parámetro '${p.nombre}' en RPC '${nombreFuncion}' contiene patrón de inyección SQL.`);
      parametrosBloqueados.push(p.nombre);
    } else if (PATRON_PATH_TRAVERSAL.test(valorStr)) {
      alertas.push(`[PATH_TRAVERSAL] Parámetro '${p.nombre}' en RPC '${nombreFuncion}' contiene traversal de directorio.`);
      parametrosBloqueados.push(p.nombre);
    } else if (PATRON_SCRIPT_XSS.test(valorStr)) {
      alertas.push(`[XSS] Parámetro '${p.nombre}' en RPC '${nombreFuncion}' contiene script malicioso.`);
      parametrosBloqueados.push(p.nombre);
    }

    // Validación de rangos numéricos para parámetros de paginación
    if (p.nombre === 'limit' && typeof p.valor === 'number' && p.valor > 1000) {
      alertas.push(`[RANGE] Parámetro 'limit' excede el máximo permitido (1000). Valor: ${p.valor}.`);
      parametrosBloqueados.push(p.nombre);
    }
  }

  return {
    esSeguro: alertas.length === 0,
    alertas,
    parametrosBloqueados,
  };
}
