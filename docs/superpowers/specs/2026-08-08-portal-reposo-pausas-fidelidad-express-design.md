# Portal: reposo real, pausas por profesional, fidelidad y citas exprés

**Fecha:** 2026-08-08
**Proyecto:** Mecha (Hairy)
**Ámbito:** 5 fases independientes, algunas con dependencias entre sí (ver orden al final)

---

## Contexto / motivación

Un cliente reportó que el portal de reservas nunca ofrece como reservable el tiempo de reposo de una cita (p. ej. tinte reposando), ni siquiera cuando el reposo es prácticamente todo el tramo inicial de la cita (fase activa de 1-2 min + reposo largo). Al investigar la causa, la conversación se amplió a cuatro piezas más relacionadas con disponibilidad del portal y de la agenda: visibilidad de servicios en el portal, pausas de comida por profesional, un sistema de fidelidad con beneficios operativos, y una opción de "cita exprés".

---

## Fase A — El portal reconoce el reposo como hueco reservable

### Causa raíz

El modelo interno de citas ya soporta reposo correctamente en cualquier posición: una cita tiene `inicio → fin_activa → fin_espera → fin`, y el tramo `[fin_activa, fin_espera)` se trata como tiempo libre en `lib/retrasos.ts` (`ventanasActivas`) y `lib/organizarAgenda.ts`. Esto ya funciona igual de bien tanto si el reposo va en medio de la cita como si va "lo primero" (fase activa de 2 min + reposo largo) — no hay ningún caso especial por posición, porque ninguna función mira dónde cae `fin_activa` respecto a `inicio`.

El problema está en las funciones SQL del portal público, `disponibilidad_publica` y `portal_dias_disponibles` (definidas originalmente en `migrations/portal-reserva-publica.sql`, redefinidas sin cambiar esta lógica en `migrations/sesion15_cierres_negocio.sql`). Ambas bloquean el rango completo `[inicio, fin]` de cualquier cita existente, sin mirar nunca `fin_activa`/`fin_espera`. El propio comentario original lo confirma como decisión consciente de v1:

> *"Disponibilidad v1: una cita ocupa todo su rango [inicio, fin] (conservador; el aprovechamiento de reposos es una optimización solo para uso interno)."*

Esto explica de una sola causa tanto el caso "reposo lo primero" como buena parte de los huecos de duración no-redonda (19-20 min) que no aparecen: si ese hueco vive dentro de un reposo, hoy es invisible para el portal sea cual sea su duración.

### Cambio 1: las funciones dejan de bloquear el reposo

Reescribir el `NOT EXISTS` de choque en `disponibilidad_publica` y `portal_dias_disponibles` para que compare solo contra las **fases activas** de cada cita existente, replicando exactamente la regla de `ventanasActivas()`:

- Ventana activa 1: `[c.inicio, coalesce(c.fin_activa, c.fin))`
- Ventana activa 2 (solo si hay reposo real): `[coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)), c.fin)`, y solo existe si ese `fin_espera` efectivo es `< c.fin`.

```sql
and not exists (
  select 1 from public.citas c
  where c.profesional_id = gen.profesional_id
    and c.estado in ('pendiente','confirmada')
    and (
      (c.inicio < gen.slot_tz + make_interval(mins => v_total)
       and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
      or
      (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
       and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => v_total)
       and c.fin > gen.slot_tz)
    )
)
```

Se aplica igual en `portal_dias_disponibles` (mismo patrón, dentro de su propio `not exists`).

### Cambio 2: nota con el tiempo exacto del reposo

`disponibilidad_publica` gana dos columnas nuevas en su `RETURNS TABLE`: `en_reposo boolean` y `reposo_disponible_min integer` (null si no aplica). Como ya sabemos por el filtro anterior que el slot NO choca con ninguna fase activa, cualquier solape restante contra el rango total `[c.inicio, c.fin)` de otra cita cae necesariamente dentro de su reposo — así que se calcula gratis en un `cross join lateral` junto al resto de la consulta:

