// lib/chispaEstructura.ts
// Capa de RECUPERACION VISUAL de Chispa (cliente).
//
// El edge deberia devolver siempre bloques tipados (tabla/kpi/enlace/...), pero
// el LLM a veces se cuela y emite un bloque 'texto' con markdown crudo: una
// tabla en pipes (| a | b |), enlaces escritos como texto ([enlace: Ir a X]),
// encabezados (## ...) y reglas (---). Sin esta capa se ven como texto feo con
// guiones y enlaces rotos (justo lo que reportan los usuarios).
//
// estructurarBloques() toma la respuesta ya normalizada y RECONSTRUYE la
// estructura: parte cada 'texto' en tabla/enlace/texto reales para que el
// renderer los pinte bien, y quita el menu "acciones rapidas" cuando la
// respuesta ya trae una superficie util (para que no aparezca SIEMPRE).
//
// Es 100% determinista y del lado cliente: no inventa datos, solo reinterpreta
// lo que el modelo escribio en texto. TypeScript puro (sin React) para testarlo.

import type { Bloque } from '@/lib/chispaBloques';
import { CHISPA_RUTAS } from '@/lib/chispaBloques';

// --- Resolucion de un texto de enlace a una ruta real -----------------------
// El LLM escribe cosas como "Ir a Servicios" / "Ver Equipo". Mapeamos por
// palabra clave a una CLAVE de CHISPA_RUTAS. Si no hay match claro, NO creamos
// un chip (mejor dejarlo como texto que mandar al usuario a una pantalla
// equivocada, que es una de las quejas).
const KEYWORDS_RUTA: { claves: string[]; ruta: keyof typeof CHISPA_RUTAS }[] = [
  { claves: ['lista de espera', 'lista espera', 'espera'], ruta: 'lista-espera' },
  { claves: ['presupuesto'], ruta: 'presupuestos' },
  { claves: ['resen', 'reseñ', 'opinion', 'valorac'], ruta: 'resenas' },
  { claves: ['bandeja', 'mensaj', 'chat'], ruta: 'bandeja' },
  { claves: ['inventario', 'stock', 'producto', 'almacen'], ruta: 'inventario' },
  { claves: ['mi jornada', 'jornada', 'mi dia'], ruta: 'mi-jornada' },
  { claves: ['campan', 'campañ', 'marketing'], ruta: 'campanas' },
  { claves: ['equipo', 'profesional', 'personal', 'empleado', 'estilista', 'plantilla'], ruta: 'equipo' },
  { claves: ['cliente', 'clienta', 'ficha'], ruta: 'clientes' },
  { claves: ['caja', 'cobro', 'cobrar', 'ticket', 'pago'], ruta: 'caja' },
  { claves: ['informe', 'estadistic', 'analitica', 'metrica', 'cifra'], ruta: 'informes' },
  // 'servicios', 'horario', 'ajustes'... viven dentro de Configuracion.
  { claves: ['servicio', 'catalogo', 'configurac', 'ajuste', 'horario', 'notificac', 'portal'], ruta: 'configuracion' },
  { claves: ['agenda', 'cita', 'calendario', 'reserva'], ruta: 'agenda' },
];

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Quita prefijos de accion ("ir a", "ver", "abrir", "->", flechas) del label.
function limpiaLabelEnlace(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/[→➜►▶]/g, '')
    .replace(/^\s*(ir a|ir al|ver|abrir|abre|vamos a|llevame a|ve a)\s+/i, '')
    .trim();
}

// Devuelve la ruta+label reales para un texto de enlace, o null si no hay match.
export function resolverEnlace(labelRaw: string): { ruta: string; label: string } | null {
  const limpio = limpiaLabelEnlace(labelRaw);
  const n = normaliza(limpio);
  if (!n) return null;
  for (const { claves, ruta } of KEYWORDS_RUTA) {
    if (claves.some((c) => n.includes(normaliza(c)))) {
      // Etiqueta amable: "Ir a " + nombre de pantalla canonico.
      return { ruta: CHISPA_RUTAS[ruta].ruta, label: CHISPA_RUTAS[ruta].label };
    }
  }
  return null;
}

// --- Deteccion y parseo de tablas markdown ----------------------------------
function esFilaTabla(linea: string): boolean {
  const t = linea.trim();
  return t.startsWith('|') && t.includes('|', 1);
}

// Linea separadora de cabecera: |---|:--:|---| (solo guiones, dos puntos y pipes).
function esSeparadorTabla(linea: string): boolean {
  const t = linea.trim();
  return /^\|?[\s:|-]+\|?$/.test(t) && t.includes('-');
}

function celdas(linea: string): string[] {
  let t = linea.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => limpiaCelda(c));
}

