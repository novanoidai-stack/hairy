import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { extractDocumentContent } from '@/lib/documentExtractor';
import { CATEGORY_COLOR_TOKENS } from '@/lib/categoryColors';
import { reportarError } from '@/lib/reportarError';

export interface ExtractedServicio {
  idTemp: string;
  nombre: string;
  precio: number;
  duracion_min: number;
  categoria: string;
  seleccionado: boolean;
  yaExiste?: boolean;
}

export interface ExtractedCatalogResult {
  ok: boolean;
  nombreNegocio?: string;
  direccion?: string;
  servicios: ExtractedServicio[];
  error?: string;
}

/**
 * Convierte strings de duración como "1 h 15 min", "30 min", "2 h 30 min", "4 h" a minutos enteros
 */
export function parseDurationToMinutes(durStr: string | number): number {
  if (typeof durStr === 'number') return Math.max(5, durStr);
  if (!durStr) return 30;

  const str = String(durStr).toLowerCase().trim();
  let total = 0;

  const hoursMatch = str.match(/(\d+)\s*(?:h|hora|horas)/);
  if (hoursMatch) {
    total += parseInt(hoursMatch[1], 10) * 60;
  }

  const minsMatch = str.match(/(\d+)\s*(?:m|min|minuto|minutos)/);
  if (minsMatch) {
    total += parseInt(minsMatch[1], 10);
  }

  if (total === 0) {
    // Si solo hay un número entero suelto
    const rawNum = parseInt(str.replace(/\D/g, ''), 10);
    if (!isNaN(rawNum) && rawNum > 0) return rawNum;
    return 30;
  }

  return total;
}

/**
 * Parser de respaldo (fallback) basado en heurísticas para procesar texto estructurado
 * como la Carta de Florent Suárez u otros documentos sin requerir API activa.
 */
function fallbackLocalCatalogParser(text: string): { nombreNegocio?: string; direccion?: string; servicios: ExtractedServicio[] } {
  // 1. Pre-procesar: quitar prefijo '>' y limpiar espacios
  const rawLines = text.split('\n')
    .map(l => l.replace(/^>\s*/, '').trim())
    .filter(Boolean);

  let currentCategory = 'General';
  let nombreNegocio = '';
  let direccion = '';
  const servicios: ExtractedServicio[] = [];

  // Palabras reservadas de encabezado de tabla que no son nombres de servicio ni categorías
  const headerWords = new Set(['servicio', 'precio', 'duración', 'duracion', 'nombre', 'tarifa']);

  // 2. Buscar posible cabecera del negocio en las primeras 5 líneas
  if (rawLines.length > 0 && !headerWords.has(rawLines[0].toLowerCase())) {
    nombreNegocio = rawLines[0];
  }
  for (let i = 1; i < Math.min(5, rawLines.length); i++) {
    const lo = rawLines[i].toLowerCase();
    if (lo.includes('avenida') || lo.includes('calle') || lo.includes('plaza') || lo.includes('paseo')) {
      direccion = rawLines[i];
    }
  }

  // Regex para detectar una línea que es solo un precio (ej: "30,00 €" o "30,00")
  const priceSoloRegex = /^(\d+[\.,]\d{2})\s*€?\s*$/;
  // Regex para detectar una línea que es solo duración (ej: "30 min", "1 h 15 min", "1 h")
  const durationSoloRegex = /^(\d+\s*h(?:\s*\d+\s*min)?|\d+\s*min)\s*$/i;
  // Regex para línea combinada o tabulada: "Secado Esprés \t 15,00 € \t 20 min"
  const priceInlineRegex = /(\d+[\.,]\d{2})\s*€?\s*(\d+\s*h(?:\s*\d+\s*min)?|\d+\s*min)?/i;

  // 3. Iterar reconociendo formatos:
  //   A) Formato tabulado (DOMParser): "Nombre \t Precio € \t Duración"
  //   B) Formato multilínea (DOCX): nombre en una línea, precio en la siguiente
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    // Ignorar encabezados de tabla sueltos
    if (headerWords.has(line.toLowerCase()) || line.match(/^servicio\s+precio\s+duraci[oó]n/i)) {
      i++;
      continue;
    }
    // Ignorar título "Carta de servicios…"
    if (line.toLowerCase().startsWith('carta de servicio')) { i++; continue; }

    // --- Formato Tabulado / Inline: "Secado Esprés \t 15,00 € \t 20 min" ---
    if (line.includes('\t') || line.includes('€')) {
      const inlineMatch = line.match(priceInlineRegex);
      if (inlineMatch) {
        const priceVal = parseFloat(inlineMatch[1].replace(',', '.'));
        const durVal = inlineMatch[2] ? parseDurationToMinutes(inlineMatch[2]) : 30;
        let serviceName = line.split('\t')[0].replace(inlineMatch[0], '').replace('€', '').trim();
        if (!serviceName && line.includes('\t')) {
          serviceName = line.split('\t')[0].trim();
        }
        if (serviceName && serviceName.length > 1 && !headerWords.has(serviceName.toLowerCase())) {
          servicios.push({
            idTemp: `srv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${servicios.length}`,
            nombre: serviceName,
            precio: priceVal,
            duracion_min: durVal,
            categoria: currentCategory,
            seleccionado: true,
          });
          i++;
          continue;
        }
      }
    }

    // --- Formato Multilínea (DOCX sin pestañas): la siguiente línea es un precio ---
    if (i + 1 < rawLines.length && priceSoloRegex.test(rawLines[i + 1])) {
      const serviceName = line;
      const priceStr = rawLines[i + 1].match(priceSoloRegex)![1];
      const priceVal = parseFloat(priceStr.replace(',', '.'));
      let durVal = 30;

      // ¿La línea i+2 es una duración?
      if (i + 2 < rawLines.length && durationSoloRegex.test(rawLines[i + 2])) {
        durVal = parseDurationToMinutes(rawLines[i + 2]);
        i += 3;
      } else {
        i += 2;
      }

      if (serviceName.length > 1 && !headerWords.has(serviceName.toLowerCase())) {
        servicios.push({
          idTemp: `srv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${servicios.length}`,
          nombre: serviceName,
          precio: priceVal,
          duracion_min: durVal,
          categoria: currentCategory,
          seleccionado: true,
        });
      }
      continue;
    }

    // --- No es servicio: posible categoría ---
    if (line.length < 60 && !line.includes('€') && !line.includes('http') && !line.includes('Avenida')) {
      if (i + 1 < rawLines.length && priceSoloRegex.test(rawLines[i + 1])) {
        i++;
        continue;
      }
      if (line !== nombreNegocio && line !== direccion && !headerWords.has(line.toLowerCase())) {
        currentCategory = line;
      }
    }

    i++;
  }

  return { nombreNegocio, direccion, servicios };
}

