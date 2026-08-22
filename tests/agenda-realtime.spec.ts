import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { entrarAlSoftware } from './helpers/software';

// La agenda escucha los cambios de citas por Realtime.
//
// Lo que vigila este spec es la parte que NO se puede probar por unidad: que el
// canal llega de verdad a estar suscrito. Hay dos formas silenciosas de que
// esto no funcione y ninguna da error en consola:
//   1. la tabla citas no esta en la publicacion supabase_realtime
//      (migrations/realtime-citas-agenda.sql), y entonces el socket se abre,
//      se une al topic y no llega un evento jamas;
//   2. el canal se monta con un negocio_id vacio y filtra por nada.
//
// La mezcla de cada evento sobre la lista de citas (duplicados, ventana de
// fechas, canceladas, borrados ajenos) se prueba aparte y sin navegador en
// lib/agenda/citasRealtime.test.ts.
//
// No se crea ninguna cita a proposito: un alta real dispara el motor de
// notificaciones y saldria un WhatsApp de verdad a un telefono de verdad.

test.use({ storageState: STORAGE_STATE });

test('la agenda se suscribe al canal de citas de su negocio', async ({ page }) => {
  test.setTimeout(90000);

  // Frames que la app ENVIA por el websocket de realtime.
  const enviados: string[] = [];
  // Frames que RECIBE (ahi viene la confirmacion de union al topic).
  const recibidos: string[] = [];

  page.on('websocket', (ws) => {
    if (!ws.url().includes('/realtime/v1/websocket')) return;
    ws.on('framesent', (f) => enviados.push(String(f.payload)));
    ws.on('framereceived', (f) => recibidos.push(String(f.payload)));
  });

  await entrarAlSoftware(page, '/app');
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 30000 });

  // 1. Se pide unirse al topic de la agenda, con un negocio concreto.
  await expect
    .poll(() => enviados.find((f) => f.includes('agenda-citas-') && f.includes('phx_join')) ?? '', {
      timeout: 30000,
      message: 'La agenda no llego a pedir la union al canal de citas.',
    })
    .toContain('phx_join');

  // El topic se saca con expresion regular y no parseando: supabase-js serializa
  // los frames con el formato de Phoenix, que segun el mensaje es un objeto o un
  // array posicional. Lo que importa aqui es el nombre del topic.
  const join = enviados.find((f) => f.includes('agenda-citas-') && f.includes('phx_join'))!;
  const topic = join.match(/realtime:agenda-citas-[^"\\,\]\s]+/)?.[0] ?? '';
  expect(topic, 'No se encontro el topic del canal en el frame de union').not.toBe('');
  expect(topic, 'El canal se monto sin negocio_id').not.toMatch(/agenda-citas-$/);

  // 2. El servidor confirma la union. Sin la tabla publicada esto tambien
  //    llega, asi que ademas se comprueba el postgres_changes de abajo.
  await expect
    .poll(
      () => recibidos.some((f) => f.includes(topic) && f.includes('"status":"ok"')),
      { timeout: 30000, message: 'El servidor no confirmo la union al canal.' },
    )
    .toBe(true);

  // 3. La confirmacion trae de vuelta los postgres_changes aceptados. Si la
  //    tabla no estuviera publicada, aqui no habria ninguno con id asignado.
  const ok = recibidos.find((f) => f.includes(topic) && f.includes('postgres_changes'))!;
  expect(ok, 'El servidor no acepto ninguna escucha de postgres_changes').toBeTruthy();
  expect(ok).toContain('citas');

  // 4. Las tres escuchas: alta, cambio y borrado.
  const join3 = enviados.filter((f) => f.includes('agenda-citas-') && f.includes('phx_join'));
  const todos = join3.join(' ');
  expect(todos).toContain('INSERT');
  expect(todos).toContain('UPDATE');
  expect(todos).toContain('DELETE');
});
