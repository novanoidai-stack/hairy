# Lista de espera: acceso abierto y prioridad por fidelidad (elimina "cita exprés")

**Fecha:** 2026-08-10
**Proyecto:** Mecha (Hairy)
**Ámbito:** Portal público de reserva + backend de lista de espera + panel interno Equipo → Lista de Espera.

---

## Contexto / motivación

Al revisar la Fase E del diseño anterior (`2026-08-08-portal-reposo-pausas-fidelidad-express-design.md`,
"Citas exprés") contra el estado real en el proyecto Supabase de producción (`vtrggiogjrhqtwbhbgia`), aparecen
tres problemas que invalidan el enfoque actual:

1. **La función `lista_espera_express_publica` — usada tanto por la pestaña "Reserva exprés" como por el
   botón "Apuntarme a la Lista de Espera" que aparece cuando un día no tiene huecos — exige que el teléfono
   ya pertenezca a un cliente existente** (`select id ... from clientes where telefono = p_telefono`; si no
   lo encuentra, devuelve `{ok:false, error:'Cliente no encontrado'}` sin crear nada) **y además exige
   `acceso_express = true` en el nivel de fidelidad resuelto del cliente** (si no, `{ok:false, error:'Cliente
   no elegible para listas de espera exprés.'}`). Resultado: un prospecto nuevo, o un cliente habitual sin
   nivel VIP, no puede apuntarse a la lista de espera hoy — ni siquiera al flujo pensado como "genérico" de
   "este día no tiene hueco, avísame si se libera algo" — aunque la UI no lo advierte en ningún sitio y se
   presenta como abierto a cualquiera.
2. **La búsqueda-y-reserva automática del primer hueco libre en 21 días** (`disponibilidad_express_publica`
   + `crear_cita_publica_express`, invocadas desde la rama `isExpress` de `confirmar()` en
   `app/r/[slug].web.tsx:358-381`) **es código inalcanzable**: el único botón que activa `isExpress=true`
   también fuerza `setServicio(null)`, y esa rama de `confirmar()` solo se ejecuta si hay `servicio`
   seleccionado. En la práctica el modo "exprés" que ve el cliente (`submitExpress`, líneas 400-421) nunca
   pasa por ahí: llama directo a `crearListaEsperaExpressPublica` con `servicioId: ''`, lo cual además
   **falla en Postgres al intentar castear `''` a `uuid`** en el parámetro `p_servicio_id` — otro camino
   roto de facto.
3. **La preferencia de franja horaria** que el cliente elige en el formulario exprés (`eFranja`, botones
   Mañana/Tarde/Noche/Cuanto antes) **se captura en el estado de React pero nunca se envía** — el RPC ni
   siquiera acepta ese parámetro. Se pierde en silencio.

Decisión de producto (esta sesión): en vez de arreglar el gate de elegibilidad y el auto-book, se elimina el
concepto de "cita exprés" tal cual existe. Pasa a haber un único concepto — **unirse a la lista de espera**,
siempre disponible, sin gate de elegibilidad — y la fidelidad dejar de ser un permiso de acceso para ser
puramente el criterio de **orden** dentro de la cola.

---

## 1. Concepto

- Desaparece la búsqueda-y-reserva automática del primer hueco (`disponibilidad_express_publica` /
  `crear_cita_publica_express`). Como ya es inalcanzable desde la UI, quitarla no cambia ningún camino que
  un cliente use hoy.
- Desaparece la pestaña "Reserva exprés" del portal como opción separada.
- Queda un único punto de entrada: **"Unirme a la lista de espera"**, abierto a cualquiera (cliente nuevo o
  existente, de cualquier nivel de fidelidad). El nivel de fidelidad ya no decide *si* puedes entrar, decide
  *en qué posición* de la cola quedas.

## 2. Portal (`app/r/[slug].web.tsx`)

### 2.1 Qué se quita

- El tab superior "Reserva guiada" / "Reserva exprés" (líneas 559-563) pasa a ser solo el flujo guiado; se
  quita el segundo botón de pestaña.
- Todo el bloque `isExpresMode` / `showExpresForm` / `showExpresSuccess` (líneas 801-864): formulario de
  nombre/teléfono/franja "puro", su función `submitExpress` y sus estados asociados (`isExpress`, `eFranja`
  si no se reutiliza — ver 2.3).
- El botón lateral "¿Tienes prisa? Reserva exprés en 10 segundos" (línea 767-770).
- La rama `if (isExpress)` dentro de `confirmar()` (líneas 358-381) y sus imports (`getDisponibilidadExpress`,
  `crearCitaPublicaExpress`).

### 2.2 Qué se mantiene y se generaliza

