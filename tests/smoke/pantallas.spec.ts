import { test, expect, type Page, type FrameLocator, type Locator } from '@playwright/test';
import { PANTALLAS, RUIDO_CONSOLA, RUIDO_RED, type Pantalla } from './pantallas';
import {
  apuntar,
  contarPeticionesSupabase,
  leerMedidasDelDocumento,
  observarLongTasks,
} from './mediciones';
import {
  apuntarSilencios,
  comprobarAnclas,
  erroresEnTexto,
  leerPromesasRotas,
  observarPromesasRotas,
  vigilarDialogos,
  type Dialogos,
  type Incidente,
} from './silencios';

// SMOKE DE PANTALLAS — el vigilante que responde "¿que boton dejo de funcionar?".
//
// Un test por pantalla, generado del inventario (pantallas.ts). Comprueba lo
// minimo que significa "esta pantalla sigue viva":
//
//   1. carga y aparece su ancla       -> no es un marco vacio
//   2. cero errores de consola        -> nada ha reventado por dentro
//   3. cero peticiones 4xx/5xx        -> ninguna consulta se ha quedado sin permiso
//   4. cada boton visible se pulsa    -> no lanza, no deja la pantalla en blanco,
//                                        no saca de la pantalla sin querer
//
// Lo que NO hace: comprobar que un boton haga lo CORRECTO. Eso son los specs
// dedicados (tests/*.spec.ts), que siguen haciendo falta. Esto es la red de
// abajo: detectar que algo dejo de responder, en las 17 pantallas a la vez.
//
// Cada pantalla se carga desde cero (ver el comentario largo de pantallas.ts):
// el software mantiene montadas las pantallas ya visitadas, asi que compartir
// documento entre pantallas contamina anclas y clics.

const RUTA_DEMO = '/demo.html?share=1&intro=0';

const esRuido = (texto: string, patrones: RegExp[]) => patrones.some((r) => r.test(texto));

type Entrada = { texto: string; url: string };
type Vigilancia = { consola: Entrada[]; red: Entrada[] };

/** Solo los errores recogidos con la pagina en la pantalla que se esta probando. */
function deLaPantalla(v: Vigilancia, urlPantalla: string) {
  return {
    consola: v.consola.filter((e) => e.url === urlPantalla).map((e) => e.texto),
    red: v.red.filter((e) => e.url === urlPantalla).map((e) => e.texto),
  };
}

/** Engancha los oidos ANTES de navegar: si no, se pierden los errores de carga. */
function vigilar(page: Page): Vigilancia {
  const v: Vigilancia = { consola: [], red: [] };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // La URL de origen va pegada al texto: los "Failed to load resource" del
    // navegador no dicen QUE recurso fallo, y sin ella no se puede filtrar.
    const t = `${m.text()} (${m.location().url})`;
    if (!esRuido(t, RUIDO_CONSOLA)) v.consola.push({ texto: t, url: page.url() });
  });
  page.on('pageerror', (e) => {
    const t = `pageerror: ${e.message}`;
    if (!esRuido(t, RUIDO_CONSOLA)) v.consola.push({ texto: t, url: page.url() });
  });
  page.on('requestfailed', (r) => {
    // ERR_ABORTED = peticion cancelada, casi siempre por una navegacion que la
    // corta (este spec reasigna el src del iframe a proposito). No es un fallo
    // del servidor ni de la app: el navegador no la cuenta como error.
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
    const t = `${r.failure()?.errorText ?? 'fallo'} ${r.url()}`;
    if (!esRuido(r.url(), RUIDO_RED)) v.red.push({ texto: t, url: page.url() });
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (esRuido(r.url(), RUIDO_RED)) return;
    v.red.push({ texto: `${r.status()} ${r.url()}`, url: page.url() });
  });
  return v;
}

/**
 * Deja la pantalla `p` cargada y devuelve donde buscar su contenido.
 *
 * Las de tipo `software` van dentro del iframe de la demo: el modo demo solo se
 * activa EMBEBIDO (lib/supabase.ts, detectDemoMode exige window.top !== window.self),
 * asi que abrir /app/clientes suelto llevaria al login. Se apunta el iframe
 * directamente a la ruta en vez de navegar por el menu, para que el documento
 * tenga SOLO esa pantalla.
 */
