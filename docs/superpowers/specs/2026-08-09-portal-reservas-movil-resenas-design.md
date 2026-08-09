# Portal de reservas: desbloquear la reserva, arreglar el móvil y conectar las reseñas

Fecha: 2026-08-09
Estado: aprobado el enfoque, pendiente de revisión del spec
Subproyecto A de 4 (ver "Fuera de alcance")

## Problema

El portal público de reservas (`/app/r/<slug>`) está roto en producción. Verificado
en vivo sobre `https://www.mechaa.es/app/r/demo` a 375px el 2026-08-09.

Siete defectos confirmados, cada uno con causa localizada:

| # | Síntoma | Causa raíz | Sitio |
|---|---|---|---|
| 1 | No se puede elegir día ni hora | Los dos efectos de carga arrancan con `if (step !== 'fecha' \|\| !servicio) return;`, pero la maquetación ya no es un asistente por pasos: las tres secciones se pintan apiladas a la vez. `step` nunca llega a `'fecha'`, así que `portal_dias_disponibles` y `disponibilidad_publica` **no se llaman nunca** | `app/r/[slug].web.tsx:248`, `:267` |
| 2 | Reseñas cortadas | `gridTemplateColumns: '260px minmax(0,1fr)'` sin rama móvil: 260+24+240 = 524px metidos en 343px. Las tarjetas se pintan a 59px de ancho con 240px de contenido | `:929`, `:944` |
| 3 | Cabecera cortada | Bloque de cabecera de 540px en un viewport de 375px: 165px recortados | `:489`, `:521` |
| 4 | Símbolos raros | Mojibake literal en el fuente: `â€”`, `Â¡Reserva confirmada!`, `Â¡Perfecto`, `12â‚¬` | `:709`, `:747`, `:822`, `:823` |
| 5 | Tipografía de periódico | `'Instrument Serif',serif` en 7 encabezados, aplicada además de forma incoherente (sección 1 en Inter, secciones 2 y 3 en serif) | `:592`, `:614` |
| 6 | Reposo | La BD ya lo resuelve entera; la UI nunca lee `en_reposo` ni `reposo_disponible_min` | `lib/reservaPublica.ts:49` |
| 7 | Reseñas inventadas | El bloque entero es un mock: `{[1,2].map(...)}` con "Cliente feliz / Servicio x", siempre 5 estrellas. Las reseñas reales se piden y no se pintan nunca | `:942` |

### El #7 es el más grave y no es cosmético

El propio código lo dice: `{/* The rest of the reviews would be mapped here, using
static for now as mock */}`. Además `:931` cae a `resenas?.media || '4.9'` y
`resenas?.total || 182`: si la petición falla, el portal público de un salón real
anuncia **4,9 estrellas sobre 182 reseñas** que no existen. Es una afirmación
cuantificada y falsa sobre un negocio real en una página pública. Se corrige aquí,
pero conviene tratarlo como urgente por sí solo.

### Lo que NO está roto (comprobado, no asumido)

- Las migraciones `fix-reposo-portal-disponibilidad.sql` y
  `fix-reposo-portal-escritura.sql` **sí están desplegadas**. `disponibilidad_publica`
  devuelve hoy `en_reposo` y `reposo_disponible_min`.
- `disponibilidad_publica` ya garantiza que el servicio **cabe** en el hueco de
  reposo: la cláusula de exclusión compara `v_total` contra `[inicio, fin_activa)` y
  `[fin_espera, fin)`. No hace falta tocar la lógica de reserva.
- La tira de días **sí** hace scroll horizontal correctamente y el documento no
  desborda a nivel de página (`scrollWidth === clientWidth === 375`).
- Inter carga bien (~165KB por peso). La sensación de periódico es el serif del #5,
  no una webfont rota.

## Decisiones tomadas

1. **Enfoque:** arreglos + extraer primitivas de maquetación + reseñas rehechas.
   No reescribir la página (983 líneas con i18n, analytics, captcha, exprés, reserva
   de grupo y pagos que funcionan).
2. **Entrega en tres commits**, el primero suelto y desplegable por sí solo, para que
   reservar funcione hoy y no espere al rediseño.
