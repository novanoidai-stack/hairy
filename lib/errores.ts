// Mensajes de error humanos y CONTEXTUALES para todo el software.
// Convierte los errores crudos de Supabase/Postgres (codigos en ingles, jerga
// tecnica) en frases claras en español, indicando -cuando se puede- QUE campo
// falla. Asi, en vez de "Error al guardar" o "null value in column ...", la
// persona ve "Falta rellenar el telefono".
//
// Uso tipico en un form:
//   import { mensajeDeError, primerCampoVacio } from '@/lib/errores';
//   const falta = primerCampoVacio([{ valor: nombre, mensaje: 'Indica el nombre.' }]);
//   if (falta) { setError(falta); return; }
//   const { error } = await supabase.from('clientes').insert(row);
//   if (error) { setError(mensajeDeError(error)); return; }

interface ErrLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

// Columna de BD -> etiqueta legible para la clienta/usuaria.
const CAMPOS: Record<string, string> = {
  nombre: 'el nombre',
  nombre_publico: 'el nombre publico',
  apellidos: 'los apellidos',
  email: 'el email',
  correo: 'el email',
  telefono: 'el telefono',
  precio: 'el precio',
  duracion: 'la duracion',
  duracion_activa_min: 'la duracion',
  duracion_espera_min: 'el tiempo de reposo',
  categoria: 'la categoria',
  color: 'el color',
  slug: 'el enlace',
  fecha: 'la fecha',
  hora: 'la hora',
  inicio: 'la hora de inicio',
  fin: 'la hora de fin',
  servicio_id: 'el servicio',
  profesional_id: 'el profesional',
  cliente_id: 'la clienta',
  negocio_id: 'el negocio',
  puntuacion: 'la puntuacion',
  rol: 'el rol',
};

function etiqueta(col?: string): string {
  if (!col) return 'ese campo';
  return CAMPOS[col] || `el campo «${col}»`;
}

// Intenta extraer el nombre de columna/constraint del detalle de Postgres.
function columnaDe(e: ErrLike): string | undefined {
  const txt = `${e.details || ''} ${e.message || ''}`;
  // not-null: null value in column "telefono"
  let m = /column "([^"]+)"/i.exec(txt);
  if (m) return m[1];
  // unique: Key (email)=(x) already exists
  m = /Key \(([^)]+)\)=/i.exec(txt);
  if (m) return m[1].split(',')[0].trim();
  return undefined;
}

// Codigos tecnicos snake_case que lanzan las RPC/edges (raise exception '...') -> frase
// legible. Lo no listado se humaniza igualmente (ver humanizarCodigo), asi que ningun codigo
// crudo con guiones bajos llega a la UI.
const CODIGOS: Record<string, string> = {
  cita_ya_cobrada: 'Esta cita ya esta cobrada.',
  cita_no_encontrada: 'No se encuentra la cita.',
  cita_not_found: 'No se encuentra la cita.',
  cita_futura: 'La cita aun no ha pasado.',
  estado_no_valido: 'La cita no esta en un estado valido para esto.',
  no_autorizado: 'No tienes permiso para hacer esto.',
  cross_tenant: 'No tienes permiso para hacer esto.',
  sin_perfil: 'Tu usuario no tiene un negocio asignado.',
  no_es_pago_online: 'Ese cobro no es online; no se puede reembolsar desde aqui.',
  sin_pago_stripe: 'No hay un pago con tarjeta asociado a este cobro.',
  sin_payment_intent: 'No hay un pago con tarjeta asociado.',
  cobro_no_reembolsable: 'Este cobro no se puede reembolsar.',
  cobro_no_encontrado: 'No se encuentra el cobro.',
  no_reembolsable: 'Este cobro no se puede reembolsar.',
  hold_no_encontrado: 'No hay ninguna retencion (fianza) para esta cita.',
  no_es_hold: 'Este pago no es una retencion.',
  no_capturable: 'No se puede capturar la retencion.',
  no_liberable: 'No se puede liberar la retencion.',
  importe_invalido: 'El importe no es valido.',
};

// Convierte un codigo snake_case ("cita_ya_cobrada") en texto legible ("Cita ya cobrada.").
// Solo actua sobre identificadores en minusculas con guiones bajos; un texto normal (con
// espacios o mayusculas) no coincide y se deja intacto.
function humanizarCodigo(s: string): string | null {
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s)) return null;
  const txt = s.replace(/_/g, ' ').trim();
  return txt.charAt(0).toUpperCase() + txt.slice(1) + '.';
}

