// S16 (plan IA Chispa V3) — Coach intra-pagina.
//
// Chispa deja de "redirigir y soltar": puede aparecer flotando, senalar un
// elemento REAL de la pantalla en la que ya estas (coach mark), explicarlo
// in-situ y encadenar varias explicaciones ("y aqui...") sin navegar.
//
// Este modulo es solo DATOS + contrato:
//   - el evento global que dispara el coach (mismo patron que
//     CHISPA_CONFIG_GUIADA_EVENT en lib/chispaBloques.ts),
//   - el registro de guias (por pagina + una universal de orientacion),
//   - los helpers para elegir guia y lanzarla desde cualquier sitio.
// El motor visual vive en components/chispa/CoachLauncher.web.tsx.
//
// Anti-alucinacion: los `target` son selectores CSS que apuntan a anclas
// `data-coach="..."` REALES que existen en el DOM (nav lateral / tab bar /
// burbuja de Chispa). Si un ancla no esta en la pantalla actual (p.ej. una
// seccion oculta por rol o por el layout movil), el motor SALTA ese paso: nunca
// senala un elemento inexistente.

export const CHISPA_COACH_EVENT = 'mecha-chispa-coach';

// Un paso del coach: ancla + explicacion breve. La accion es opcional; cuando
// existe y lleva `ruta`, el motor navega (uso puntual, no el modo por defecto:
// el coach explica DONDE ESTAS, no te saca de ahi).
export interface CoachPaso {
  // Selector CSS del elemento a resaltar. Normalmente [data-coach="..."].
  target: string;
  titulo: string;
  cuerpo: string;
  // Preferencia de colocacion de la burbuja respecto al elemento. El motor la
  // corrige si no cabe. 'auto' por defecto.
  lado?: 'auto' | 'arriba' | 'abajo' | 'izquierda' | 'derecha';
  cta?: { label: string; ruta?: string };
}

export interface CoachGuia {
  id: string;
  // Nombre del segmento de (tabs) al que aplica ('index' = agenda), o '*' para
  // cualquiera. `guiaParaPagina` prioriza la especifica sobre la universal.
  pagina: string;
  titulo: string;
  pasos: CoachPaso[];
}

// Ancla siempre presente en la app autenticada (la pestana/burbuja de Chispa
// del panel cerrado, ver ChispaPanel.web.tsx). Sirve de red de seguridad: si
// ningun otro ancla de la pantalla existe, al menos este paso se puede mostrar.
const PASO_CHISPA: CoachPaso = {
  target: '[data-coach="chispa-bubble"]',
  titulo: 'Aqui me tienes siempre',
  cuerpo:
    'Soy Chispa, la IA de tu salon. Estoy en todas las pantallas: pideme lo que necesites y te lo dejo hecho o te acompano paso a paso.',
  lado: 'izquierda',
};

// Guia universal de orientacion: recorre la navegacion sin sacarte de la
// pantalla actual. Los pasos que no existan en esta vista (por rol o por movil)
// se saltan solos.
const ORIENTACION: CoachGuia = {
  id: 'orientacion',
  pagina: '*',
  titulo: 'Orientate en Mecha',
  pasos: [
    {
      target: '[data-coach="nav-agenda"]',
      titulo: 'Tu agenda, el corazon del dia',
      cuerpo: 'Aqui ves y organizas todas las citas. Es la pantalla donde mas vas a estar.',
    },
    {
      target: '[data-coach="nav-clientes"]',
      titulo: 'Tus clientas y su historial',
      cuerpo: 'Fichas, fotos, formulas de color y todo lo que hayais hecho antes, en un sitio.',
    },
    {
      target: '[data-coach="nav-caja"]',
      titulo: 'Cobros y caja del dia',
      cuerpo: 'Cobra servicios y productos y cuadra la caja sin salir del software.',
    },
    PASO_CHISPA,
  ],
};

// Guias por pagina: resaltan algo propio de esa vista y cierran con Chispa.
// Se apoyan en las mismas anclas de navegacion (siempre presentes) mas la
// burbuja; asi son robustas sin tener que instrumentar el interior de cada
// pantalla compleja.
const GUIAS: CoachGuia[] = [
  ORIENTACION,
  {
    id: 'agenda',
    pagina: 'index',
    titulo: 'Como sacar partido a la agenda',
    pasos: [
      {
        target: '[data-coach="nav-agenda"]',
        titulo: 'Estas en la Agenda',
        cuerpo: 'El dia se organiza por columnas de profesional. Arrastra una cita para moverla; Chispa evita solapes por ti.',
      },
      PASO_CHISPA,
    ],
  },
  {
    id: 'clientes',
    pagina: 'clientes',
    titulo: 'Como aprovechar Clientes',
    pasos: [
      {
        target: '[data-coach="nav-clientes"]',
        titulo: 'Estas en Clientes',
        cuerpo: 'Cada ficha guarda historial, fotos y formulas. Pideme "recupera a las que no vienen" y preparo el aviso.',
      },
      PASO_CHISPA,
    ],
  },
];

// Elige la guia mas especifica para una pagina; si no hay, la de orientacion.
export function guiaParaPagina(pagina: string): CoachGuia {
  const especifica = GUIAS.find((g) => g.pagina === pagina);
  return especifica ?? ORIENTACION;
}

export function guiaPorId(id: string): CoachGuia | undefined {
  return GUIAS.find((g) => g.id === id);
}

// Existe una guia especifica (no la universal) para esta pagina.
export function tieneGuiaDePagina(pagina: string): boolean {
  return GUIAS.some((g) => g.pagina === pagina);
}

// Dispara el coach desde cualquier sitio (panel, iniciativa proactiva, etc.).
// Sin argumento, el motor resuelve la guia de la pagina actual.
export function lanzarCoach(guiaId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHISPA_COACH_EVENT, { detail: { guiaId } }));
}
