// Mediciones de rendimiento para el smoke de pantallas (familia 1a del plan de
// fase 2). No cambia lo que el smoke COMPRUEBA; solo añade lo que MIDE:
//
//   ms_carga   — cuanto tarda la pantalla en pintar su ancla (navigation→ancla)
//   long_tasks — nº y ms de tareas >50 ms del hilo principal (el "fps bajo"
//                medible sin instrumentar la app) via PerformanceObserver
//   fps_medio  — muestreo de requestAnimationFrame durante un scroll suave de
//                la pantalla: el jank real de scroll, no el teorico
//   peticiones — llamadas a Supabase (/rest/v1/ y /rpc/): el detector de N+1.
//
// Las medidas se apuntan a un JSONL (una linea por pantalla) y las compara
// `scripts/vigilantes/rendimiento.mjs` contra la linea base congelada
// (tests/smoke/rendimiento-baseline.json). El trinquete solo gira hacia abajo:
// si algo MEJORA, se actualiza la linea base a mano con --aprobar, nunca solo.

import { appendFileSync } from 'node:fs';
import process from 'node:process';
import type { Page } from '@playwright/test';
import type { Pantalla } from './pantallas';

export type Medidas = {
  pantalla: string;
  ms_carga: number;
  long_tasks_n: number;
  long_tasks_ms: number;
  fps_medio: number | null;
  peticiones: number;
};

/** Cuenta las llamadas a Supabase (REST y RPC) que salen de esta pagina. */
export function contarPeticionesSupabase(page: Page): { total: () => number } {
  let n = 0;
  page.on('request', (r) => {
    if (/\/rest\/v1\/(rpc\/)?/.test(r.url())) n += 1;
  });
  return { total: () => n };
}

/**
 * Engancha el observer de long tasks en TODOS los documentos que cree esta
 * pagina (la app vive en un iframe y se navega por cada pantalla). Tiene que
 * ir ANTES de navegar, como los oidos de consola.
 */
export function observarLongTasks(page: Page): void {
  void page.addInitScript(() => {
    const w = window as unknown as { __longTasks?: { n: number; ms: number } };
    w.__longTasks = { n: 0, ms: 0 };
    try {
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) {
          w.__longTasks!.n += 1;
          w.__longTasks!.ms += e.duration;
        }
      }).observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    } catch {
      // Navegador sin soporte (no deberia): quedara a 0 y la linea base lo nota.
    }
  });
}

/** Evalua codigo DENTRO del documento de la pantalla (iframe o pagina). */
async function evaluarEnDocumento(
  page: Page,
  p: Pantalla,
  codigo: string,
): Promise<{ n: number; ms: number; fps: number | null }> {
  if (p.tipo === 'publica') return page.evaluate(codigo);
  const f = page.frames().find((fr) => fr.url().includes('/app'));
  if (!f) throw new Error(`no se encuentra el iframe de la app para medir ${p.nombre}`);
  return f.evaluate(codigo);
}

/**
 * Scroll suave muestreando rAF: devuelve fps medio y las long tasks acumuladas
 * en el documento de la pantalla. Un segundo de scroll basta para ver el jank.
 */
export async function leerMedidasDelDocumento(
  page: Page,
  p: Pantalla,
): Promise<{ long_tasks_n: number; long_tasks_ms: number; fps_medio: number | null }> {
  const r = await evaluarEnDocumento(
    page,
    p,
    `(() => {
      const w = window;
      const lt = w.__longTasks || { n: 0, ms: 0 };
      // Scroll del elemento que realmente scrollea (la app RN-web usa un div,
      // no siempre el body), avanzando por pasos para no saltarnos contenido.
      const candidatos = [document.scrollingElement, ...document.querySelectorAll('div')]
        .filter((el) => el && el.scrollHeight > el.clientHeight + 200 && el.clientWidth > 300);
      candidatos.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
      const zona = candidatos[0] || document.scrollingElement;
      const fps = [];
      return new Promise((resolver) => {
        const empieza = performance.now();
        let ultimoCuadro = empieza;
        let paso = 0;
        const maxPaso = zona ? Math.min(zona.scrollHeight, 3000) : 600;
        function cuadro(t) {
          if (ultimoCuadro) fps.push(1000 / Math.max(1, t - ultimoCuadro));
          ultimoCuadro = t;
          if (t - empieza < 1200 && paso < maxPaso) {
            paso += 60;
            if (zona) zona.scrollTop = paso;
            requestAnimationFrame(cuadro);
          } else {
            const medio = fps.length > 5 ? fps.reduce((a, b) => a + b, 0) / fps.length : null;
            resolver({ n: lt.n, ms: Math.round(lt.ms), fps: medio ? Math.round(medio) : null });
          }
        }
        requestAnimationFrame(cuadro);
      });
    })()`,
  );
  return { long_tasks_n: r.n, long_tasks_ms: r.ms, fps_medio: r.fps };
}

/** Una linea por pantalla en el JSONL de la corrida. */
export function apuntar(m: Medidas): void {
  const destino = process.env.RENDIMIENTO_OUT || 'rendimiento.jsonl';
  appendFileSync(destino, `${JSON.stringify(m)}\n`, 'utf8');
}