El modal `showWlModal` (líneas 1027-1082) ya resuelve exactamente la pregunta de "lista global vs. filtrada"
que motivó esta sesión: un `<select>` con **"Cualquier día de las próximas 2 semanas (Global)"** o **"Solo
este día específico"**, más nombre y teléfono. Lleva implícito el `servicio`/`profesional` si el cliente ya
los había elegido en el paso 1-2 del flujo guiado (o van `null`/vacío si no).

Se mantiene tal cual en su forma, con dos disparadores:

- **Contextual (ya existe):** al elegir un día sin huecos, banner "Sin huecos disponibles este día" (línea
  661-669) con el botón que abre el modal.
- **Contextual nuevo:** si tras recorrer los próximos 21 días **ningún día tiene hueco** para el
  servicio/profesional elegidos (`diasDisp.size === 0` tras cargar), se muestra el mismo banner con el
  mensaje adaptado ("No hay hueco libre en las próximas 3 semanas · Apúntate y te avisamos").
- **Persistente (nuevo):** un enlace discreto en el aside de resumen, visible desde que hay `servicio`
  elegido — sustituye al botón "Reserva exprés en 10 segundos" en la misma posición: *"¿No te encaja
  ninguna hora? Únete a la lista de espera"*. Abre el mismo modal.

Si el cliente entra desde el enlace persistente sin haber navegado el flujo guiado (p. ej. quiere apuntarse
sin mirar horarios), `servicio`/`profId` pueden estar vacíos: el modal ya soporta eso (`profId === ANY_PRO`
→ `null`; sin servicio → cola global "cualquier servicio").

### 2.3 Fix incluido: franja horaria

El modal gana un selector de franja (reutilizando el patrón de píldoras `FRANJAS` ya definido en el propio
archivo — mañana/tarde/noche/cualquiera) y lo envía como nuevo parámetro `p_franja` al RPC (ver 3.1). Se
guarda en la columna `lista_espera.franja`, que ya existe y ya la usa el motor de matching
(`_lista_espera_mejor_candidato`) para filtrar candidatos — hoy simplemente nunca se rellena desde el
portal.

## 3. Backend / datos

### 3.1 Nueva función `lista_espera_unirse_publica`

Sustituye a `lista_espera_express_publica` (se elimina esta última). Firma:

```sql
lista_espera_unirse_publica(
  p_slug text, p_telefono text, p_cliente_nombre text,
  p_servicio_id uuid default null, p_profesional_id uuid default null,
  p_franja text default 'cualquiera', p_desde date default null, p_hasta date default null,
  p_consentimiento_datos boolean default true
) returns jsonb
```

Cambios respecto a la función actual:

- **Find-or-create de cliente**, mismo patrón que `crear_cita_publica` (`normalizar_telefono` para el
  match; si no existe, `insert into clientes`). Requiere `p_cliente_nombre` (hoy el modal ya lo pide) y
  `p_consentimiento_datos = true` (mismo check que el resto de RPCs públicas del portal).
- **Sin chequeo de `acceso_express`.** Cualquier cliente, de cualquier nivel, puede insertarse.
- **Anti-abuso**, replicando lo que ya hace `crear_cita_publica` (principio de CLAUDE.md §4: toda RPC
  pública nueva necesita límites en servidor): rechazar si el cliente está `bloqueado = true`; límite de,
  p. ej., 3 entradas `esperando` simultáneas por teléfono en el mismo negocio; límite de inserciones por
  canal `web` por negocio en la última hora (mismo umbral que ya usa `crear_cita_publica`, 30/hora).
- **Prioridad = snapshot del nivel de fidelidad en el momento de apuntarse**: `prioridad :=
  coalesce((obtener_nivel_cliente(v_cliente)->'nivel'->>'orden')::smallint, 0)`. `obtener_nivel_cliente` ya
  resuelve el override manual si existe (D2 del diseño anterior, sí desplegado) antes de calcular por
  visitas/gasto, así que cubre "automático por defecto, override manual si existe" sin código nuevo aquí.
  Es un snapshot, no un valor recalculado en cada tick del matching: si el nivel de un cliente cambia
  mientras espera, su posición en la cola no se recalcula sola. Para esperas de horas/días es un compromiso
  razonable; si en el futuro hace falta recalcular en vivo, sería una función aparte que re-lee
  `obtener_nivel_cliente` en cada tick de `procesar_lista_espera()` — fuera de alcance de este cambio.
- Inserta también `franja` (bug fix del §2.3) y `nota` descriptiva del origen ("Alta desde portal").
- `desde`/`hasta`: igual que hoy, `coalesce(p_desde, current_date)` / `coalesce(p_hasta, current_date + 21)`.

`grant execute ... to anon` (RPC pública nueva, sigue el patrón exigido desde el round 4 de seguridad).

### 3.2 Nueva función `ajustar_prioridad_lista_espera_manual`

