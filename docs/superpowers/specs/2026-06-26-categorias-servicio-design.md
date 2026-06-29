# Categorías de servicio (con color)

> Spec de diseño. Fuente de decisiones: brainstorming con Carlos (26 jun 2026), incluyendo
> companion visual para color y layout (paleta curada vs hex libre; secciones agrupadas vs chips vs
> punto de color en nueva cita; borde vs etiqueta vs tabs en portal).
> Producto: Mecha (repo Hairy). Estado del producto: `informes/MEGA_INFORME_MECHA.md`.

## Problema

Hoy `servicios.categoria` es texto libre, con un selector fijo y hardcodeado de 5 opciones
(`Corte/Color/Tratamiento/Peinado/Otro`) solo en el modal de edición. La lista de Configuración →
Servicios ya agrupa por ese valor, pero sin color ni posibilidad de que el dueño cree sus propias
categorías. En creación de cita, portal público y caja no hay ninguna agrupación: con catálogos
grandes (varios servicios por categoría, ej. "Mechas californianas", "Mechas de hombre", "Mechas
balayage" bajo "Mechas") se vuelve difícil escanear la lista.

## Objetivo

El dueño define sus propias categorías de servicio (nombre + color), y esas categorías se ven
consistentes en: catálogo (admin), creación de cita, portal público de reserva online, y en caja /
ficha de cita ("órdenes"). Velocidad de escaneo > decoración — coherente con el resto del producto.

## Decisiones (fijadas por el usuario, 26 jun)

- **Una sola categoría por servicio** (no etiquetas múltiples). Coincide con el campo actual.
- **Color de una paleta curada de 10 tonos**, no un hex libre — garantiza contraste sobre el tema
  claro/crema de la app y coherencia con el resto del producto. 6 son tokens ya existentes y en uso
  (`primary, success, warning, danger, cyan, rose`); 4 son tokens **nuevos y aditivos** que se añaden
  a `lib/designTokens.ts` sin tocar ninguno existente: `indigo` (#4f46e5), `purple` (#8b5cf6), `teal`
  (#0d9488), `slate` (#64748b). **No se reutiliza el token `violet`**: aunque su nombre sugiere
  morado, su valor real es `#c0260a` (idéntico a `primaryHi`) y está en uso activo de verdad en
  `clientes.web.tsx` (fichas de color/química) e `informes.web.tsx` (stats de ocupación) — repintarlo
  rompería esas pantallas. Queda como deuda aparte, no se toca aquí.
- **Crear cita:** secciones agrupadas por categoría con cabecera de color, siempre desplegadas
  (mismo patrón que ya usa hoy Configuración → Servicios).
- **Portal público:** fila de chips de filtro ("Todos" + una por categoría) encima de la lista del
  paso 1 (elegir servicio); la tarjeta de servicio en sí no cambia (el portal ya tiene diseño
  aprobado, no se toca su tarjeta).
- **"Órdenes" = caja (ticket de cobro) + ficha/resumen de la cita** (agenda y autogestión del
  cliente). No incluye informes/analítica (fuera de alcance, ver más abajo).
- **Gestión de categorías solo para el propietario**, dentro de Configuración → Servicios (no un
  menú nuevo), igual que la configuración del asistente.

## Aviso de colisión de nombres (importante)

En la BD ya existe el concepto de **categoría profesional** (jerarquía auxiliar/oficial/oficial
mayor/estilista senior/dirección): campo `profesionales.categoria`, `servicios.categoria_minima`, y
la tabla `service_category_pricing` (precio especial por categoría de profesional). Es un concepto
**totalmente distinto** al que se crea aquí (categoría de servicio = agrupación temática como
Color/Corte/Mechas). No se toca nada de la jerarquía de profesional. Para evitar ambigüedad en
código y UI:
- Tabla nueva: `categorias_servicio`.
- Campo nuevo en `servicios`: `categoria_id` (sustituye a `servicios.categoria` texto libre, que se
  elimina tras la migración).
- En la UI, el selector de categoría de servicio se etiqueta "Categoría" a secas (es lo que ve el
  dueño al crear un servicio); el selector de categoría profesional ya existente mantiene su label
  actual ("Categoría mínima del profesional" / similar) sin cambios.

## 1. Modelo de datos

```sql
create table categorias_servicio (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  nombre text not null,
  color text not null,           -- token: 'primary'|'success'|'warning'|'danger'|'cyan'|'rose'|'indigo'|'purple'|'teal'|'slate'
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (negocio_id, nombre)
);
-- RLS: select/insert/update/delete filtrado por negocio_id = propio (igual que el resto de tablas).

alter table servicios add column categoria_id uuid references categorias_servicio(id);
```

No se toca `cobro_lineas`: comprobado en código que `caja.web.tsx` no renderiza líneas de
cobro individuales (solo el arqueo agregado del día vía la tabla `cobros`), así que no hay
ninguna pantalla hoy que consuma un snapshot de categoría ahí — añadirlo sería una columna
muerta. El día que exista un listado de tickets detallado, se puede unir en vivo por
`ref_id → servicios.categoria_id` (igual que `citas_pendientes_cobro` ya hace con
`servicio_nombre`), sin necesidad de snapshot.

El color se guarda como **nombre de token** (no hex), mapeado en código a los hex reales de
`designTokens.ts` (`lib/categoryColors.ts` nuevo, con `{bg, text, border}` derivados de los tokens
existentes + su variante `*Soft`). Si algún día cambia un hex de marca, las categorías heredan el
cambio solas.

## 2. Gestión de categorías (Configuración → Servicios)

Botón "Gestionar categorías" (visible solo a propietario) → modal con:
- Lista ordenable (flechas arriba/abajo o drag simple): swatch de color + nombre + nº de servicios
  que la usan.
- Alta: nombre + selector de color (8 swatches de la paleta curada).
- Edición: mismo formulario.
- Baja: si tiene servicios asociados, aviso ("N servicios quedarán sin categoría") en vez de
  bloquear; confirmar pone `categoria_id = null` en esos servicios.

## 3. Catálogo de servicios (admin) — `configuracion.web.tsx`

- `EditServiceModal`: el selector hardcodeado de 5 opciones (línea ~3300) pasa a ser un desplegable
  con las categorías reales del negocio + opción "crear nueva" inline (abre el alta rápida sin salir
  del modal de servicio).
- `TabServicios`: la agrupación por categoría que ya existe (línea ~1900-1983) pinta la cabecera de
  cada grupo con el color de su categoría (barra lateral o punto, igual que en los mockups).
- Servicios sin categoría se agrupan bajo "Sin categoría" (gris/slate), sin romper el resto.

## 4. Crear cita — `nueva-cita.tsx` (nativo) y el modal de creación dentro de `AgendaCalendar.web.tsx` (web)

Son dos implementaciones independientes de la misma pantalla (patrón de split de plataforma: la web
no navega a `nueva-cita.tsx`, tiene su propio modal embebido). Las dos listas de servicios, hoy
planas, pasan a secciones por categoría: cabecera con barra de color + nombre de categoría, servicios
debajo en el mismo estilo de fila/grid actual de cada una. Sin controles nuevos (cero toques extra).
Orden de las secciones = `categorias_servicio.orden`.

## 5. Portal público — `app/r/[slug].web.tsx` + RPC `portal_info`

- RPC `portal_info` (migración `portal-reserva-publica.sql`): la query de servicios añade join a
  `categorias_servicio` y devuelve `categoria_id, categoria_nombre, categoria_color`; el
  `order by` pasa de `s.categoria nulls last, s.nombre` a
  `categoria.orden nulls last, s.nombre`.
- UI: fila de chips arriba de la lista del paso 1 ("Todos" + una por categoría con su color); al
  tocar un chip, filtra la lista por esa categoría (cliente-side, sin nueva llamada al RPC). La
  tarjeta de servicio no cambia de estructura.

## 6. Caja + ficha de cita ("órdenes")

- **Ficha de cita en agenda** (`DetalleCitaModal` dentro de `components/agenda/AgendaCalendar.web.tsx`):
  punto de color de categoría junto al nombre del servicio en la cabecera y en el selector de
  servicio, vía lookup en vivo (`categoria_id` → mapa de categorías ya cargado en el mismo archivo).
- **Página de autogestión del cliente** (`app/cita/[id].web.tsx`): el RPC `cita_publica` hace join
  en vivo a `categorias_servicio` (igual que ya hace con `servicios` para el nombre) y devuelve
  `categoria_nombre`/`categoria_color`; se pinta el mismo punto de color junto al servicio.
- **Ticket de caja**: el momento real de "cobrar" es el `CobroSheet` (`components/pos/CobroSheet.tsx`),
  que para el flujo de cita ya recibe el servicio seleccionado en memoria — se le pasa el color de
  categoría como prop y se pinta junto al nombre del servicio en su cabecera. No se toca
  `cobro_lineas`: no existe hoy ninguna pantalla que liste líneas de cobro históricas por servicio
  (`caja.web.tsx` solo muestra el arqueo agregado del día), así que no hay snapshot que hacer todavía.

## 7. Migración de datos existentes

Automática, sin intervención manual:
1. Por cada `negocio_id`, `select distinct categoria from servicios where categoria is not null`.
2. Crear una fila en `categorias_servicio` por cada valor distinto, asignando color de la paleta de
   8 tonos en orden round-robin (orden = orden alfabético de aparición).
3. `update servicios set categoria_id = (categoria creada correspondiente)`.
4. Servicios con `categoria` null quedan con `categoria_id` null ("Sin categoría"); no se inventan
   categorías para ellos.
5. **`servicios.categoria` (texto) NO se borra en esta migración** — se deja en paralelo hasta que
   todo el código (RPC `portal_info`, `nueva-cita.tsx`, admin) lea `categoria_id`. Si se borra antes,
   el RPC del portal rompe en producción mientras el código nuevo aún no está desplegado. El DROP
   COLUMN va en una migración de limpieza aparte, al final (ver "Orden de implementación").
6. Tras aplicar la migración: pasar **advisors de seguridad** de Supabase (regla del repo).

## Fuera de alcance ahora (YAGNI)

- Múltiples categorías por servicio (etiquetas).
- Subcategorías anidadas (la categoría agrupa servicios directamente, sin un tercer nivel).
- Iconos por categoría (solo color, como se pidió).
- Comisiones configurables por categoría de servicio (existe como modelo futuro en el Modular 3,
  pero el esquema de hoy ya lo deja preparado — `categoria_id` es reutilizable el día que se
  implemente).
- Cambios al concepto de categoría **profesional** (jerarquía) — completamente intacto.

## Errores y casos límite

- Servicio sin categoría en cualquier pantalla → bucket "Sin categoría" (slate), nunca un hueco roto.
- Borrar una categoría con servicios → confirmación explícita, no bloqueo duro.
- Nombre de categoría duplicado en el mismo negocio → `unique(negocio_id, nombre)` + mensaje de error
  claro en el modal (reutilizar patrón de `lib/errores.ts`).
- Negocio con 0 categorías tras la migración (porque todos sus servicios tenían `categoria` null) →
  pantallas funcionan igual, todo cae en "Sin categoría", sin forzar al dueño a crear nada.

## Pruebas

- **SQL:** migración crea categorías correctas por negocio (sin mezclar negocios), backfill de
  `categoria_id` correcto, RLS de `categorias_servicio` filtra por `negocio_id`.
- **Admin:** crear/editar/reordenar/borrar categoría; borrar con servicios asociados muestra aviso;
  selector de categoría en `EditServiceModal` lista categorías reales y permite alta inline.
- **Agenda:** `nueva-cita.tsx` (nativo) y el modal de creación en `AgendaCalendar.web.tsx` (web)
  agrupan correctamente con catálogos de varias categorías y con servicios sin categoría;
  `DetalleCitaModal` y `CobroSheet` muestran el color correcto del servicio elegido.
- **Portal:** chips filtran bien, "Todos" muestra todo, RPC `portal_info` devuelve color/nombre de
  categoría; RPC `cita_publica` idem para la autogestión del cliente.
- **Seguridad:** advisors de Supabase limpios tras la migración.

## Orden de implementación

1. Migración SQL aditiva: tabla `categorias_servicio` + columna `servicios.categoria_id` + backfill +
   RLS + `create or replace function portal_info` y `cita_publica` ya apuntando a `categoria_id`
   (no se toca todavía `servicios.categoria`, queda en paralelo) + advisors.
2. `lib/categoryColors.ts` (mapa token → hex) + componente reutilizable de punto/badge de color en
   `components/ui/DesignComponents.tsx`.
3. Gestión de categorías en Configuración → Servicios (modal CRUD) + selector dinámico en
   `EditServiceModal` + color en cabeceras de `TabServicios`.
4. Agrupación en `nueva-cita.tsx` (nativo).
5. Agrupación en el modal de creación de `AgendaCalendar.web.tsx` + mapa de categorías compartido +
   badge de color en `DetalleCitaModal` (cabecera y selector de servicio) + prop de color a
   `CobroSheet`.
6. Chips de filtro en `app/r/[slug].web.tsx` (ya consume `categoria_id` desde el paso 1).
7. Badge en `app/cita/[id].web.tsx` (autogestión, vía `cita_publica` ya actualizado en el paso 1).
8. `npx tsc --noEmit`, `npm run build:web`, smoke test local (`scripts/serve-web.mjs`), advisors.
9. Commit, merge a `master`, deploy (Vercel vía Git).
10. Migración de limpieza (aparte, tras confirmar que nada lee ya `servicios.categoria`):
    `alter table servicios drop column categoria`.