3. **Serif fuera del todo.** Inter en todo el portal.
4. **Reposo: reservable y marcado.** Sólo UI; la BD ya lo cubre.
5. **Reseñas: maquetación A** (resumen apilado, con las barras 5→1 también en móvil).
6. **Distribución 5→1 real**, ampliando `resenas_publicas`.
7. **Campos públicos = grupo `salon`.** El grupo `mecha` no sale al portal.

### Qué campos van al portal y por qué

`app/(tabs)/resenas.web.tsx:96` ya clasifica cada nota en `salon` o `mecha`. Esa
clasificación es la fuente de verdad de esta decisión.

Van al portal (grupo `salon` + identidad):

| Campo | Etiqueta en la tarjeta |
|---|---|
| `autor_nombre` | nombre, con fallback `'Anónimo'` (misma convención que `:591`) |
| `puntuacion` | `Salón` |
| `salon_trato_puntuacion` | `Trato` |
| `salon_productos_puntuacion` | `Limpieza/Prod` |
| `comentario` | texto de la reseña |
| `created_at` | fecha relativa |
| `profesional` (nombre) + `profesional_puntuacion` | `Atendido por X` |
| `servicio` (nombre) | contexto de la cita |
| `verificada` | insignia de cita verificada |

No van al portal:

- Todo el grupo `mecha` (`mecha_puntuacion`, `mecha_facilidad_puntuacion`,
  `mecha_disponibilidad_puntuacion`, `mecha_pagos_puntuacion`, `mecha_comentario`,
  `mecha_mejora_comentario`). Es el cliente valorando **Mecha como software**, no al
  salón. Publicarlo en la página de un cliente sería incorrecto.
- `respuesta_borrador`: es un **borrador**. No existe columna de respuesta publicada,
  así que las respuestas del salón no pueden hacerse públicas hasta modelarlo.
- `ip_origen`, `cliente_id`, `cita_id`: datos personales / internos.

Las sub-notas se pintan **sólo si no son nulas**, igual que hace la página interna
en `:645` y `:651`.

## Diseño

### Commit 1 — desbloquear la reserva

Alcance mínimo y aislado, para poder desplegarlo solo.

1. En `:248` y `:267`, sustituir la guarda `step !== 'fecha' || !servicio` por
   `!servicio`. Es lo que la maquetación apilada implica de verdad.
2. Corregir los cuatro literales con mojibake (`:709`, `:747`, `:822`, `:823`).
   Revisar el fichero entero en busca de más secuencias `Ã`/`â€`/`Â`.

Nada más. Sin rediseño, sin migración.

### Commit 2 — maquetación

Cuatro componentes locales en el mismo fichero, que sustituyen patrones repetidos:

- **`PortalContainer`** — el envoltorio `maxWidth: 1360` + padding responsive.
  Hoy duplicado en `:489`, `:521` y `:527` con tres paddings distintos.
- **`SectionHeading`** — un único estilo de encabezado, Inter, sin serif.
- **`ResponsiveGrid`** — recibe columnas de móvil y plantilla de escritorio. Es la
  abstracción cuya ausencia causó el #2 y el #3: obliga a declarar el comportamiento
  bajo el breakpoint para poder pintar una rejilla.
- **`useIsMobile`** — un único origen de verdad del breakpoint.

El objetivo es que los defectos #2 y #3 pasen a ser **inalcanzables**, no parcheados.

### Commit 3 — reseñas

**Migración**: ampliar `resenas_publicas(p_slug)` para que devuelva, además de lo
actual (`media`, `total`, `verificadas`, `ultimas[]` con `autor`/`fecha`/
`comentario`/`puntuacion`/`verificada`):

- `distribucion`: reparto real de 5 a 1 estrellas, para las barras.
- Por reseña: `salon_trato_puntuacion`, `salon_productos_puntuacion`,
  `profesional_nombre`, `profesional_puntuacion`, `servicio_nombre`.

Restricciones de la migración:
- La función devuelve `jsonb`, así que `CREATE OR REPLACE` basta: no cambia el
  `RETURNS` y **no se pierden los grants**. (A diferencia de
  `disponibilidad_publica`, que sí necesitó `DROP` + re-`GRANT`.) Verificar los
  grants existentes antes y después.
- Sigue respetando `visible = true`.
- No expone ningún campo del grupo `mecha` ni datos personales.

