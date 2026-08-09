# Informes: gráficas que se entienden + calculadora de comisiones

Fecha: 2026-08-09
Autor: Carlos + Claude
Estado: aprobado, pendiente de implementar

## Problema

Dos problemas distintos en el mismo apartado.

**1. Las estadísticas no se entienden.** Carlos, que sabe para qué está hecha cada
gráfica, tiene que pararse a descifrarlas. Un jefe de salón no va a hacer ese
esfuerzo. Causas concretas, verificadas en el código:

- `LineChartMini` pinta el eje Y con tres marcas (`max`, `max/2`, `0`) y el eje X
  con tres fechas fijas (primera, media, última). Sin unidades rotuladas.
- El pie de cada gráfica dice siempre `Total en periodo`. En la gráfica de
  *Eficiencia de reposos (%)* eso **suma porcentajes**, que no significa nada.
- `InfoDot` existe y funciona bien, pero sus textos (`KPI_INFO`, `SECTION_INFO`)
  son estáticos: explican qué mide la gráfica, nunca qué está diciendo.
- Hay **dos filtros de tiempo compitiendo**: `periodo` arriba
  (semana/mes/3meses/año) y `agrupacionEjeX` (día/semana/mes) escondido dentro de
  la tarjeta "Evolución temporal".
- La métrica que de verdad mide si el salón mejora — cuántos clientes consigue
  fidelizar y cómo crece esa base — **no existe**. Lo más cercano es
  `retencionData.avgFreq` (días medios entre visitas) y una línea de recurrentes.
- `Retencion (frec. media)` se calcula **solo con las citas del periodo elegido**.
  Con el filtro en "semana" el número es ruido: no caben dos visitas del mismo
  cliente en siete días.

**2. Falta la calculadora de comisiones.** Es la tarea **B4-066** del tracker de
lanzamiento (`Mecha-Tracker-Lanzamiento.xlsx`, hoja *Plan de acción*, semana 2,
área Web y SEO, crítica, 12 h): *"Construir la calculadora de comisiones
(/calculadora-comisiones)"*, justificada como *"mejor activo de marketing que
puedes hacer en 2 días: posiciona, se comparte y captura email"*.

En el tracker es una **landing pública**. Carlos además quería un simulador
**dentro** de Informes. Son dos cosas distintas y se hacen las dos, compartiendo
un único motor de cálculo.

Estado actual de comisiones en la app:

- `informes.web.tsx` tiene sección "Comisiones por profesional": un **único %
  plano** (20/25/30/custom) igual para todo el equipo, sobre base sin IVA,
  descontando propinas. Eso está bien calculado.
- `components/informes/LiquidacionesSection.tsx` (939 líneas) gestiona
  liquidaciones persistentes: generar, marcar pagada, exportar. Vía RPCs
  `calcular_comisiones_periodo`, `generar_liquidacion`, `obtener_liquidaciones`.
- `migrations/comisiones-liquidaciones.sql` (1 jul 2026) ya creó
  `comisiones_tramos` (% por tramo de facturación) y `comisiones_por_categoria`
  (% por categoría de servicio). **La UI no los usa en ningún sitio.** Capacidad
  construida y muerta.

## Decisiones tomadas

| Decisión | Elegido |
| --- | --- |
| Calculadora | Las dos (pública + interna), con motor compartido |
| Filtros de tiempo | Uno solo arriba, granularidad automática |
| Gráfica de fidelización | Embudo **y** cohortes, ambos explicados |

## Diseño

### Parte A — Que las gráficas se entiendan

#### A1. Motor de lectura de series — `lib/informes/lecturaSerie.ts`

Módulo puro, sin React, testeable con `deno test` (patrón que ya sigue `lib/`).

```ts
export interface PuntoSerie { fecha: Date; valor: number }

export type Granularidad = 'hora' | 'dia' | 'semana' | 'mes';
export type Unidad = 'eur' | 'conteo' | 'pct' | 'dias';

export interface LecturaSerie {
  pico: PuntoSerie | null;
  valle: PuntoSerie | null;
  total: number;
  media: number;
  mediana: number;
  /** 2ª mitad del periodo vs 1ª mitad, en %. null si la 1ª mitad es 0. */
  tendenciaPct: number | null;
  direccion: 'sube' | 'baja' | 'estable' | 'sin_datos';
  /** Frase en castellano llano, lista para pintar. */
  frase: string;
  /** Si la unidad es 'pct', el total no tiene sentido y esto es false. */
  totalTieneSentido: boolean;
}

export function leerSerie(
  serie: PuntoSerie[],
  opts: { unidad: Unidad; granularidad: Granularidad; nombre: string },
): LecturaSerie;
```