// Traduce un posible codigo tecnico a frase legible: mapa conocido primero, si no, humanizado.
// Devuelve null si no parece un codigo (es un texto normal que hay que respetar).
function textoDeCodigo(msg: string): string | null {
  const key = msg.trim();
  if (CODIGOS[key]) return CODIGOS[key];
  return humanizarCodigo(key);
}

/**
 * Devuelve un mensaje claro en español para un error de Supabase/Postgres/JS.
 * @param fallback mensaje si no se reconoce el error (personalizalo por contexto,
 *   p. ej. 'No se pudo guardar el servicio.').
 */
export function mensajeDeError(error: unknown, fallback = 'No se pudo completar la accion. Intentalo de nuevo.'): string {
  if (!error) return fallback;
  const e = error as ErrLike;
  const code = (e.code || '').toString();
  const msg = (e.message || '').toString();

  // Sin conexion / red
  if (/Failed to fetch|NetworkError|network request failed|fetch failed|ERR_NETWORK/i.test(msg)) {
    return 'Sin conexion. Revisa tu internet e intentalo de nuevo.';
  }

  // Errores de autenticacion (Supabase Auth): vienen en ingles, los pasamos a español.
  const authMap: [RegExp, string][] = [
    [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
    [/email not confirmed/i, 'Confirma tu email antes de entrar (revisa tu correo).'],
    [/user already registered|already been registered|already exists/i, 'Ya existe una cuenta con ese email.'],
    [/password should be at least (\d+)/i, 'La contraseña debe tener al menos $1 caracteres.'],
    [/weak.?password|password.*weak/i, 'La contraseña es demasiado debil.'],
    [/for security purposes|rate limit|too many requests|over_request_rate/i, 'Demasiados intentos. Espera un momento e intentalo de nuevo.'],
    [/unable to validate email|invalid email|email.*invalid/i, 'El email no es valido.'],
    [/signups? not allowed|signup is disabled/i, 'El registro no esta disponible ahora mismo.'],
    [/token has expired|otp.*expired/i, 'El enlace o codigo ha caducado. Pide uno nuevo.'],
  ];
  for (const [re, txt] of authMap) {
    const m = re.exec(msg);
    if (m) return txt.replace('$1', m[1] || '');
  }

  switch (code) {
    case '23505': return `Ya existe un registro con ${etiqueta(columnaDe(e))}. Usa uno distinto.`;
    case '23503': return 'No se puede: este dato esta vinculado a otros (por ejemplo, citas). Quita primero esa relacion.';
    case '23502': return `Falta rellenar ${etiqueta(columnaDe(e))}.`;
    case '23514': return `El valor de ${etiqueta(columnaDe(e))} no es valido.`;
    case '22001': return `El texto de ${etiqueta(columnaDe(e))} es demasiado largo.`;
    case '22P02': return 'Hay un valor con formato incorrecto. Revisa los campos.';
    case '42501': return 'No tienes permisos para hacer esto.';
    case 'P0001': return textoDeCodigo(msg) ?? (msg || fallback); // raise_exception: RPC en español, o codigo snake_case humanizado
    case '23P01': return 'Ese horario se solapa con otra reserva. Elige otro hueco.';
  }

  // Por texto (cuando no llega code fiable)
  if (/permission denied|row-level security|violates row-level/i.test(msg)) return 'No tienes permisos para hacer esto.';
  if (/duplicate key|already exists/i.test(msg)) return `Ya existe un registro con ${etiqueta(columnaDe(e))}.`;
  if (/violates not-null|null value in column/i.test(msg)) return `Falta rellenar ${etiqueta(columnaDe(e))}.`;
  if (/violates check constraint/i.test(msg)) return `El valor de ${etiqueta(columnaDe(e))} no es valido.`;
  if (/violates foreign key/i.test(msg)) return 'No se puede: este dato esta vinculado a otros (por ejemplo, citas).';

  // Codigo tecnico snake_case sin traducir (p.ej. 'cita_ya_cobrada' de una RPC/edge): humanizar.
  const porCodigo = textoDeCodigo(msg);
  if (porCodigo) return porCodigo;

  // Si el mensaje ya viene en español legible (tipico de RPC con raise), usarlo.
  if (msg && msg.length < 180 && /[áéíóúñ¿¡]| no | el | la | ya /i.test(msg)) return msg;

  return fallback;
}

/**
 * Valida una lista de campos obligatorios en orden y devuelve el primer
 * mensaje cuyo valor este vacio, o null si todos estan rellenos.
 */
export function primerCampoVacio(campos: { valor: unknown; mensaje: string }[]): string | null {
  for (const c of campos) {
    const v = typeof c.valor === 'string' ? c.valor.trim() : c.valor;
    if (v === '' || v === null || v === undefined) return c.mensaje;
  }
  return null;
}
