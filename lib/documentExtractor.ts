// xlsx (~8 MB en disco) y jszip solo hacen falta cuando alguien sube de verdad
// una hoja de calculo o un .docx. Importarlos arriba los metia en el bundle
// principal, asi que TODOS los visitantes los descargaban para no usarlos casi
// nunca. Con import() dinamico viajan en su propio trozo, bajo demanda.
type ModuloXlsx = typeof import('xlsx');
// jszip usa `export =`, asi que segun como lo envuelva el bundler el modulo
// llega tal cual o dentro de .default: se aceptan las dos formas.
type JsZip = typeof import('jszip');

let xlsxEnVuelo: Promise<ModuloXlsx> | null = null;
function cargarXlsx(): Promise<ModuloXlsx> {
  if (!xlsxEnVuelo) xlsxEnVuelo = import('xlsx');
  return xlsxEnVuelo;
}

let jszipEnVuelo: Promise<JsZip> | null = null;
function cargarJsZip(): Promise<JsZip> {
  if (!jszipEnVuelo) jszipEnVuelo = import('jszip').then((m) => ((m as any).default ?? m) as JsZip);
  return jszipEnVuelo;
}

export interface ExtractedDocument {
  type: 'text' | 'image';
  mimeType: string;
  content: string; // Plain text or Base64 string for images
  filename: string;
}

/**
 * Sanitiza texto extraído eliminando símbolos iniciales de formato ('>', '•', '*', '-', etc.)
 */
export function cleanExtractedText(rawText: string): string {
  return rawText
    .split('\n')
    .map(line => line.replace(/^[\s>•*\-#|~]+/g, '').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Desempaqueta y extrae el texto estructurado de un archivo .docx
 */
async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const JSZip = await cargarJsZip();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXmlFile = zip.file('word/document.xml');
  const xmlString = documentXmlFile ? await documentXmlFile.async('string') : '';

  if (!xmlString) return '';

  // 1. Usar DOMParser en navegador web para preservar estructura exacta de tablas (w:tbl, w:tr, w:tc)
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
      const body = doc.getElementsByTagName('w:body')[0] || doc.documentElement;
      const lines: string[] = [];

      for (let i = 0; i < body.childNodes.length; i++) {
        const node = body.childNodes[i] as Element;
        const nodeName = node.nodeName || '';

        if (nodeName === 'w:p') {
          const text = node.textContent?.replace(/\s+/g, ' ').trim();
          if (text) lines.push(text);
        } else if (nodeName === 'w:tbl') {
          const rows = node.getElementsByTagName('w:tr');
          for (let r = 0; r < rows.length; r++) {
            const cells = rows[r].getElementsByTagName('w:tc');
            const rowTexts: string[] = [];
            for (let c = 0; c < cells.length; c++) {
              const cellText = cells[c].textContent?.replace(/\s+/g, ' ').trim();
              if (cellText) rowTexts.push(cellText);
            }
            if (rowTexts.length > 0) {
              lines.push(rowTexts.join('\t'));
            }
          }
        }
      }

      if (lines.length > 0) {
        return cleanExtractedText(lines.join('\n'));
      }
    } catch {
      // Continuar al fallback de expresiones regulares
    }
  }

  // 2. Fallback con expresiones regulares eliminando adecuadamente etiquetas de apertura completas
  let formattedText = xmlString
    .replace(/<w:tr[\s\S]*?>/gi, '\n')
    .replace(/<w:p[\s\S]*?>/gi, '\n')
    .replace(/<w:tc[\s\S]*?>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n+/g, '\n')
    .trim();

  formattedText = formattedText.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');
  return cleanExtractedText(formattedText);
}

/**
 * Extrae texto de hojas de cálculo (.xlsx, .xls, .csv, .tsv)
 */
async function extractTextFromExcel(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const XLSX = await cargarXlsx();
  const workbook = XLSX.read(data, { type: 'array' });
  let fullText = '';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      fullText += `--- Hoja: ${sheetName} ---\n${csv}\n\n`;
    }
  }

  return cleanExtractedText(fullText);
}

/**
 * Extrae texto de archivos XML / HTML desnudando etiquetas
 */
async function extractTextFromXmlOrHtml(file: File): Promise<string> {
  const rawText = await file.text();
  if (typeof DOMParser !== 'undefined') {
    try {
      const parsed = new DOMParser().parseFromString(rawText, 'text/html');
      const textContent = parsed.body?.textContent || parsed.documentElement?.textContent || '';
      if (textContent.trim()) return cleanExtractedText(textContent);
    } catch {
      /* continuar */
    }
  }
  const stripped = rawText.replace(/<[^>]+>/g, ' ');
  return cleanExtractedText(stripped);
}