Reglas:

- `direccion` es `estable` si `|tendenciaPct| < 5`, para no llamar tendencia al
  ruido.
- `sin_datos` cuando todos los valores son 0 o hay menos de 2 puntos. La frase lo
  dice claramente en vez de inventar una lectura.
- `mediana` siempre, porque en frecuencias y tickets la media la destrozan los
  valores extremos.
- `totalTieneSentido` es `false` para `unidad: 'pct'`. Ahí se muestra la media.

Ejemplo de frase generada:

> Va subiendo. La segunda quincena va un 23 % por encima de la primera. Tu mejor
> día fue el jueves 7 (412 €); el más flojo, el lunes 4 (98 €). Media: 240 € al
> día.

#### A2. `<GraficaExplicada>` — `components/charts/GraficaExplicada.web.tsx`

Envoltorio que compone: título + `InfoDot` (el "qué es y para qué sirve",
estático) + la gráfica + **banda de lectura siempre visible** con tres chips
(Pico · Media · Tendencia) y la frase de `leerSerie`. La lectura no se esconde
dentro del icono: el icono es para el concepto, la banda para el dato.

Estado vacío honesto: si `direccion === 'sin_datos'`, en lugar de una línea plana
engañosa se dice que no hay datos suficientes en el periodo.

#### A3. `LineChartMini` v2 — retrocompatible

`components/charts/LineChartMini.web.tsx` lo usa también el bloque `grafica` de
Chispa, así que **todas las props nuevas son opcionales** y el comportamiento por
defecto no cambia.

Nuevas props: `unidadY?: string`, `etiquetaX?: string`, `mostrarMedia?: boolean`,
`marcarPico?: boolean`, `pieDeGrafica?: 'total' | 'media' | 'ninguno'`.

Cambios de render:

- Rótulo de unidad en el eje Y y de qué representa el tiempo en el eje X.
- Escala Y con **números redondos** (algoritmo de ticks agradables: 1/2/5 × 10ⁿ)
  en vez de `max`, `max/2`, `0`.
- Eje X con hasta 6–7 etiquetas repartidas, con formato según granularidad, sin
  solaparse (se reduce el número de etiquetas si no caben).
- Línea punteada de la media, rotulada.
- El punto máximo marcado siempre, no solo al pasar el ratón.
- Arreglo del pie: `Total en periodo` solo cuando sumar tiene sentido. Con
  `unidad: 'pct'` pasa a decir "Media".

#### A4. Filtro único de tiempo

`type Periodo = 'hoy' | 'semana' | 'mes' | '3meses' | 'anio'`.

`granularidadDe(periodo)`: `hoy` → hora, `semana` → día, `mes` → día, `3meses` →
semana, `anio` → mes.

Se elimina el estado `agrupacionEjeX`, su selector y el `useEffect` que lo
autoajustaba. `getRango` gana el caso `hoy` y `agruparFecha` el caso `hora`.

#### A5. Lectura también en las secciones de barras

Ocupación, no-shows y servicios reciben una frase equivalente calculada sobre el
reparto, no sobre una serie temporal:

> Tu franja fuerte es 17-20 (34 % de las citas); la más floja, 13-15 (9 %).

#### A6. «Cada cuánto vuelven» como estadístico serio

Sustituye al KPI `Retencion (frec. media)`. Tres cambios:

- Se calcula sobre los **13 meses de histórico** que carga la parte B, no sobre
  el periodo elegido.
- **Mediana además de media**, y la frase explica por qué difieren cuando lo
  hacen.
- **Segmentado**: fieles (3+ visitas) frente a ocasionales, y por servicio,
  porque un color y un corte tienen ciclos distintos.

> Tus clientes vuelven cada **28 días** (mediana; la media sale 34 porque hay
> reapariciones sueltas). Los fieles cada 24, los ocasionales cada 71. Los de
> color cada 45; los de corte, cada 26.

Se conecta con la alerta de fuga existente (`alerta-fuga-clientas.sql`, umbral =
`frecuencia_dias × 1.4`): *"con tu ciclo de 28 días, un cliente que lleva 40 sin
aparecer ya se está yendo"*.

