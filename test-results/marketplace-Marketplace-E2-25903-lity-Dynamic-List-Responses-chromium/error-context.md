# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketplace.spec.ts >> Marketplace E2E Suite - mechaa.es/salones.html >> 2. Search Form Functionality & Dynamic List Responses
- Location: tests\marketplace.spec.ts:58:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#list')
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('#list')
    23 × locator resolved to <div id="list" hidden="" class="d-list"></div>
       - unexpected value "hidden"

```

```yaml
- banner:
  - link "Mecha, inicio":
    - /url: index.html
    - text: mecha
  - link "¿Necesitas ayuda?":
    - /url: "#"
  - link "¿Tienes un salón?":
    - /url: index.html
- main:
  - heading "Encuentra peluquería y reserva sin llamar" [level=1]
  - paragraph: Mira servicios, precios y valoraciones de los salones de tu zona, y pide cita online a la hora que te venga bien.
  - img
  - text: Qué
  - textbox "Qué":
    - /placeholder: Corte, color, barba, nombre del salón
  - img
  - text: Dónde
  - textbox "Dónde":
    - /placeholder: Ciudad o barrio
  - button "Buscar"
  - heading "Mejor valorados" [level=2]
  - paragraph: De momento hay 1 salón con reserva online.
  - link "Florent Suarez Peluqueros 5 1 reseña Florent Suarez Peluqueros Avenida de Finisterre 31 Bajo A Coruña 15004":
    - /url: salon.html?s=florent-suarez-peluqueros
    - img "Florent Suarez Peluqueros"
    - text: 5 1 reseña
    - heading "Florent Suarez Peluqueros" [level=3]
    - text: Avenida de Finisterre 31 Bajo A Coruña 15004
  - heading "También en tu zona" [level=2]
  - paragraph: Otras 2388 peluquerías que todavía no trabajan con Mecha. Aquí no puedes reservar online, pero sí llamar.
  - paragraph:
    - strong: ¿Es tu salón?
    - text: Actívalo en Mecha y pasa a aceptar reservas online, con tu agenda de verdad detrás.
  - link "Activar mi salón":
    - /url: /index.html#precios
  - text: "1"
  - heading "116" [level=3]
  - text: Travesía Puente Virrey 58, Zaragoza
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=41.6347749%2C-0.8753768
    - img
    - text: Cómo llegar
  - text: "1"
  - heading "13" [level=3]
  - text: Calle Martínez Campos 19, Málaga
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=36.715074%2C-4.4244259
    - img
    - text: Cómo llegar
  - text: "2"
  - heading "2 a Dos" [level=3]
  - text: Calle de Hernández de Tejada 10, Madrid
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=40.4472591%2C-3.650368
    - img
    - text: Cómo llegar
  - text: "3"
  - heading "3 Hermanos" [level=3]
  - text: Avila kalea 8, Bilbao
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=43.2567573%2C-2.9397851
    - img
    - text: Cómo llegar
  - text: "3"
  - heading "360°" [level=3]
  - text: Calle del Doctor Esquerdo 167, Madrid
  - link "Llamar":
    - /url: tel:+34910338524
    - img
    - text: Llamar
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=40.4077423%2C-3.6698805
    - img
    - text: Cómo llegar
  - text: "3"
  - heading "3ª Generación" [level=3]
  - text: Calle de Ramón Luján 18, Madrid
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=40.3863895%2C-3.7047679
    - img
    - text: Cómo llegar
  - text: "3"
  - heading "3D" [level=3]
  - text: Pablo Picasso kalea 6, Bilbao
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=43.2562439%2C-2.9357821
    - img
    - text: Cómo llegar
  - text: "3"
  - heading "3K peluqueros" [level=3]
  - text: Calle de Sierra de Atapuerca, Madrid
  - link "Llamar":
    - /url: tel:+34917507264
    - img
    - text: Llamar
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=40.5007239%2C-3.6724699
    - img
    - text: Cómo llegar
  - text: "4"
  - heading "4 Elementos" [level=3]
  - text: Avenida da Concordia 5, A Coruña
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=43.3518657%2C-8.3913577
    - img
    - text: Cómo llegar
  - text: "4"
  - heading "4k" [level=3]
  - text: Calle Santander, Barcelona
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=10.1481551%2C-64.6857851
    - img
    - text: Cómo llegar
  - text: "5"
  - heading "5 Jotas" [level=3]
  - text: Carrer de Sant Pancraç 25, Valencia
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=39.4881687%2C-0.3850105
    - img
    - text: Cómo llegar
  - text: "6"
  - heading "6d2" [level=3]
  - text: Calle de Blas Cabrera 71, Madrid
  - link "Cómo llegar":
    - /url: https://www.google.com/maps/search/?api=1&query=40.3788046%2C-3.7737199
    - img
    - text: Cómo llegar
  - paragraph:
    - text: Los datos de estos salones vienen de
    - link "OpenStreetMap":
      - /url: https://www.openstreetmap.org/copyright
    - text: ", © sus colaboradores, bajo licencia ODbL."
  - heading "Por servicio" [level=2]
  - paragraph: "Mecha es software de peluquería y barbería: aquí solo encontrarás eso."
  - button "Corte":
    - img
    - text: Corte
  - button "Color":
    - img
    - text: Color
  - button "Peinado":
    - img
    - text: Peinado
  - button "Barba":
    - img
    - text: Barba
  - button "Tratamiento":
    - img
    - text: Tratamiento
  - heading "Cómo funciona" [level=2]
  - paragraph: Reservas directamente en la agenda del salón, no en un intermediario.
  - img
  - heading "A la hora que quieras" [level=3]
  - paragraph: El salón puede estar cerrado y su agenda sigue abierta. Eliges hueco y queda reservado.
  - img
  - heading "Precios antes de reservar" [level=3]
  - paragraph: Cada salón publica sus servicios con precio y duración. Sin sorpresas al llegar.
  - img
  - heading "Recordatorio de tu cita" [level=3]
  - paragraph: Los salones que lo tienen activado te avisan por WhatsApp antes de la cita.
  - heading "Pide cita sin llamar por teléfono" [level=2]
  - paragraph: Buscas por zona o por lo que necesitas —un corte, unas mechas, arreglarte la barba— y ves de una vez los salones que trabajan cerca de ti, con sus precios y sus valoraciones.
  - paragraph: Cada servicio viene con su precio y su duración antes de que reserves nada. Eliges el hueco que te encaja, dejas tu nombre y un teléfono, y ya está.
  - paragraph: Sin llamadas, sin esperar a que abran y sin que nadie tenga que cogerte el teléfono.
  - img "Ilustración de un salón de peluquería"
  - heading "Tu cita entra en la agenda real del salón" [level=2]
  - paragraph: "Mecha no es una capa por encima del salón: es el programa con el que llevan su día a día. Cuando ves un hueco libre, es el hueco que tienen libre de verdad, con su profesional y su duración."
  - paragraph: Al reservar, la cita aparece en su agenda en ese momento y el hueco deja de estar disponible para nadie más. No hay confirmaciones a medias ni dos personas citadas a la misma hora.
  - paragraph: Si el salón tiene activados los avisos, te llega un recordatorio por WhatsApp antes de la cita, y puedes cambiarla o cancelarla desde ahí.
  - paragraph: Reservas con el salón, no con un intermediario.
  - img "Ilustración de una agenda con una cita confirmada"
  - heading "Habla con el salón, no con un formulario" [level=2]
  - paragraph: "Los salones que lo tienen activado atienden sus mensajes de WhatsApp con un asistente: le cuentas qué necesitas y cuándo te viene bien, y te propone hueco y te lo reserva. A la hora que sea."
  - paragraph: El asistente te dice siempre que es un asistente. Y si prefieres que te atienda una persona, lo pides y la conversación pasa a alguien del salón.
  - paragraph: Sin descargar ninguna aplicación y sin crearte una cuenta.
  - img "Ilustración de una conversación de mensajería"
  - heading "Lo que hace distinto a Mecha" [level=2]
  - paragraph: "Un directorio lo tiene cualquiera. La diferencia está en el software que hay detrás: Mecha lleva la agenda del salón y tiene una capa de inteligencia artificial trabajando dentro de ella, no un buscador con anuncios encima."
  - img
  - heading "Un asistente que atiende WhatsApp" [level=3]
  - paragraph: Responde a las clientas, consulta el catálogo y reserva citas fuera de horario, sin que nadie del salón tenga que estar pendiente.
  - img
  - heading "Una agenda que se reorganiza sola" [level=3]
  - paragraph: "Detecta huecos muertos, solapes y retrasos en cascada, y propone cómo recolocar el día. Propone: decide el salón."
  - img
  - heading "Menos plantones" [level=3]
  - paragraph: Recordatorios automáticos antes de la cita y aviso al salón cuando una reserva tiene pinta de quedarse sin cubrir.
  - img
  - heading "Vigila lo que se escapa" [level=3]
  - paragraph: Revisa el negocio cada poco y avisa de citas sin confirmar, mensajes sin responder o clientas que llevan tiempo sin volver.
  - paragraph: "La inteligencia artificial siempre se identifica como tal y nunca decide por su cuenta: propone y el salón aprueba. Cada función se activa o se apaga desde los ajustes del negocio."
  - heading "¿Tienes un salón?" [level=2]
  - paragraph: Mecha es el software con el que estos salones llevan su agenda, su caja y sus clientas. Aparecer aquí va incluido.
  - link "Ver cómo funciona":
    - /url: reservar.html
    - text: Ver cómo funciona
    - img
