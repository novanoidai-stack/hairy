// Logica PURA (sin DOM/navegador) para detectar la palabra de activacion de
// Chispa ("Hola Mecha" / "Hola Chispa") dentro de un texto transcrito. Se
// separa de useChispaWakeWord.web.ts para poder testearla con `deno test`
// (igual que lib/retrasos.ts, lib/upsellCandidato.ts), sin depender de APIs
// de navegador. Ver diseno: docs/superpowers/specs/2026-07-11-chispa-voz-manos-libres-design.md

export const FRASES_ACTIVACION = ['hola mecha', 'hola chispa'];

// Minusculas, sin tildes, espacios colapsados y recortados. Determinista.
export function normalizarTextoVoz(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DeteccionActivacion {
  activado: boolean;
  // Lo que sigue a la frase de activacion (recortado), si el usuario dijo
  // algo mas en la misma frase ("hola mecha, cuanto llevo hoy" -> "cuanto llevo hoy").
  resto: string;
}

// Busca CUALQUIERA de las frases de activacion dentro del texto (no exige que
// sea el inicio exacto: "oye, hola mecha" tambien activa). Devuelve el resto
// del texto tras la PRIMERA aparicion de la frase encontrada.
export function detectarActivacion(texto: string, frases: string[] = FRASES_ACTIVACION): DeteccionActivacion {
  const normalizado = normalizarTextoVoz(texto);
  if (!normalizado) return { activado: false, resto: '' };
  for (const frase of frases) {
    const idx = normalizado.indexOf(frase);
    if (idx !== -1) {
      const resto = normalizado.slice(idx + frase.length).replace(/^[,.\s]+/, '').trim();
      return { activado: true, resto };
    }
  }
  return { activado: false, resto: '' };
}