**UI**: sustituir el mock de `:942` por el render de las reseñas reales, siguiendo
la anatomía de la tarjeta interna (`:632`–`:660`):

- `FlamesRow` en lugar de `IconStarFilled`. Mecha usa llamas, no estrellas; el
  portal es el único sitio que dibuja estrellas.
- `Atendido por {profesional}` + sus llamas, sólo si hay profesional.
- Fila de notas: `Salón` siempre; `Trato` y `Limpieza/Prod` sólo si no son nulas.
- Insignia de verificada cuando `verificada` es true.
- `autor_nombre || 'Anónimo'`.

**Eliminar los fallbacks inventados** de `:931`: sin datos, el bloque de reseñas no
se pinta. Nunca un número inventado.

**Maquetación A**: en móvil una sola columna — resumen (media + llamas + total +
barras 5→1) a ancho completo, y debajo las tarjetas apiladas a ancho completo. En
escritorio se mantiene la barra lateral `260px | 1fr`.

### Reposo

Los huecos con `en_reposo` reciben un distintivo visual y una etiqueta breve
derivada de `reposo_disponible_min`. Cero cambios en la lógica de reserva.

### Queries muertas

`:190` consulta la tabla `negocios`, que **no existe**. `:194` consulta
`negocio_portal.fondo_portal_url`, columna que **no existe**. Son el 404 y el 400 de
la consola.

**Pendiente de decidir** (el usuario no se ha pronunciado sobre esto todavía). La
propuesta por defecto: borrar la query a `negocios`, y dejar la de
`fondo_portal_url` donde está pero con un comentario que deje claro que la columna
no existe y que hoy no hace nada, por si se quiere recuperar la función. La
alternativa es borrar también esa segunda query y su consumidor en `:518`.

**Riesgo abierto:** `cobroReserva` se alimenta de la query muerta a `negocios`, así
que hoy el depósito es siempre 0 en el portal. Antes de tocar nada hay que averiguar
de dónde debería salir el importe. Puede ser un bug real de cobros escondido detrás
de la query muerta. **Si al investigarlo resulta que toca la pasarela de pago, se
saca de este spec y se trata aparte.**

## Verificación

Reproducir cada fila de la tabla de defectos a 375px contra el portal real, y
confirmar con evidencia:

1. `portal_dias_disponibles` y `disponibilidad_publica` aparecen en las peticiones
   de red (hoy no aparecen).
2. Al pulsar un día se pintan horas, o el vacío honesto "Sin huecos este día".
3. Una reserva se completa de principio a fin.
4. Ningún contenedor que no sea un carrusel recorta: `scrollWidth <= clientWidth`.
5. `Instrument Serif` no aparece en ningún estilo computado.
6. Cero mojibake en el texto renderizado.
7. Las reseñas mostradas coinciden una a una con `resenas_publicas('demo')`.
8. Ningún campo `mecha_*` viaja al cliente. Comprobar la respuesta cruda de la RPC.
9. Con un salón sin reseñas, el bloque no inventa ni `4.9` ni `182`.

Verificar en **producción**, no sólo en local: CSP, buildCommand y latencia esconden
bugs que en local no aparecen.

## Fuera de alcance

Este spec es el subproyecto **A** de cuatro. Los otros tres van cada uno con su
propio spec:

- **B — Agenda móvil:** scroll lateral en la vista de todos los profesionales.
- **C — Bloqueos visuales:** pausas, comidas, vacaciones y fin de jornada por
  profesional. Las tablas `bloqueos`, `bloqueos_profesional`, `cierres_negocio` y
  `horarios_profesional` ya existen.
- **D — Organizador maestro:** rehacer el criterio (aprovechar reposos, adelantar
  al máximo) y el "enséñamelo" paso a paso y en orden.

B y C caen los dos en `components/agenda/AgendaCalendar.web.tsx`, de **21.151
líneas**. Es el mayor riesgo de todo el encargo y conviene coordinarlos.

Tampoco entra aquí:

- `app/r/[slug].tsx` (nativo). No lo he examinado y no se toca.
- Fondos de portal como funcionalidad real (necesitaría su propia migración).
- Respuestas del salón a las reseñas (necesitaría columna de respuesta publicada).
