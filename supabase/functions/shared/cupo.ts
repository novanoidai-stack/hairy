// supabase/functions/shared/cupo.ts
//
// Limite de uso por usuario y hora para las funciones de IA caras.
// Se apoya en la RPC `cupo_ia_disponible` (migrations/cupo-ia-por-usuario.sql).
//
// Decision consciente: si la RPC no existe o falla, DEJAMOS PASAR. Un salon
// trabajando no puede quedarse sin migrar clientes porque una migracion no se
// haya aplicado. Pero no se calla: deja un error en los logs bien visible,
// porque un cupo que no se aplica es un agujero de coste, no un detalle.

export interface ResultadoCupo {
  permitido: boolean;
  /** true si el limite no se pudo comprobar (RPC ausente o caida). */
  sinComprobar: boolean;
}

/**
 * `supabase` se tipa laxo a proposito: el cliente de supabase-js devuelve un
 * builder "thenable", no una Promise, y encadenar sus genericos aqui solo
 * ataria este helper a una version concreta del SDK.
 */
export async function comprobarCupo(
  // deno-lint-ignore no-explicit-any
  supabase: { rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> },
  funcion: string,
  maxHora: number,
): Promise<ResultadoCupo> {
  try {
    const { data, error } = await supabase.rpc('cupo_ia_disponible', {
      p_funcion: funcion,
      p_max_hora: maxHora,
    });

    if (error) {
      const mensaje = (error as { message?: string })?.message ?? String(error);
      console.error(
        `[cupo] NO SE PUDO APLICAR EL LIMITE de '${funcion}': ${mensaje}. ` +
        'Aplica migrations/cupo-ia-por-usuario.sql o el gasto de IA queda sin tope.',
      );
      return { permitido: true, sinComprobar: true };
    }

    return { permitido: data !== false, sinComprobar: false };
  } catch (err) {
    console.error(`[cupo] excepcion comprobando el limite de '${funcion}':`, err);
    return { permitido: true, sinComprobar: true };
  }
}