#### A7. Frecuencia en la ficha de cliente (web) + arreglo del SQL

`clientes.frecuencia_dias` **ya existe y ya se calcula** (job de
`alerta-fuga-clientas.sql`: media de los últimos 6 intervalos entre citas
completadas, requiere ≥3 visitas). Ya se muestra en la app **nativa**
(`app/(tabs)/clientes.tsx:482`, "Frecuencia: cada N días").

En la **web** (`app/(tabs)/clientes.web.tsx`) el campo solo se usa escondido
dentro del texto del aviso de fuga; en la ficha nunca se ve. Se añade al resumen:

> **Vuelve cada 26 días** · última visita hace 31 · le tocaba hace 5

Con `InfoDot` explicando el origen (media de sus 6 últimos intervalos; hacen
falta 3 visitas para tenerlo).

Arreglo en `migrations/alerta-fuga-clientas.sql`: la CTE `ultimas_6` filtra
`rn_desc <= 6` sobre `gaps`, donde `rn_desc` numera **todas** las citas incluida
la primera (que tiene `gap` null). Al filtrar después por `gap is not null`, en
los clientes con pocas visitas quedan 5 intervalos en vez de 6. Se numera solo
sobre las filas con `gap` no nulo.

### Parte B — Sección «Fidelización: ¿está creciendo tu base?»

Sustituye a la sección "Retención" actual. Necesita histórico: hoy `cargar()`
solo pide las citas del rango del periodo. Se añade una consulta extra ligera de
**13 meses** con solo `cliente_id`, `inicio`, `estado`, `servicio_id`.

#### B1. Línea «Base fidelizada»

Mes a mes: número de clientes con **2+ visitas** cuya **última visita está dentro
de los 90 días** de ese mes. Es la definición de "base viva y fidelizada". Con su
lectura automática: *"+38 clientes fidelizados en 6 meses (+27 %)"*.

Esta es la gráfica que mide si el salón mejora de verdad.

#### B2. Embudo del periodo

De dónde sale ese número:

```
Nuevos este mes         42  ████████████████
  volvieron 2ª vez      19  ███████          45 %
    ya son fieles (3+)  11  ████             26 %
```

Cada peldaño con su explicación de una línea y el porcentaje **sobre el peldaño
anterior**, no sobre el total (es lo que interesa: la tasa de conversión de cada
paso).

#### B3. Cohortes

Plegado bajo *"Ver análisis avanzado"* para no abrumar al que solo quiere el
titular. Mapa de calor: mes de entrada × meses transcurridos, % que sigue
viniendo. Con **leyenda en castellano llano** y una frase que lo traduce:

> De cada 10 clientes nuevos, 4 siguen viniendo al mes siguiente y 2 al medio año.

### Parte C — Calculadora de comisiones

#### C1. Motor compartido — `lib/comisiones/motor.js`

**JavaScript puro ESM con tipos en JSDoc**, sin dependencias. En JS y no TS por
una razón concreta: la landing es HTML estático servido desde `web/` y no pasa
por el bundle de Expo, así que el mismo fichero tiene que poder importarlo la app
*y* cargarlo la página con `<script type="module">`.
`scripts/postbuild-web.mjs` lo copia a `web/assets/comisiones-motor.js`. Una
sola lógica, dos consumidores, cero duplicación.

Modelos soportados:

- `plano`: un % único.
- `tramos`: % por tramo de facturación (alimentado por `comisiones_tramos`).
- `categoria`: % por categoría de servicio (alimentado por
  `comisiones_por_categoria`).

Parámetros: fijo mensual, propinas dentro o fuera de la base, base con o sin IVA,
cuota patronal de Seguridad Social.

Salida por profesional: `{ base, comision, fijo, brutoTrabajador, costeEmpresa }`
más totales y **margen del salón**. Y `avisos[]`, para los avisos legales de C4.

Tests con `deno test`.

#### C2. Landing pública — `web/calculadora-comisiones.html`

- Misma nav y mismo pie que el resto del sitio. Regla del proyecto: la nav de
  `index.html` va **sin ancho** y el directorio solo en el pie.
- Calculadora: facturación mensual, filas por profesional, modelo, %, fijo,
  propinas.
- Resultado destacado: **lo que te queda a ti** frente a lo que se lleva el
  equipo, coste real de empresa, y "cada punto de % te cuesta X € al mes".
