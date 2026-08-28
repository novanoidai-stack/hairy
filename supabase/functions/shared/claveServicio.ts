// La clave con la que el servidor habla con la base de datos SALTANDOSE las RLS.
// Es la llave maestra del proyecto: con ella se leen y se escriben los datos de
// cualquier salon sin que ninguna politica lo impida.
//
// POR QUE EXISTE ESTE FICHERO (28 ago 2026)
// Se encontraron cinco ficheros versionados con la `service_role` en claro en un
// repositorio PUBLICO, y la de produccion seguia siendo valida. Al ir a rotarla
// aparecio el problema de fondo: las claves heredadas (`anon` y `service_role`)
// derivan del JWT secret del proyecto y **Supabase ya no permite rotarlas**. No
// hay boton porque no existe la operacion.
//
// El camino oficial es sustituir la `service_role` por una *secret key*
// (`sb_secret_...`), que si se puede crear, nombrar y revocar por separado.
//
// QUE HACE ESTA FUNCION
// Devuelve la secret key nueva si esta disponible y, si no, la heredada. Las dos
// a la vez, a proposito: asi desplegar esto NO cambia nada hoy (sigue tirando de
// la heredada) y sigue funcionando el dia que se desactive. Sin ventana de
// corte, y sin tener que coordinar 32 despliegues con un cambio de clave.
//
// Supabase inyecta `SUPABASE_SECRET_KEYS` en las edge functions como un JSON
// indexado por nombre -- no una cadena suelta como la variable heredada --
// porque se puede tener una clave por componente y rotarlas por separado.
//
// TRAMPA YA RESUELTA, no volver a investigarla: una secret key NO es un JWT y no
// vale en la cabecera `Authorization: Bearer`. Aqui da igual, porque todas las
// funciones crean el cliente con `createClient(url, clave)` y el gateway sustituye
// esa cabecera por un JWT interno cuando ve un `Bearer sb_`. Donde SI importa es
// en las llamadas de `pg_net` y los Database Webhooks, que mandan la clave a mano
// en `Authorization`: esos hay que pasarlos a la cabecera `apikey`.

/** Nombre de la clave dentro de `SUPABASE_SECRET_KEYS`. Supabase crea la suya como `default`. */
const NOMBRE_POR_DEFECTO = "default";

// El aviso de que se sigue tirando del legado se emite UNA vez por instancia, no
// en cada llamada: estas funciones crean el cliente en cada peticion y el log se
// volveria ruido.
let avisadoDelLegado = false;

/**
 * Devuelve la clave de servicio con la que crear el cliente admin de Supabase.
 *
 * Prefiere la secret key nueva (`SUPABASE_SECRET_KEYS`) y cae a la heredada
 * (`SUPABASE_SERVICE_ROLE_KEY`) mientras siga activa.
 *
 * @param nombre Clave dentro de `SUPABASE_SECRET_KEYS`. Por defecto `default`.
 * @throws Si no hay ninguna de las dos: preferible reventar con un mensaje claro
 *         que construir un cliente con cadena vacia y fallar luego en la primera
 *         consulta con un error que no dice nada.
 */
export function claveServicio(nombre: string = NOMBRE_POR_DEFECTO): string {
  const nuevas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (nuevas) {
    try {
      const mapa = JSON.parse(nuevas) as Record<string, unknown>;
      const clave = mapa?.[nombre];
      if (typeof clave === "string" && clave.length > 0) return clave;
      console.warn(
        `[claveServicio] SUPABASE_SECRET_KEYS no trae ninguna clave "${nombre}". ` +
          `Disponibles: ${Object.keys(mapa ?? {}).join(", ") || "(ninguna)"}. Se usa la heredada.`,
      );
    } catch {
      // JSON mal formado: se cae al legado en vez de tumbar la funcion. Que la
      // variable nueva venga rota no puede dejar el salon sin servicio.
      console.warn(
        "[claveServicio] SUPABASE_SECRET_KEYS no es JSON valido. Se usa la heredada.",
      );
    }
  }

  const legado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legado) {
    if (!avisadoDelLegado) {
      avisadoDelLegado = true;
      console.warn(
        "[claveServicio] Usando la service_role HEREDADA. Ya no se puede rotar: " +
          "migrar a una secret key (sb_secret_...) en Settings > API Keys.",
      );
    }
    return legado;
  }

  throw new Error(
    "Falta la clave de servicio: ni SUPABASE_SECRET_KEYS ni SUPABASE_SERVICE_ROLE_KEY " +
      "estan definidas en el entorno de esta edge function.",
  );
}

/**
 * Igual que `claveServicio` pero devuelve `undefined` en vez de reventar.
 *
 * Para las funciones que YA tratan la ausencia de clave como un caso normal y
 * responden algo sensato (`vigilar-agenda` devuelve un error legible;
 * `notificar-solicitud` decide no bloquear). Ahi lanzar cambiaria el
 * comportamiento, que es justo lo que una mudanza de claves no debe hacer.
 */
export function claveServicioOpcional(
  nombre: string = NOMBRE_POR_DEFECTO,
): string | undefined {
  try {
    return claveServicio(nombre);
  } catch {
    return undefined;
  }
}

/**
 * ¿Es `valor` una clave de servicio valida de este proyecto?
 *
 * Existe por `agenda-optimizador`, que AUTENTICA a quien la llama comparando la
 * cabecera `Authorization` con la clave. Ahi no vale preguntar "cual uso yo",
 * sino "acepto la que me mandan": durante la migracion el cron puede seguir
 * mandando la heredada mientras la funcion ya conoce la nueva. Si se comparase
 * solo contra una, el cron dejaria de autenticarse EN SILENCIO.
 *
 * Comparacion en tiempo constante para no filtrar la clave carácter a carácter
 * midiendo cuanto tarda en decir que no.
 */
export function esClaveDeServicio(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const candidatas: string[] = [];

  const nuevas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (nuevas) {
    try {
      const mapa = JSON.parse(nuevas) as Record<string, unknown>;
      for (const v of Object.values(mapa ?? {})) {
        if (typeof v === "string" && v.length > 0) candidatas.push(v);
      }
    } catch {
      // Ignorado a proposito: si el JSON viene roto queda la heredada.
    }
  }
  const legado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legado) candidatas.push(legado);

  let alguna = false;
  for (const c of candidatas) if (igualesEnTiempoConstante(valor, c)) alguna = true;
  return alguna;
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/** Solo para tests: olvida que ya se aviso del legado. */
export function _reiniciarAvisoLegado(): void {
  avisadoDelLegado = false;
}
