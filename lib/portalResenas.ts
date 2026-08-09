// Logica pura del bloque de resenas del portal publico. Vive fuera de la pagina
// para poder testearla en aislamiento con deno.
//
// OJO: no se importa ResenaItem de ./reservaPublica a proposito. Deno exige la
// extension .ts en los imports y Metro no la admite, asi que un import cruzado
// rompe uno de los dos. Se tipa estructuralmente solo lo que estas funciones
// necesitan: ResenaItem es asignable a NotasDeSalon.

export interface NotasDeSalon {
  trato?: number | null;
  productos?: number | null;
}

export interface BarraDistribucion {
  star: number;
  count: number;
  pct: number;
}

// Reparto de 5 a 1 estrellas, siempre con las cinco filas aunque la RPC no
// devuelva alguna. NUNCA inventa: sin datos, todo a cero. (El bloque anterior
// pintaba 164/15/2/1/0 sobre un total fijo de 182 resenas inexistentes.)
export function barrasDistribucion(
  distribucion: Record<string, number> | undefined,
  total: number
): BarraDistribucion[] {
  return [5, 4, 3, 2, 1].map((star) => {
    const count = distribucion?.[String(star)] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { star, count, pct };
  });
}

// Sub-notas del salon que se pintan en la tarjeta. Misma convencion que la
// pagina interna de resenas: solo se pintan las que no son nulas.
export function subNotas(r: NotasDeSalon): Array<{ etiqueta: string; valor: number }> {
  const out: Array<{ etiqueta: string; valor: number }> = [];
  if (r.trato != null) out.push({ etiqueta: 'Trato', valor: r.trato });
  if (r.productos != null) out.push({ etiqueta: 'Limpieza/Prod', valor: r.productos });
  return out;
}
