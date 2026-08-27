import { test, expect, type Page, type Route } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { entrarAlSoftware as abrirSoftware } from './helpers/software';

// Agenda: jornada real por profesional y "Enseñamelo" paso a paso.
//
// Contexto de los bugs que blindan estos tests:
//   - La rejilla pintaba a TODOS los profesionales con la ventana del salon
//     porque nunca cargaba horarios_profesional.
//   - El bloque que derivaba la pausa de comida leia `horarios`
//     (negocio_horarios), que no tiene ni profesional_id ni hora_fin: salia
//     siempre vacio y no pinto nada jamas.
//   - horarios_profesional NO tiene columna negocio_id; filtrar por ella
//     devuelve cero filas en silencio.
//   - "Enseñamelo" encendia TODOS los problemas del dia a la vez.
//
// Requiere sesion: la agenda no es publica, y ademas horarios_profesional y
// bloqueos_profesional tienen RLS de "own negocio" (por eso esto NO se puede
// verificar en la demo, que es anonima). La sesion la deja tests/auth.setup.ts.
//
// POR QUE EL ESCENARIO SE SIMULA (27 ago 2026)
// --------------------------------------------
// La version anterior entraba a la agenda y buscaba el texto "Fuera de jornada"
// tal cual estuviera el salon de pruebas ese dia. Eso no comprobaba el
// mecanismo: comprobaba los DATOS. La marca solo aparece si algun profesional
// tiene ese dia un horario distinto al del salon, y el 27 ago 2026 ninguno lo
// tenia, asi que el test agotaba sus 45 s con la agenda entera pintada
// perfectamente detras. Dependia ademas del dia de la semana (si el salon
// cierra, no se pinta ni un solo bloque de jornada) y de que nadie tocara la
// siembra del tenant.
//
// Ahora el escenario se fuerza interceptando las consultas que lo alimentan
// (mismo patron que tests/staff-jornada.spec.ts) y se afirma sobre ESTRUCTURA,
// no sobre datos concretos — el criterio de tests/agenda-demo.spec.ts. Lo que
// se prueba es lo unico que de verdad puede romperse en un refactor: que con
// una jornada propia distinta a la del salon, la rejilla la pinte.

test.use({ storageState: STORAGE_STATE });

// ---------------------------------------------------------------------------
// Escenario simulado
// ---------------------------------------------------------------------------

interface FilaJornada {
  profesional_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  turno: number;
}

// OJO: las dos tablas de horario cuentan los dias AL REVES.
//   horarios_profesional.dia_semana -> 0 = DOMINGO (extract(dow) de Postgres)
//   negocio_horarios.dia_semana     -> 0 = LUNES
// La rejilla convierte el getDay() de JS a cada una por su lado. Aqui solo hace
// falta el de horarios_profesional porque el salon se simula abierto los siete
// dias, precisamente para no tener que acertar con la otra convencion.
const HOY_DOW = new Date().getDay();

// Rejilla de la agenda (lib/constants.ts): de 09:00 a 20:00.
const REJILLA_ABRE = '09:00:00';
const SALON_CIERRA = '20:00:00';

async function responderJson(route: Route, cuerpo: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    // La app corre en 127.0.0.1:8080 y Supabase es otro origen: sin este
    // encabezado el navegador tira la respuesta simulada por CORS y la consulta
    // parece haber devuelto un error de red.
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(cuerpo),
  });
}

// Monta la agenda con un dia inventado de punta a punta:
//   - el salon ABIERTO hoy de 09:00 a 20:00 (toda la rejilla) y sin festivos,
//     porque con el salon cerrado la rejilla no pinta jornadas: pinta el cierre;
//   - sin bloqueos reales (vacaciones, bajas, huecos retenidos), que se apilan
//     sobre los mismos tramos y desplazan las etiquetas;
//   - los horarios propios que pida `construirFilas`.
//
// Devuelve los ids de profesional que se usaron, para poder distinguir "el
// mecanismo no pinta" de "este tenant no tiene profesionales".
async function montarAgendaConJornada(
  page: Page,
  construirFilas: (idsProfesionales: string[]) => FilaJornada[],
  salonAbre: string = REJILLA_ABRE,
): Promise<string[]> {
  // Los ids tienen que ser los REALES del salon: el bloque se pinta por columna
  // y la columna casa la fila con `prof.id`, asi que un uuid inventado no pinta
  // nada. Se leen de la propia consulta de profesionales sin interceptarla (solo
  // se escucha la respuesta), que es la forma de no alterar lo que la app pide.
  let resolverIds: (ids: string[]) => void = () => {};
  const idsProfesionales = new Promise<string[]>((res) => {
    resolverIds = res;
  });
  page.on('response', async (respuesta) => {
    if (!/\/rest\/v1\/profesionales\?/.test(respuesta.url())) return;
    const cuerpo = await respuesta.json().catch(() => null);
    if (!Array.isArray(cuerpo)) return;
    const ids = cuerpo.map((p: { id?: string }) => p?.id).filter(Boolean) as string[];
    if (ids.length) resolverIds(ids);
  });

  await page.route('**/rest/v1/negocio_horarios**', (route) =>
    responderJson(
      route,
      [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        dia_semana: dia,
        abierto: true,
        apertura: salonAbre,
        cierre: SALON_CIERRA,
      })),
    ),
  );
  await page.route('**/rest/v1/cierres_negocio**', (route) => responderJson(route, []));
  await page.route('**/rest/v1/bloqueos_profesional**', (route) => responderJson(route, []));
  await page.route('**/rest/v1/horarios_profesional**', async (route) => {
    // Espera a conocer los ids reales. Los dos GET salen juntos en el mismo
    // Promise.all de la agenda, asi que este se retiene aqui mientras el de
    // profesionales (que no esta interceptado) termina.
    const ids = await Promise.race([
      idsProfesionales,
      new Promise<string[]>((res) => setTimeout(() => res([]), 25000)),
    ]);
    await responderJson(route, construirFilas(ids));
  });

  await abrirSoftware(page, '/app');
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 30000 });

  const ids = await Promise.race([
    idsProfesionales,
    new Promise<string[]>((res) => setTimeout(() => res([]), 5000)),
  ]);
  expect(
    ids.length,
    'no se leyo ningun profesional del salon de pruebas: sin columnas no hay jornada que pintar',
  ).toBeGreaterThan(0);
  return ids;
}

