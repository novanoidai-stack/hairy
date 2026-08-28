import { test, expect, type FrameLocator, type Page } from '@playwright/test';

// AGENDA — pruebas de CARACTERIZACION sobre la demo compartida.
//
// Que son: no comprueban lo que la agenda DEBERIA hacer, sino lo que hace HOY.
// Existen para que la descomposicion de AgendaCalendar.web.tsx (25.688 lineas,
// ver informes/PLAN-MAESTRO-RENDIMIENTO-Y-ARQUITECTURA-2026-08-27.md) no pueda
// cambiar el comportamiento sin que salte algo. Antes de esto la agenda tenia
// 3 pruebas E2E en total.
//
// Por que sobre la DEMO y no sobre una cuenta real:
//   - la demo entra sola con la cuenta publica (demo.publico, ver
//     lib/supabase.ts), asi que estas pruebas NO necesitan credenciales y
//     pueden bloquear cada PR en CI aunque el repo no tenga secrets;
//   - lo que necesita RLS de un negocio propio (horarios_profesional,
//     bloqueos_profesional) sigue en tests/agenda-jornada.spec.ts, que si pide
//     sesion.
//
// Regla al escribir aqui: los datos de la demo se resiembran cada 2 h (cron
// resembrar_demo), asi que NUNCA se afirma sobre una clienta o una hora
// concretas. Se afirma sobre ESTRUCTURA: que existan fases, que los bloqueos se
// distingan de las citas, que arrastrar no remonte el mundo.

// `intro=0` salta la cortinilla de bienvenida (mecanismo propio de demo.html,
// ver el <script> de cabecera). Sin esto, el overlay .dm-intro cubre la pagina
// entera y se come los clics: los tests fallaban con "intercepts pointer
// events". `share=1` evita gastar una de las 3 visitas del contador.
const RUTA_DEMO = '/demo.html?share=1&intro=0';

