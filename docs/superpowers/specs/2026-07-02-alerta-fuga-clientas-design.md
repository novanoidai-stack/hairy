# Diseño — Alerta de fuga de clientas

> Fecha: 2026-07-02 · Autor: Carlos + Claude · Estado: diseño aprobado, pendiente de plan de implementación.
> Backlog de ideas emergentes vs Booksy/Fresha (ver `informes/MEGA_INFORME_MECHA.md`, adenda 1 jul 2026).

## 1. Objetivo

Detectar clientas que se están retrasando respecto a su patrón habitual de visitas y ponerlo delante
del dueño del salón — con la opción de más adelante automatizar el aviso por WhatsApp con una oferta,
sin repetir trabajo cuando llegue ese momento.

## 2. Decisiones de producto (fijadas por Carlos, 2 jul)

- Alcance: panel para el dueño **+** motor/outbox ya preparados para automatizar (no implica envío
  automático todavía — eso lo conecta Alexandro más adelante).
- Ubicación: dentro de **Clientes** (filtro/pestaña) **y** tarjeta de resumen en el panel de **Avisos**
  de la agenda, visible solo en rol propietario/dirección.
- Contenido del aviso: sugiere la recompensa activa que la clienta ya puede canjear, si existe una
  configurada; si no, aviso sin oferta.
- Solo entran clientas con **historial suficiente** (≥3 visitas completadas) — clientas nuevas o de una
  sola vez no son "fuga", son otro problema.

## 3. Arquitectura (motor periódico, cron-pull — mismo patrón que lista de espera)

Una función `procesar_alertas_fuga()` (`security definer`, `service_role` only) que un workflow n8n
futuro llama 1-2 veces al día (no cada 2 min: la frecuencia de visita es una señal lenta, a diferencia
de la lista de espera). Recalcula en lote las columnas ya existentes
`clientes.total_visitas` / `ultima_visita` / `frecuencia_dias` (hoy muertas: existen en el schema y se
muestran en la ficha del cliente, pero ningún trigger ni código las escribe) y detecta nuevas clientas
en riesgo. No toca el flujo de cobro/cierre de cita — cero riesgo para el camino crítico de caja.

El panel de Clientes lee esas columnas directamente (rápido, sin recalcular al vuelo); **no depende**
de que el motor de automatización esté activo para mostrarse — solo la generación de avisos para
WhatsApp depende del toggle.

## 4. Config (en `negocio_config.config`)

| Clave | Tipo | Default | Qué hace |
|---|---|---|---|
| `fugaClientasActivo` | bool | **false** | Toggle maestro. OFF = el panel de Clientes sigue funcionando (calculado), pero el motor no genera avisos para automatizar. |

Heurística de riesgo (constantes fijas en el motor, no configurables en v0 — YAGNI hasta que haya
señal real de que un salón necesita ajustarlas):

- Mínimo 3 citas `completada` para calcular `frecuencia_dias`: media en días de los huecos entre cada
  par de citas completadas consecutivas, usando como máximo las últimas 6 citas completadas (para que
  una racha antigua no pese de más).
- En riesgo cuando `dias_desde_ultima_visita > frecuencia_dias * 1.4`.
- Excluida si tiene una cita futura ya reservada (`estado <> 'cancelada' AND inicio > now()`) o si
  `clientes.bloqueado = true`.

## 5. Datos

- `clientes.total_visitas` / `ultima_visita` / `frecuencia_dias` (ya existen, columnas muertas hoy —
  las rellena el motor; no hace falta migración de columnas, solo de lógica).
- **Nueva `fuga_clientas_avisos`** (outbox, calcada de `lista_espera_avisos`): `id, negocio_id,
  cliente_id, dias_desde_ultima_visita, frecuencia_dias, recompensa_sugerida_id (nullable, fk
  `recompensas`), estado (`'pendiente'|'enviado'|'descartado'`), created_at, enviado_at`.

## 6. Motor `procesar_alertas_fuga()` (service_role, security definer)

Para cada negocio (el recálculo de agregados siempre corre; la generación de avisos solo si
`fugaClientasActivo`):

- **A. Recalcular agregados**: para cada cliente con ≥3 citas `completada`, `total_visitas` = count,
  `ultima_visita` = max(inicio), `frecuencia_dias` = media de huecos según §4. Clientes con <3 citas
  completadas quedan con `frecuencia_dias = null` (nunca entran en el cálculo de riesgo).
- **B. Detectar riesgo**: aplica la heurística de §4 sobre los agregados recién calculados.
- **C. Generar/descartar avisos** (solo si `fugaClientasActivo`):
  - Si la clienta pasa a estar en riesgo y no hay ya un `fuga_clientas_avisos` `pendiente` para ella,
    inserta uno nuevo. Adjunta `recompensa_sugerida_id` = la recompensa activa de mayor
    `umbral_visitas` que ya cumple (`umbral_visitas <= total_visitas`), si existe alguna.
  - Si una clienta con un aviso `pendiente` **deja** de estar en riesgo (p. ej. reservó o completó una
    cita antes de que el aviso saliera), el motor lo marca `descartado`. Evita que salga un WhatsApp de
    "te echamos de menos" a alguien que ya volvió.

## 7. Frontend

- **Clientes** (`app/(tabs)/clientes.web.tsx`): filtro/pestaña "En riesgo" — lista ordenada por nivel
  de fidelización (más valiosas primero), cada fila con días de retraso y, si hay, la recompensa
  sugerida.
- **Avisos de agenda**: tarjeta nueva (mismo mecanismo que `OnboardingCard` / `OnboardingPanel` en
  `components/onboarding/`, montada en `AgendaCalendar.web.tsx`), gateada a rol propietario/dirección,
  contador "N clientas en riesgo" que enlaza al filtro de Clientes. Sin panel propio duplicado —
  reutiliza la vista de Clientes en vez de construir una superficie nueva.
- RPC de lectura `clientes_en_riesgo_fuga()` (`authenticated`, scope por `negocio_id` igual que el
  resto de RPCs de Clientes) — la usan ambas superficies (panel y contador de Avisos).

## 8. Fuera de alcance ahora (Alexandro, más adelante)

Workflow n8n que llama a `procesar_alertas_fuga()` a diario, drena `fuga_clientas_avisos` y envía el
WhatsApp real con la oferta — mismo molde que "Mecha — Lista de espera". Plantilla Meta nueva a validar.

## 9. Seguridad / multi-tenant

Todo por `negocio_id`. Motor `service_role only`. RPC de lectura `authenticated` con RLS estándar (igual
que el resto de RPCs de Clientes). Advisors de Supabase tras la migración (regla del repo).

## 10. Pruebas

- SQL con datos sintéticos: cliente con 3+ citas y hueco grande → aparece en riesgo + aviso generado;
  ese mismo cliente reserva de nuevo → aviso pasa a `descartado`; cliente con cita futura → excluido
  pese al hueco; cliente bloqueado → excluido; cliente con <3 visitas → nunca calculado. Limpiar tras
  probar.
- Panel de Clientes probado en demo (o negocio propio) tras aplicar migración.
- `npx tsc --noEmit` y `npm run build:web` limpios.

## 11. Pendiente externo (usuario)

Ninguno para esta fase — el toggle nace OFF, no requiere nada de Meta/n8n hasta que Alexandro conecte
el envío.