/**
 * Procesa cualquier documento (DOCX, XLSX, PDF, TXT, Imágenes) y extrae sus tarifas con IA
 */
async function marcarExistentes(servicios: ExtractedServicio[], negocioId: string): Promise<ExtractedServicio[]> {
  const { data: existentes } = await supabase
    .from('servicios')
    .select('nombre')
    .eq('negocio_id', negocioId);

  if (!existentes || existentes.length === 0) return servicios;

  const nombresExistentes = new Set(existentes.map(s => s.nombre.trim().toLowerCase()));
  return servicios.map(s => ({ ...s, yaExiste: nombresExistentes.has(s.nombre.trim().toLowerCase()) }));
}

export async function parseTarifasDocumento(file: File, negocioId: string): Promise<ExtractedCatalogResult> {
  try {
    const doc = await extractDocumentContent(file);

    // Si estamos en modo demo o el cliente prefiere local, llamar a la función edge de IA
    const { data, error: funcError } = await supabase.functions.invoke('migracion-magica', {
      body: {
        intencion: 'catalogo',
        mimeType: doc.mimeType,
        content: doc.content,
        negocioId,
      },
    });

    if (!funcError && data && data.ok && data.data && Array.isArray(data.data.servicios) && data.data.servicios.length > 0) {
      const rawServicios = data.data.servicios;
      let servicios: ExtractedServicio[] = rawServicios.map((s: any, idx: number) => ({
        idTemp: `srv_ai_${idx}_${Date.now()}`,
        nombre: s.nombre || `Servicio ${idx + 1}`,
        precio: typeof s.precio === 'number' ? s.precio : parseFloat(String(s.precio || 0).replace(',', '.')) || 0,
        duracion_min: parseDurationToMinutes(s.duracion_min),
        categoria: s.categoria || 'General',
        seleccionado: true,
      }));
      servicios = await marcarExistentes(servicios, negocioId);

      return {
        ok: true,
        nombreNegocio: data.data.nombre_negocio,
        direccion: data.data.direccion,
        servicios,
      };
    }

    // Fallback: Si el Edge Function devolvió error o no trajo servicios (o estamos procesando texto en local)
    if (doc.type === 'text') {
      const fallbackResult = fallbackLocalCatalogParser(doc.content);
      if (fallbackResult.servicios.length > 0) {
        const servicios = await marcarExistentes(fallbackResult.servicios, negocioId);
        return {
          ok: true,
          nombreNegocio: fallbackResult.nombreNegocio,
          direccion: fallbackResult.direccion,
          servicios,
        };
      }
    }

    return {
      ok: false,
      servicios: [],
      error: funcError?.message || data?.error || 'No se pudieron extraer tarifas del documento. Revisa el formato.',
    };
  } catch (e: any) {
    // Si hubo cualquier fallo de conexión o ejecución con la Edge Function, intentar el parser local de respaldo
    try {
      const doc = await extractDocumentContent(file);
      if (doc.type === 'text') {
        const fallbackResult = fallbackLocalCatalogParser(doc.content);
        if (fallbackResult.servicios.length > 0) {
          const servicios = await marcarExistentes(fallbackResult.servicios, negocioId);
          return {
            ok: true,
            nombreNegocio: fallbackResult.nombreNegocio,
            direccion: fallbackResult.direccion,
            servicios,
          };
        }
      }
    } catch {
      // Ignorar error del fallback y devolver el error original
    }

    return {
      ok: false,
      servicios: [],
      error: e?.message || 'Error al procesar el documento con IA.',
    };
  }
}