// Limpia una celda: markdown inline y emojis de severidad que el LLM cuela.
function limpiaCelda(c: string): string {
  return c
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function esNumerica(v: string): boolean {
  const n = v.replace(/[€%\s.]/g, '').replace(',', '.');
  return v.trim() !== '' && !Number.isNaN(Number(n)) && /\d/.test(v);
}

// Construye un bloque 'tabla' a partir de una cabecera + filas de datos.
function construirTabla(header: string[], filasRaw: string[][]): Bloque {
  const columnas = header.map((label, i) => {
    const todasNum = filasRaw.length > 0 && filasRaw.every((f) => !f[i] || esNumerica(f[i]));
    return { key: `c${i}`, label, alinear: (todasNum ? 'der' : 'izq') as 'der' | 'izq' };
  });
  const filas = filasRaw.map((f) => {
    const fila: Record<string, string> = {};
    header.forEach((_, i) => { fila[`c${i}`] = f[i] ?? ''; });
    return fila;
  });
  return { tipo: 'tabla', columnas, filas };
}

// --- Estructurado de UN bloque de texto -------------------------------------
// Devuelve una lista de bloques (texto/tabla/enlace) que representan el mismo
// contenido pero ya con la estructura visual recuperada.
export function estructurarTexto(texto: string): Bloque[] {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const out: Bloque[] = [];
  let buffer: string[] = [];

  const volcarTexto = () => {
    if (buffer.length === 0) return;
    const bloques = extraerEnlacesDeParrafo(buffer.join('\n'));
    out.push(...bloques);
    buffer = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    // Tabla markdown: cabecera + separador + filas.
    if (esFilaTabla(linea) && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      volcarTexto();
      const header = celdas(linea);
      const filasRaw: string[][] = [];
      let j = i + 2;
      while (j < lineas.length && esFilaTabla(lineas[j]) && !esSeparadorTabla(lineas[j])) {
        filasRaw.push(celdas(lineas[j]));
        j++;
      }
      out.push(construirTabla(header, filasRaw));
      i = j - 1;
      continue;
    }

    buffer.push(linea);
  }
  volcarTexto();

  // Si al final no quedo NADA (texto que era solo tabla), garantizamos algo.
  return out;
}

// Extrae los enlaces escritos como texto ([enlace: X], [Ir a X]) de un parrafo,
// los convierte en bloques 'enlace' reales y deja el texto restante como bloque
// 'texto' (limpiando encabezados markdown y reglas ---).
function extraerEnlacesDeParrafo(parrafo: string): Bloque[] {
  const enlaces: Bloque[] = [];
  // [enlace: LABEL]  y  [LABEL](ruta-ignorada)  y  lineas tipo "[Ir a X]"
  const patron = /\[(?:enlace:\s*)?([^\]]+?)\]/gi;
  const restante = parrafo.replace(patron, (match, label: string) => {
    const r = resolverEnlace(label);
    if (r) {
      enlaces.push({ tipo: 'enlace', ruta: r.ruta, label: r.label });
      return '';
    }
    return match; // no es un enlace reconocible: se deja tal cual
  });

  const textoLimpio = limpiaMarkdownBloque(restante);
  const bloques: Bloque[] = [];
  if (textoLimpio.trim()) bloques.push({ tipo: 'texto', texto: textoLimpio });
  bloques.push(...enlaces);
  return bloques;
}

// Limpia markdown de bloque que el renderer no maneja: encabezados (##) pasan a
// una linea en negrita; reglas horizontales (---, ***) se quitan; se colapsan
// lineas en blanco de sobra.
function limpiaMarkdownBloque(texto: string): string {
  return texto
    .split('\n')
    .map((l) => {
      const t = l.trim();
      if (/^[-*_]{3,}$/.test(t)) return ''; // regla horizontal
      const h = t.match(/^#{1,6}\s+(.*)$/);
      if (h) return `**${h[1].replace(/\*\*/g, '').trim()}**`;
      return l;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- API principal ----------------------------------------------------------
// Tipos de bloque que cuentan como "superficie util" (algo mas que texto).
const TIPOS_SUPERFICIE = new Set([
  'enlace', 'accion', 'grafica', 'comparativa', 'formulario', 'opciones',
  'progreso', 'kpi', 'barras', 'tabla', 'timeline',
]);

// ¿Es el menu automatico "¿Te ayudo con algo de esto?" que el edge adjunta como
// red de seguridad? Lo reconocemos por su id o su titulo.
function esAccionesRapidas(b: Bloque): boolean {
  if (b.tipo !== 'opciones') return false;
  const id = (b as Extract<Bloque, { tipo: 'opciones' }>).id ?? '';
  const titulo = (b as Extract<Bloque, { tipo: 'opciones' }>).titulo ?? '';
  return id.startsWith('acciones-rapidas') || /te ayudo con algo de esto/i.test(titulo);
}

// Reconstruye la estructura visual de una respuesta de Chispa: parte los bloques
// 'texto' en tabla/enlace/texto, y suprime el menu de acciones rapidas cuando ya
// hay una superficie util (para que solo aparezca como verdadero fallback).
export function estructurarBloques(bloques: Bloque[]): Bloque[] {
  const expandido: Bloque[] = [];
  for (const b of bloques) {
    if (b.tipo === 'texto') {
      const partes = estructurarTexto(b.texto);
      if (partes.length === 0) expandido.push(b);
      else expandido.push(...partes);
    } else {
      expandido.push(b);
    }
  }

  // ¿Hay ya una superficie util aparte del propio menu de acciones rapidas?
  const haySuperficieReal = expandido.some(
    (b) => TIPOS_SUPERFICIE.has(b.tipo) && !esAccionesRapidas(b),
  );
  if (haySuperficieReal) {
    return expandido.filter((b) => !esAccionesRapidas(b));
  }
  return expandido;
}
