import * as XLSX from 'xlsx';

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
  const bytes = new Uint8Array(arrayBuffer);

  // Intentar decodificar word/document.xml buscando las marcas ZIP
  const decoder = new TextDecoder('utf-8');
  const rawContent = decoder.decode(bytes);

  let xmlString = '';
  const docXmlIndex = rawContent.indexOf('word/document.xml');
  if (docXmlIndex !== -1) {
    xmlString = rawContent.substring(docXmlIndex);
  } else {
    xmlString = rawContent;
  }

  // Eliminar cualquier etiqueta XML (<w:p ...>, </w:p>, <w:t>, etc.)
  // Reemplazar párrafos <w:p> por salto de línea y celdas <w:tc> por tabulaciones
  let formattedText = xmlString
    .replace(/<w:p[ >]/gi, '\n')
    .replace(/<w:tc[ >]/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/w14:[a-z0-9]+="[^"]*"/gi, '') // Eliminar atributos residuales si existieran
    .replace(/w:[a-z0-9]+="[^"]*"/gi, '')
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