La función `cambiar_prioridad_lista_espera` de `migrations/lista-espera-recola-y-prioridad.sql` **no llegó a
desplegarse en producción ni la llama ningún componente** — es diseño no usado, no una función viva que haya
que preservar. Se sustituye por una nueva, más simple:

```sql
ajustar_prioridad_lista_espera_manual(p_id uuid, p_delta smallint) returns void
```

- `security definer`, solo `authenticated` con rol owner/admin del negocio de esa entrada (chequeo de rol
  dentro, como el resto de RPCs internas sensibles).
- `update lista_espera set prioridad = greatest(prioridad + p_delta, 0) where id = p_id and negocio_id = ...`.
- Es un ajuste puntual sobre esa entrada de cola, no toca el nivel de fidelidad del cliente ni afecta a
  futuras entradas suyas — cubre la "excepción del día a día" sin reintroducir un segundo sistema de
  prioridad paralelo.

### 3.3 El motor de matching no cambia

`procesar_lista_espera()` y `_lista_espera_mejor_candidato()` siguen ordenando por `prioridad desc,
created_at asc` — exactamente lo que hace falta. Solo cambia quién y cómo se escribe `prioridad` al entrar
en la cola.

### 3.4 Limpieza de lo que queda huérfano

Al eliminar el auto-book, estos elementos del diseño anterior dejan de tener consumidor y se retiran en la
misma migración:

- Columna `niveles_fidelizacion.acceso_express` y su toggle en el editor de nivel de
  `TabRecompensas.web.tsx`.
- Funciones `disponibilidad_express_publica`, `crear_cita_publica_express`, `lista_espera_express_publica`.
- Columna `citas.origen_express` (ya no se van a crear citas por esta vía) y la categoría de aviso `express`
  en `lib/avisosCategorias.ts` (entrada en `AvisoCategoria`, `CATEGORIA_META`, `CATEGORIA_ORDEN`, y el bloque
  correspondiente en `lib/hooks/useAvisos.ts`).
- `EXPRESS_LISTA_ESPERA_PRIORIDAD_DEFAULT` en `lib/constants.ts` y la clave de config
  `expressListaEsperaPrioridad` en `negocio_config` / `ConfigState` (ya no hay un valor plano que
  configurar: la prioridad sale del nivel de fidelidad).
- `niveles_fidelizacion.sin_deposito` **no se toca** — pertenece al sistema de depósitos, es independiente.

## 4. Panel interno (`app/(tabs)/lista-espera.web.tsx`)

- La columna de prioridad numérica cruda se sustituye por el badge de nivel de fidelidad del cliente (mismo
  componente visual que ya existe en la ficha de cliente / `TabRecompensas.web.tsx` — nombre, color, icono),
  resuelto vía `obtener_nivel_cliente(cliente_id)` en el momento de listar (para reflejar el nivel actual en
  la UI aunque la `prioridad` guardada sea un snapshot antiguo — es solo lectura informativa, no cambia el
  orden real de la cola).
- Se añade la acción de nudge manual (botones subir/bajar, o input de ajuste) por fila, llamando a
  `ajustar_prioridad_lista_espera_manual`.
- El resto de la pantalla (filtros, estados `esperando/avisado/resuelta/cancelada`, alta manual desde el
  panel) no cambia.

## 5. Migración de datos existentes

Las entradas `lista_espera` ya insertadas antes de este cambio conservan su `prioridad` actual tal cual
(no se recalculan retroactivamente) — evita reordenar colas ya en curso con clientes ya avisados a mitad de
proceso. Solo las nuevas entradas usan la fórmula de fidelidad.

## 6. Seguridad / multi-tenant

Todo por `negocio_id`, siguiendo el patrón ya establecido. `lista_espera_unirse_publica` es `anon` con
`grant execute` explícito (RPC pública nueva) y anti-abuso en servidor (bloqueado, límite por teléfono,
límite por canal/hora) — nunca `SELECT` directo a `anon` sobre `lista_espera`.
`ajustar_prioridad_lista_espera_manual` es `authenticated` con chequeo de rol owner/admin dentro de la
función. Pasar los advisors de Supabase tras la migración.

## 7. Fuera de alcance

- No se toca el motor de ofertas por WhatsApp (`procesar_lista_espera`, plantillas Meta, workflow n8n
  dedicado) ni el resto de fidelización (logros, recompensas canjeables, bonos, tarjetas regalo).
- No se crea una lista de espera separada por servicio: sigue siendo una sola tabla, filtrable por
  servicio/profesional/franja, tal como ya funciona hoy — es exactamente la arquitectura "global o
  filtrada" que ya resuelve el modal existente.
- No se recalcula la prioridad en vivo mientras la entrada espera (ver 3.1); es snapshot al entrar.
- No se toca el fix de reposo del portal (Fase A del diseño anterior) ni la pausa de comida (Fase C) ni el
  resto de beneficios de fidelidad (`sin_deposito`, D1/D3) — quedan como están.
