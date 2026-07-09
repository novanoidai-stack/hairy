// S17 (plan IA Chispa V3) — Tours y redirecciones guiadas.
//
// "Te llevo y te enseño": recorridos guiados paso a paso ENTRE pantallas. A
// diferencia del coach intra-pagina (S16, que explica la pantalla en la que ya
// estas), un tour NAVEGA por varias pantallas, resalta en cada una que mirar y
// avanza confirmando. Se apoya en el mismo visual (CoachMark) y en las mismas
// anclas `data-coach` reales que S16.
//
// Este modulo es solo DATOS + contrato:
//   - evento global que dispara un tour (mismo patron que S16),
//   - catalogo de tours curados (los flujos de mas valor),
//   - persistencia del progreso (reanudable tras cerrar/navegar).
// El motor visual vive en components/chispa/TourLauncher.web.tsx.
//
// Anti-alucinacion: cada paso apunta a una ruta real de app/(tabs) y a un ancla
// `data-coach` que existe en esa pantalla en movil Y escritorio (nav-agenda,
// nav-clientes, nav-caja, chispa-bubble). Si un ancla no aparece (p.ej. por
// rol), el motor avanza al siguiente paso: nunca deja al usuario encallado.

export const CHISPA_TOUR_EVENT = 'mecha-chispa-tour';

export interface TourPaso {
  // Nombre del segmento de (tabs) donde vive el paso ('index' = agenda).
  pagina: string;
  // Ruta expo-router para navegar hasta el (coincide con CHISPA_RUTAS).
  ruta: string;
  // Ancla `data-coach` a resaltar en esa pantalla.
  target: string;
  titulo: string;
  cuerpo: string;
}

export interface Tour {
  id: string;
  titulo: string;
  descripcion: string;
  pasos: TourPaso[];
}

// Paso final reutilizable: cierra el tour presentando a Chispa (ancla siempre
// presente en la app autenticada). Se queda en la pagina en la que estes.
function pasoChispa(pagina: string, ruta: string): TourPaso {
  return {
    pagina, ruta,
    target: '[data-coach="chispa-bubble"]',
    titulo: 'Y yo te acompano siempre',
    cuerpo: 'Estoy en todas las pantallas. Pideme lo que necesites por voz o texto y te lo dejo hecho, o vuelve a pedirme un tour cuando quieras.',
  };
}

export const TOURS: Tour[] = [
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos en Mecha',
    descripcion: 'Un recorrido rapido por las tres pantallas que mas vas a usar: agenda, clientas y caja.',
    pasos: [
      {
        pagina: 'index', ruta: '/(tabs)',
        target: '[data-coach="nav-agenda"]',
        titulo: 'Tu agenda, el corazon del dia',
        cuerpo: 'Aqui ves y organizas todas las citas por profesional. Es la pantalla donde mas vas a estar.',
      },
      {
        pagina: 'clientes', ruta: '/(tabs)/clientes',
        target: '[data-coach="nav-clientes"]',
        titulo: 'Tus clientas y su historial',
        cuerpo: 'Cada ficha guarda historial, fotos y formulas de color. Desde aqui las buscas y las gestionas.',
      },
      {
        pagina: 'caja', ruta: '/(tabs)/caja',
        target: '[data-coach="nav-caja"]',
        titulo: 'Cobra sin salir del software',
        cuerpo: 'Cobra servicios y productos y cuadra la caja del dia. Todo queda registrado.',
      },
      pasoChispa('caja', '/(tabs)/caja'),
    ],
  },
  {
    id: 'primer-cobro',
    titulo: 'Haz tu primer cobro',
    descripcion: 'Del calendario a la caja: como cobrar una cita de principio a fin.',
    pasos: [
      {
        pagina: 'index', ruta: '/(tabs)',
        target: '[data-coach="nav-agenda"]',
        titulo: 'Empieza en la agenda',
        cuerpo: 'Elige en tu agenda la cita que quieres cobrar. Cuando el servicio este hecho, pasa a Caja.',
      },
      {
        pagina: 'caja', ruta: '/(tabs)/caja',
        target: '[data-coach="nav-caja"]',
        titulo: 'Cierra el cobro en Caja',
        cuerpo: 'En Caja seleccionas la cita, anades productos si hace falta y cobras. Chispa puede sugerirte un producto complementario.',
      },
    ],
  },
];

export function tourPorId(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}

// Dispara un tour desde el principio (panel, iniciativa, Avisos...).
export function lanzarTour(id: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHISPA_TOUR_EVENT, { detail: { tourId: id, reiniciar: true } }));
}

// Reanuda el tour con progreso guardado (si lo hay). Devuelve true si habia algo
// que reanudar. Lo usa la entrada "Reanudar tour" del panel.
export function reanudarTour(): boolean {
  if (typeof window === 'undefined') return false;
  const p = leerProgresoTour();
  if (!p) return false;
  window.dispatchEvent(new CustomEvent(CHISPA_TOUR_EVENT, { detail: { tourId: p.id, reiniciar: false } }));
  return true;
}

// --- Reanudabilidad (progreso durable) ---------------------------------------
// Guardamos el tour en curso en localStorage para poder reanudarlo tras cerrar
// el navegador o navegar fuera. No usa BD: es preferencia local del usuario.
const LS_KEY = 'mecha-tour-progreso';

export interface ProgresoTour { id: string; idx: number }

export function guardarProgresoTour(id: string, idx: number): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ id, idx })); } catch { /* almacenamiento no disponible */ }
}

export function leerProgresoTour(): ProgresoTour | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ProgresoTour;
    if (p && typeof p.id === 'string' && typeof p.idx === 'number' && tourPorId(p.id)) return p;
    return null;
  } catch { return null; }
}

export function limpiarProgresoTour(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* almacenamiento no disponible */ }
}