test.describe('Agenda — jornada real', () => {
  test('la rejilla marca el tramo en el que el profesional aun no ha entrado o ya ha salido', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Todos los profesionales entran a las 12:00 y salen a las 17:00 con el
    // salon abierto de 09:00 a 20:00: la rejilla tiene que negar 09:00-12:00 y
    // 17:00-20:00 en cada columna.
    await montarAgendaConJornada(page, (ids) =>
      ids.map((id) => ({
        profesional_id: id,
        dia_semana: HOY_DOW,
        hora_inicio: '12:00:00',
        hora_fin: '17:00:00',
        turno: 1,
      })),
    );

    // Se espera a la marca en vez de leer el HTML de golpe: la rejilla pinta los
    // horarios propios cuando llega su consulta, no al montar.
    await expect(
      page.getByText(/Fuera de jornada/).first(),
      'la rejilla no marco ningun tramo fuera de jornada pese a que todos entran 3 h despues de abrir',
    ).toBeAttached({ timeout: 30000 });

    // Y con el motivo correcto: que la etiqueta salga pero diga otra hora
    // significaria que la rejilla esta leyendo el horario del salon, que es
    // exactamente el bug original.
    await expect(
      page.getByText('Entra a las 12:00').first(),
      'no se marco el tramo previo a la entrada del profesional',
    ).toBeAttached({ timeout: 30000 });
    await expect(
      page.getByText('Termina a las 17:00').first(),
      'no se marco el tramo posterior a la salida del profesional',
    ).toBeAttached({ timeout: 30000 });
  });

  test('la rejilla marca el dia entero de quien tiene horario pero hoy no trabaja', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Con horario configurado en OTRO dia de la semana y ninguno hoy. Es un caso
    // distinto del anterior en el codigo (`tieneAlgunHorario` con
    // `profHorarios` vacio) y tiene su propio texto.
    await montarAgendaConJornada(page, (ids) =>
      ids.map((id) => ({
        profesional_id: id,
        dia_semana: (HOY_DOW + 3) % 7,
        hora_inicio: '10:00:00',
        hora_fin: '18:00:00',
        turno: 1,
      })),
    );

    await expect(
      page.getByText(/No trabaja este d[ií]a/).first(),
      'la rejilla no marco el dia libre de un profesional con horario en otros dias',
    ).toBeAttached({ timeout: 30000 });
  });

  test('sin horario propio la rejilla no inventa tramos fuera de jornada', async ({ page }) => {
    test.setTimeout(90000);

    // El negativo del primer test. Un salon recien dado de alta no tiene ni una
    // fila en horarios_profesional: ahi la rejilla debe pintar la ventana del
    // salon entera y NO negar nada. Si esto falla, la agenda estaria tachando
    // horas laborables de un salon que nunca configuro jornadas.
    //
    // El salon abre a las 10:00 (la rejilla empieza a las 09:00) a proposito:
    // eso obliga a pintar un bloque de "salon cerrado" que sale del MISMO bucle
    // que los de jornada. Sirve de ancla — sin el, un `toHaveCount(0)` acierta
    // en el primer sondeo, antes de que la rejilla haya pintado nada, y el test
    // pasaria siempre.
    await montarAgendaConJornada(page, () => [], '10:00:00');

    await expect(
      page.getByText('El salón abre a las 10:00').first(),
      'la rejilla no llego a pintar sus bloques: la ausencia de jornada no probaria nada',
    ).toBeAttached({ timeout: 30000 });

    await expect(page.getByText(/Fuera de jornada/)).toHaveCount(0);
    await expect(page.getByText(/No trabaja este d[ií]a/)).toHaveCount(0);
  });

  test('Enseñamelo resalta un problema cada vez, no todos a la vez', async ({ page }) => {
    await abrirSoftware(page, '/app');
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 30000 });

    const toggle = page.getByRole('button', { name: /Enséñamelo|Ensenamelo/i }).first();
    if ((await toggle.count()) === 0) test.skip(true, 'no hay boton Enseñamelo en esta vista');
    await toggle.click();
    await page.waitForTimeout(1500);

    const zonas = await page.evaluate(() => document.querySelectorAll('[data-mecha-zona]').length);
    // 0 = el dia no tiene problemas (valido). Lo que NO puede pasar es que se
    // enciendan varios: eso era exactamente el bug.
    expect(zonas, 'se resalto mas de un problema a la vez').toBeLessThanOrEqual(1);
  });
});
