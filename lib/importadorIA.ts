import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { extractDocumentContent } from '@/lib/documentExtractor';

export interface ExtractedServicio {
  idTemp: string;
  nombre: string;
  precio: number;
  duracion_min: number;
  categoria: string;
  seleccionado: boolean;
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
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentCategory = 'General';
  let nombreNegocio = '';
  let direccion = '';
  const servicios: ExtractedServicio[] = [];

  // Buscar posible cabecera del negocio en las primeras 5 líneas
  if (lines.length > 0 && !lines[0].toLowerCase().includes('servicio') && !lines[0].toLowerCase().includes('precio')) {
    nombreNegocio = lines[0];
  }
  for (let i = 1; i < Math.min(5, lines.length); i++) {
    if (lines[i].toLowerCase().includes('avenida') || lines[i].toLowerCase().includes('calle') || lines[i].toLowerCase().includes('plaza')) {
      direccion = lines[i];
    }
  }

  // Iterar sobre las líneas buscando encabezados de categoría y entradas de precio/duración
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignorar encabezados de tabla genéricos
    if (line.match(/^servicio\s+precio\s+duraci[oó]n/i)) continue;

    // Detectar patrones de línea con precio (ej: "Corte 30,00 € 30 min" o "30,00 € 30 min")
    const priceMatch = line.match(/(\d+[\.,]\d{2})\s*€?\s*(\d+\s*h(?:\s*\d+\s*min)?|\d+\s*min)?/i);

    if (priceMatch) {
      // Es una línea de servicio
      const priceVal = parseFloat(priceMatch[1].replace(',', '.'));
      const durVal = priceMatch[2] ? parseDurationToMinutes(priceMatch[2]) : 30;

      // Extraer el nombre del servicio eliminando el precio y duración
      let serviceName = line.replace(priceMatch[0], '').trim();
      // Si el nombre quedó vacío o muy corto, revisar si estaba en la posición previa
      if (!serviceName && i > 0 && !lines[i - 1].includes('€')) {
        serviceName = lines[i - 1];
      }

      if (serviceName && serviceName.length > 1) {
        servicios.push({
          idTemp: `srv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          nombre: serviceName,
          precio: priceVal,
          duracion_min: durVal,
          categoria: currentCategory,
          seleccionado: true,
        });
      }
    } else {
      // Si no contiene precio pero es un texto de cabecera corto, puede ser una categoría
      if (line.length < 50 && !line.includes('€') && !line.includes('http') && !line.includes('Avenida')) {
        // Evitar cambiar categoría si la línea es un título de servicio previa al precio
        if (i < lines.length - 1 && lines[i + 1].includes('€')) {
          // Es el nombre del servicio de la siguiente línea, no cambiar categoría
        } else {
          currentCategory = line;
        }
      }
    }
  }

  return { nombreNegocio, direccion, servicios };
}

/**
 * Procesa cualquier documento (DOCX, XLSX, PDF, TXT, Imágenes) y extrae sus tarifas con IA
 */
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
      const servicios: ExtractedServicio[] = rawServicios.map((s: any, idx: number) => ({
        idTemp: `srv_ai_${idx}_${Date.now()}`,
        nombre: s.nombre || `Servicio ${idx + 1}`,
        precio: typeof s.precio === 'number' ? s.precio : parseFloat(String(s.precio || 0).replace(',', '.')) || 0,
        duracion_min: parseDurationToMinutes(s.duracion_min),
        categoria: s.categoria || 'General',
        seleccionado: true,
      }));

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
        return {
          ok: true,
          nombreNegocio: fallbackResult.nombreNegocio,
          direccion: fallbackResult.direccion,
          servicios: fallbackResult.servicios,
        };
      }
    }

    return {
      ok: false,
      servicios: [],
      error: funcError?.message || data?.error || 'No se pudieron extraer tarifas del documento. Revisa el formato.',
    };
  } catch (e: any) {
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
): Promise<{ ok: boolean; creadas: number; categoriasCreadas: number; errores: string[] }> {
  let creadas = 0;
  let categoriasCreadas = 0;
  const errores: string[] = [];

  const elegidos = serviciosAImportar.filter(s => s.seleccionado && s.nombre.trim());
  if (elegidos.length === 0) {
    return { ok: false, creadas: 0, categoriasCreadas: 0, errores: ['No se ha seleccionado ningún servicio para importar.'] };
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
      for (const catNombre of categoriasUnicas) {
        const key = catNombre.toLowerCase();
        if (!catMap.has(key)) {
          const { data: newCat, error: catErr } = await supabase
            .from('categorias_servicio')
            .insert({
              negocio_id: negocioId,
              nombre: catNombre,
              orden: catMap.size + 1,
              color: '#e5e7eb',
              icono: 'scissors',
            })
            .select('id')
            .single();

          if (catErr) {
            errores.push(`Categoría "${catNombre}": ${catErr.message}`);
          } else if (newCat) {
            catMap.set(key, newCat.id);
            categoriasCreadas++;
          }
        }
      }
    }

    // 3. Insertar los servicios
    for (const s of elegidos) {
      const catKey = (s.categoria || 'General').trim().toLowerCase();
      const categoriaId = catMap.get(catKey) || null;

      const { error: srvErr } = await supabase.from('servicios').insert({
        negocio_id: negocioId,
        nombre: s.nombre.trim(),
        precio: Number(s.precio) || 0,
        duracion_activa_min: Number(s.duracion_min) || 30,
        categoria_id: categoriaId,
        activo: true,
      });

      if (srvErr) {
        errores.push(`Servicio "${s.nombre}": ${srvErr.message}`);
      } else {
        creadas++;
      }
    }

    return {
      ok: creadas > 0,
      creadas,
      categoriasCreadas,
      errores,
    };
  } catch (e: any) {
    return {
      ok: false,
      creadas: 0,
      categoriasCreadas: 0,
      errores: [e?.message || 'Error inesperado durante la importación.'],
    };
  }
}