```sql
cross join lateral (
  select
    exists (
      select 1 from public.citas c2
      where c2.profesional_id = gen.profesional_id
        and c2.estado in ('pendiente','confirmada')
        and c2.inicio < gen.slot_tz + make_interval(mins => v_total)
        and c2.fin    > gen.slot_tz
    ) as en_reposo,
    (
      select min(round(extract(epoch from (
        coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz
      )) / 60)::int)
      from public.citas c3
      where c3.profesional_id = gen.profesional_id
        and c3.estado in ('pendiente','confirmada')
        and c3.inicio < gen.slot_tz + make_interval(mins => v_total)
        and c3.fin    > gen.slot_tz
    ) as disponible_min
) reposo
```

`reposo_disponible_min` es el tiempo exacto que queda desde ESE slot concreto hasta que el profesional necesita volver a atender a la clienta original (no la duración total del reposo del host, sino lo que queda desde el punto de arranque de este hueco — es lo accionable para quien reserva).

### Cambio 3: TS + UI del portal

- `lib/reservaPublica.ts`: `SlotDisponible` gana `en_reposo: boolean` y `reposo_disponible_min: number | null`.
- `app/r/[slug].web.tsx`: los slots con `en_reposo=true` llevan un indicador sutil (mismo patrón visual que ya existe para "cualquier profesional", línea ~707) y una nota neutra con el minutaje exacto, p. ej. **"Hueco breve · 22 min disponibles"**, sin revelar nada de la otra clienta. Nueva clave de traducción en `lib/portalI18n.ts`.

### Verificación

Antes de cerrar la fase, probar con datos reales del proyecto Mecha (vía MCP de Supabase) que un hueco de duración no múltiplo de 15 se ofrece correctamente tras el cambio 1, y que `reposo_disponible_min` da el número correcto. El bloqueo de reposo era la causa dominante identificada; si tras el fix sigue habiendo huecos "perdidos" por alineación de rejilla de 15 min, se trata como bug aparte (no bloquea esta fase).

**Alcance:** toca funciones SQL en producción (proyecto Supabase "Mecha", multi-tenant). El cambio es aditivo — solo revela huecos que hoy se ocultan indebidamente.

---

## Fase B — Visibilidad de servicio en el portal

**Cerrada, no hay nada que construir.** Ya existe: `servicios.reservable_online` (boolean, default true) + interruptor **"Reservable online"** ("Visible en el portal de reservas del salón") en `app/(tabs)/configuracion.web.tsx` (modal de edición de servicio, `EditServiceModal`), ya respetado en `crear_cita_publica`, en la carga de disponibilidad y en la query del portal. Separado del toggle "Activo".

---

## Fase C — Pausa de comida por profesional

### Estado actual

Cada profesional ya admite **2 turnos** por día en `horarios_profesional` (`profesional_id, dia_semana, hora_inicio, hora_fin, turno`). El hueco entre turno 1 y turno 2 (p. ej. 09:00-14:00 y 16:00-20:00) ya se trata como bloqueado en:
- `disponibilidad_publica` (portal): cada turno genera su propia serie de candidatos, no hay generación cruzando el hueco.
- `crear_cita_publica` (portal): `exists` exige que la cita quepa entera dentro de un único turno.
- `app/screens/nueva-cita.tsx` (alta manual interna): llama a `validarHorarioLaboral()` (`lib/horarios.ts`), que usa el mismo criterio de turnos/franjas.

Lo que **no** está cubierto hoy:
1. UI: para poner una pausa hay que cerrar el turno 1 a una hora y abrir el turno 2 en otra, día a día, desde `app/(tabs)/equipo.web.tsx` (`openEditDia`, `guardarHorario`). No hay concepto explícito de "pausa" ni forma de aplicar el mismo horario a varios días de una vez.
2. La rejilla de la agenda (`components/agenda/AgendaCalendar.web.tsx`) no lee `horarios_profesional` en ningún punto — no pinta la pausa como bloqueada visualmente.
3. Mover una cita arrastrándola (drag) en la agenda no valida contra `horarios_profesional` — solo la creación nueva desde `nueva-cita.tsx` lo hace.

### Cambios