// El modo demo solo se activa EMBEBIDO (lib/supabase.ts: detectDemoMode exige
// window.top !== window.self). Abrir /app?demo=1 suelto no vale: entra como
// visitante sin sesion y la agenda sale vacia.
async function abrirAgendaDemo(page: Page): Promise<FrameLocator> {
  await page.goto(RUTA_DEMO, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const app = page.frameLocator('iframe[src*="/app"]');
  // Se espera a que haya citas pintadas, no a un numero de segundos: la agenda
  // monta antes de que lleguen sus consultas y afirmar en ese hueco da falsos
  // negativos segun lo cargado que este Supabase ese dia.
  await expect(app.locator('[data-mecha-cita]').first()).toBeAttached({ timeout: 45000 });
  return app;
}

test.describe('Agenda (demo) — caracterizacion', () => {
  test('pinta citas con los ganchos de estado y fase', async ({ page }) => {
    const app = await abrirAgendaDemo(page);

    const citas = app.locator('[data-mecha-cita]');
    const n = await citas.count();
    expect(n, 'la demo no pinto ninguna cita').toBeGreaterThan(0);

    // Toda cita pintada declara su estado. Si un refactor deja de pasar el
    // estado a la tarjeta, el color y las acciones disponibles se rompen en
    // silencio: esto lo caza.
    const estados = await citas.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-mecha-estado')),
    );
    expect(estados.every((e) => !!e), 'hay citas sin estado').toBe(true);
  });

  test('el diferencial se pinta: hay citas con fase de reposo', async ({ page }) => {
    const app = await abrirAgendaDemo(page);

    // Fases activa/reposo son EL diferencial del producto (tintes: el
    // profesional queda libre mientras actua el color). La demo esta sembrada
    // con servicios de color, asi que debe haber al menos una.
    const fases = await app
      .locator('[data-mecha-fase]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-mecha-fase')));

    expect(fases.length, 'ninguna cita declara fase').toBeGreaterThan(0);
    expect(
      fases.includes('con-reposo'),
      'ninguna cita de la demo tiene fase de reposo: o la siembra cambio o se perdio el render de fases',
    ).toBe(true);
  });

  test('los bloqueos y descansos no se pintan como citas', async ({ page }) => {
    const app = await abrirAgendaDemo(page);

    // Un descanso no es una cita: no lleva data-mecha-cita y no se puede
    // arrastrar. Si algun refactor los unifica, esto salta.
    const descanso = app.getByText(/Descanso|Pausa de comida/).first();
    if ((await descanso.count()) === 0) {
      test.skip(true, 'la siembra de hoy no tiene descansos');
    }
    const esCita = await descanso.evaluate((el) => !!el.closest('[data-mecha-cita]'));
    expect(esCita, 'un descanso se esta pintando como si fuera una cita').toBe(false);
  });

  test('la agenda no pierde citas al cambiar de vista y volver', async ({ page }) => {
    const app = await abrirAgendaDemo(page);
    const antes = await app.locator('[data-mecha-cita]').count();

    for (const vista of [/^Semana$/, /^Mes$/, /^D[ií]a$/]) {
      const tab = app.getByText(vista).first();
      if ((await tab.count()) === 0) continue;
      // force: true a proposito. La agenda tiene elementos en animacion
      // continua (linea AHORA pulsante, fondos degradados por profesional), asi
      // que Playwright nunca da el boton por "stable" y se agota el timeout
      // esperando a que se quede quieto algo que no va a pararse. Aqui se
      // comprueba que los datos sobreviven al cambio de vista, no si el boton
      // es clicable. Mismo patron que tests/staff-jornada.spec.ts.
      await tab.click({ force: true });
      await page.waitForTimeout(1200);
    }

    // De vuelta en Dia deben seguir estando las mismas citas. El bug que esto
    // vigila: que la vista de dia se remonte sin volver a pedir datos y quede
    // en blanco.
    await expect(app.locator('[data-mecha-cita]').first()).toBeAttached({ timeout: 20000 });
    const despues = await app.locator('[data-mecha-cita]').count();
    expect(despues, 'se perdieron citas al pasear por las vistas').toBe(antes);
  });

  test('la linea AHORA marca la hora actual del salon', async ({ page }) => {
    // El indicador solo se pinta DENTRO del horario del salon (9:00-20:00, ver
    // lib/constants.ts): fuera de esa franja devuelve null a proposito. Sin
    // congelar el reloj, esta prueba pasaria por la mañana y fallaria por la
    // noche -- justo el tipo de prueba que depende del entorno y que estas
    // pruebas existen para no tener. Se fija a las 12:00 del dia de hoy: dentro
    // del horario, y con los datos que la demo siembra para hoy.
    const mediodia = new Date();
    mediodia.setHours(12, 0, 0, 0);
    await page.clock.setFixedTime(mediodia);

    const app = await abrirAgendaDemo(page);

    const ahora = app.locator('[data-mecha-ahora]').first();
    await expect(ahora, 'no se pinta la linea AHORA dentro del horario').toBeAttached({
      timeout: 20000,
    });

    // Con el reloj clavado a las 12:00, el indicador tiene que decir 12:00. Si
    // dijera otra cosa es que no lee la hora, y el bug clasico es pintarlo
    // siempre al principio del dia.
    expect(
      await ahora.getAttribute('data-mecha-ahora'),
      'la linea AHORA no refleja la hora actual',
    ).toBe('12:00');
  });

  test('las citas encadenadas se declaran como tales', async ({ page }) => {
    const app = await abrirAgendaDemo(page);

    // Cadena multiprofesional (grupo_id): una clienta pasa por varios
    // profesionales y sigue siendo UNA cita repartida en columnas.
    //
    // OJO: a 27 ago 2026 la siembra de la demo NO trae ninguna (comprobado:
    // 9 citas hoy, las 9 con reposo, 0 con grupo_id), asi que esta prueba se
    // salta SIEMPRE y el invariante queda sin cubrir. Son dos cosas que
    // arreglar, y la segunda no es de tests:
    //   1. cubrir la cadena en el spec autenticado, donde si se puede crear una;
    //   2. sembrar alguna en la demo -- es el diferencial nº2 del producto y
    //      hoy el escaparate comercial no lo enseña.
    const encadenadas = app.locator('[data-mecha-encadenada="si"]');
    if ((await encadenadas.count()) === 0) {
      test.skip(true, 'la siembra de la demo no trae cadenas multiprofesional (ver comentario)');
    }
    // Una cadena tiene por definicion mas de un eslabon.
    expect(await encadenadas.count()).toBeGreaterThan(1);
  });

  test('abrir una cita muestra su detalle sin perder la agenda', async ({ page }) => {
    const app = await abrirAgendaDemo(page);
    const antes = await app.locator('[data-mecha-cita]').count();

    await app.locator('[data-mecha-cita]').first().click({ force: true });
    await page.waitForTimeout(1500);

    // El detalle abre en un modal; la agenda de debajo no se desmonta. El bug
    // que esto vigila: que abrir el detalle recargue y deje la rejilla vacia.
    const despues = await app.locator('[data-mecha-cita]').count();
    expect(despues, 'la agenda perdio citas al abrir el detalle').toBe(antes);
  });

  // ---------------------------------------------------------------------
  // Caracterizacion de RENDIMIENTO
  // ---------------------------------------------------------------------
  // Esta es la importante para el plan. El 27 ago 2026 se midio que arrastrar
  // una cita cruzando ~8 slots muta 8 nodos distintos y NO remonta nada: la
  // memoizacion manual (callbacks dt* con useCallback, mapas con useMemo)
  // aguanta. El informe estrategico afirmaba lo contrario y proponia desmontar
  // la agenda para arreglarlo.
  //
  // Esta prueba CONGELA ese resultado. Si alguien rompe una barrera memo -- por
  // ejemplo pasando un objeto o una funcion recreados en cada render al extraer
  // un componente -- el numero de nodos mutados se dispara y esto falla. Es la
  // red que permite refactorizar la agenda sin degradar el arrastre en silencio.
  test('arrastrar una cita no repinta la agenda entera', async ({ page }) => {
    const app = await abrirAgendaDemo(page);
    await expect(app.locator('[data-mecha-cita]').first()).toBeAttached({ timeout: 30000 });

    const medida = await page.evaluate(async () => {
      const marco = document.querySelector('iframe[src*="/app"]') as HTMLIFrameElement;
      const w = marco.contentWindow as Window & typeof globalThis;
      const d = w.document;

      const carta = Array.from(d.querySelectorAll('[data-mecha-cita]')).find((el) => {
        const k = Object.keys(el).find((x) => x.startsWith('__reactProps$'));
        return k && typeof (el as any)[k].onMouseDown === 'function';
      }) as HTMLElement | undefined;
      if (!carta) return { error: 'ninguna cita arrastrable' };

      const r = carta.getBoundingClientRect();
      const x = r.left + Math.min(50, r.width / 2);
      const y = r.top + 10;

      // cancelable:true es necesario: startDrag hace e.preventDefault(), y sin
      // cancelable el handler de React no llega a iniciar el arrastre.
      carta.dispatchEvent(
        new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: w, button: 0 }),
      );
      await new Promise((res) => setTimeout(res, 200));

      // Identidad de las tarjetas ANTES de arrastrar. Comprobar despues que
      // siguen siendo LOS MISMOS nodos es la forma exacta de detectar un
      // remontaje: si React destruye y recrea la columna, estos elementos
      // quedan desconectados del documento aunque el total de nodos cuadre.
      // (Contar nodos no vale: la previa del hueco de suelta pinta una cantidad
      // variable segun caiga sobre un reposo o sobre rejilla vacia -- medido
      // entre 26 y 140 de diferencia en ejecuciones distintas.)
      const tarjetasAntes = Array.from(d.querySelectorAll('[data-mecha-cita]'));
      let mutaciones = 0;
      const tocados = new Set<Node>();
      const obs = new w.MutationObserver((ms) => {
        for (const m of ms) {
          mutaciones++;
          tocados.add(m.target);
        }
      });
      obs.observe(d.body, { attributes: true, childList: true, subtree: true, characterData: true });

      // 80 movimientos de 5px = 400px: cruza varios slots de 15 min.
      for (let i = 1; i <= 80; i++) {
        w.dispatchEvent(
          new w.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y + i * 5, view: w }),
        );
        await new Promise((res) => w.requestAnimationFrame(res));
      }
      await new Promise((res) => setTimeout(res, 200));
      obs.disconnect();

      // Se sale del arrastre por la tecla, NO con mouseup: un mouseup
      // confirmaria el movimiento y MOVERIA UNA CITA REAL de la demo, que es
      // compartida por todos los visitantes.
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      return {
        mutaciones,
        nodosDistintos: tocados.size,
        tarjetas: tarjetasAntes.length,
        tarjetasRecreadas: tarjetasAntes.filter((el) => !el.isConnected).length,
      };
    });

    expect(medida.error, medida.error ?? '').toBeUndefined();

    // Linea base medida el 27 ago 2026: 8 nodos distintos, 171 mutaciones.
    // El margen es amplio a proposito -- esto no vigila microsegundos, vigila
    // que no se caiga la memoizacion. Con las barreras memo rotas, cruzar 8
    // slots repinta las columnas y todas sus tarjetas: cientos de nodos.
    expect(
      medida.nodosDistintos,
      `arrastrar toco ${medida.nodosDistintos} nodos distintos (linea base: 8). ` +
        'Sintoma tipico: un prop recreado en cada render que rompe una barrera memo ' +
        'de DayTimelineProfessionalColumn o DayTimelineAppointmentCard.',
    ).toBeLessThanOrEqual(40);

    // Ninguna tarjeta que ya estaba pintada puede haber sido destruida y
    // recreada: arrastrar reposiciona un fantasma, no reconstruye la agenda.
    expect(
      medida.tarjetasRecreadas,
      `${medida.tarjetasRecreadas} de ${medida.tarjetas} tarjetas se remontaron durante el arrastre`,
    ).toBe(0);
  });
});