/**
 * Ejecuta la importación efectiva a la base de datos de Supabase
 */
export async function ejecutarImportacionTarifas(
  negocioId: string,
  serviciosAImportar: ExtractedServicio[],
  crearCategoriasAuto: boolean = true
): Promise<{ ok: boolean; creadas: number; actualizadas: number; categoriasCreadas: number; errores: string[] }> {
  let creadas = 0;
  let actualizadas = 0;
  let categoriasCreadas = 0;
  const errores: string[] = [];

  const elegidos = serviciosAImportar.filter(s => s.seleccionado && s.nombre.trim());
  if (elegidos.length === 0) {
    return { ok: false, creadas: 0, actualizadas: 0, categoriasCreadas: 0, errores: ['No se ha seleccionado ningún servicio para importar.'] };
  }

  try {
    // 1. Obtener categorías existentes
    const { data: existingCats } = await supabase
      .from('categorias_servicio')
      .select('id, nombre')
      .eq('negocio_id', negocioId);

    const catMap = new Map<string, string>(); // Nombre normalizado -> ID
    if (existingCats) {
      existingCats.forEach(c => catMap.set(c.nombre.trim().toLowerCase(), c.id));
    }

    // 2. Crear las categorías faltantes si está activado
    const categoriasUnicas = Array.from(new Set(elegidos.map(s => (s.categoria || 'General').trim())));

    if (crearCategoriasAuto) {
      let colorIdx = existingCats?.length || 0;
      for (const catNombre of categoriasUnicas) {
        const key = catNombre.toLowerCase();
        if (!catMap.has(key)) {
          // El color es un token semantico ('primary', 'success', ...), no un hex:
          // categorias_servicio_color_check lo exige asi y rechaza cualquier otro
          // valor (incl. hex como '#e5e7eb'), lo que antes tumbaba SIEMPRE la
          // creacion de categorias nuevas durante la importacion con IA.
          const color = CATEGORY_COLOR_TOKENS[colorIdx % CATEGORY_COLOR_TOKENS.length];
          const { data: newCat, error: catErr } = await supabase
            .from('categorias_servicio')
            .insert({
              negocio_id: negocioId,
              nombre: catNombre,
              orden: catMap.size + 1,
              color,
              icono: 'general',
            })
            .select('id')
            .single();

          if (catErr) {
            reportarError(catErr, { origen: 'app', tipo: 'operativo' });
            errores.push(`Categoría "${catNombre}": ${catErr.message}`);
          } else if (newCat) {
            catMap.set(key, newCat.id);
            categoriasCreadas++;
            colorIdx++;
          }
        }
      }
    }

    // 3. Insertar/actualizar los servicios. Upsert por (negocio_id, nombre): si el
    // salon ya tenia un servicio con ese nombre (alta manual previa o reimportacion
    // de la misma carta con precios corregidos), se actualiza en vez de fallar en
    // silencio contra el indice unico servicios_negocio_nombre_uq.
    for (const s of elegidos) {
      const catKey = (s.categoria || 'General').trim().toLowerCase();
      const categoriaId = catMap.get(catKey) || null;

      const { error: srvErr } = await supabase.from('servicios').upsert({
        negocio_id: negocioId,
        nombre: s.nombre.trim(),
        precio: Number(s.precio) || 0,
        duracion_activa_min: Number(s.duracion_min) || 30,
        categoria_id: categoriaId,
        activo: true,
      }, { onConflict: 'negocio_id,nombre' });

      if (srvErr) {
        reportarError(srvErr, { origen: 'app', tipo: 'operativo' });
        errores.push(`Servicio "${s.nombre}": ${srvErr.message}`);
      } else if (s.yaExiste) {
        actualizadas++;
      } else {
        creadas++;
      }
    }

    return {
      ok: creadas + actualizadas > 0,
      creadas,
      actualizadas,
      categoriasCreadas,
      errores,
    };
  } catch (e: any) {
    reportarError(e, { origen: 'app', tipo: 'operativo' });
    return {
      ok: false,
      creadas: 0,
      actualizadas: 0,
      categoriasCreadas: 0,
      errores: [e?.message || 'Error inesperado durante la importación.'],
    };
  }
}
