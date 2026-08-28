// Inventario de las pantallas que recorre el smoke. Es DATOS, no un test: si
// añades una pantalla, la añades aqui y queda vigilada sin escribir un spec.
//
// POR QUE CADA PANTALLA SE CARGA DESDE CERO
// El software mantiene MONTADAS en el DOM las pantallas ya visitadas. Medido: en
// /app/equipo el `innerText` del documento contiene a la vez el texto de Equipo,
// el de Caja y el de Clientes, porque se habia pasado por las tres. Consecuencia
// para un smoke: no se puede afirmar sobre el documento entero (el ancla de una
// pantalla la satisface otra que sigue montada) ni pulsar "todos los botones
// visibles" (pulsarias los de otra pantalla).
//
// La salida es cargar cada pantalla en un documento limpio: se apunta el iframe
// de la demo directamente a su ruta. Comprobado: asi /app/equipo da 632
// caracteres, solo de Equipo. Cuesta un arranque por pantalla (~12 s), pero un
// fallo señala UNA pantalla y no hay contaminacion posible.
//
// POR QUE DENTRO DE LA DEMO Y NO CON CREDENCIALES
// El modo demo entra solo con la cuenta publica (lib/supabase.ts) y solo se
// activa EMBEBIDO (`window.top !== window.self`). Asi el smoke corre en cada PR
// sin depender de que el repositorio tenga secrets, igual que el proyecto
// "publico" de playwright.config.ts.

export type Pantalla = {
  /** Nombre corto: es la clave del hallazgo en el panel (pantallas/rota-<nombre>). */
  nombre: string;
  /** Ruta dentro de la SPA. */
  ruta: string;
  /** Texto que TIENE que aparecer cuando la pantalla ha cargado de verdad. */
  ancla: RegExp;
  /**
   * `software` = va dentro del iframe de la demo (necesita sesion).
   * `publica`  = se abre directa, es para el cliente final.
   */
  tipo: 'software' | 'publica';
  /** Pantallas que tardan mas (informes agrega, inventario carga catalogo). */
  lenta?: boolean;
};

export const PANTALLAS: Pantalla[] = [
  // --- Operativa ---
  { nombre: 'agenda', ruta: '/app', ancla: /Nueva cita/i, tipo: 'software' },
  { nombre: 'mi-jornada', ruta: '/app/mi-jornada', ancla: /jornada|fichar|fichaje/i, tipo: 'software' },
  { nombre: 'lista-espera', ruta: '/app/lista-espera', ancla: /espera/i, tipo: 'software' },
  { nombre: 'citas', ruta: '/app/citas', ancla: /cita/i, tipo: 'software' },

  // --- CRM y marketing ---
  { nombre: 'clientes', ruta: '/app/clientes', ancla: /clientes activos|Nuevo cliente/i, tipo: 'software' },
  { nombre: 'bandeja', ruta: '/app/bandeja', ancla: /bandeja|mensaje|conversac/i, tipo: 'software' },
  { nombre: 'campanas', ruta: '/app/campanas', ancla: /campañ|campan/i, tipo: 'software' },

  // --- Gestion ---
  { nombre: 'caja', ruta: '/app/caja', ancla: /Vender producto|Cobro rápido/i, tipo: 'software' },
  { nombre: 'presupuestos', ruta: '/app/presupuestos', ancla: /presupuesto/i, tipo: 'software' },
  { nombre: 'equipo', ruta: '/app/equipo', ancla: /profesionales|Añadir profesional/i, tipo: 'software' },
  { nombre: 'inventario', ruta: '/app/inventario', ancla: /inventario|producto|stock/i, tipo: 'software', lenta: true },

  // --- Analisis ---
  { nombre: 'resenas', ruta: '/app/resenas', ancla: /reseñ|resen|valoraci/i, tipo: 'software' },
  { nombre: 'informes', ruta: '/app/informes', ancla: /informe|registro/i, tipo: 'software', lenta: true },
  { nombre: 'ayuda', ruta: '/app/ayuda', ancla: /ayuda|manual/i, tipo: 'software' },
  { nombre: 'configuracion', ruta: '/app/configuracion', ancla: /ajustes|configuraci/i, tipo: 'software', lenta: true },

  // --- Lo que ve el cliente final (rutas publicas, sin sesion) ---
  { nombre: 'portal-reserva', ruta: '/app/r/demo', ancla: /reservar|servicio/i, tipo: 'publica' },
  { nombre: 'portal-resena', ruta: '/app/resena/demo', ancla: /valorac|reseñ|puntuaci/i, tipo: 'publica' },
];

/**
 * Errores de consola que NO cuentan: ruido conocido de terceros o de la propia
 * plataforma. Cada patron lleva por que se ignora -- sin eso, esta lista acaba
 * siendo el sitio donde se esconden los fallos de verdad.
 */
export const RUIDO_CONSOLA: RegExp[] = [
  // Aviso de desarrollo de React, no un fallo.
  /Download the React DevTools/i,
  // Chrome avisa de handlers lentos; es rendimiento, no una regresion funcional.
  /\[Violation\]/i,
  /favicon\.ico/i,
  // react-native-web avisa de props de RN obsoletas en CADA render. Es deuda
  // conocida de la libreria, no del producto (deuda C14 de CLAUDE.md).
  /"?shadow\*"? style props are deprecated/i,
  /props\.pointerEvents is deprecated/i,
  /"?textShadow\*"? style props are deprecated/i,
  // Google Translate y Analytics se cargan en la landing que embebe la demo.
  /translate\.googleapis\.com|googletagmanager|google-analytics/i,
  // La analitica de Vercel solo existe desplegada: en el espejo local y en la
  // CI sus dos scripts dan 404. No es del producto y no se puede arreglar aqui.
  /_vercel\/(insights|speed-insights)\//i,
];

/** Peticiones fallidas que NO cuentan. */
export const RUIDO_RED: RegExp[] = [
  /favicon/i,
  /google-analytics|googletagmanager|translate\.google/i,
  // El realtime de Supabase reconecta solo: un 4xx suelto no es una regresion.
  /\/realtime\/v1\//i,
  // Sondeo de sesion del navegador; 401 esperado cuando no hay sesion propia.
  /\/auth\/v1\/user\b/i,
  // Ver RUIDO_CONSOLA: la analitica de Vercel no existe fuera de produccion.
  /_vercel\/(insights|speed-insights)\//i,
];