**C1 — Editor de "pausa de comida" en Equipo, con selección de varios días a la vez.**
Nueva sección en el panel de horario del profesional (`app/(tabs)/equipo.web.tsx`), reutilizando el selector de píldoras de días que ya existe para la recurrencia de bloqueos (`DIAS_SEMANA_FULL`, patrón de `toggleDia`, líneas ~2665-2692 del mismo archivo). El formulario pide: días (multi-select) + hora de inicio/fin de la jornada completa de esos días + hora de inicio/fin de la pausa. Al guardar, para cada día seleccionado se escribe/actualiza turno 1 (inicio de jornada → inicio pausa) y turno 2 (fin pausa → fin de jornada), reutilizando `guardarHorario()`. Si el profesional ya tenía turnos distintos en algún día seleccionado, se sobrescriben para ese día (el formulario parte de valores por defecto precargados del primer día seleccionado, editables antes de guardar). Sin cambio de esquema — sigue siendo el mismo modelo de 2 turnos, solo con una UI que no obliga a pensarlo como "turno 2".

**C2 — Franja de pausa visible en la rejilla de la agenda.**
`AgendaCalendar.web.tsx` carga `horarios_profesional` del día visible (una query nueva, mismo patrón que ya usa para `bloqueos_profesional`) y pinta el hueco entre turnos como franja bloqueada (gris, sin interacción de arrastre), coherente visualmente con cómo ya se pinta un bloqueo.

**C3 — Validación al mover una cita por arrastre.**
El handler de drag-and-drop de citas en `AgendaCalendar.web.tsx` pasa a llamar a `validarHorarioLaboral()` (la misma función que ya usa `nueva-cita.tsx`) antes de confirmar el movimiento, para no poder arrastrar una cita a un hueco de pausa.

---

## Fase D — Fidelidad: beneficios operativos + asignación manual

### Estado actual

Ya existe un sistema completo de fidelización: tabla `niveles_fidelizacion` (nombre, `umbral_visitas`, `umbral_gastado_cents`, color, icono, orden — configurable por el salón desde Configuración → Recompensas, componente `components/config/TabRecompensas.web.tsx`), con asignación **automática** vía la función `obtener_nivel_cliente(p_cliente_id)`: cuenta citas completadas y gasto total histórico del cliente, y elige el nivel de mayor `orden` cuyo umbral se cumple. No hay ventana temporal (es histórico total) ni override manual todavía. Además ya existen logros, recompensas canjeables, bonos (paquetes de sesiones) y tarjetas regalo — no se toca nada de eso.

Aparte, y sin relación hoy, existe el sistema de depósito dinámico por riesgo (`perfil_riesgo_cliente`, tiers `exento/riesgo/alto/normal`, configurable en Configuración → sección de señales, con override manual por cliente vía `clientes.deposito_perfil_override`). Es un sistema totalmente independiente del de fidelidad.

### Cambios

**D1 — Beneficios por nivel.**
```sql
alter table public.niveles_fidelizacion
  add column sin_deposito boolean not null default false,
  add column acceso_express boolean not null default false;
```
Editables como 2 toggles nuevos en el editor de nivel de `TabRecompensas.web.tsx`.

**D2 — Asignación manual (override), mismo patrón que el override de riesgo.**
```sql
alter table public.clientes
  add column nivel_fidelizacion_override uuid null references public.niveles_fidelizacion(id) on delete set null;
```
Selector en la ficha de cliente (`app/(tabs)/clientes.web.tsx`), junto al que ya existe para el override de depósito/riesgo. `obtener_nivel_cliente` se actualiza para devolver el nivel del override si existe, en vez de calcularlo por umbrales (mismo patrón que ya usa `perfil_riesgo_cliente` con `deposito_perfil_override`), y para incluir `sin_deposito`/`acceso_express` en el JSON de salida.

**D3 — El beneficio de fidelidad manda sobre el riesgo.**
En `crear_cita_publica`, antes de aplicar el cálculo de depósito dinámico por riesgo: si el nivel de fidelidad resuelto del cliente tiene `sin_deposito = true`, el depósito se fija a 0 y no se evalúa `perfil_riesgo_cliente`. Decisión explícita: un perk de fidelidad gana siempre al riesgo (una clienta VIP con algún no-show ocasional conserva el beneficio si el salón se lo ha dado explícitamente).

**Decisión explícita — no se duplica el sistema de niveles.** No se crea una segunda escalera de fidelidad "por ventana de tiempo reciente". Se reutiliza `niveles_fidelizacion` (histórico total) tal cual existe. Si un salón quiere premiar frecuencia reciente, baja el umbral del nivel o usa el override manual (D2). Mantener dos sistemas de niveles en paralelo sería confuso y no lo pide nadie explícitamente — solo hacía falta que "ser VIP" abriera puertas operativas, que es exactamente D1+D3.

