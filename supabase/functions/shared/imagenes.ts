// supabase/functions/shared/imagenes.ts
//
// Descarga una imagen en el servidor y la convierte a data URL para mandarla
// al modelo como bytes.
//
// Por que no pasar la URL directamente: las fotos de clientas viven en el bucket
// PRIVADO `cliente-fotos` y se sirven con signed URLs. Pasarle esa URL a
// OpenRouter significa entregar a un tercero (y a su proveedor de turno) una
// credencial de acceso valida durante todo su TTL, que cualquiera que la tenga
// puede reutilizar. Mandando los bytes, el proveedor ve la foto de esa peticion
// y nada mas. Es ademas lo que exigen los consentimientos que firman las clientas.

/** Tope por imagen. Por encima de esto no es una foto de un corte, es un problema. */
const TOPE_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

export class ErrorImagen extends Error {
  constructor(message: string, readonly codigo: 'url_invalida' | 'descarga' | 'demasiado_grande' | 'tipo_no_soportado') {
    super(message);
    this.name = 'ErrorImagen';
  }
}

function aBase64(bytes: Uint8Array): string {
  // btoa por trozos: con imagenes de varios MB, String.fromCharCode(...bytes)
  // revienta la pila de golpe.
  let binario = '';
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

/**
 * Acepta una data URL (se devuelve tal cual) o una URL http(s), que se descarga
 * aqui y se convierte en data URL.
 */
export async function comoDataUrl(origen: string): Promise<string> {
  if (origen.startsWith('data:')) return origen;

  let url: URL;
  try {
    url = new URL(origen);
  } catch {
    throw new ErrorImagen('La URL de la imagen no es valida', 'url_invalida');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ErrorImagen('Solo se admiten URLs http(s) o data URLs', 'url_invalida');
  }

  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) throw new ErrorImagen(`No se pudo descargar la imagen (HTTP ${res.status})`, 'descarga');

    const declarado = Number(res.headers.get('content-length') ?? 0);
    if (declarado > TOPE_BYTES) {
      throw new ErrorImagen('La imagen supera los 12 MB', 'demasiado_grande');
    }

    const tipo = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!TIPOS_PERMITIDOS.includes(tipo)) {
      throw new ErrorImagen(`Tipo de imagen no soportado: ${tipo}`, 'tipo_no_soportado');
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > TOPE_BYTES) {
      throw new ErrorImagen('La imagen supera los 12 MB', 'demasiado_grande');
    }

    return `data:${tipo};base64,${aBase64(bytes)}`;
  } catch (err) {
    if (err instanceof ErrorImagen) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new ErrorImagen('La descarga de la imagen tardo demasiado', 'descarga');
    }
    throw new ErrorImagen(`No se pudo descargar la imagen: ${(err as Error)?.message}`, 'descarga');
  } finally {
    clearTimeout(corte);
  }
}
