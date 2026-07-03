// Tips mostrados bajo el spinner en pantallas de carga (app, login, demo).
// Copia hermana (mismo contenido) en web/assets/loading-tips.js — mantener ambas en sync a mano,
// no hay build compartido entre la app Expo y la web estática. Ver
// docs/superpowers/specs/2026-07-03-loading-tips-design.md

export const LOADING_TIPS: string[] = [
  'Desde la ficha de una cita puedes cobrar al momento con el botón "Cobrar": queda registrado en Caja sin pasos extra.',
  'La Lista de espera te deja ofrecer un hueco liberado al siguiente candidato sin llamar uno a uno.',
  'Cada profesional tiene su propio panel en "Mi jornada": horas trabajadas, cobrado y comisión, sin ver la caja del salón entero.',
  'El portal de reserva genera un QR: pégalo en el mostrador y las clientas reservan solas desde el móvil.',
  'Puedes bloquear a un cliente conflictivo con un toque desde su ficha — no podrá volver a reservar online.',
  'Las etiquetas de cliente (VIP, alérgica...) se ven de un vistazo en la agenda, sin abrir la ficha.',
  'Los presupuestos se envían con un enlace de pago: el cliente los acepta y paga sin salir del correo.',
  'En Informes puedes comparar lo estimado con lo realmente cobrado, para ver si hay hueco entre lo previsto y la caja.',
  'La ficha de color guarda las fases activa y de reposo del tinte, para no perder ningún detalle técnico entre visitas.',
  'Puedes crear recompensas — descuento, producto o servicio — que canjeas cuando el cliente llega al número de visitas que marques.',
  'Puedes cerrar el salón un día concreto desde Agenda sin tocar los horarios generales del equipo.',
  'La Bandeja de mensajes reúne las conversaciones de cada cliente junto a su presupuesto o cita.',
  'El arqueo de caja del día se calcula solo: efectivo, datáfono y propinas, listo para cuadrar al cerrar.',
  'Cada reseña que deja un cliente aparece automáticamente en su portal público, sin copiarla a mano.',
  'Los niveles de fidelización (Nuevo, Habitual, VIP...) se calculan solos según las visitas o el gasto de cada cliente.',
  'El checklist "Pon en marcha tu salón" te guía paso a paso hasta tener todo listo para tu primer cliente real.',
  'Desde Equipo puedes vincular la cuenta de acceso de cada profesional a su ficha, para que gestione su propia jornada.',
  'La agenda evita solapes automáticamente, incluso en servicios con fases de tinte encadenadas entre profesionales.',
  'Puedes generar todas las liquidaciones de comisiones del mes con un solo botón, sin calcular nada a mano.',
];

export const LOADER_STUCK_MESSAGE =
  'Esto está tardando más de lo normal — revisa tu conexión a internet.';

// Milisegundos tras los que un loader se considera "atascado" (§4/§6 del spec).
export const LOADER_STUCK_TIMEOUT_MS = 7000;

export function pickLoadingTip(excludeTip?: string): string {
  if (LOADING_TIPS.length <= 1) return LOADING_TIPS[0];
  let tip: string;
  do {
    tip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  } while (tip === excludeTip);
  return tip;
}
