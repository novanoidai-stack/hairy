// Trae a la vista el elemento que esta explicando el recorrido guiado.
//
// Regla: los bloques ALTOS se alinean por arriba, no por el centro. Centrar un
// bloque mas alto que la pantalla deja a la vista justo su mitad de abajo, que
// es lo contrario de lo que se quiere ensenar (paso "la ficha": se veian las
// fotos y los consentimientos en vez de la cabecera del cliente).
export function traerAlFoco(el: HTMLElement | null | undefined) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const alto = el.getBoundingClientRect().height;
  const pantalla = typeof window !== 'undefined' ? window.innerHeight : 800;
  el.scrollIntoView({ behavior: 'smooth', block: alto > pantalla * 0.6 ? 'start' : 'center' });
}
