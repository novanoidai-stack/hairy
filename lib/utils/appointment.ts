// Ocupacion real de un profesional (Modular 1, tiempos muertos productivos).
//
// Una cita NO es un bloque macizo: ocupa a su profesional en [inicio, fin_activa) y en
// [fin_espera, fin), y lo deja LIBRE durante el reposo [fin_activa, fin_espera) — ahi el
// tinte actua solo y encima se puede encajar otra cita.
//
// La regla vive en UN solo sitio, `fasesDe` + `chocaActivaActiva` de lib/retrasos.ts, que
// es tambien lo que replica el SQL de las RPC del portal (`coalesce(fin_espera, fin_activa)`).
// Este modulo era una segunda copia que leia el reposo al reves: con `fin_espera` a NULL
// daba por reposo TODO el tramo posterior a `fin_activa`, o sea, daba por libre la cola de
// cualquier color sembrado o importado sin fases. Por ahi se colaban citas encima de otras
// (la agenda las pintaba luego en dos columnas). Sin `fin_espera` no se puede afirmar que
// haya reposo: la cita ocupa entera.
import { fasesDe, chocaActivaActiva, type Fases } from '../retrasos';

export interface Cita {
  id: string;
  inicio: string;
  fin: string;
  profesional_id: string;
  cliente_id: string;
  servicio_id: string;
  [key: string]: any;
}

// Cita candidata (aun sin guardar) con sus cuatro marcas ya calculadas.
export interface CitaCandidata {
  inicio: Date;
  finActiva: Date;
  finEspera: Date;
  fin: Date;
}

function fasesDeCandidata(c: CitaCandidata): Fases {
  return {
    id: '__candidata__',
    ini: c.inicio.getTime(),
    finA: c.finActiva.getTime(),
    finE: c.finEspera.getTime(),
    fin: c.fin.getTime(),
  };
}

// Un tramo suelto se trata como una unica ventana activa (sin reposo propio).
function fasesDeTramo(inicio: Date, fin: Date): Fases {
  const ini = inicio.getTime();
  const f = fin.getTime();
  return { id: '__tramo__', ini, finA: f, finE: f, fin: f };
}

function relevantes(citas: Cita[], profId: string, excludeId?: string): Fases[] {
  const out: Fases[] = [];
  for (const cita of citas) {
    if (cita.profesional_id !== profId) continue;
    if (excludeId && cita.id === excludeId) continue;
    out.push(fasesDe(cita as any));
  }
  return out;
}

// True si el tramo [testStart, testEnd) pisa el trabajo real de alguna cita del profesional.
// El llamador lo invoca una vez por cada fase ACTIVA de lo que quiere colocar; para validar
// una cita entera de una tacada usa `citaSolapaOcupacion`, que no se deja ninguna fase.
export function isTimeSlotOccupied(
  testStart: Date,
  testEnd: Date,
  citas: Cita[],
  profId: string,
  excludeId?: string,
): boolean {
  const tramo = fasesDeTramo(testStart, testEnd);
  return relevantes(citas, profId, excludeId).some((f) => chocaActivaActiva(tramo, f));
}

// True si alguna de las DOS fases activas de la cita candidata pisa el trabajo real de
// otra cita del profesional. El reposo de la candidata puede solaparse sin problema: en
// ese rato el profesional esta libre y puede estar atendiendo a otra persona.
export function citaSolapaOcupacion(
  candidata: CitaCandidata,
  citas: Cita[],
  profId: string,
  excludeId?: string,
): boolean {
  const cand = fasesDeCandidata(candidata);
  return relevantes(citas, profId, excludeId).some((f) => chocaActivaActiva(cand, f));
}