---

## Fase E — Citas exprés

100% nuevo, no existe nada parecido hoy.

### Flujo en el portal

Botón **"Lo antes posible"** como alternativa a elegir hora, tras seleccionar servicio (y opcionalmente profesional). El botón se muestra siempre; la elegibilidad (nivel con `acceso_express = true`, resuelto con el override si lo hay) se comprueba **después** de que el cliente introduce su teléfono — igual que ya hace hoy el depósito dinámico, que tampoco se resuelve hasta ese punto. Si no es elegible, se le informa y se le ofrece el flujo normal de elegir hora.

### Backend: búsqueda del primer hueco

Nueva función `disponibilidad_express_publica(p_slug text, p_servicio_id uuid, p_telefono text, p_profesional_id uuid default null, p_dias int default 21)`.

- Primero resuelve el cliente por teléfono (o confirma que es nuevo) y comprueba elegibilidad (`acceso_express` del nivel resuelto); si no es elegible, devuelve un motivo explícito en vez de huecos.
- Reutiliza exactamente la misma lógica de fases activas de la Fase A, pero generando candidatos a lo largo de todo el horizonte de días (mismo patrón de bucle por día que ya usa `portal_dias_disponibles`), sobre cualquier profesional cualificado (o el indicado), y devuelve **el primer slot** (`order by slot_tz, profesional_id limit 1`) que quepa — activo o dentro de un reposo.
- Si no hay ningún hueco en todo el horizonte: no fallar sin más. Se ofrece de alta directa en `lista_espera`.

### Prioridad en lista de espera

`lista_espera.prioridad` ya existe como columna y ya se usa para ordenar tanto en la UI (`lista-espera.web.tsx`) como en `matching_lista_espera` (`order by prioridad desc, created_at asc`) — hoy nadie la escribe, siempre queda en el default 0. Cuando una cita exprés sin hueco cae a lista de espera, se inserta con una prioridad elevada. El valor se guarda como ajuste de salón (mismo patrón que `agendaUmbralHuecoMin` o `depositoFactorRiesgo`, dentro de `negocio_config.config`): `expressListaEsperaPrioridad`, default `5`.

### Aviso interno

Nueva categoría `express` en `lib/avisosCategorias.ts` (entrada en el union type `AvisoCategoria`, en `CATEGORIA_META` con icono/tinte propio, y en `CATEGORIA_ORDEN`). Como el sistema de avisos no usa triggers de BD — se recalcula en vivo por polling en `lib/hooks/useAvisos.ts` — se añade ahí un bloque nuevo que consulta citas con `origen_express = true` recientes/próximas y genera los `AvisoItem` correspondientes, siguiendo el mismo patrón que ya usan el resto de categorías.

```sql
alter table public.citas
  add column origen_express boolean not null default false;
```

(Se usa una columna dedicada y no se reutiliza `canal`, porque `canal` ya significa "por dónde llegó" — web/whatsapp/etc. — y esto es una etiqueta de urgencia ortogonal.)

`crear_cita_publica` (o una variante `crear_cita_publica_express` que la envuelva) marca `origen_express = true` al crear la cita desde este flujo.

---

## Orden de implementación y dependencias

1. **Fase A** (sin dependencias) — lista para implementar ya.
2. **Fase B** — cerrada, no requiere trabajo.
3. **Fase C** (sin dependencias) — puede ir en paralelo con A.
4. **Fase D** (sin dependencias) — puede ir en paralelo con A/C.
5. **Fase E** — depende de A (reutiliza su lógica de fases activas) y de D (gating por `acceso_express`). Va la última.

---

## Fuera de alcance

- No se toca el algoritmo de rejilla de 15 min de generación de candidatos salvo que la verificación de la Fase A revele huecos perdidos por alineación (se trataría como bug aparte).
- No se construye un segundo sistema de niveles de fidelidad (ver Fase D).
- No se restringe qué servicios del catálogo pueden reservarse en un hueco de reposo (decisión explícita del cliente: solo nota informativa, sin restricción).
- No se modifica `bloqueos_profesional` (sigue siendo para bloqueos puntuales con fecha/hora — vacaciones, bajas, citas de recurrencia excepcional); la pausa recurrente vive en `horarios_profesional` (Fase C).