async function abrir(page: Page, p: Pantalla): Promise<Page | FrameLocator> {
  if (p.tipo === 'publica') {
    await page.goto(p.ruta, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return page;
  }

  await page.goto(RUTA_DEMO, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const iframe = page.locator('iframe[src*="/app"]');
  await expect(iframe, 'demo.html no ha pintado el iframe de la app').toBeAttached({ timeout: 30_000 });

  if (p.ruta !== '/app') {
    await page.evaluate((ruta) => {
      const f = document.querySelector<HTMLIFrameElement>('iframe[src*="/app"]');
      if (f) f.src = `${ruta}?demo=1`;
    }, p.ruta);
  }

  return page.frameLocator('iframe[src*="/app"]');
}

/**
 * Pulsa los botones visibles y comprueba que ninguno rompe la pantalla.
 *
 * Se salta los que sacan de aqui o destruyen algo: no es su sitio. Un clic que
 * falla porque otro clic abrio un modal encima NO es un fallo -- es lo normal al
 * manosear una pantalla a ciegas -- asi que se ignora y se sigue.
 */
async function manosearBotones(
  donde: Page | FrameLocator,
  page: Page,
  nombrePantalla: string,
  sensores: { dialogos: Dialogos; incidentes: Incidente[] },
): Promise<void> {
  const botones = donde.locator('button:visible, [role="button"]:visible');
  const total = Math.min(await botones.count(), 25);
  const urlInicial = page.url();
  const rutaInicial = new URL(urlInicial).pathname;

  // Estado ANTES de tocar nada: lo que ya estaba no lo ha roto ningun boton.
  let promesasPrevias = (await leerPromesasRotas(page)).length;
  let dialogosPrevios = sensores.dialogos.vistos().length;
  let erroresPrevios = new Set(
    erroresEnTexto(await donde.locator('body').innerText().catch(() => '')).map((e) => e.aguja),
  );

  for (let i = 0; i < total; i++) {
    const b: Locator = botones.nth(i);

    let etiqueta = '';
    try {
      etiqueta = ((await b.innerText({ timeout: 1500 })) || '').trim().slice(0, 40);
    } catch {
      continue; // desaparecio entre medias: no es un fallo
    }

    // Los que sacan de la pantalla, cierran sesion o borran datos no se pulsan:
    // la demo es compartida y ensuciarla obliga a resembrar el tenant.
    if (/salir|cerrar sesión|cerrar salon|volver a la web|eliminar|borrar|anular|cancelar cita/i.test(etiqueta)) {
      continue;
    }

    try {
      await b.click({ timeout: 3000 });
    } catch {
      continue; // tapado por un modal que abrio el click anterior: normal
    }
    await page.waitForTimeout(150);

    // En las paginas publicas hay CTAs de marketing que navegan fuera (al
    // marketplace, a la landing). Eso es lo que el boton debe hacer, no una
    // regression: se vuelve a la pantalla y se sigue. Los errores que ocurran
    // en la pagina de destino quedan fuera: el veredicto final solo cuenta los
    // recogidos en la pantalla propia (ver deLaPantalla en el test).
    if (new URL(page.url()).pathname !== rutaInicial) {
      await page.goto(urlInicial, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
      continue;
    }

    // Lo unico que de verdad importa: la pantalla no se ha quedado en blanco.
    const cuerpo = await donde.locator('body').innerText().catch(() => '');
    expect(
      (cuerpo || '').trim().length,
      `la pantalla ${nombrePantalla} se quedo en blanco tras pulsar "${etiqueta}"`,
    ).toBeGreaterThan(20);

    // Familia 2a: el boton no ha roto la pantalla, pero ¿ha fallado en silencio?
    // Nada de esto tumba el test -- se apunta y `scripts/vigilantes/silencios.mjs`
    // lo convierte en avisos. Un boton que da error puede ser flujo legitimo
    // (validar un formulario vacio al pulsarlo a ciegas); lo que interesa es la
    // ETIQUETA, para ver cual empieza a fallar y desde cuando.
    const promesas = await leerPromesasRotas(page);
    for (const motivo of promesas.slice(promesasPrevias)) {
      sensores.incidentes.push({ tipo: 'promesa-rota', boton: etiqueta, detalle: motivo });
    }
    promesasPrevias = promesas.length;

    const dialogos = sensores.dialogos.vistos();
    for (const d of dialogos.slice(dialogosPrevios)) {
      // Un `confirm` es una pregunta, no un fallo: solo cuentan los avisos.
      if (d.tipo !== 'alert') continue;
      sensores.incidentes.push({
        tipo: 'dialogo',
        boton: etiqueta,
        detalle: `alert(): ${d.mensaje}`,
      });
    }
    dialogosPrevios = dialogos.length;

    const ahora = erroresEnTexto(cuerpo || '');
    for (const e of ahora) {
      if (erroresPrevios.has(e.aguja)) continue;
      sensores.incidentes.push({
        tipo: 'error-en-pantalla',
        boton: etiqueta,
        detalle: `${e.que} — "${e.aguja}"`,
      });
    }
    erroresPrevios = new Set(ahora.map((e) => e.aguja));

    // Si abrio un modal, cerrarlo para que el siguiente clic no lo herede.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(100);
  }

  expect(
    new URL(page.url()).pathname,
    `algo saco de la pantalla ${nombrePantalla}`,
  ).toBe(rutaInicial);
}

// El catalogo de frases de error (silencios.ts) tiene que seguir casando con
// lib/errores.ts. Si no, el detector de fallos silenciosos busca algo que ya
// nadie escribe y pasaria en verde sin haber mirado. Es un test aparte para que
// se lea como lo que es: el ancla del sensor, no una pantalla rota.
test('el catalogo de errores sigue casando con lib/errores.ts', () => {
  comprobarAnclas();
});

for (const p of PANTALLAS) {
  test(`humo: ${p.nombre}`, async ({ page }) => {
    test.setTimeout(p.lenta ? 150_000 : 110_000);

    const v = vigilar(page);

    // Mediciones de rendimiento (familia 1a): los oidos van antes de navegar.
    observarLongTasks(page);
    const peticiones = contarPeticionesSupabase(page);

    // Sensores de fallo silencioso (familia 2a): tambien antes de navegar.
    await observarPromesasRotas(page);
    const sensores = { dialogos: vigilarDialogos(page), incidentes: [] as Incidente[] };

    const t0 = Date.now();

    const donde = await abrir(page, p);
    const urlPantalla = page.url();

    // 1. La pantalla ha cargado de verdad.
    await expect(
      donde.locator('body'),
      `la pantalla ${p.nombre} (${p.ruta}) no ha pintado su contenido`,
    ).toContainText(p.ancla, { timeout: 45_000 });
    const msCarga = Date.now() - t0;

    // 2 y 3. Nada roto durante la carga.
    const alCargar = deLaPantalla(v, urlPantalla);
    expect(alCargar.consola, `errores de consola al cargar ${p.nombre}`).toEqual([]);
    expect(alCargar.red, `peticiones fallidas al cargar ${p.nombre}`).toEqual([]);

    // 4. Los botones responden.
    await manosearBotones(donde, page, p.nombre, sensores);

    // 4bis. Y lo que hicieron sin decirlo (familia 2a). Se apunta SIEMPRE,
    // tambien con la lista vacia: si solo escribieran las pantallas con
    // incidentes, el panel no distinguiria "limpia" de "no se ha mirado".
    apuntarSilencios({ pantalla: p.nombre, incidentes: sensores.incidentes });

    // 5. Y despues de todo el manoseo, sigue sin haber errores EN ESTA PANTALLA.
    // Los de las paginas de destino de los CTAs de marketing no cuentan: ver
    // el comentario de manosearBotones.
    expect(
      deLaPantalla(v, urlPantalla).consola,
      `errores de consola al pulsar botones en ${p.nombre}`,
    ).toEqual([]);

    // 6. Y una vez comprobado que vive, MEDIRLA: el scroll muestrea rAF (fps
    // real) y recoge las long tasks acumuladas. Se apunta al JSONL de la
    // corrida; `scripts/vigilantes/rendimiento.mjs` compara contra la linea
    // base. Un fallo AQUI nunca tumba la pantalla: es un hallazgo aparte.
    try {
      const doc = await leerMedidasDelDocumento(page, p);
      apuntar({
        pantalla: p.nombre,
        ms_carga: msCarga,
        long_tasks_n: doc.long_tasks_n,
        long_tasks_ms: doc.long_tasks_ms,
        fps_medio: doc.fps_medio,
        peticiones: peticiones.total(),
      });
    } catch {
      // Pantalla rota ya bloquea arriba; medir no puede tumbar dos veces.
    }
  });
}
