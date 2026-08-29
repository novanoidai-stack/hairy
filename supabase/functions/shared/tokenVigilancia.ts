// La puerta de VIGILANCIA_TOKEN, en un solo sitio.
//
// POR QUE EXISTE ESTE FICHERO
// Lo usan las dos funciones que llama GitHub Actions: `registrar-vigilancia`
// (recibe el informe de una corrida) y `ejecutar-vigilancia-bd` (dispara los
// vigilantes que viven dentro de Postgres). Las dos tienen `verify_jwt = false`
// en config.toml -- Actions no tiene JWT -- y por eso las dos TIENEN que
// autorizar por su cuenta: si no, quedan abiertas al mundo (regla 9 de CLAUDE.md).
//
// Estaba escrito una vez y se iba a escribir la segunda. Un chequeo de
// autorizacion copiado y pegado es exactamente el invariante repartido que la
// decision 10 llama "la fabrica de regresiones": el dia que uno de los dos se
// arregle, el otro se queda como estaba y nadie lo nota.
//
// POR QUE NO SE USA peticionDeServicio()
// Quien llama es un workflow de GitHub Actions, no la base de datos. Autorizar
// con la clave de servicio obligaria a guardarla en los secrets de GitHub: una
// credencial que abre TODA la base de datos, en un sitio mas, para hacer una
// sola cosa. El 28 ago 2026 se sacaron cinco claves de servicio del repositorio;
// no tiene sentido meter otra por la puerta de al lado. VIGILANCIA_TOKEN es un
// secreto propio cuyo peor uso posible es ensuciar la pestaña Salud.

/**
 * Un token no se compara con `===`: eso filtra su contenido midiendo cuanto
 * tarda en decir que no.
 */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

export type Veredicto =
  | { ok: true }
  | { ok: false; status: number; cuerpo: Record<string, unknown> };

/**
 * Comprueba la cabecera `x-vigilancia-token` contra el secreto del entorno.
 *
 * Falla RUIDOSAMENTE si no hay token configurado: sin el no se acepta nada. Un
 * valor por defecto silencioso es justo como se cuelan estos agujeros -- y como
 * una clave filtrada paso meses sin que nadie lo notara (regla 9).
 */
export function autorizarVigilancia(req: Request, quien: string): Veredicto {
  const esperado = Deno.env.get('VIGILANCIA_TOKEN');
  if (!esperado) {
    console.error(`[${quien}] falta VIGILANCIA_TOKEN en el entorno`);
    return { ok: false, status: 500, cuerpo: { error: 'sin_configurar', porque: 'falta VIGILANCIA_TOKEN' } };
  }

  const recibido = req.headers.get('x-vigilancia-token') ?? '';
  if (!igualesEnTiempoConstante(recibido, esperado)) {
    // Se registra la LONGITUD, nunca el valor: un token rechazado sigue siendo
    // un secreto de alguien, y los logs se leen.
    console.warn(`[${quien}] rechazada. x-vigilancia-token:`, recibido ? `len=${recibido.length}` : 'AUSENTE');
    return { ok: false, status: 401, cuerpo: { error: 'no_autorizado', porque: 'x-vigilancia-token no coincide' } };
  }

  return { ok: true };
}