/**
 * Extrae texto de un PDF leyendo bloques de texto BT...ET o caracteres legibles
 */
async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const pdfRaw = decoder.decode(bytes);

    const matches: string[] = [];

    // Buscar cadenas Tj / TJ (operadores estándar de texto en formato PDF)
    const tjRegex = /\((.*?)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(pdfRaw)) !== null) {
      if (match[1] && match[1].trim().length > 1) {
        matches.push(match[1].trim());
      }
    }

    // Buscar arrays TJ [(Texto1) 12 (Texto2)] TJ
    const arrayTjRegex = /\[\s*((?:\(.*?\)\s*|-?\d+\s*)+)\]\s*TJ/gi;
    while ((match = arrayTjRegex.exec(pdfRaw)) !== null) {
      const subMatches = match[1].match(/\((.*?)\)/g);
      if (subMatches) {
        const joined = subMatches.map(s => s.slice(1, -1)).join('');
        if (joined.trim().length > 1) matches.push(joined.trim());
      }
    }

    if (matches.length > 5) {
      return cleanExtractedText(matches.join('\n'));
    }
  } catch {
    /* fallback a lectura directa */
  }

  // Fallback: leer texto plano de la estructura
  const text = await file.text().catch(() => '');
  const clean = cleanExtractedText(text.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' '));
  return clean;
}

/**
 * Lee cualquier imagen o documento binario y devuelve su representación Base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result?.toString() || '';
      const split = result.split(',');
      resolve(split.length > 1 ? split[1] : result);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Función principal universal para procesar cualquier tipo de documento o imagen recibido
 */
export async function extractDocumentContent(file: File): Promise<ExtractedDocument> {
  const mimeType = file.type || 'application/octet-stream';
  const nameLower = file.name.toLowerCase();

  // 1. Fotos e Imágenes (JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC)
  if (mimeType.startsWith('image/') || nameLower.match(/\.(png|jpe?g|webp|gif|bmp|heic|tiff?)$/)) {
    const base64 = await fileToBase64(file);
    return {
      type: 'image',
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
      content: base64,
      filename: file.name,
    };
  }

  // 2. Documentos Word (.docx)
  if (nameLower.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
    const text = await extractTextFromDocx(file);
    return {
      type: 'text',
      mimeType: 'text/plain',
      content: text,
      filename: file.name,
    };
  }

  // 3. Hojas de cálculo (.xlsx, .xls, .csv, .tsv)
  if (nameLower.match(/\.(xlsx?|csv|tsv)$/) || mimeType.includes('spreadsheet') || mimeType.includes('csv')) {
    const text = await extractTextFromExcel(file);
    return {
      type: 'text',
      mimeType: 'text/plain',
      content: text,
      filename: file.name,
    };
  }

  // 4. Documentos PDF (.pdf)
  if (nameLower.endsWith('.pdf') || mimeType.includes('pdf')) {
    const text = await extractTextFromPdf(file);
    // Si se pudo extraer texto claro del PDF, enviarlo como texto; si no (ej: PDF escaneado/foto), enviarlo como Base64 para Visión IA
    if (text && text.length > 50) {
      return {
        type: 'text',
        mimeType: 'text/plain',
        content: text,
        filename: file.name,
      };
    }
    const base64 = await fileToBase64(file);
    return {
      type: 'image',
      mimeType: 'application/pdf',
      content: base64,
      filename: file.name,
    };
  }

  // 5. Archivos XML y HTML (.xml, .html, .htm)
  if (nameLower.match(/\.(xml|html?)$/) || mimeType.includes('xml') || mimeType.includes('html')) {
    const text = await extractTextFromXmlOrHtml(file);
    return {
      type: 'text',
      mimeType: 'text/plain',
      content: text,
      filename: file.name,
    };
  }

  // 6. Archivos de texto plano (.txt, .json, .md, .rtf)
  try {
    const text = await file.text();
    return {
      type: 'text',
      mimeType: 'text/plain',
      content: cleanExtractedText(text),
      filename: file.name,
    };
  } catch {
    // Fallback: intentar base64 si falla la lectura de texto
    const base64 = await fileToBase64(file);
    return {
      type: 'image',
      mimeType,
      content: base64,
      filename: file.name,
    };
  }
}
