import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface ExtractedDocument {
  type: 'text' | 'image';
  mimeType: string;
  content: string; // Plain text or Base64 string for images
  filename: string;
}

/**
 * Desempaqueta y extrae el texto estructurado de un archivo .docx
 */
async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

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
        return lines.join('\n');
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

  // Eliminar caracteres binarios de control
  formattedText = formattedText.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');

  return formattedText;
}

/**
 * Extrae texto de hojas de cálculo (.xlsx, .xls, .csv)
 */
async function extractTextFromExcel(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  let fullText = '';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      fullText += `--- Hoja: ${sheetName} ---\n${csv}\n\n`;
    }
  }

  return fullText.trim();
}

/**
 * Lee la imagen y devuelve su representación Base64
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
 * Función principal para procesar cualquier tipo de documento recibido
 */
export async function extractDocumentContent(file: File): Promise<ExtractedDocument> {
  const mimeType = file.type || 'application/octet-stream';
  const nameLower = file.name.toLowerCase();

  // 1. Imágenes (JPG, PNG, WEBP, GIF, etc.)
  if (mimeType.startsWith('image/') || nameLower.match(/\.(png|jpe?g|webp|gif|bmp)$/)) {
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

  // 4. Archivos de texto plano (.txt, .json, .md)
  try {
    const text = await file.text();
    return {
      type: 'text',
      mimeType: 'text/plain',
      content: text,
      filename: file.name,
    };
  } catch (e) {
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