- contentinfo:
  - text: mecha
  - paragraph: Software de gestión para peluquerías y barberías. El directorio lo forman los salones que lo usan.
  - heading "Directorio" [level=4]
  - link "Buscar salones":
    - /url: salones.html
  - link "Por ciudad":
    - /url: salones.html#sec-ciudades
  - heading "Mecha" [level=4]
  - link "Qué es Mecha":
    - /url: index.html
  - link "Especificaciones":
    - /url: especificaciones.html
  - link "Ver la demo":
    - /url: demo.html
  - link "Acceder":
    - /url: acceso.html
  - heading "Legal" [level=4]
  - link "Privacidad":
    - /url: privacidad.html
  - link "Términos":
    - /url: terminos.html
  - link "Cookies":
    - /url: cookies.html
  - text: © 2026 Mecha Hecho para salones, no para intermediarios.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Marketplace E2E Suite - mechaa.es/salones.html', () => {
  4   |   let pageErrors: Error[] = [];
  5   |   let consoleErrors: string[] = [];
  6   | 
  7   |   const gotoSalones = async (page: any) => {
  8   |     for (let attempt = 1; attempt <= 3; attempt++) {
  9   |       try {
  10  |         await page.goto('/salones.html', { waitUntil: 'commit', timeout: 10000 });
  11  |         break;
  12  |       } catch (e) {
  13  |         await page.waitForTimeout(500);
  14  |       }
  15  |     }
  16  |     await page.waitForSelector('form#form', { timeout: 10000 }).catch(() => {});
  17  |   };
  18  | 
  19  |   test.beforeEach(async ({ page }) => {
  20  |     pageErrors = [];
  21  |     consoleErrors = [];
  22  |     page.on('pageerror', (exception) => {
  23  |       console.error('Captured page error:', exception.message);
  24  |       pageErrors.push(exception);
  25  |     });
  26  |     page.on('console', (msg) => {
  27  |       if (msg.type() === 'error') {
  28  |         console.warn('Captured console error:', msg.text());
  29  |         consoleErrors.push(msg.text());
  30  |       }
  31  |     });
  32  |   });
  33  | 
  34  |   test.afterEach(() => {
  35  |     expect(
  36  |       pageErrors,
  37  |       `Uncaught JS exceptions detected: ${pageErrors.map((e) => e.message).join(' | ')}`
  38  |     ).toHaveLength(0);
  39  |   });
  40  | 
  41  |   test('1. Initial Navigation & Marketplace Search Form Verification', async ({ page }) => {
  42  |     await gotoSalones(page);
  43  | 
  44  |     const title = await page.title();
  45  |     expect(title.length).toBeGreaterThan(0);
  46  |     expect(title).toContain('Mecha');
  47  | 
  48  |     const topHeader = page.locator('header.d-top');
  49  |     await expect(topHeader).toBeVisible();
  50  | 
  51  |     const searchForm = page.locator('form#form');
  52  |     await expect(searchForm).toBeVisible();
  53  |     await expect(page.locator('input#q')).toBeVisible();
  54  |     await expect(page.locator('input#ciudad')).toBeVisible();
  55  |     await expect(page.locator('form#form button[type="submit"]')).toBeVisible();
  56  |   });
  57  | 
  58  |   test('2. Search Form Functionality & Dynamic List Responses', async ({ page }) => {
  59  |     await gotoSalones(page);
  60  | 
  61  |     const qInput = page.locator('input#q');
  62  |     const ciudadInput = page.locator('input#ciudad');
  63  |     const submitBtn = page.locator('form#form button[type="submit"]');
  64  | 
  65  |     await expect(qInput).toBeVisible();
  66  |     await qInput.fill('Corte');
  67  |     await ciudadInput.fill('Madrid');
  68  | 
  69  |     await submitBtn.click();
  70  |     await page.waitForTimeout(1000);
  71  | 
  72  |     const listSec = page.locator('#list');
> 73  |     await expect(listSec).toBeVisible();
      |                           ^ Error: expect(locator).toBeVisible() failed
  74  |   });
  75  | 
  76  |   test('3. Dynamic Lists (#destacados, #carrusel, #list) & Category Filters', async ({ page }) => {
  77  |     await gotoSalones(page);
  78  | 
  79  |     const destacados = page.locator('#destacados');
  80  |     const carrusel = page.locator('#carrusel');
  81  |     await expect(destacados).toBeAttached();
  82  |     await expect(carrusel).toBeAttached();
  83  | 
  84  |     const catButtons = page.locator('button[data-cat]');
  85  |     await catButtons.first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  86  |     const count = await catButtons.count();
  87  |     expect(count).toBeGreaterThan(0);
  88  | 
  89  |     let clicked = false;
  90  |     for (let i = 0; i < count; i++) {
  91  |       const btn = catButtons.nth(i);
  92  |       if (await btn.isVisible().catch(() => false)) {
  93  |         const catName = await btn.getAttribute('data-cat');
  94  |         console.log(`Clicking category filter button: ${catName}`);
  95  |         await btn.click({ force: true });
  96  |         clicked = true;
  97  |         await page.waitForTimeout(1000);
  98  |         break;
  99  |       }
  100 |     }
  101 |     expect(clicked).toBe(true);
  102 | 
  103 |     const listSec = page.locator('#list');
  104 |     await expect(listSec).toBeVisible();
  105 |   });
  106 | 
  107 |   test('4. Salon Cards, Details Links & External Salon Items', async ({ page }) => {
  108 |     await gotoSalones(page);
  109 |     await page.waitForTimeout(1500);
  110 | 
  111 |     const carDer = page.locator('#car-der');
  112 |     if (await carDer.isVisible().catch(() => false)) {
  113 |       await carDer.click().catch(() => {});
  114 |     }
  115 | 
  116 |     const salonCards = page.locator('a.d-mini, a.d-res');
  117 |     const cardCount = await salonCards.count();
  118 |     console.log(`Verified ${cardCount} salon cards on marketplace.`);
  119 |     if (cardCount > 0) {
  120 |       const firstCard = salonCards.first();
  121 |       const href = await firstCard.getAttribute('href');
  122 |       expect(href).toMatch(/salon\.html/);
  123 |     }
  124 | 
  125 |     const externosSec = page.locator('#externos');
  126 |     await expect(externosSec).toBeAttached();
  127 | 
  128 |     const extItems = page.locator('#externos-lista .d-ext');
  129 |     const extCount = await extItems.count();
  130 |     console.log(`Verified ${extCount} external salon items.`);
  131 | 
  132 |     const cityLinks = page.locator('#ciudades a.d-ciudad');
  133 |     if (await cityLinks.count() > 0) {
  134 |       const cityLink = cityLinks.first();
  135 |       if (await cityLink.isVisible().catch(() => false)) {
  136 |         const cityHref = await cityLink.getAttribute('href');
  137 |         expect(cityHref).toContain('ciudad=');
  138 |       }
  139 |     }
  140 |   });
  141 | });
  142 | 
```