- Contenido SEO real debajo: qué es una comisión en peluquería, modelos típicos
  del sector, base con o sin IVA, errores frecuentes. Sin este texto la página no
  posiciona y la tarea no cumple su objetivo.
- JSON-LD `WebApplication` + `FAQPage` (adelanta parte de B4-065).
- **Captura de email**: "te mando el desglose" → `MechaAPI.insertSolicitud`, que
  ya existe en `web/assets/auth.js` y llama a la RPC `crear_solicitud_publica`.
- **Migración necesaria**: `solicitudes.tipo` tiene un CHECK que solo admite
  `demo | reserva_llamada | signup | mensaje | quiero_software`. Hay que añadir
  `calculadora` **en el CHECK de la tabla y en la RPC**. Si se hace solo en uno,
  la fila no se guarda y falla en silencio — es exactamente el bug documentado en
  `migrations/contacto-tres-vias.sql` con los mensajes del pricing.
- `vercel.json`: rewrite `/calculadora-comisiones` → `/calculadora-comisiones.html`.
- Entrada en `web/sitemap.xml` y enlace desde el pie de `index.html`.

#### C3. Simulador dentro de Informes

La sección "Comisiones por profesional" pasa a usar el motor compartido y gana:

- Modelo por **tramos** y por **categoría**, leyendo `comisiones_tramos` y
  `comisiones_por_categoria` (hoy en BD sin UI).
- Modo **"¿qué pasa si...?"**: al mover el %, delta inmediato en euros y en
  margen del salón.
- Enlace con la `LiquidacionesSection` existente para aplicar y liquidar.

#### C4. IVA y marco legal — `lib/comisiones/parametrosLegales.js`

Un **único fichero** con todos los números legales, cada uno fechado y con nota
de procedencia, para que sea auditable sin leer la lógica.

- **IVA 21 %** (peluquería y estética) y comisión **siempre sobre base sin IVA**.
  La app ya lo hace bien; la landing igual, **y lo explica**: calcular el 30 %
  sobre el precio con IVA es regalar dinero que era de Hacienda. Es el error más
  común del sector.
- **Propinas fuera de la base comisionable** (son íntegras del trabajador). La
  app ya lo respeta restando `propina_cents`; la landing lo mismo y explicado.
- **Coste real de empresa**: cuota patronal desglosada (contingencias comunes,
  desempleo, FOGASA, formación profesional, MEI), editable y con el desglose a la
  vista.
- **Aviso de suelo legal**: si el resultado deja al profesional por debajo del
  mínimo de convenio o del SMI, la calculadora avisa. La comisión es un
  **complemento**, no sustituye al salario base.
- **Modelo alquiler de sillón / autónomo** como alternativa: el profesional
  factura al salón con IVA 21 % y retención de IRPF. Es otro régimen fiscal y
  muchos salones lo usan sin saberlo.
- **Aviso legal visible**: cálculo orientativo, no es asesoramiento fiscal ni
  laboral, parámetros a fecha X, consulta con tu asesor.

**Restricción asumida:** las cifras exactas de SMI y de tipos de cotización de
2026 no se dan por buenas de memoria. Van en este fichero como valores por
defecto **editables y fechados**, y se verifican contra fuente oficial en la
implementación. Nada que pueda acabar en una nómina se escribe a ojo.

## Fuera de alcance

- Tocar la app nativa (`informes.tsx`, `clientes.tsx`) más allá de lo que exija
  no romper el tipado. La ficha nativa ya muestra la frecuencia.
- Rehacer `LiquidacionesSection`. Se enlaza con ella, no se reescribe.
- Refactor general de `informes.web.tsx` (2.131 líneas). Solo se extrae lo que
  toca este trabajo: la lectura de series y las gráficas salen a `lib/` y
  `components/charts/`, que ya reduce el fichero.

## Verificación

- `npx tsc --noEmit` limpio.
- `deno test` verde en `lib/informes/lecturaSerie.test.ts` y
  `lib/comisiones/motor.test.ts`.
- Informes revisado en el navegador con datos reales (patrón demo iframe:
  `/demo.html?share=1` y navegación por DOM).
- Landing `/calculadora-comisiones` revisada en el navegador: cálculo correcto,
  captura de email guardando de verdad en `solicitudes` (no dando por bueno el
  200), y JSON-LD válido.
